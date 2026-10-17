import { Board } from './board.js';
import { DIFFICULTIES, GENERATOR_VERSION, generateLevel, levelParams } from './generator.js';
import { BoardView } from './view.js';
import { sfx, setSoundEnabled, unlockAudio } from './audio.js';
import { initAppInfo } from './app-info.js';

const STORAGE_KEY = 'bended-arrows';
const ORDER = ['easy', 'medium', 'hard', 'expert'];
const FLAVOR = {
  easy: 'korte pile',
  medium: 'pile med knæk',
  hard: 'lange, snoede pile',
  expert: 'stor labyrint, ingen tip',
};
const HEART =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3l-1.3-1.2C6 14.9 3 12.2 3 8.8 3 6.1 5.1 4 7.8 4c1.6 0 3.1.7 4.2 2 1.1-1.3 2.6-2 4.2-2C18.9 4 21 6.1 21 8.8c0 3.4-3 6.1-7.7 10.3L12 20.3z"/></svg>';

const $ = (id) => document.getElementById(id);

// ---- saved state ----------------------------------------------------------

const save = loadSave();

function loadSave() {
  const fresh = { progress: {}, solved: {}, sound: true, theme: 'auto', current: null };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && typeof raw === 'object') {
      const merged = { ...fresh, ...raw };
      if (merged.current?.version !== GENERATOR_VERSION) merged.current = null;
      return merged;
    }
  } catch {
    // Ignore unreadable or blocked storage and start fresh.
  }
  return fresh;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or full storage: the game still works, it just won't remember.
  }
}

// ---- theme ---------------------------------------------------------------

const THEMES = { auto: 'Auto', light: 'Lys', dark: 'Mørk' };
const systemDark = matchMedia('(prefers-color-scheme: dark)');

