// Game controller: rules state is the single source of truth; the 3D view only replays it.
import { ChessView } from './view/view.js';

const C = window.Chess960;
const $ = (id) => document.getElementById(id);
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PIECE_NAME = { q: 'QUEEN', r: 'ROOK', b: 'BISHOP', n: 'KNIGHT' };
const SETTINGS_KEY = 'chess960.settings';

const settings = Object.assign({ quality: 'auto', cinematic: true, slowmo: true }, loadSettings());

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

const sameSq = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

// ---------- State ----------

let game = null;
let status = null;
let history = [];
let selected = null;
let busy = false;

const view = new ChessView($('stage'));

// ---------- Flow ----------

function newGame(id) {
  game = C.createGame(id);
  status = C.status(game);
  history = [];
  selected = null;
  hideBanner();
  view.sync(game.board, { intro: true });
  refresh();
}

function movesFrom(sq) {
  return status.moves.filter((m) => sameSq(m.from, sq));
}

// Targets shown for a selected piece. Castling is offered on the rook square, and also on the
// king's landing square when that square isn't already a normal king move.
function targetsFor(sq) {
  const moves = movesFrom(sq);
  const out = [];
  for (const m of moves) {
    if (m.castle) {
      out.push({ sq: m.to, castle: true, move: m });
      if (!sameSq(m.kingTo, m.from) && !moves.some((o) => !o.castle && sameSq(o.to, m.kingTo))) {
        out.push({ sq: m.kingTo, castle: true, move: m });
      }
    } else if (!out.some((t) => sameSq(t.sq, m.to))) {
      out.push({ sq: m.to, capture: !!m.captured });
    }
  }
  return out;
}

function select(sq) {
  selected = sq;
  view.select(sq);
  refreshMarks();
}

async function onSquare(sq) {
  if (busy || status.over || !sq) return;
  const piece = game.board[sq[0]][sq[1]];

  if (selected) {
    const target = targetsFor(selected).find((t) => sameSq(t.sq, sq));
    if (target) {
      let candidates = target.move ? [target.move] : movesFrom(selected).filter((m) => !m.castle && sameSq(m.to, sq));
      if (candidates.length > 1) {
        const promo = await askPromotion(game.turn);
        if (!promo) return;
        candidates = candidates.filter((m) => m.promo === promo);
      }
      return play(candidates[0]);
    }
    if (sameSq(sq, selected)) return select(null);
  }
  if (piece && piece.color === game.turn && movesFrom(sq).length) select(sq);
  else select(null);
}

function onHoverSquare(sq) {
  if (busy || status.over || !sq) { view.setHover(null); return; }
  const piece = game.board[sq[0]][sq[1]];
  const ownMovable = piece && piece.color === game.turn && movesFrom(sq).length;
  const isTarget = selected && targetsFor(selected).some((t) => sameSq(t.sq, sq));
  view.setHover(ownMovable || isTarget ? sq : null);
  document.body.style.cursor = ownMovable || isTarget ? 'pointer' : '';
}

async function play(move) {
  busy = true;
  const prev = game;
  const san = C.toSAN(prev, move, status.moves);
  game = C.makeMove(prev, move);
  status = C.status(game);
  history.push({ prev, move, san });
  selected = null;
  view.select(null);
  view.setHover(null);
  view.setMarks({});
  refreshLog();

  try {
    await view.playMove(move, { cinematic: settings.cinematic, slowmo: settings.slowmo });
  } finally {
    view.sync(game.board); // guarantees the view matches the rules state
    busy = false;
  }
  if (pendingTheme) applyThemeToView(pendingTheme);
  refresh();
  announce();
}

function undo() {
  if (busy || !history.length) return;
  game = history.pop().prev;
  status = C.status(game);
  selected = null;
  hideBanner();
  view.sync(game.board);
  refresh();
}

// ---------- HUD ----------

function refresh() {
  $('pos-id').textContent = '#' + String(game.id).padStart(3, '0');
  $('pos-rank').textContent = game.backRank;
  for (const c of ['w', 'b']) {
    const panel = $('player-' + c);
    panel.classList.toggle('is-active', game.turn === c && !status.over);
    panel.classList.toggle('is-checked', game.turn === c && status.check && !status.over);
    $('name-' + c).textContent = C.sideName(c);
    $('status-' + c).textContent = panelStatus(c);
  }
  refreshCaptures();
  refreshLog();
  refreshMarks();
  $('btn-undo').disabled = !history.length;
}

function panelStatus(c) {
  if (status.over) {
    if (status.result === '1/2-1/2') return 'DRAW';
    return (status.result === '1-0') === (c === 'w') ? 'VICTORY' : 'DEFEATED';
  }
  if (game.turn !== c) return 'STANDING BY';
  return status.check ? 'KING UNDER ATTACK' : 'YOUR COMMAND';
}

function refreshMarks() {
  const last = history.length ? history[history.length - 1].move : null;
  const king = status.check ? C.findKing(game.board, game.turn) : null;
  view.setMarks({
    selected,
    targets: selected ? targetsFor(selected) : [],
    last: last ? [last.from, last.castle ? last.kingTo : last.to] : null,
    check: king,
  });
}

