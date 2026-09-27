'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const C = require(path.join(__dirname, '..', 'js', 'ciphers.js'));

const s = (rows) => rows.map((r) => r.join('')).join(' ');

test('wrapper registers on globalThis.TPOF.ciphers', () => {
  assert.equal(globalThis.TPOF.ciphers, C);
});

// ---------------------------------------------------------------- Bacon
test('bacon "ab c" worked example', () => {
  const r = C.baconEncode('ab c');
  assert.equal(s(r.rows), '00000 00001 11111 00010');
  assert.deepEqual(r.labels, ['a', 'b', ' ', 'c']);
  assert.deepEqual(r.warnings, []);
});

test('bacon "ab" and "de" rows (dual example)', () => {
  assert.equal(s(C.baconEncode('ab').rows), '00000 00001');
  assert.equal(s(C.baconEncode('de').rows), '00011 00100');
  assert.equal(s(C.baconEncode('z').rows), '11001');
});

test('bacon is case-insensitive and warns on skipped chars', () => {
  const r = C.baconEncode('AB!c');
  assert.equal(s(r.rows), '00000 00001 00010');
  assert.deepEqual(r.labels, ['A', 'B', 'c']);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /"!"/);
});

test('bacon round trip and decode edge cases', () => {
  const txt = 'hello world xyz';
  assert.equal(C.baconDecode(C.baconEncode(txt).rows), txt);
  assert.equal(C.baconDecode([[1, 1, 0, 1, 0], [1, 1, 1, 1, 1]]), '? ');
  assert.equal(C.decode(C.encode('Ab C', { type: 'bacon' }).rows, { type: 'bacon' }), 'ab c');
});

// ---------------------------------------------------------------- Morse
test('morse "eta n" worked example', () => {
  const r = C.morseEncode('eta n');
  assert.equal(s(r.rows), '1000000000 1100000000 1011000000 1101000000');
  assert.deepEqual(r.labels, ['e', 't', 'a', 'n']);
  assert.deepEqual(r.warnings, []);
});

test('morse "ab" and "bc" rows (dual example)', () => {
  assert.equal(s(C.morseEncode('ab').rows), '1011000000 1101010100');
  assert.equal(s(C.morseEncode('bc').rows), '1101010100 1101011010');
});

test('all letters fit in 10 bits', () => {
  const r = C.morseEncode('abcdefghijklmnopqrstuvwxyz');
  assert.equal(r.warnings.length, 0);
  assert.ok(r.rows.every((row) => row.length === 10));
});

test('digits widen all morse rows with a warning', () => {
  const r = C.morseEncode('e0');
  // 0 = ----- = 11 0 11 0 11 0 11 0 11 -> 14 bits
  assert.equal(s(r.rows), '10000000000000 11011011011011');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /14/);
});

test('morse custom width and unknown chars', () => {
  const r = C.morseEncode('e#t', { width: 4 });
  assert.equal(s(r.rows), '1000 1100');
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /"#"/);
});

test('morse round trip (letters, digits, punctuation)', () => {
  const txt = 'SOS HELP 2025? YES!';
  const enc = C.morseEncode(txt);
  assert.equal(C.morseDecode(enc.rows), txt.replace(/ /g, ''));
  assert.equal(C.decode(C.encode('eta n', { type: 'morse' }).rows, { type: 'morse' }), 'ETAN');
});

test('morse decode: 00+ splits chars, 111 invalid, trailing zeros ignored', () => {
  assert.equal(C.morseDecode(['1000110000']), 'ET');
  assert.equal(C.morseDecode([[1, 1, 1, 0, 0]]), '?');
  assert.equal(C.morseDecode(['0000000000']), '');
});

// ---------------------------------------------------------------- Binary
test('binary numbers with default and explicit bits', () => {
  let r = C.binaryEncode('5, 2 7');
  assert.equal(s(r.rows), '101 010 111');
  assert.deepEqual(r.labels, ['5', '2', '7']);
  r = C.binaryEncode('5 2', { bits: 5 });
  assert.equal(s(r.rows), '00101 00010');
  r = C.binaryEncode('0');
  assert.equal(s(r.rows), '0');
});

test('binary numbers widen with warning when too small', () => {
  const r = C.binaryEncode('9 1', { bits: 3 });
  assert.equal(s(r.rows), '1001 0001');
  assert.equal(r.warnings.length, 1);
});

