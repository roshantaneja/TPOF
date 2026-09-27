'use strict';
// Tests for js/pipeline.js — written against docs/SPEC.md (worked examples + module contract).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pipeline = require(path.join(__dirname, '..', 'js', 'pipeline.js'));
const ciphers = require(path.join(__dirname, '..', 'js', 'ciphers.js'));
const knots = require(path.join(__dirname, '..', 'js', 'knots.js'));

const MORSE = { type: 'morse' };
const BACON = { type: 'bacon' };
const NONE = { type: 'none' };
const single = (mode, text, encoding, transform) =>
  pipeline.encode({ mode, layer: { text, transform: transform || NONE, encoding } });
const dual = (rl, swap, encoding, extra) =>
  pipeline.encode(Object.assign({
    mode: 'dual',
    rl: { text: rl, transform: NONE, encoding },
    swap: { text: swap, transform: NONE, encoding }
  }, extra || {}));

// ------------------------------------------------------------ worked examples
const EXAMPLES = [
  ['Morse "eta n" Color', () => single('color', 'eta n', MORSE),
    'BX,FX,FX,FX,FX,FX,FX,FX,FX,FX BX,BX,FX,FX,FX,FX,FX,FX,FX,FX BX,FX,BX,BX,FX,FX,FX,FX,FX,FX BX,BX,FX,BX,FX,FX,FX,FX,FX,FX'],
  ['Morse "eta n" RL', () => single('rl', 'eta n', MORSE),
    'B,F,F,F,F,F,F,F,F,F B,B,F,F,F,F,F,F,F,F B,F,B,B,F,F,F,F,F,F B,B,F,B,F,F,F,F,F,F'],
  ['Morse "eta n" Swap', () => single('swap', 'eta n', MORSE),
    'FX,F,F,F,F,F,F,F,F,F FX,FX,F,F,F,F,F,F,F,F FX,F,FX,FX,F,F,F,F,F,F FX,FX,F,FX,F,F,F,F,F,F'],
  ['Morse "ab" + "bc" Dual', () => dual('ab', 'bc', MORSE),
    'BX,FX,B,BX,F,FX,F,FX,F,F BX,BX,F,BX,F,BX,FX,B,FX,F'],
  ['Bacon "ab c" Color', () => single('color', 'ab c', BACON),
    'FX,FX,FX,FX,FX FX,FX,FX,FX,BX BX,BX,BX,BX,BX FX,FX,FX,BX,FX'],
  ['Bacon "ab c" RL', () => single('rl', 'ab c', BACON),
    'F,F,F,F,F F,F,F,F,B B,B,B,B,B F,F,F,B,F'],
  ['Bacon "ab c" Swap', () => single('swap', 'ab c', BACON),
    'F,F,F,F,F F,F,F,F,FX FX,FX,FX,FX,FX F,F,F,FX,F'],
  ['Bacon "ab" + "de" Dual', () => dual('ab', 'de', BACON),
    'F,F,F,FX,FX F,F,FX,F,B']
];

for (const [name, run, expected] of EXAMPLES) {
  test('worked example: ' + name, () => {
    const out = run();
    assert.equal(out.text, expected);
    assert.equal(knots.format(out.knots), expected);
  });
}

// ------------------------------------------------------------------ encode
test('encodeLayer returns cipherText, rows, labels, warnings', () => {
  const l = pipeline.encodeLayer({ text: 'ab c', transform: NONE, encoding: BACON });
  assert.equal(l.cipherText, 'ab c');
  assert.deepEqual(l.rows, [[0, 0, 0, 0, 0], [0, 0, 0, 0, 1], [1, 1, 1, 1, 1], [0, 0, 0, 1, 0]]);
  assert.equal(l.labels.length, 4);
  assert.ok(Array.isArray(l.warnings));
});

test('encodeLayer applies the transform before encoding', () => {
  const t = { type: 'vigenere', key: 'key' };
  const l = pipeline.encodeLayer({ text: 'hello world', transform: t, encoding: BACON });
  assert.equal(l.cipherText, ciphers.vigenere('hello world', 'key'));
  assert.deepEqual(l.rows, ciphers.baconEncode(l.cipherText).rows);
});

