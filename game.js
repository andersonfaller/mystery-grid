(function () {
  'use strict';

  const Law = window.Law;
  const root = document.documentElement;
  const $board = document.getElementById('board');
  const $undo = document.getElementById('undo');
  const $reset = document.getElementById('reset');
  const $pips = Array.from(document.querySelectorAll('#pips i'));
  const $theme = document.querySelector('meta[name="theme-color"]');
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');
  const STORE = 'mystery-grid';
  const BAR = 48;

  // Uma paleta por lei: fundo, casa clara, casa escura, acesa clara, acesa escura.
  const PALETTES = [
    ['#0a0a0a', '#171717', '#121212', '#ece7dc', '#ddd7ca'],
    ['#0b0c10', '#171922', '#12141b', '#e9bf62', '#d9ae50'],
    ['#100a0b', '#1e1315', '#170e10', '#ef6f55', '#df5f46'],
    ['#071012', '#10201f', '#0b1719', '#62d4c1', '#50c2b0'],
    ['#ebe7de', '#dfdace', '#d5cfc1', '#1b1a18', '#2b2926'],
    ['#0c0a12', '#1a1627', '#14111f', '#b39ef6', '#a28be9'],
    ['#090d09', '#141b13', '#0f150f', '#c6e46c', '#b4d35b'],
    ['#efe6d6', '#e3d6c0', '#d9cab1', '#b4452a', '#a33c23'],
  ];

  const store = {
    get() {
      try {
        return JSON.parse(window.localStorage.getItem(STORE)) || {};
      } catch (e) {
        return {};
      }
    },
    set(v) {
      try {
        window.localStorage.setItem(STORE, JSON.stringify(v));
      } catch (e) { /* sem memória, tudo bem */ }
    },
  };

  let game = null;
  let busy = true;

  const wait = (ms) => new Promise((r) => setTimeout(r, still.matches ? Math.min(ms, 60) : ms));

  // ------------------------------------------------------------ medidas

  function area() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = Math.round(Math.max(14, Math.min(48, Math.min(vw, vh) * 0.05)));
    return { pad, w: vw - 2 * pad, h: vh - 2 * pad - BAR };
  }

  function fit() {
    const a = area();
    const b = game.lv.board;
    const cell = Math.max(8, Math.floor(Math.min(a.w / b.cols, a.h / b.rows)));
    root.style.setProperty('--pad', a.pad + 'px');
    root.style.setProperty('--cols', b.cols);
    root.style.setProperty('--cell', cell + 'px');
  }

  function xy(i) {
    const cols = game.lv.board.cols;
    return [i % cols, Math.floor(i / cols)];
  }

  function dist(i, j) {
    const [ax, ay] = xy(i);
    const [bx, by] = xy(j);
    return Math.hypot(ax - bx, ay - by);
  }

  // --------------------------------------------------------------- cor

  function hex(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    const x = hex(a);
    const y = hex(b);
    return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',') + ')';
  }

  function palette(chapter) {
    const p = PALETTES[chapter % PALETTES.length];
    ['--bg', '--a', '--b', '--on', '--on2'].forEach((v, i) => root.style.setProperty(v, p[i]));
    root.style.colorScheme = hex(p[0])[0] > 128 ? 'light' : 'dark';
    if ($theme) $theme.setAttribute('content', p[0]);
    return p;
  }

  // ------------------------------------------------------------- desenho

  function build(board) {
    const frag = document.createDocumentFragment();
    const cells = new Array(board.n);
    for (let i = 0; i < board.n; i++) {
      const el = document.createElement('div');
      const x = i % board.cols;
      const y = Math.floor(i / board.cols);
      el.className = (x + y) & 1 ? 'c k' : 'c';
      el.dataset.i = i;
      cells[i] = el;
      frag.appendChild(el);
    }
    $board.replaceChildren(frag);
    return cells;
  }

  function flip(i, delay) {
    const el = game.cells[i];
    el.style.setProperty('--d', delay + 'ms');
    el.classList.toggle('on', game.state[i] === 1);
    if (!still.matches && el.animate) {
      el.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.84)', offset: 0.35 }, { transform: 'scale(1)' }],
        { duration: 440, delay, easing: 'cubic-bezier(.3,.7,.2,1)' }
      );
    }
  }

  function ripple(indices, origin) {
    for (const i of indices) flip(i, still.matches ? 0 : Math.min(dist(i, origin) * 45, 260));
  }

  // O tabuleiro respira quando fica limpo.
  function exhale(origin) {
    if (still.matches) return 0;
    const p = PALETTES[game.lv.chapter % PALETTES.length];
    let longest = 0;
    game.cells.forEach((el, i) => {
      const delay = dist(i, origin) * 55;
      const base = el.classList.contains('k') ? p[2] : p[1];
      longest = Math.max(longest, delay);
      el.animate(
        [
          { backgroundColor: base, transform: 'scale(1)' },
          { backgroundColor: mix(base, p[3], 0.3), transform: 'scale(0.9)', offset: 0.4 },
          { backgroundColor: base, transform: 'scale(1)' },
        ],
        { duration: 900, delay, easing: 'ease-in-out' }
      );
    });
    return longest + 900;
  }

  function pips(done) {
    $pips.forEach((el, i) => el.classList.toggle('done', i < done));
  }

  function sync() {
    $undo.disabled = busy || !game.history.length;
    $reset.disabled = busy || !game.history.length;
    store.set({
      level: game.lv.level,
      seed: game.lv.seed,
      cols: game.lv.board.cols,
      rows: game.lv.board.rows,
      history: game.history,
    });
  }

  // -------------------------------------------------------------- jogo

  async function start(level, saved) {
    busy = true;
    const a = area();
    let { cols, rows } = Law.gridFor(level, a.w, a.h);
    let seed;
    let history = [];
    if (saved && saved.level === level && Number.isFinite(saved.seed)) {
      seed = saved.seed;
      if (saved.cols === cols && saved.rows === rows && Array.isArray(saved.history)) {
        history = saved.history.filter((i) => Number.isInteger(i) && i >= 0 && i < cols * rows);
      }
    }

    const lv = Law.makeLevel(level, cols, rows, seed);
    $board.classList.add('gone');
    game = { lv, state: new Uint8Array(lv.board.n), history, cells: build(lv.board) };
    palette(lv.chapter);
    pips(lv.step);
    fit();
    sync();

    game.state.set(lv.state);
    for (const i of history) Law.apply(lv.board, game.state, i);

    void $board.offsetWidth;
    $board.classList.remove('gone');
    await wait(450);

    const centre = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
    for (let i = 0; i < lv.board.n; i++) {
      if (game.state[i]) flip(i, still.matches ? 0 : 60 + dist(i, centre) * 50 + Math.random() * 90);
    }
    await wait(500);
    busy = false;
    sync();
  }

  function press(i) {
    if (busy || !game) return;
    const touched = Law.apply(game.lv.board, game.state, i);
    game.history.push(i);
    ripple(touched, i);
    sync();
    if (!game.state.some((v) => v)) solved(i);
  }

  function undo() {
    if (busy || !game || !game.history.length) return;
    const i = game.history.pop();
    ripple(Law.apply(game.lv.board, game.state, i), i);
    sync();
  }

  function reset() {
    if (busy || !game || !game.history.length) return;
    const origin = game.history[game.history.length - 1];
    const changed = [];
    for (let i = 0; i < game.lv.board.n; i++) {
      if (game.state[i] !== game.lv.state[i]) changed.push(i);
    }
    game.state.set(game.lv.state);
    game.history = [];
    ripple(changed, origin);
    sync();
  }

  async function solved(origin) {
    busy = true;
    const lv = game.lv;
    sync();
    store.set({ level: lv.level + 1 });
    $pips[lv.step].classList.add('done');
    await wait(420);
    await wait(exhale(origin));
    $board.classList.add('gone');
    await wait(lv.step === Law.STEPS - 1 ? 1300 : 850);
    start(lv.level + 1);
  }

  // ------------------------------------------------------------ entradas

  $board.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.c');
    if (!el) return;
    e.preventDefault();
    press(Number(el.dataset.i));
  });

  $board.addEventListener('contextmenu', (e) => e.preventDefault());
  $undo.addEventListener('click', undo);
  $reset.addEventListener('click', reset);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
      e.preventDefault();
      undo();
    } else if (e.key === 'r' || e.key === 'R') {
      if (e.metaKey || e.ctrlKey) return;
      reset();
    }
  });

  let resizing = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizing);
    resizing = setTimeout(() => {
      if (!game || busy) return;
      const a = area();
      const ideal = Law.gridFor(game.lv.level, a.w, a.h);
      const b = game.lv.board;
      const same = ideal.cols === b.cols && ideal.rows === b.rows;
      const turned = ideal.cols !== ideal.rows && ideal.cols > ideal.rows !== b.cols > b.rows;
      if (!same && (!game.history.length || turned)) start(game.lv.level, { level: game.lv.level, seed: game.lv.seed });
      else fit();
    }, 250);
  });

  // ------------------------------------------------------------- início

  const saved = store.get();
  const forced = Number.parseInt(new URLSearchParams(window.location.search).get('l'), 10);
  const level = Number.isInteger(forced) && forced >= 0 ? forced : Number.isInteger(saved.level) && saved.level >= 0 ? saved.level : 0;
  start(level, Number.isInteger(forced) ? null : saved);
})();