test('binary raw and ascii', () => {
  let r = C.binaryEncode('101 0011,1 x2', { mode: 'raw' });
  assert.equal(s(r.rows), '101 0011 1');
  assert.equal(r.warnings.length, 1);
  r = C.binaryEncode('Hi', { mode: 'ascii' });
  assert.equal(s(r.rows), '01001000 01101001');
  r = C.binaryEncode('A', { mode: 'ascii', bits: 7 });
  assert.equal(s(r.rows), '1000001');
});

test('binary round trips', () => {
  for (const [txt, mode] of [['12 0 255 3', 'numbers'], ['Hello, World!', 'ascii'], ['101 0011 1', 'raw']]) {
    const enc = C.encode(txt, { type: 'binary', mode });
    assert.equal(C.decode(enc.rows, { type: 'binary', mode }), txt);
  }
});

// ---------------------------------------------------------------- Transforms
test('vigenere known answer', () => {
  assert.equal(C.vigenere('ATTACKATDAWN', 'LEMON'), 'LXFOPVEFRNHR');
  assert.equal(C.vigenere('LXFOPVEFRNHR', 'LEMON', { decrypt: true }), 'ATTACKATDAWN');
});

test('vigenere preserves case/punctuation and key advances on letters only', () => {
  assert.equal(C.vigenere('Attack at dawn!', 'lemon'), 'Lxfopv ef rnhr!');
  assert.equal(C.vigenere('Attack at dawn!', 'LE-MON 1'), 'Lxfopv ef rnhr!');
  assert.equal(C.vigenere('Hello', ''), 'Hello');
  assert.equal(C.vigenere('Hello', '123'), 'Hello');
});

test('trithemius known answer and round trip', () => {
  assert.equal(C.trithemius('HELLO'), 'HFNOS');
  assert.equal(C.trithemius('abc', { start: 1 }), 'bdf');
  assert.equal(C.trithemius('He, llo!'), 'Hf, nos!');
  const t = 'The quick brown fox jumps over the lazy dog.';
  assert.equal(C.trithemius(C.trithemius(t, { start: 3 }), { start: 3, decrypt: true }), t);
});

test('shiftList known answer and round trip', () => {
  assert.equal(C.shiftList('abc', [1, 2]), 'bdd');
  assert.equal(C.shiftList('A b-C d', [1, 2, 3]), 'B d-F e');
  assert.equal(C.shiftList('xyz', [3]), 'abc');
  assert.equal(C.shiftList('hi', []), 'hi');
  const t = 'Dual Trithemius, puzzle #2';
  assert.equal(C.shiftList(C.shiftList(t, [4, 17, 9]), [4, 17, 9], { decrypt: true }), t);
});

test('caesar and atbash', () => {
  assert.equal(C.caesar('Hello, World', 3), 'Khoor, Zruog');
  assert.equal(C.caesar('Khoor, Zruog', 3, { decrypt: true }), 'Hello, World');
  assert.equal(C.caesar('abc', -1), 'zab');
  assert.equal(C.atbash('Hello, World!'), 'Svool, Dliow!');
  assert.equal(C.atbash(C.atbash('Round trip')), 'Round trip');
});

test('applyTransform dispatches', () => {
  assert.equal(C.applyTransform('hi', { type: 'none' }), 'hi');
  assert.equal(C.applyTransform('ATTACKATDAWN', { type: 'vigenere', key: 'LEMON' }), 'LXFOPVEFRNHR');
  assert.equal(C.applyTransform('HFNOS', { type: 'trithemius', decrypt: true }), 'HELLO');
  assert.equal(C.applyTransform('abc', { type: 'shiftList', numbers: [1, 2] }), 'bdd');
  assert.equal(C.applyTransform('abc', { type: 'caesar', shift: 1 }), 'bcd');
  assert.equal(C.applyTransform('abc', { type: 'atbash' }), 'zyx');
  assert.throws(() => C.applyTransform('x', { type: 'nope' }));
});

test('metadata arrays', () => {
  for (const arr of [C.TRANSFORMS, C.ENCODINGS]) {
    for (const m of arr) {
      assert.equal(typeof m.id, 'string');
      assert.equal(typeof m.label, 'string');
      assert.equal(typeof m.description, 'string');
      assert.ok(Array.isArray(m.options));
    }
  }
  assert.deepEqual(C.TRANSFORMS.map((t) => t.id), ['none', 'vigenere', 'trithemius', 'shiftList', 'caesar', 'atbash']);
  assert.deepEqual(C.ENCODINGS.map((t) => t.id), ['bacon', 'morse', 'binary']);
});
