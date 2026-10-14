// Chess rules engine: legal moves (incl. Chess 960 castling, en passant, promotion),
// check / mate / draw detection, SAN, FEN and perft. No DOM — runs in Node for tests.
(function (C) {
  'use strict';

  const FILES = 'abcdefgh';
  const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const PROMOS = ['q', 'r', 'b', 'n'];

  const inside = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const backRow = (c) => (c === 'w' ? 7 : 0);
  const sqName = (r, f) => FILES[f] + (8 - r);
  const cloneBoard = (b) => b.map((row) => row.slice());

  // ---------- State ----------

  // castling[c] = { a: rookFile | null, h: rookFile | null } — a = queen-side, h = king-side.
  function createGame(id) {
    const base = C.createInitialState(id);
    const rank = base.backRank;
    const rooks = [rank.indexOf('R'), rank.lastIndexOf('R')];
    const state = {
      id: base.id,
      backRank: rank,
      board: base.board,
      turn: 'w',
      castling: { w: { a: rooks[0], h: rooks[1] }, b: { a: rooks[0], h: rooks[1] } },
      ep: null,
      halfmove: 0,
      fullmove: 1,
      positions: {},
    };
    state.positions[positionKey(state)] = 1;
    return state;
  }

  function findKing(board, color) {
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === 'k' && p.color === color) return [r, f];
      }
    return null;
  }

  // ---------- Attacks ----------

  function isAttacked(board, r, f, by) {
    // Pawns: a pawn of colour `by` attacks diagonally forward.
    const pr = by === 'w' ? r + 1 : r - 1;
    for (const df of [-1, 1]) {
      if (inside(pr, f + df)) {
        const p = board[pr][f + df];
        if (p && p.color === by && p.type === 'p') return true;
      }
    }
    for (const [dr, df] of KNIGHT) {
      const rr = r + dr, ff = f + df;
      if (inside(rr, ff)) { const p = board[rr][ff]; if (p && p.color === by && p.type === 'n') return true; }
    }
    for (const [dr, df] of KING) {
      const rr = r + dr, ff = f + df;
      if (inside(rr, ff)) { const p = board[rr][ff]; if (p && p.color === by && p.type === 'k') return true; }
    }
    const slide = (dirs, types) => {
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (inside(rr, ff)) {
          const p = board[rr][ff];
          if (p) { if (p.color === by && types.includes(p.type)) return true; break; }
          rr += dr; ff += df;
        }
      }
      return false;
    };
    return slide(ROOK_DIRS, 'rq') || slide(BISHOP_DIRS, 'bq');
  }

  function inCheck(state, color = state.turn) {
    const k = findKing(state.board, color);
    return !!k && isAttacked(state.board, k[0], k[1], other(color));
  }

  // ---------- Move generation ----------

  function pseudoMoves(state) {
    const { board, turn: c } = state;
    const moves = [];
    const add = (from, to, extra) => {
      const piece = board[from[0]][from[1]];
      const target = board[to[0]][to[1]];
      moves.push(Object.assign({ from, to, piece, captured: target || null }, extra));
    };

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p || p.color !== c) continue;

        if (p.type === 'p') {
          const dir = c === 'w' ? -1 : 1;
          const startRow = c === 'w' ? 6 : 1;
          const lastRow = c === 'w' ? 0 : 7;
          const pushPromo = (to, extra = {}) => {
            if (to[0] === lastRow) for (const promo of PROMOS) add([r, f], to, Object.assign({ promo }, extra));
            else add([r, f], to, extra);
          };
          if (inside(r + dir, f) && !board[r + dir][f]) {
            pushPromo([r + dir, f]);
            if (r === startRow && !board[r + 2 * dir][f]) add([r, f], [r + 2 * dir, f], { double: true });
          }
          for (const df of [-1, 1]) {
            const rr = r + dir, ff = f + df;
            if (!inside(rr, ff)) continue;
            const t = board[rr][ff];
            if (t && t.color !== c) pushPromo([rr, ff]);
            else if (state.ep && state.ep[0] === rr && state.ep[1] === ff) {
              moves.push({ from: [r, f], to: [rr, ff], piece: p, captured: board[r][ff], ep: true, capSq: [r, ff] });
            }
          }
          continue;
        }

        if (p.type === 'n' || p.type === 'k') {
          for (const [dr, df] of p.type === 'n' ? KNIGHT : KING) {
            const rr = r + dr, ff = f + df;
            if (!inside(rr, ff)) continue;
            const t = board[rr][ff];
            if (!t || t.color !== c) add([r, f], [rr, ff]);
          }
          continue;
        }

        const dirs = p.type === 'r' ? ROOK_DIRS : p.type === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
        for (const [dr, df] of dirs) {
          let rr = r + dr, ff = f + df;
          while (inside(rr, ff)) {
            const t = board[rr][ff];
            if (!t) add([r, f], [rr, ff]);
            else { if (t.color !== c) add([r, f], [rr, ff]); break; }
            rr += dr; ff += df;
          }
        }
      }
    }
    return moves;
  }

  // Chess 960 castling. The move's `to` is the castling rook's square (unambiguous),
  // `kingTo` / `rookTo` are where the pieces actually land.
  function castleMoves(state) {
    const { board, turn: c } = state;
    const row = backRow(c);
    const k = findKing(board, c);
    if (!k || k[0] !== row) return [];
    const kf = k[1];
    const moves = [];
    if (isAttacked(board, row, kf, other(c))) return moves;

    for (const side of ['a', 'h']) {
      const rf = state.castling[c][side];
      if (rf === null) continue;
      const rook = board[row][rf];
      if (!rook || rook.type !== 'r' || rook.color !== c) continue;

      const kTo = side === 'h' ? 6 : 2;
      const rTo = side === 'h' ? 5 : 3;
      const lo = Math.min(kf, rf, kTo, rTo);
      const hi = Math.max(kf, rf, kTo, rTo);
      let clear = true;
      for (let f = lo; f <= hi && clear; f++) {
        if (f !== kf && f !== rf && board[row][f]) clear = false;
      }
      if (!clear) continue;

      let safe = true;
      const step = kTo >= kf ? 1 : -1;
      for (let f = kf; ; f += step) {
        if (f !== kf && isAttacked(board, row, f, other(c))) { safe = false; break; }
        if (f === kTo) break;
      }
      if (!safe) continue;

      moves.push({
        from: [row, kf], to: [row, rf], piece: board[row][kf], captured: null,
        castle: side, kingTo: [row, kTo], rookFrom: [row, rf], rookTo: [row, rTo],
      });
    }
    return moves;
  }

  // Apply a move and return a new state (the input state is never mutated).
  function makeMove(state, m) {
    const board = cloneBoard(state.board);
    const c = state.turn;
    const castling = { w: Object.assign({}, state.castling.w), b: Object.assign({}, state.castling.b) };
    const [fr, ff] = m.from;
    const piece = board[fr][ff];

    if (m.castle) {
      const rook = board[m.rookFrom[0]][m.rookFrom[1]];
      board[fr][ff] = null;
      board[m.rookFrom[0]][m.rookFrom[1]] = null;
      board[m.kingTo[0]][m.kingTo[1]] = piece;
      board[m.rookTo[0]][m.rookTo[1]] = rook;
      castling[c] = { a: null, h: null };
    } else {
      const [tr, tf] = m.to;
      if (m.ep) board[m.capSq[0]][m.capSq[1]] = null;
      board[tr][tf] = m.promo ? { type: m.promo, color: c } : piece;
      board[fr][ff] = null;

      if (piece.type === 'k') castling[c] = { a: null, h: null };
      if (piece.type === 'r' && fr === backRow(c)) {
        if (castling[c].a === ff) castling[c].a = null;
        if (castling[c].h === ff) castling[c].h = null;
      }
      const o = other(c);
      if (m.captured && m.captured.type === 'r' && tr === backRow(o)) {
        if (castling[o].a === tf) castling[o].a = null;
        if (castling[o].h === tf) castling[o].h = null;
      }
    }

    const next = {
      id: state.id,
      backRank: state.backRank,
      board,
      turn: other(c),
      castling,
      ep: m.double ? [(m.from[0] + m.to[0]) / 2, m.from[1]] : null,
      halfmove: piece.type === 'p' || m.captured ? 0 : state.halfmove + 1,
      fullmove: state.fullmove + (c === 'b' ? 1 : 0),
      positions: Object.assign({}, state.positions),
    };
    const key = positionKey(next);
    next.positions[key] = (next.positions[key] || 0) + 1;
    return next;
  }

  function legalMoves(state) {
    const c = state.turn;
    return pseudoMoves(state).concat(castleMoves(state)).filter((m) => !inCheck(makeMoveFast(state, m), c));
  }

  // Lightweight board-only apply for legality checks (skips bookkeeping).
  function makeMoveFast(state, m) {
    const board = cloneBoard(state.board);
    const [fr, ff] = m.from;
    const piece = board[fr][ff];
    if (m.castle) {
      const rook = board[m.rookFrom[0]][m.rookFrom[1]];
      board[fr][ff] = null;
      board[m.rookFrom[0]][m.rookFrom[1]] = null;
      board[m.kingTo[0]][m.kingTo[1]] = piece;
      board[m.rookTo[0]][m.rookTo[1]] = rook;
    } else {
      if (m.ep) board[m.capSq[0]][m.capSq[1]] = null;
      board[m.to[0]][m.to[1]] = m.promo ? { type: m.promo, color: piece.color } : piece;
      board[fr][ff] = null;
    }
    return { board, turn: state.turn };
  }

  // ---------- Game status ----------

  function positionKey(state) {
    let s = '';
    for (const row of state.board) for (const p of row) s += p ? (p.color === 'w' ? p.type.toUpperCase() : p.type) : '.';
    const cs = state.castling;
    return `${s} ${state.turn} ${cs.w.a},${cs.w.h},${cs.b.a},${cs.b.h} ${state.ep ? state.ep.join('') : '-'}`;
  }

  function insufficientMaterial(board) {
    const minors = [];
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p || p.type === 'k') continue;
        if (p.type === 'b' || p.type === 'n') minors.push({ type: p.type, shade: (r + f) % 2 });
        else return false;
      }
    if (minors.length <= 1) return true;
    return minors.every((m) => m.type === 'b' && m.shade === minors[0].shade);
  }

  // { over, result: '1-0' | '0-1' | '1/2-1/2' | null, reason, check, moves }
  function status(state) {
    const moves = legalMoves(state);
    const check = inCheck(state);
    if (moves.length === 0) {
      return check
        ? { over: true, result: state.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate', check, moves }
        : { over: true, result: '1/2-1/2', reason: 'stalemate', check, moves };
    }
    if (state.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', check, moves };
    if (insufficientMaterial(state.board)) return { over: true, result: '1/2-1/2', reason: 'insufficient material', check, moves };
    if ((state.positions[positionKey(state)] || 0) >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition', check, moves };
    return { over: false, result: null, reason: null, check, moves };
  }

  // ---------- Notation ----------

  function toSAN(state, m, legal = legalMoves(state)) {
    let san;
    if (m.castle) san = m.castle === 'h' ? 'O-O' : 'O-O-O';
    else {
      const p = m.piece.type;
      const dest = sqName(m.to[0], m.to[1]);
      const cap = !!m.captured;
      if (p === 'p') {
        san = (cap ? FILES[m.from[1]] + 'x' : '') + dest + (m.promo ? '=' + m.promo.toUpperCase() : '');
      } else {
        const rivals = legal.filter((o) => !o.castle && o.piece.type === p && o.to[0] === m.to[0] && o.to[1] === m.to[1] &&
          (o.from[0] !== m.from[0] || o.from[1] !== m.from[1]));
        let dis = '';
        if (rivals.length) {
          const sameFile = rivals.some((o) => o.from[1] === m.from[1]);
          const sameRank = rivals.some((o) => o.from[0] === m.from[0]);
          if (!sameFile) dis = FILES[m.from[1]];
          else if (!sameRank) dis = String(8 - m.from[0]);
          else dis = sqName(m.from[0], m.from[1]);
        }
        san = p.toUpperCase() + dis + (cap ? 'x' : '') + dest;
      }
    }
    const after = makeMove(state, m);
    if (inCheck(after)) san += legalMoves(after).length === 0 ? '#' : '+';
    return san;
  }

  // ---------- FEN (supports KQkq and Shredder/X-FEN file letters) ----------

  function fromFEN(fen) {
    const [placement, turn, cast, ep, half, full] = fen.trim().split(/\s+/);
    const board = placement.split('/').map((row) => {
      const out = [];
      for (const ch of row) {
        if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) out.push(null);
        else out.push({ type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' });
      }
      return out;
    });
    const castling = { w: { a: null, h: null }, b: { a: null, h: null } };
    for (const ch of cast === '-' ? '' : cast) {
      const c = ch === ch.toUpperCase() ? 'w' : 'b';
      const row = backRow(c);
      const kf = board[row].findIndex((p) => p && p.type === 'k' && p.color === c);
      const lc = ch.toLowerCase();
      let rf;
      if (lc === 'k' || lc === 'q') {
        const range = lc === 'k' ? [7, kf, -1] : [0, kf, 1];
        for (let f = range[0]; f !== range[1]; f += range[2]) {
          const p = board[row][f];
          if (p && p.type === 'r' && p.color === c) { rf = f; break; }
        }
      } else rf = FILES.indexOf(lc);
      if (rf === undefined || rf < 0) continue;
      castling[c][rf > kf ? 'h' : 'a'] = rf;
    }
    return {
      id: null, backRank: null, board, turn, castling,
      ep: ep && ep !== '-' ? [8 - +ep[1], FILES.indexOf(ep[0])] : null,
      halfmove: +(half || 0), fullmove: +(full || 1), positions: {},
    };
  }

  function perft(state, depth) {
    if (depth === 0) return 1;
    const moves = legalMoves(state);
    if (depth === 1) return moves.length;
    let n = 0;
    for (const m of moves) n += perft(makeMove(state, m), depth - 1);
    return n;
  }

  Object.assign(C, {
    sqName, createGame, legalMoves, makeMove, inCheck, findKing, isAttacked,
    status, toSAN, fromFEN, perft, positionKey,
  });
})(typeof window !== 'undefined' ? (window.Chess960 = window.Chess960 || {}) : (globalThis.Chess960 = globalThis.Chess960 || {}));
