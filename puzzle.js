/*
 * Mystery Grid — a lei oculta.
 *
 * Um clique em (x, y) inverte a célula (x + dx, y + dy) se e somente se
 *
 *     (dx, dy) = (0, 0)   ou   [ Q(u, v) ∈ S   e   L(u, v) ≥ 0 ]
 *
 *     Q(u, v) = a·u² + b·u·v + c·v²        (forma quadrática: "distância")
 *     L(u, v) = p·u + q·v + r              (semiplano: "direção")
 *     (u, v)  = (dx, dy)                   na face clara
 *     (u, v)  = T(dx, dy)                  na face escura (T ∈ simetrias do quadrado)
 *
 * A "face" de uma casa é dada por uma zona: cor da casa no xadrez, linha par/ímpar
 * ou coluna par/ímpar. Em algumas leis o tabuleiro é um toro (as bordas se tocam).
 *
 * Cada clique aplica um XOR com uma máscara fixa que só depende da posição clicada,
 * logo cliques comutam e são involuções: o tabuleiro inicial é gerado aplicando k
 * cliques ao tabuleiro vazio, e refazer esses mesmos k cliques o resolve.
 *
 * Sem DOM: funciona no navegador (window.Law) e no Node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Law = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REACH = 2; // toda lei vive numa janela 5×5 em volta do clique
  const STEPS = 3; // níveis por lei (capítulo)
  const SALT = 0x5eed1e55;

  // ---------------------------------------------------------------- acaso

  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash() {
    let h = 0x811c9dc5;
    for (let i = 0; i < arguments.length; i++) {
      h = Math.imul(h ^ (arguments[i] | 0), 0x01000193);
      h ^= h >>> 15;
      h = Math.imul(h, 0x2c1b3c6d);
      h ^= h >>> 12;
    }
    return h >>> 0;
  }

  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const randomSeed = () => (Math.random() * 4294967296) >>> 0;

  // ------------------------------------------------------------- a lei

  // As 8 simetrias do quadrado.
  const SYM = [
    (x, y) => [x, y],
    (x, y) => [-y, x],
    (x, y) => [-x, -y],
    (x, y) => [y, -x],
    (x, y) => [-x, y],
    (x, y) => [x, -y],
    (x, y) => [y, x],
    (x, y) => [-y, -x],
  ];

  // Zonas: qual face da lei vale em (x, y).
  const ZONE = [
    (x, y) => (x + y) & 1, // xadrez
    (x, y) => y & 1, // linhas
    (x, y) => x & 1, // colunas
  ];

  function holds(key, u, v) {
    if (u === 0 && v === 0) return true;
    const [a, b, c] = key.q;
    if (!key.s.includes(a * u * u + b * u * v + c * v * v)) return false;
    if (key.l) {
      const [p, q, r] = key.l;
      if (p * u + q * v + r < 0) return false;
    }
    return true;
  }

  // Deslocamentos afetados por um clique numa casa da face `face` (0 ou 1).
  function shape(key, face) {
    const T = SYM[face && key.t ? key.t : 0];
    const out = [];
    for (let dy = -REACH; dy <= REACH; dy++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const [u, v] = T(dx, dy);
        if (holds(key, u, v)) out.push([dx, dy]);
      }
    }
    return out;
  }

  const sig = (sh) => sh.map(([x, y]) => x + ',' + y).sort().join(' ');

  // As primeiras leis são escolhidas à mão, para ensinar sem palavras.
  const CURATED = [
    { q: [1, 0, 1], s: [2] }, //                     X
    { q: [1, 0, 1], s: [4] }, //                     cruz com vãos
    { q: [1, 1, 1], s: [1] }, //                     hexágono torto
    { q: [1, 0, 1], s: [1, 2], l: [1, 1, 0] }, //    meia-lua
    { q: [1, 0, 1], s: [5], l: [0, 1, -1], t: 2 }, // meio cavalo, que gira nas casas escuras
    { q: [1, 0, 1], s: [1, 4], l: [1, 0, 0], w: 1 }, // seta, num mundo sem bordas
  ];

  const FORMS = [
    [1, 0, 1], [1, 0, 1], [1, 1, 1], [1, -1, 1],
    [2, 0, 1], [1, 0, 2], [2, 1, 1], [1, 1, 2], [2, -1, 1], [1, -1, 2],
  ];

  function valuesOf(q) {
    const set = new Set();
    for (let v = -REACH; v <= REACH; v++)
      for (let u = -REACH; u <= REACH; u++)
        if (u || v) set.add(q[0] * u * u + q[1] * u * v + q[2] * v * v);
    return [...set].sort((a, b) => a - b);
  }

  function acceptable(key, prev) {
    const s0 = shape(key, 0);
    const s1 = shape(key, 1);
    for (const sh of [s0, s1]) if (sh.length < 4 || sh.length > 8) return false;
    if (key.t && sig(s0) === sig(s1)) return false; // a face escura tem de ser outra
    if (prev && sig(s0) === sig(shape(prev, 0))) return false; // nunca repetir a anterior
    return true;
  }

  const keyMemo = new Map();

  function keyFor(chapter) {
    if (chapter < CURATED.length) return CURATED[chapter];
    if (keyMemo.has(chapter)) return keyMemo.get(chapter);
    const rng = rngFrom(hash(SALT, chapter));
    const prev = keyFor(chapter - 1);
    const depth = chapter - CURATED.length; // o quanto a lei pode se esconder
    let key = null;
    for (let tries = 0; tries < 2000 && !key; tries++) {
      const q = pick(rng, FORMS);
      const vals = valuesOf(q).filter((v) => v <= 8);
      const s = [pick(rng, vals)];
      if (rng() < 0.45) {
        const extra = pick(rng, vals);
        if (!s.includes(extra)) s.push(extra);
      }
      const k = { q, s };
      if (rng() < 0.6) {
        let p = 0;
        let qq = 0;
        while (!p && !qq) {
          p = pick(rng, [-1, 0, 1]);
          qq = pick(rng, [-1, 0, 1]);
        }
        k.l = [p, qq, pick(rng, [0, 0, -1])];
      }
      if (rng() < 0.5 + Math.min(depth, 6) * 0.04) {
        k.t = 1 + Math.floor(rng() * 7);
        if (depth >= 4 && rng() < 0.3) k.z = 1 + Math.floor(rng() * 2);
      }
      if (rng() < 0.3) k.w = 1;
      const plain = !k.l && !k.t && q[1] === 0 && q[0] === q[2];
      if (plain) continue; // daqui em diante, nada de leis óbvias
      if (acceptable(k, prev)) key = k;
    }
    keyMemo.set(chapter, key);
    return key;
  }

  // --------------------------------------------------------- tabuleiro

  function makeBoard(cols, rows, key) {
    const n = cols * rows;
    const faces = [shape(key, 0), shape(key, 1)];
    const zone = ZONE[key.z || 0];
    const masks = new Array(n);
    const full = new Uint8Array(n); // a figura inteira coube, sem cortes nem voltas
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const sh = faces[key.t ? zone(x, y) : 0];
        const hit = new Set();
        let clean = true;
        for (const [dx, dy] of sh) {
          let i = x + dx;
          let j = y + dy;
          if (i < 0 || j < 0 || i >= cols || j >= rows) {
            clean = false;
            if (!key.w) continue;
            i = ((i % cols) + cols) % cols;
            j = ((j % rows) + rows) % rows;
          }
          hit.add(j * cols + i);
        }
        const idx = y * cols + x;
        masks[idx] = Int16Array.from([...hit].sort((a, b) => a - b));
        full[idx] = clean && hit.size === sh.length ? 1 : 0;
      }
    }
    return { cols, rows, n, key, masks, full, zone: (i) => (key.t ? zone(i % cols, Math.floor(i / cols)) : 0) };
  }

  function apply(board, state, idx) {
    const m = board.masks[idx];
    for (let i = 0; i < m.length; i++) state[m[i]] ^= 1;
    return m;
  }

  // ------------------------------------------------- independência em GF(2)

  function bitsOf(mask, words) {
    const b = new Uint32Array(words);
    for (let i = 0; i < mask.length; i++) b[mask[i] >>> 5] |= 1 << (mask[i] & 31);
    return b;
  }

  function lowBit(b) {
    for (let w = 0; w < b.length; w++) if (b[w]) return w * 32 + (31 - Math.clz32(b[w] & -b[w]));
    return -1;
  }

  // Nenhum subconjunto dos cliques se anula: o embaralhamento não "desfaz" a si mesmo.
  function independent(board, presses) {
    const words = Math.ceil(board.n / 32);
    const basis = [];
    for (const p of presses) {
      const v = bitsOf(board.masks[p], words);
      for (const e of basis) {
        if ((v[e.pivot >>> 5] >>> (e.pivot & 31)) & 1) for (let w = 0; w < words; w++) v[w] ^= e.bits[w];
      }
      const pivot = lowBit(v);
      if (pivot < 0) return false;
      basis.push({ pivot, bits: v });
    }
    return true;
  }

  // --------------------------------------------------------------- níveis

  const chapterOf = (level) => Math.floor(level / STEPS);
  const stepOf = (level) => level % STEPS;

  // Quantos cliques reversos embaralham o tabuleiro.
  function pressesFor(level) {
    const c = chapterOf(level);
    const s = stepOf(level);
    const key = keyFor(c);
    if (s === 0) return key.t ? 2 : 1; // a primeira vez de cada lei é uma revelação
    const base = s === 1 ? 3 : 5;
    return Math.min(base + Math.floor(c / 2), s === 1 ? 7 : 10);
  }

  // Quantas casas, aproximadamente, a tela deve mostrar (cresce aos poucos).
  const cellTarget = (level) => Math.min(36 + chapterOf(level) * 9, 150);

  function separated(board, a, b, gap) {
    const ax = a % board.cols;
    const ay = Math.floor(a / board.cols);
    const bx = b % board.cols;
    const by = Math.floor(b / board.cols);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by)) >= gap;
  }

  function wraps(board, idx) {
    return board.key.w && !board.full[idx];
  }

  // Revelação: a lei aparece inteira, sozinha (uma figura por face).
  function reveal(board, rng) {
    const want = board.key.t ? 2 : 1;
    const centre = (i) => {
      const x = (i % board.cols) - (board.cols - 1) / 2;
      const y = Math.floor(i / board.cols) - (board.rows - 1) / 2;
      return x * x + y * y;
    };
    for (let gap = 2 * REACH + 1; gap >= 1; gap--) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const chosen = [];
        const faces = new Set();
        for (let tries = 0; tries < 60 && chosen.length < want; tries++) {
          const i = Math.floor(rng() * board.n);
          const ok = board.key.w && want === 1 ? wraps(board, i) : board.full[i];
          if (!ok || faces.has(board.zone(i))) continue;
          if (want === 1 && !board.key.w && centre(i) > (board.cols * board.cols + board.rows * board.rows) / 16 && attempt < 300) continue;
          if (chosen.some((c) => !separated(board, c, i, gap))) continue;
          chosen.push(i);
          faces.add(board.zone(i));
        }
        if (chosen.length === want && independent(board, chosen)) return chosen;
      }
    }
    return null;
  }

  // Embaralhamento: cliques que se esbarram, para que as figuras se misturem.
  function tangle(board, k, rng) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const chosen = [];
      const used = new Set();
      for (let tries = 0; tries < 400 && chosen.length < k; tries++) {
        let i;
        if (chosen.length && rng() < 0.65) {
          const near = chosen[Math.floor(rng() * chosen.length)];
          const x = (near % board.cols) + Math.round((rng() * 2 - 1) * 3);
          const y = Math.floor(near / board.cols) + Math.round((rng() * 2 - 1) * 3);
          if (x < 0 || y < 0 || x >= board.cols || y >= board.rows) continue;
          i = y * board.cols + x;
        } else {
          i = Math.floor(rng() * board.n);
        }
        if (used.has(i)) continue;
        used.add(i);
        chosen.push(i);
      }
      if (chosen.length < k || !independent(board, chosen)) continue;
      const state = new Uint8Array(board.n);
      for (const p of chosen) apply(board, state, p);
      let lit = 0;
      for (let i = 0; i < board.n; i++) lit += state[i];
      if (lit >= k + 2) return chosen;
    }
    return null;
  }

  function makeLevel(level, cols, rows, seed) {
    seed = seed === undefined ? randomSeed() : seed >>> 0;
    const rng = rngFrom(hash(seed, level));
    const key = keyFor(chapterOf(level));
    const board = makeBoard(cols, rows, key);
    const k = pressesFor(level);
    let presses = stepOf(level) === 0 ? reveal(board, rng) : null;
    for (let kk = k; !presses && kk >= 1; kk--) presses = tangle(board, kk, rng);
    if (!presses) presses = [Math.floor(board.n / 2)];
    const state = new Uint8Array(board.n);
    for (const p of presses) apply(board, state, p);
    return { level, chapter: chapterOf(level), step: stepOf(level), seed, board, state, presses };
  }

  // Dimensões da grade para uma área disponível (em px).
  function gridFor(level, width, height) {
    let cell = Math.sqrt((width * height) / cellTarget(level));
    cell = Math.min(cell, Math.min(width, height) / (2 * REACH + 1), 168);
    cell = Math.max(cell, 34);
    const cols = Math.max(2 * REACH + 1, Math.floor(width / cell));
    const rows = Math.max(2 * REACH + 1, Math.floor(height / cell));
    return { cols, rows };
  }

  return {
    REACH, STEPS, SYM, ZONE, CURATED,
    keyFor, shape, makeBoard, apply, independent, makeLevel, gridFor,
    chapterOf, stepOf, pressesFor, cellTarget, rngFrom, hash,
  };
});
