'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../js/knots.js');

// Hand-built bit rows (independent of ciphers.js)
const b = (s) => s.split('').map(Number);
const rows = (str) => str.split(' ').map(b);

// Morse (width 10): e=".", t="-", a=".-", n="-.", b="-...", c="-.-."
const MORSE_ETA_N = rows('1000000000 1100000000 1011000000 1101000000');
const MORSE_AB = rows('1011000000 1101010100');
const MORSE_BC = rows('1101010100 1101011010');
// Bacon: a=00000 b=00001 c=00010 d=00011 e=00100 space=11111
const BACON_AB_C = rows('00000 00001 11111 00010');
const BACON_AB = rows('00000 00001');
const BACON_DE = rows('00011 00100');

test('spec worked examples: single-layer modes', () => {
  const cases = [
    [MORSE_ETA_N, 'color', 'BX,FX,FX,FX,FX,FX,FX,FX,FX,FX BX,BX,FX,FX,FX,FX,FX,FX,FX,FX BX,FX,BX,BX,FX,FX,FX,FX,FX,FX BX,BX,FX,BX,FX,FX,FX,FX,FX,FX'],
    [MORSE_ETA_N, 'rl', 'B,F,F,F,F,F,F,F,F,F B,B,F,F,F,F,F,F,F,F B,F,B,B,F,F,F,F,F,F B,B,F,B,F,F,F,F,F,F'],
    [MORSE_ETA_N, 'swap', 'FX,F,F,F,F,F,F,F,F,F FX,FX,F,F,F,F,F,F,F,F FX,F,FX,FX,F,F,F,F,F,F FX,FX,F,FX,F,F,F,F,F,F'],
    [BACON_AB_C, 'color', 'FX,FX,FX,FX,FX FX,FX,FX,FX,BX BX,BX,BX,BX,BX FX,FX,FX,BX,FX'],
    [BACON_AB_C, 'rl', 'F,F,F,F,F F,F,F,F,B B,B,B,B,B F,F,F,B,F'],
    [BACON_AB_C, 'swap', 'F,F,F,F,F F,F,F,F,FX FX,FX,FX,FX,FX F,F,F,FX,F'],
  ];
  for (const [bits, mode, expected] of cases) {
    assert.equal(K.format(K.bitsToKnots(bits, mode)), expected, mode);
  }
});

test('spec worked examples: dual', () => {
  let r = K.dualToKnots(MORSE_AB, MORSE_BC);
  assert.equal(K.format(r.knots), 'BX,FX,B,BX,F,FX,F,FX,F,F BX,BX,F,BX,F,BX,FX,B,FX,F');
  assert.deepEqual(r.warnings, []);
  r = K.dualToKnots(BACON_AB, BACON_DE);
  assert.equal(K.format(r.knots), 'F,F,F,FX,FX F,F,FX,F,B');
  assert.deepEqual(r.warnings, []);
});

test('bitsToKnots rejects unknown mode', () => {
  assert.throws(() => K.bitsToKnots([[0]], 'dual'), /Unknown knot mode/);
  assert.throws(() => K.bitsToKnots([[0]], 'nope'), /Unknown knot mode/);
});

test('dualToKnots pads mismatched layers and warns', () => {
  const r = K.dualToKnots([[1, 1], [0, 1], [1]], [[0, 1, 1], [1]]);
  assert.deepEqual(r.knots, [['B', 'BX', 'FX'], ['FX', 'B'], ['B']]);
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings[0], /RL layer has 3 rows, Swap layer has 2 rows; padded/);
  assert.match(r.warnings[1], /row 1 \(RL 2, Swap 3\)/);
  assert.match(r.warnings[1], /row 2 \(RL 2, Swap 1\)/);
});

test('format options', () => {
  const k = [['F', 'B'], ['FX']];
  assert.equal(K.format(k), 'F,B FX');
  assert.equal(K.format(k, { rowSep: '\n' }), 'F,B\nFX');
  assert.equal(K.format(k, { knotSep: ' ', rowSep: ' | ' }), 'F B | FX');
  assert.equal(K.format([]), '');
});

test('parse: whitespace, separators, case, empty tokens', () => {
  assert.deepEqual(K.parse('F,F,F,FX,FX, F,F,FX,F,B'), [['F', 'F', 'F', 'FX', 'FX'], ['F', 'F', 'FX', 'F', 'B']]);
  assert.deepEqual(K.parse('  f,bx\n\tFx,,b  \n'), [['F', 'BX'], ['FX', 'B']]);
  assert.deepEqual(K.parse('F,B|FX;BX'), [['F', 'B'], ['FX'], ['BX']]);
  assert.deepEqual(K.parse(''), []);
  assert.deepEqual(K.parse(' , ,'), []);
});