function refreshCaptures() {
  const taken = { w: [], b: [] };
  for (const h of history) if (h.move.captured) taken[h.move.piece.color].push(h.move.captured.type);
  const order = 'qrbnp';
  for (const c of ['w', 'b']) {
    const el = $('caps-' + c);
    el.textContent = '';
    taken[c].sort((a, b) => order.indexOf(a) - order.indexOf(b)).forEach((t) => {
      const s = document.createElement('span');
      s.className = 'cap cap--' + (c === 'w' ? 'b' : 'w');
      s.textContent = GLYPH[t] + '︎';
      el.appendChild(s);
    });
  }
}

function refreshLog() {
  const ol = $('moves');
  ol.textContent = '';
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="mv-n">${i / 2 + 1}.</span><span class="mv">${history[i].san}</span><span class="mv">${history[i + 1]?.san || ''}</span>`;
    ol.appendChild(li);
  }
  ol.scrollTop = ol.scrollHeight;
}

function announce() {
  if (status.over) {
    const winner = status.result === '1-0' ? 'w' : status.result === '0-1' ? 'b' : null;
    showBanner(
      status.reason.toUpperCase(),
      winner ? `${C.sideName(winner)} TRIUMPHS` : 'THE BATTLE IS DRAWN',
      status.result,
      true,
    );
    view.shake(0.35);
  } else if (status.check) {
    showBanner('WARNING', 'CHECK', `${C.sideName(game.turn)} KING UNDER ATTACK`, false);
  }
}

let bannerTimer = null;
function showBanner(kicker, title, sub, sticky) {
  clearTimeout(bannerTimer);
  const b = $('banner');
  $('banner-kicker').textContent = kicker;
  $('banner-title').textContent = title;
  $('banner-sub').textContent = sub;
  $('banner-new').hidden = !sticky;
  b.classList.toggle('is-final', sticky);
  b.hidden = false;
  b.classList.remove('is-in');
  void b.offsetWidth;
  b.classList.add('is-in');
  if (!sticky) bannerTimer = setTimeout(hideBanner, 1600);
}
function hideBanner() {
  clearTimeout(bannerTimer);
  $('banner').hidden = true;
}

function askPromotion(color) {
  return new Promise((resolve) => {
    const box = $('promo');
    const choices = $('promo-choices');
    choices.textContent = '';
    const done = (v) => { box.hidden = true; document.removeEventListener('keydown', esc); resolve(v); };
    const esc = (e) => { if (e.key === 'Escape') done(null); };
    for (const t of ['q', 'r', 'b', 'n']) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo__btn';
      btn.innerHTML = `<span class="promo__glyph cap--${color}">${GLYPH[t]}︎</span><span>${PIECE_NAME[t]}</span>`;
      btn.addEventListener('click', () => done(t));
      choices.appendChild(btn);
    }
    box.hidden = false;
    choices.firstChild.focus();
    document.addEventListener('keydown', esc);
  });
}

// ---------- Settings & controls ----------

function setupControls() {
  $('btn-new').addEventListener('click', () => { if (!busy) newGame(); });
  $('banner-new').addEventListener('click', () => newGame());
  $('btn-undo').addEventListener('click', undo);
  $('btn-flip').addEventListener('click', () => { if (!busy) view.flip(); });
  $('btn-cam').addEventListener('click', () => { if (!busy) view.resetCamera(); });

  const panel = $('settings');
  const toggle = $('btn-settings');
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });

  const quality = $('opt-quality');
  quality.value = settings.quality;
  quality.addEventListener('change', () => {
    settings.quality = quality.value;
    saveSettings();
    view.setQualityMode(settings.quality);
  });
  view.onQualityChange = (name) => { $('quality-now').textContent = name.toUpperCase(); };

  for (const key of ['cinematic', 'slowmo']) {
    const box = $('opt-' + key);
    box.checked = settings[key];
    box.addEventListener('change', () => { settings[key] = box.checked; saveSettings(); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || !$('promo').hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') select(null);
    else if (k === 'u') undo();
    else if (k === 'f' && !busy) view.flip();
    else if (k === 'c' && !busy) view.resetCamera();
    else if (k === 'n' && !busy) newGame();
  });
}

// ---------- Boot ----------

view.onSquare = onSquare;
view.onHoverSquare = onHoverSquare;
view.setQualityMode(settings.quality);
$('quality-now').textContent = view.quality.toUpperCase();
setupControls();

let pendingTheme = null;
function applyThemeToView(theme) {
  if (busy) { pendingTheme = theme; return; } // never rebuild the scene mid-animation
  pendingTheme = null;
  view.setTheme(theme, game ? game.board : null);
  if (game) refresh();
}
document.addEventListener('themechange', (e) => applyThemeToView(e.detail));
game = C.createGame();
status = C.status(game);
C.initThemes(); // builds the world and drops the pieces in
refresh();

window.__chess960Ready = true;
$('loader').classList.add('is-done');
C.debug = { get game() { return game; }, get status() { return status; }, view, play, newGame };
