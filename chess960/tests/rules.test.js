// Run: node chess960/tests/rules.test.js
globalThis.window = globalThis;
require('../js/setup960.js');
require('../js/rules.js');
const C = globalThis.Chess960;

let failed = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
}

// Reference perft counts (chessprogramming.org "Perft Results" + Chess960 perft list).
const PERFT = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902]],
  ['kiwipete (castling, ep, promo)', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['position 3 (ep pins)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4 (promotions)', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['chess960 #1', 'bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9', [21, 528, 12189]],
];

for (const [name, fen, counts] of PERFT) {
  const s = C.fromFEN(fen);
  counts.forEach((n, i) => check(`perft ${name} d${i + 1}`, C.perft(s, i + 1), n));
}

// 960 castling edge cases
function castleResult(fen, side) {
  const s = C.fromFEN(fen);
  const m = C.legalMoves(s).find((x) => x.castle === side);
  if (!m) return 'no castle';
  const b = C.makeMove(s, m).board[7];
  return b.map((p) => (p ? p.type : '.')).join('');
}
check('O-O-O with king b1 / rook a1', castleResult('4k3/8/8/8/8/8/8/RK6 w A - 0 1', 'a'), '..kr....');
check('O-O with king already on g1', castleResult('4k3/8/8/8/8/8/8/6KR w H - 0 1', 'h'), '.....rk.');
check('O-O blocked by attacked path', castleResult('4kr2/8/8/8/8/8/8/4K2R w H - 0 1', 'h'), 'no castle');
check('O-O-O king and rook swap', castleResult('4k3/8/8/8/8/8/8/2RK4 w C - 0 1', 'a'), '..kr....');

// Game flow: fool's mate in the classical position (#518) → checkmate
{
  let s = C.createGame(518);
  for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) {
    const sq = (n) => [8 - +n[1], 'abcdefgh'.indexOf(n[0])];
    const m = C.legalMoves(s).find((x) => x.from + '' === sq(from) + '' && x.to + '' === sq(to) + '');
    s = C.makeMove(s, m);
  }
  const st = C.status(s);
  check('fool\'s mate detected', `${st.reason} ${st.result}`, 'checkmate 0-1');
}

// All 960 starts: 16 pawn moves + 2–4 knight moves, + 1 when king and rook can swap immediately
// (e.g. #275 BNRKNRQB allows O-O-O on move one).
{
  let bad = null;
  for (let id = 0; id < 960 && !bad; id++) {
    const n = C.legalMoves(C.createGame(id)).length;
    if (n < 18 || n > 21) bad = `#${id} has ${n}`;
  }
  check('all 960 starts have 18–21 legal moves', bad || 'ok', 'ok');
  check('#275 can castle on move one', C.legalMoves(C.createGame(275)).some((m) => m.castle === 'a'), true);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