test('parse: errors name the bad token and row', () => {
  assert.throws(() => K.parse('F,B FX,Q'), (e) => /"Q"/.test(e.message) && /row 2/.test(e.message));
  assert.throws(() => K.parse('XF'), /Unknown knot code "XF" in row 1/);
});

test('parse/format round-trip on all spec outputs', () => {
  const outs = [
    'BX,FX,B,BX,F,FX,F,FX,F,F BX,BX,F,BX,F,BX,FX,B,FX,F',
    'F,F,F,F,F F,F,F,F,B B,B,B,B,B F,F,F,B,F',
    'FX,FX,FX,FX,FX FX,FX,FX,FX,BX BX,BX,BX,BX,BX FX,FX,FX,BX,FX',
  ];
  for (const s of outs) assert.equal(K.format(K.parse(s)), s);
  const k = K.parse(outs[0]);
  assert.deepEqual(K.parse(K.format(k, { rowSep: '\n' })), k);
});

test('knotsToBits inverts each single-layer mode', () => {
  for (const bits of [MORSE_ETA_N, BACON_AB_C]) {
    for (const mode of ['color', 'rl', 'swap']) {
      const r = K.knotsToBits(K.bitsToKnots(bits, mode), mode);
      assert.deepEqual(r.rows, bits, mode);
      assert.deepEqual(r.warnings, []);
    }
  }
});

test('knotsToBits rl/swap read the side / swap flag of any knot', () => {
  const k = [['F', 'B', 'FX', 'BX']];
  assert.deepEqual(K.knotsToBits(k, 'rl').rows, [[0, 1, 0, 1]]);
  assert.deepEqual(K.knotsToBits(k, 'swap').rows, [[0, 0, 1, 1]]);
});

test('knotsToBits color warns once on non-swap knots', () => {
  const r = K.knotsToBits([['FX', 'F'], ['B', 'BX']], 'color');
  assert.deepEqual(r.rows, [[0, 0], [0, 1]]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /row 1 knot 2 \(F\)/);
  assert.match(r.warnings[0], /row 2 knot 1 \(B\)/);
});

test('knotsToBits dual inverts dualToKnots', () => {
  for (const [rl, sw] of [[MORSE_AB, MORSE_BC], [BACON_AB, BACON_DE]]) {
    const r = K.knotsToBits(K.dualToKnots(rl, sw).knots, 'dual');
    assert.deepEqual(r.rl, rl);
    assert.deepEqual(r.swap, sw);
    assert.deepEqual(r.warnings, []);
  }
  assert.throws(() => K.knotsToBits([['F']], 'bogus'), /Unknown knot mode/);
});

test('simulate: FX,FX shows black then white', () => {
  const g = K.simulate([['FX', 'FX']], { left: 'black', right: 'white' });
  assert.deepEqual(g[0].map((c) => c.shown), ['black', 'white']);
  assert.deepEqual(g[0][0], { code: 'FX', shown: 'black', leftIn: 'black', rightIn: 'white', leftOut: 'white', rightOut: 'black' });
  assert.equal(g[0][1].leftOut, 'black');
});

test('simulate: non-swap knots keep state; state carries across rows; defaults', () => {
  const g = K.simulate([['F', 'B'], ['BX'], ['F']], { left: 'L', right: 'R' });
  assert.deepEqual(g.flat().map((c) => c.shown), ['L', 'R', 'R', 'R']);
  assert.equal(g[2][0].leftIn, 'R');
  const d = K.simulate([['F', 'B']]);
  assert.equal(d[0][0].shown, '#111111');
  assert.equal(d[0][1].shown, '#f5f5f5');
});

test('stats', () => {
  assert.deepEqual(K.stats(K.parse('F,F,FX BX B,F')), { rows: 3, knots: 6, counts: { F: 3, B: 1, FX: 1, BX: 1 } });
  assert.deepEqual(K.stats([]), { rows: 0, knots: 0, counts: { F: 0, B: 0, FX: 0, BX: 0 } });
});

test('describe, CODES, MODES', () => {
  assert.deepEqual(K.CODES, ['F', 'B', 'FX', 'BX']);
  assert.deepEqual(K.describe('fx'), { code: 'FX', expresses: 'L', swap: true, label: 'Forward swap knot (Left, swap)' });
  assert.deepEqual(K.describe('B'), { code: 'B', expresses: 'R', swap: false, label: 'Backward knot (Right, no swap)' });
  assert.throws(() => K.describe('Z'), /Unknown knot code/);
  assert.deepEqual(K.MODES.map((m) => m.id), ['color', 'rl', 'swap', 'dual']);
  for (const m of K.MODES) assert.ok(m.label && m.description);
});

test('attaches to globalThis.TPOF', () => {
  assert.equal(globalThis.TPOF.knots, K);
});
