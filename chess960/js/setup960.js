// Chess 960 (Fischer Random) start-position generator and validator.
(function (C) {
  'use strict';

  // Knight placements over the 5 files left after bishops + queen (Scharnagl table).
  const KNIGHT_TABLE = [
    [0, 1], [0, 2], [0, 3], [0, 4], [1, 2],
    [1, 3], [1, 4], [2, 3], [2, 4], [3, 4],
  ];

  function emptyFiles(rank) {
    const out = [];
    for (let f = 0; f < 8; f++) if (!rank[f]) out.push(f);
    return out;
  }

  // Decode a Scharnagl number (0–959) into a back rank string, e.g. 518 -> "RNBQKBNR".
  function decode960(id) {
    if (!Number.isInteger(id) || id < 0 || id > 959) throw new RangeError('Position id must be 0–959');
    const rank = new Array(8).fill(null);
    let n = id;

    rank[(n % 4) * 2 + 1] = 'B'; // light-squared bishop: b, d, f, h
    n = Math.floor(n / 4);
    rank[(n % 4) * 2] = 'B';     // dark-squared bishop: a, c, e, g
    n = Math.floor(n / 4);

    rank[emptyFiles(rank)[n % 6]] = 'Q';
    n = Math.floor(n / 6);

    const free = emptyFiles(rank);
    const [k1, k2] = KNIGHT_TABLE[n];
    rank[free[k1]] = 'N';
    rank[free[k2]] = 'N';

    // The last three empty files are always Rook, King, Rook — king between the rooks.
    const [a, b, c] = emptyFiles(rank);
    rank[a] = 'R';
    rank[b] = 'K';
    rank[c] = 'R';

    return rank.join('');
  }

  // Independent rule check for a back rank string (does not trust decode960).
  function validate960(rank) {
    if (typeof rank !== 'string' || rank.length !== 8) return false;
    const count = (ch) => rank.split(ch).length - 1;
    if (count('K') !== 1 || count('Q') !== 1 || count('R') !== 2 || count('B') !== 2 || count('N') !== 2) return false;

    const bishops = [rank.indexOf('B'), rank.lastIndexOf('B')];
    if (bishops[0] % 2 === bishops[1] % 2) return false; // must be on opposite colours

    const king = rank.indexOf('K');
    const rooks = [rank.indexOf('R'), rank.lastIndexOf('R')];
    return rooks[0] < king && king < rooks[1];
  }

  function randomId() {
    return Math.floor(Math.random() * 960);
  }

  // board[r][f]: r = 0 is rank 8 (Black's back rank), r = 7 is rank 1 (White's).
  function createInitialState(id = randomId()) {
    const backRank = decode960(id);
    const board = Array.from({ length: 8 }, () => new Array(8).fill(null));

    for (let f = 0; f < 8; f++) {
      const type = backRank[f].toLowerCase();
      board[0][f] = { type, color: 'b' };
      board[1][f] = { type: 'p', color: 'b' };
      board[6][f] = { type: 'p', color: 'w' };
      board[7][f] = { type, color: 'w' };
    }

    return { id, backRank, board, turn: 'w' };
  }

  // Run from the console: Chess960.selfTest(10000)
  function selfTest(iterations = 10000) {
    const failures = [];

    if (decode960(518) !== 'RNBQKBNR') failures.push('518 is not the classical position');

    const seen = new Set();
    for (let id = 0; id < 960; id++) {
      const rank = decode960(id);
      if (!validate960(rank)) failures.push(`id ${id} invalid: ${rank}`);
      seen.add(rank);
    }
    if (seen.size !== 960) failures.push(`expected 960 distinct positions, got ${seen.size}`);

    for (let i = 0; i < iterations; i++) {
      const { id, backRank, board } = createInitialState();
      const white = board[7].map((p) => p.type.toUpperCase()).join('');
      const black = board[0].map((p) => p.type.toUpperCase()).join('');
      const pawnsOk = board[1].every((p) => p.type === 'p' && p.color === 'b') &&
                      board[6].every((p) => p.type === 'p' && p.color === 'w');
      const colorsOk = board[0].every((p) => p.color === 'b') && board[7].every((p) => p.color === 'w');
      const emptyOk = board.slice(2, 6).every((row) => row.every((sq) => sq === null));
      if (!validate960(white) || white !== backRank || white !== black || !pawnsOk || !colorsOk || !emptyOk) {
        failures.push(`random state for id ${id} failed`);
        if (failures.length > 20) break;
      }
    }

    const result = { passed: failures.length === 0, iterations, distinct: seen.size, failures };
    (result.passed ? console.log : console.error)('[Chess960 selfTest]', result);
    return result;
  }

  Object.assign(C, { decode960, validate960, createInitialState, selfTest });
})(window.Chess960 = window.Chess960 || {});