test('encode: format options (newline rows, comma+space knots)', () => {
  const out = pipeline.encode({ mode: 'rl', layer: { text: 'ab', encoding: BACON },
    format: { knotSep: ', ', rowSep: '\n' } });
  assert.equal(out.text, 'F, F, F, F, F\nF, F, F, F, B');
});

test('encode: stats and layers', () => {
  const out = single('color', 'ab c', BACON);
  assert.equal(out.stats.rows, 4);
  assert.equal(out.stats.knots, 20);
  assert.equal(out.stats.counts.BX, 7);
  assert.equal(out.stats.counts.FX, 13);
  assert.equal(out.layers.length, 1);
  const d = dual('ab', 'de', BACON);
  assert.equal(d.layers.length, 2);
  assert.deepEqual(d.layers.map((l) => l.name), ['rl', 'swap']);
});

test('encode: unknown characters produce warnings, not errors', () => {
  const out = single('rl', 'a1b', BACON);
  assert.ok(out.warnings.length >= 1);
  assert.equal(out.stats.rows, 2);
});

test('encode: binary numbers', () => {
  const out = single('rl', '1 2 3', { type: 'binary', mode: 'numbers' });
  assert.equal(out.text, 'F,B B,F B,B');
  const five = single('rl', '1 2 3', { type: 'binary', mode: 'numbers', bits: '5' });
  assert.equal(five.text, 'F,F,F,F,B F,F,F,B,F F,F,F,B,B');
});

test('crossKeys: RL text uses the Swap key and vice-versa', () => {
  const layer = (text, key) => ({ text, transform: { type: 'vigenere', key }, encoding: BACON });
  const crossed = pipeline.encode({ mode: 'dual', crossKeys: true, rl: layer('left', 'red'), swap: layer('right', 'blue') });
  const manual = pipeline.encode({ mode: 'dual', rl: layer('left', 'blue'), swap: layer('right', 'red') });
  assert.equal(crossed.text, manual.text);
  assert.equal(crossed.layers[0].cipherText, ciphers.vigenere('left', 'blue'));
  assert.equal(crossed.layers[1].cipherText, ciphers.vigenere('right', 'red'));
});

test('linkedShiftList: RL = 5-bit numbers, Swap = shiftList(plaintext, numbers)', () => {
  const out = pipeline.encode({
    mode: 'dual', linkedShiftList: true, numbers: '3 1 4 1 5',
    rl: { encoding: { type: 'binary', mode: 'numbers', bits: 5 } },
    swap: { text: 'hello', encoding: BACON }
  });
  const [rl, swap] = out.layers;
  assert.deepEqual(rl.rows, [[0, 0, 0, 1, 1], [0, 0, 0, 0, 1], [0, 0, 1, 0, 0], [0, 0, 0, 0, 1], [0, 0, 1, 0, 1]]);
  assert.equal(swap.cipherText, ciphers.shiftList('hello', [3, 1, 4, 1, 5]));
  assert.deepEqual(out.knots, knots.dualToKnots(rl.rows, swap.rows).knots);
});