// Light or dark: the player's choice, or the phone's setting on 'auto'. The
// script at the top of index.html does the same before the first paint.
function applyTheme() {
  if (!THEMES[save.theme]) save.theme = 'auto';
  const dark = save.theme === 'dark' || (save.theme === 'auto' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#171b22' : '#f6f3ea';
  view.refreshTheme();
}

function nextLevel(difficulty) {
  return save.progress[difficulty] || 1;
}

// ---- game -----------------------------------------------------------------

let game = null;

const view = new BoardView($('board'), {
  onTap: handleTap,
  onZoomChange: (zoomed) => {
    $('zoom-reset').hidden = !zoomed;
  },
});

let loading = 0;

// A big board takes a moment to build on slower phones, so the game screen
// comes up first with a note, and the level is generated right after.
function startLevel(difficulty, levelNumber, resume = null) {
  const params = DIFFICULTIES[difficulty];
  const token = ++loading;
  game = null;
  hideOverlay();
  showGameScreen();
  $('level-name').textContent = `${params.label} · Bane ${levelNumber}`;
  $('arrows-left').textContent = '';
  $('lives').innerHTML = '';
  $('hint-count').textContent = '';
  $('hint-btn').disabled = true;
  $('board-wrap').classList.add('loading');
  requestAnimationFrame(() =>
    setTimeout(() => {
      if (token !== loading || $('game').hidden) return;
      const board = new Board(generateLevel(difficulty, levelNumber));
      game = {
        difficulty,
        levelNumber,
        params,
        board,
        lives: params.lives,
        shownLives: params.lives,
        hintsLeft: params.hints,
        mistakes: 0,
        elapsed: 0,
        startedAt: performance.now(),
        over: false,
      };
      if (resume) {
        for (const id of resume.removed) if (board.arrows[id]) board.remove(id);
        game.lives = game.shownLives = resume.lives;
        game.hintsLeft = resume.hintsLeft;
        game.mistakes = resume.mistakes;
        game.elapsed = resume.elapsed;
      }
      $('board-wrap').classList.remove('loading');
      view.setBoard(board, { colored: params.colored });
      renderHud();
      saveCurrent();
    }),
  );
}

function elapsed() {
  return game.elapsed + (game.startedAt === null ? 0 : performance.now() - game.startedAt);
}

function saveCurrent() {
  if (!game || game.over) return;
  save.current = {
    version: GENERATOR_VERSION,
    difficulty: game.difficulty,
    levelNumber: game.levelNumber,
    removed: game.board.arrows.filter((a) => game.board.removed[a.id]).map((a) => a.id),
    lives: game.lives,
    hintsLeft: game.hintsLeft,
    mistakes: game.mistakes,
    elapsed: Math.round(elapsed()),
  };
  persist();
}

function handleTap(id) {
  if (!game || game.over || view.isAnimating(id)) return;
  unlockAudio();
  const g = game;
  const { board } = g;
  const block = board.blocker(id);
  if (!block) {
    const rayLength = board.ray(id).length;
    board.remove(id);
    view.animateExit(id, rayLength);
    sfx.shoot();
    renderHud();
    if (board.remaining === 0) {
      endGame(true);
      setTimeout(() => game === g && showResult(g, true), 700);
    }
  } else {
    g.lives--;
    g.mistakes++;
    const out = g.lives <= 0;
    if (out) endGame(false);
    view.animateBump(
      id,
      block.steps,
      block.id,
      () => {
        if (game !== g) return;
        sfx.hit();
        navigator.vibrate?.(70);
        g.shownLives--;
        renderHud(true);
      },
      () => out && game === g && showResult(g, false),
    );
  }
  saveCurrent();
}

// The outcome is recorded straight away, so it sticks even if the player
// leaves before the result card shows up.
function endGame(won) {
  const { difficulty, levelNumber } = game;
  game.over = true;
  game.time = elapsed();
  save.current = null;
  if (won) {
    save.progress[difficulty] = Math.max(nextLevel(difficulty), levelNumber + 1);
    save.solved[difficulty] = (save.solved[difficulty] || 0) + 1;
  }
  persist();
}

function showResult(g, won) {
  const { difficulty, levelNumber, board, params } = g;
  if (won) {
    sfx.win();
    const perfect = g.mistakes === 0;
    showOverlay({
      title: perfect ? 'Fejlfrit!' : 'Bane klaret!',
      body: `
        <div class="big">${perfect ? '🏆' : '🎉'}</div>
        <p class="center">${params.label} · Bane ${levelNumber} er tømt for pile.</p>
        <div class="stats">
          <div><strong>${formatTime(g.time)}</strong>tid</div>
          <div><strong>${g.mistakes}</strong>fejl</div>
          <div><strong>${board.arrows.length}</strong>pile</div>
        </div>`,
      actions: [
        { label: 'Næste bane', primary: true, onClick: () => startLevel(difficulty, levelNumber + 1) },
        { label: 'Menu', onClick: goToMenu },
      ],
    });
  } else {
    sfx.lose();
    const removed = board.arrows.length - board.remaining;
    showOverlay({
      title: 'Ingen liv tilbage',
      body: `
        <div class="big">💥</div>
        <p class="center">Du nåede at fjerne ${removed} af ${board.arrows.length} pile.</p>`,
      actions: [
        { label: 'Prøv igen', primary: true, onClick: () => startLevel(difficulty, levelNumber) },
        { label: 'Menu', onClick: goToMenu },
      ],
    });
  }
}

function useHint() {
  if (!game || game.over || game.hintsLeft <= 0) return;
  unlockAudio();
  const free = game.board.freeArrows().filter((id) => !view.isAnimating(id));
  if (!free.length) return;
  view.showHint(free[Math.floor(Math.random() * free.length)]);
  game.hintsLeft--;
  sfx.hint();
  renderHud();
  saveCurrent();
}

function restart() {
  if (!game) return;
  const moved = game.board.remaining < game.board.arrows.length || game.lives < game.params.lives;
  if (!moved || game.over) {
    startLevel(game.difficulty, game.levelNumber);
    return;
  }
  showOverlay({
    title: 'Start forfra?',
    body: '<p class="center">Banen stilles op igen, og du får alle liv tilbage.</p>',
    actions: [
      { label: 'Start forfra', primary: true, onClick: () => startLevel(game.difficulty, game.levelNumber) },
      { label: 'Annuller', onClick: hideOverlay },
    ],
  });
}

function formatTime(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---- rendering ------------------------------------------------------------

function renderHud(lostLife = false) {
  const { params, board, levelNumber } = game;
  $('level-name').textContent = `${params.label} · Bane ${levelNumber}`;
  $('arrows-left').textContent = `${board.remaining} ${board.remaining === 1 ? 'pil' : 'pile'} tilbage`;
  const lives = $('lives');
  lives.innerHTML = HEART.repeat(params.lives);
  lives.setAttribute('aria-label', `${game.shownLives} af ${params.lives} liv tilbage`);
  [...lives.children].forEach((svg, i) => {
    svg.classList.toggle('lost', i >= game.shownLives);
    if (lostLife && i === game.shownLives) svg.classList.add('pop');
  });
  $('hint-count').textContent = game.hintsLeft;
  $('hint-btn').disabled = game.hintsLeft <= 0;
}

function renderMenu() {
  const list = $('difficulty-list');
  list.innerHTML = '';
  for (const key of ORDER) {
    const p = levelParams(key, nextLevel(key));
    const btn = document.createElement('button');
    btn.className = 'diff-card';
    btn.style.setProperty('--tone', `var(--${key})`);
    btn.innerHTML = `
      <span class="name">${p.label}</span>
      <span class="desc">${p.cols}×${p.rows} · ${p.lives} liv · ${FLAVOR[key]}</span>
      <span class="level">Bane ${nextLevel(key)}</span>`;
    btn.addEventListener('click', () => {
      unlockAudio();
      const cur = save.current;
      if (cur && cur.difficulty === key && cur.levelNumber === nextLevel(key)) startLevel(key, cur.levelNumber, cur);
      else startLevel(key, nextLevel(key));
    });
    list.append(btn);
  }
  const cont = $('continue-btn');
  const cur = save.current;
  cont.hidden = !cur;
  if (cur) cont.textContent = `Fortsæt: ${DIFFICULTIES[cur.difficulty].label} · Bane ${cur.levelNumber}`;
  const sound = $('sound-btn');
  sound.textContent = save.sound ? 'Lyd: til' : 'Lyd: fra';
  sound.setAttribute('aria-pressed', String(save.sound));
  $('theme-btn').textContent = `Tema: ${THEMES[save.theme]}`;
}

// ---- screens & overlay ----------------------------------------------------

function showGameScreen() {
  $('menu').hidden = true;
  $('game').hidden = false;
  if (history.state?.screen !== 'game') history.pushState({ screen: 'game' }, '');
}

function leaveGame() {
  if (game && !game.over) {
    game.elapsed = elapsed();
    game.startedAt = performance.now();
    saveCurrent();
  }
  game = null;
  hideOverlay();
  $('game').hidden = true;
  $('menu').hidden = false;
  renderMenu();
}

function goToMenu() {
  if (history.state?.screen === 'game') history.back();
  else leaveGame();
}

let overlayDismiss = null;

function showOverlay({ title, body, actions, dismissable = false }) {
  $('overlay-title').textContent = title;
  const bodyEl = $('overlay-body');
  bodyEl.innerHTML = '';
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else bodyEl.append(body);
  const acts = $('overlay-actions');
  acts.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn wide${a.primary ? ' primary' : ''}`;
    b.textContent = a.label;
    b.addEventListener('click', a.onClick);
    acts.append(b);
  }
  overlayDismiss = dismissable ? hideOverlay : null;
  $('overlay').hidden = false;
  acts.querySelector('.primary')?.focus({ preventScroll: true });
}

function hideOverlay() {
  $('overlay').hidden = true;
  overlayDismiss = null;
}

function showIosInstall() {
  showOverlay({
    title: 'Installér som app',
    body: `
      <ol class="rules">
        <li>Tryk på <strong>Del</strong>-knappen (firkanten med en pil op) i Safari.</li>
        <li>Vælg <strong>Føj til hjemmeskærm</strong>.</li>
        <li>Tryk <strong>Tilføj</strong>.</li>
      </ol>
      <p class="muted">Så starter spillet i fuld skærm fra hjemmeskærmen og virker uden net.</p>`,
    actions: [{ label: 'OK', primary: true, onClick: hideOverlay }],
    dismissable: true,
  });
}

function showHowTo() {
  showOverlay({
    title: 'Sådan spiller du',
    body: $('howto-template').content.cloneNode(true),
    actions: [{ label: 'Forstået', primary: true, onClick: hideOverlay }],
    dismissable: true,
  });
}

// ---- wiring ---------------------------------------------------------------

$('continue-btn').addEventListener('click', () => {
  unlockAudio();
  const cur = save.current;
  if (cur) startLevel(cur.difficulty, cur.levelNumber, cur);
});
$('howto-btn').addEventListener('click', showHowTo);
$('sound-btn').addEventListener('click', () => {
  save.sound = !save.sound;
  setSoundEnabled(save.sound);
  if (save.sound) unlockAudio();
  persist();
  renderMenu();
});
$('theme-btn').addEventListener('click', () => {
  const order = Object.keys(THEMES);
  save.theme = order[(order.indexOf(save.theme) + 1) % order.length];
  persist();
  applyTheme();
  renderMenu();
});
systemDark.addEventListener('change', () => {
  if (save.theme === 'auto') applyTheme();
});
$('back-btn').addEventListener('click', goToMenu);
$('hint-btn').addEventListener('click', useHint);
$('restart-btn').addEventListener('click', restart);
$('zoom-reset').addEventListener('click', () => view.resetZoom());
$('overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) overlayDismiss?.();
});
window.addEventListener('popstate', () => {
  if (!$('game').hidden) leaveGame();
});
document.addEventListener('visibilitychange', () => {
  if (!game || game.over) return;
  if (document.hidden) {
    game.elapsed = elapsed();
    game.startedAt = null;
    saveCurrent();
  } else {
    game.startedAt = performance.now();
  }
});
window.addEventListener('pagehide', saveCurrent);

setSoundEnabled(save.sound);
applyTheme();
renderMenu();
initAppInfo({ showIosInstall });
if (!save.seenRules) {
  showHowTo();
  save.seenRules = true;
  persist();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
