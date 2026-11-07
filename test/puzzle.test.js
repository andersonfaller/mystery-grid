// node --test
const test = require('node:test');
const assert = require('node:assert');
const Law = require('../puzzle.js');

const SCREENS = [[200, 200], [300, 300], [358, 700], [700, 358], [1360, 780], [2480, 1320]];

test('toda lei tem duas faces válidas e nunca repete a anterior', () => {
  let prev = null;
  for (let c = 0; c < 60; c++) {
    const key = Law.keyFor(c);
    assert.ok(key, `capítulo ${c} sem lei`);
    for (const face of [0, 1]) {
      const sh = Law.shape(key, face);
      assert.ok(sh.length >= 4 && sh.length <= 8, `capítulo ${c} face ${face}: ${sh.length} casas`);
      assert.ok(sh.some(([x, y]) => x === 0 && y === 0), 'o clique sempre inverte a própria casa');
    }
    if (prev) assert.notDeepStrictEqual(Law.shape(key, 0), Law.shape(prev, 0));
    prev = key;
  }
});

test('todo tabuleiro gerado tem solução (refazer os cliques reversos o limpa)', () => {
  for (const [w, h] of SCREENS) {
    for (let level = 0; level < 90; level++) {
      const { cols, rows } = Law.gridFor(level, w, h);
      for (let rep = 0; rep < 4; rep++) {
        const lv = Law.makeLevel(level, cols, rows);
        const s = lv.state.slice();
        assert.ok(s.some((v) => v), `nível ${level} começou vazio`);
        assert.ok(Law.independent(lv.board, lv.presses), `nível ${level}: cliques dependentes`);
        for (const p of lv.presses) Law.apply(lv.board, s, p);
        assert.ok(s.every((v) => v === 0), `nível ${level} em ${w}x${h} sem solução`);
      }
    }
  }
});

test('a mesma semente reproduz o mesmo tabuleiro', () => {
  const a = Law.makeLevel(10, 9, 6, 1234);
  const b = Law.makeLevel(10, 9, 6, 1234);
  assert.deepStrictEqual([...a.state], [...b.state]);
  assert.deepStrictEqual(a.presses, b.presses);
});