test('linkedShiftList: "1 2 3 4 5 ..." extends to the plaintext letter count', () => {
  const out = pipeline.encode({
    mode: 'dual', linkedShiftList: true, numbers: '1 2 3 4 5 ...',
    rl: {}, swap: { text: 'letibus jam', encoding: BACON }
  });
  assert.deepEqual(out.numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(out.layers[0].rows.length, 10);
  assert.ok(out.layers[0].rows.every((r) => r.length === 5));
  assert.equal(out.layers[1].cipherText, ciphers.shiftList('letibus jam', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
});

test('linkedShiftList + numbersAsLetters: RL = vigenere(letters(numbers), key), bacon', () => {
  const out = pipeline.encode({
    mode: 'dual', linkedShiftList: true, numbersAsLetters: true, numbers: '0 1 2 25',
    rl: { transform: { type: 'vigenere', key: 'key' }, encoding: BACON },
    swap: { text: 'abcd', encoding: BACON }
  });
  assert.equal(out.layers[0].cipherText, ciphers.vigenere('abcz', 'key'));
  assert.equal(out.layers[1].cipherText, ciphers.shiftList('abcd', [0, 1, 2, 25]));
});

// ------------------------------------------------------------------ decode
test('decode single modes round-trip the worked examples', () => {
  for (const mode of ['color', 'rl', 'swap']) {
    const enc = single(mode, 'eta n', MORSE);
    assert.equal(pipeline.decode(enc.text, { mode, encoding: MORSE }).text.toLowerCase(), 'etan');
    const b = single(mode, 'ab c', BACON);
    const d = pipeline.decode(b.text, { mode, encoding: BACON });
    assert.equal(d.text.toLowerCase(), 'ab c');
    assert.equal(d.rows.length, 4);
  }
});

test('decode dual returns both layers', () => {
  const out = pipeline.decode('F,F,F,FX,FX F,F,FX,F,B', { mode: 'dual', encoding: BACON });
  assert.equal(out.rl.text.toLowerCase(), 'ab');
  assert.equal(out.swap.text.toLowerCase(), 'de');
});

test('decode undoes a transform when given', () => {
  const t = { type: 'vigenere', key: 'lemon' };
  const enc = single('swap', 'attack at dawn', BACON, t);
  const dec = pipeline.decode(enc.text, { mode: 'swap', encoding: BACON, transform: t });
  assert.equal(dec.text.toLowerCase(), 'attack at dawn');
  assert.equal(dec.cipherText.toLowerCase(), ciphers.vigenere('attack at dawn', 'lemon').toLowerCase());
});

test('decode reports parse errors instead of throwing', () => {
  const out = pipeline.decode('F,Q,B', { mode: 'rl', encoding: BACON });
  assert.ok(out.error);
  assert.ok(out.warnings.length >= 1);
});

test('decode linkedShiftList recovers the plaintext', () => {
  const enc = pipeline.encode({
    mode: 'dual', linkedShiftList: true, numbers: '1 2 3 4 5 ...',
    rl: {}, swap: { text: 'letibus jam', encoding: BACON }
  });
  const dec = pipeline.decode(enc.text, { mode: 'dual', linkedShiftList: true, swap: { encoding: BACON } });
  assert.deepEqual(dec.numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(dec.swap.text.toLowerCase(), 'letibus jam');
});

// ------------------------------------------------------------------ presets
test('PRESETS: shape, unique ids, all encode', () => {
  assert.ok(Array.isArray(pipeline.PRESETS) && pipeline.PRESETS.length >= 18);
  const ids = new Set();
  for (const p of pipeline.PRESETS) {
    for (const k of ['id', 'number', 'name', 'description', 'config']) assert.ok(k in p, p.id + ' missing ' + k);
    assert.ok('difficulty' in p);
    assert.ok(!ids.has(p.id), 'duplicate ' + p.id);
    ids.add(p.id);
    const out = pipeline.encode(p.config);
    assert.ok(out.stats.knots > 0, p.id + ' produced no knots');
    assert.equal(typeof out.text, 'string');
  }
  const names = pipeline.PRESETS.map((p) => p.name);
  for (const n of ['Color Binary', 'Dual L-R Swap Bacon', 'Color Morse', 'Wrong Key Dual Vigenère',
    'Single Dual Trithemius', 'Double Dual Trithemius']) {
    assert.ok(names.includes(n), 'missing preset ' + n);
  }
  assert.ok(pipeline.getPreset('wrong-key-dual-vigenere').config.crossKeys);
  assert.ok(pipeline.getPreset('single-dual-trithemius').config.linkedShiftList);
  assert.match(pipeline.getPreset('double-dual-trithemius').description, /confirm with puzzle author/i);
});

test('Color Morse preset reproduces the spec example', () => {
  const p = pipeline.getPreset('color-morse');
  assert.equal(pipeline.encode(p.config).text, EXAMPLES[0][2]);
});
