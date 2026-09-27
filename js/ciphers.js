/* TPOF.ciphers — text transforms and text <-> bit-row encodings.
 * Plain script (no modules, no deps). Loads in browsers (window.TPOF.ciphers)
 * and in Node (module.exports). See docs/SPEC.md.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- helpers

  function isUpper(c) { return c >= 'A' && c <= 'Z'; }
  function isLower(c) { return c >= 'a' && c <= 'z'; }
  function isLetter(c) { return isUpper(c) || isLower(c); }
  function mod(n, m) { return ((n % m) + m) % m; }
  function toInt(v, dflt) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : dflt;
  }

  /** Shift one letter by `k`, preserving case. Non-letters returned as-is. */
  function shiftChar(c, k) {
    if (isUpper(c)) return String.fromCharCode(65 + mod(c.charCodeAt(0) - 65 + k, 26));
    if (isLower(c)) return String.fromCharCode(97 + mod(c.charCodeAt(0) - 97 + k, 26));
    return c;
  }

  /** Apply shiftFor(i) to the i-th letter of text (i counts letters only). */
  function mapLetters(text, shiftFor) {
    let out = '';
    let i = 0;
    for (const c of String(text == null ? '' : text)) {
      if (isLetter(c)) { out += shiftChar(c, shiftFor(i)); i++; }
      else out += c;
    }
    return out;
  }

  function toBits(n, width) {
    const row = new Array(width).fill(0);
    for (let i = width - 1; i >= 0 && n > 0; i--) { row[i] = n % 2; n = Math.floor(n / 2); }
    return row;
  }

  function bitsToInt(row) {
    let n = 0;
    for (const b of row) n = n * 2 + (b ? 1 : 0);
    return n;
  }

  function bitLength(n) {
    let len = 0;
    while (n > 0) { len++; n = Math.floor(n / 2); }
    return len;
  }

  function describeChar(c) {
    const cp = c.codePointAt(0);
    return JSON.stringify(c) + ' (U+' + cp.toString(16).toUpperCase().padStart(4, '0') + ')';
  }

  function normalizeRow(row) {
    if (typeof row === 'string') return Array.from(row).filter((c) => c === '0' || c === '1').map(Number);
    return Array.from(row || []).map((b) => (b ? 1 : 0));
  }

  // ---------------------------------------------------------- text ciphers

  function vigenere(text, key, { decrypt = false } = {}) {
    const shifts = Array.from(String(key == null ? '' : key))
      .filter(isLetter)
      .map((c) => c.toUpperCase().charCodeAt(0) - 65);
    if (!shifts.length) return String(text == null ? '' : text);
    const sign = decrypt ? -1 : 1;
    return mapLetters(text, (i) => sign * shifts[i % shifts.length]);
  }

  function trithemius(text, { start = 0, decrypt = false } = {}) {
    const s = toInt(start, 0);
    const sign = decrypt ? -1 : 1;
    return mapLetters(text, (i) => sign * (s + i));
  }

  function shiftList(text, numbers, { decrypt = false } = {}) {
    const nums = parseNumberList(numbers);
    if (!nums.length) return String(text == null ? '' : text);
    const sign = decrypt ? -1 : 1;
    return mapLetters(text, (i) => sign * nums[i % nums.length]);
  }

  function caesar(text, shift, { decrypt = false } = {}) {
    const s = toInt(shift, 0);
    const sign = decrypt ? -1 : 1;
    return mapLetters(text, () => sign * s);
  }

  function atbash(text) {
    let out = '';
    for (const c of String(text == null ? '' : text)) {
      if (isUpper(c)) out += String.fromCharCode(90 - (c.charCodeAt(0) - 65));
      else if (isLower(c)) out += String.fromCharCode(122 - (c.charCodeAt(0) - 97));
      else out += c;
    }
    return out;
  }

  /** Accepts an array of numbers or a string like "3, 1 4". Non-numeric tokens dropped. */
  function parseNumberList(numbers) {
    if (numbers == null) return [];
    const list = Array.isArray(numbers) ? numbers : String(numbers).split(/[\s,]+/);
    return list
      .filter((x) => x !== '' && x != null)
      .map(Number)
      .filter(Number.isFinite)
      .map(Math.trunc);
  }

  function applyTransform(text, opts = {}) {
    const { type = 'none', key, shift, start, numbers, decrypt = false } = opts || {};
    switch (type) {
      case 'none': case '': case undefined: case null: return String(text == null ? '' : text);
      case 'vigenere': return vigenere(text, key, { decrypt });
      case 'trithemius': return trithemius(text, { start: start == null ? 0 : start, decrypt });
      case 'shiftList': return shiftList(text, numbers, { decrypt });
      case 'caesar': return caesar(text, shift == null ? 0 : shift, { decrypt });
      case 'atbash': return atbash(text);
      default: throw new Error('Unknown transform type: ' + type);
    }
  }

  // ------------------------------------------------------------------ Bacon

  const BACON_SPACE = 31; // 11111

  function baconEncode(text) {
    const rows = [], labels = [], warnings = [];
    for (const c of String(text == null ? '' : text)) {
      if (isLetter(c)) {
        rows.push(toBits(c.toLowerCase().charCodeAt(0) - 97, 5));
        labels.push(c);
      } else if (c === ' ') {
        rows.push(toBits(BACON_SPACE, 5));
        labels.push(' ');
      } else {
        warnings.push('Bacon: skipped unsupported character ' + describeChar(c));
      }
    }
    return { rows, labels, warnings };
  }

  function baconDecode(rows) {
    let out = '';
    for (const r of rows || []) {
      const n = bitsToInt(normalizeRow(r));
      if (n <= 25) out += String.fromCharCode(97 + n);
      else if (n === BACON_SPACE) out += ' ';
      else out += '?';
    }
    return out;
  }

  // ------------------------------------------------------------------ Morse

  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
    Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
    '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
    ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
    '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
  };
  const MORSE_REVERSE = {};
  for (const k of Object.keys(MORSE)) MORSE_REVERSE[MORSE[k]] = k;

  function morseToBits(code) {
    const bits = [];
    Array.from(code).forEach((sym, i) => {
      if (i > 0) bits.push(0);
      if (sym === '.') bits.push(1);
      else bits.push(1, 1);
    });
    return bits;
  }

  function morseEncode(text, { width = 10 } = {}) {
    let w = Math.max(1, toInt(width, 10));
    const raw = [], labels = [], warnings = [];
    for (const c of String(text == null ? '' : text)) {
      if (/\s/.test(c)) continue; // spaces dropped: each char is its own row
      const code = MORSE[c.toUpperCase()];
      if (!code) { warnings.push('Morse: skipped unsupported character ' + describeChar(c)); continue; }
      raw.push(morseToBits(code));
      labels.push(c);
    }
    const longest = raw.reduce((m, r) => Math.max(m, r.length), 0);
    if (longest > w) {
      const over = labels.filter((_, i) => raw[i].length > w);
      warnings.push('Morse: ' + over.map((c) => JSON.stringify(c)).join(', ') +
        ' need more than ' + w + ' bits; all rows widened to ' + longest + '.');
      w = longest;
    }
    const rows = raw.map((r) => r.concat(new Array(w - r.length).fill(0)));
    return { rows, labels, warnings };
  }

  /** Decode one group of bits (no "00" inside) to a single character, '?' if invalid. */
  function morseGroupToChar(group) {
    const runs = group.match(/1+|0+/g) || [];
    let code = '';
    for (const run of runs) {
      if (run[0] === '0') { if (run.length !== 1) return '?'; continue; }
      if (run.length === 1) code += '.';
      else if (run.length === 2) code += '-';
      else return '?';
    }
    return MORSE_REVERSE[code] || '?';
  }

  function morseDecode(rows) {
    let out = '';
    for (const r of rows || []) {
      const s = normalizeRow(r).join('').replace(/^0+|0+$/g, '');
      if (!s) continue;
      for (const g of s.split(/0{2,}/)) out += morseGroupToChar(g);
    }
    return out;
  }

  // ----------------------------------------------------------------- Binary

  function binaryEncode(text, { mode = 'numbers', bits } = {}) {
    const rows = [], labels = [], warnings = [];
    const src = String(text == null ? '' : text);
    const hasBits = bits !== undefined && bits !== null && bits !== '' && Number.isFinite(Number(bits));
    const want = hasBits ? Math.max(1, toInt(bits, 1)) : null;

    if (mode === 'raw') {
      for (const tok of src.split(/[\s,]+/).filter(Boolean)) {
        if (!/^[01]+$/.test(tok)) { warnings.push('Binary (raw): skipped token ' + JSON.stringify(tok) + ' (only 0/1 allowed)'); continue; }
        rows.push(Array.from(tok).map(Number));
        labels.push(tok);
      }
      return { rows, labels, warnings };
    }

    if (mode === 'ascii') {
      const chars = Array.from(src);
      const codes = chars.map((c) => c.codePointAt(0));
      const maxLen = codes.reduce((m, n) => Math.max(m, bitLength(n)), 0);
      let w = want == null ? 8 : want;
      if (maxLen > w) {
        warnings.push('Binary (ascii): some characters need ' + maxLen + ' bits; rows widened from ' + w + ' to ' + maxLen + '.');
        w = maxLen;
      }
      chars.forEach((c, i) => { rows.push(toBits(codes[i], w)); labels.push(c); });
      return { rows, labels, warnings };
    }

    if (mode !== 'numbers') throw new Error('Unknown binary mode: ' + mode);

    const nums = [];
    for (const tok of src.split(/[\s,]+/).filter(Boolean)) {
      if (!/^\d+$/.test(tok)) { warnings.push('Binary (numbers): skipped token ' + JSON.stringify(tok) + ' (not a non-negative integer)'); continue; }
      nums.push({ n: Number(tok), tok });
    }
    const maxLen = nums.reduce((m, x) => Math.max(m, bitLength(x.n)), 0);
    let w = want == null ? Math.max(1, maxLen) : want;
    if (want != null && maxLen > want) {
      warnings.push('Binary (numbers): largest number needs ' + maxLen + ' bits; rows widened from ' + want + ' to ' + maxLen + '.');
      w = maxLen;
    }
    for (const x of nums) { rows.push(toBits(x.n, w)); labels.push(x.tok); }
    return { rows, labels, warnings };
  }

  function binaryDecode(rows, { mode = 'numbers' } = {}) {
    const list = (rows || []).map(normalizeRow);
    if (mode === 'raw') return list.map((r) => r.join('')).join(' ');
    if (mode === 'ascii') return list.map((r) => String.fromCodePoint(bitsToInt(r))).join('');
    if (mode === 'numbers') return list.map(bitsToInt).join(' ');
    throw new Error('Unknown binary mode: ' + mode);
  }

  // --------------------------------------------------------------- dispatch

  function encode(text, opts = {}) {
    const { type = 'bacon' } = opts || {};
    switch (type) {
      case 'bacon': return baconEncode(text);
      case 'morse': return morseEncode(text, { width: opts.width == null ? 10 : opts.width });
      case 'binary': return binaryEncode(text, { mode: opts.mode || 'numbers', bits: opts.bits });
      default: throw new Error('Unknown encoding type: ' + type);
    }
  }

  function decode(rows, opts = {}) {
    const { type = 'bacon' } = opts || {};
    switch (type) {
      case 'bacon': return baconDecode(rows);
      case 'morse': return morseDecode(rows);
      case 'binary': return binaryDecode(rows, { mode: opts.mode || 'numbers' });
      default: throw new Error('Unknown encoding type: ' + type);
    }
  }

  // --------------------------------------------------------------- metadata

  const TRANSFORMS = [
    { id: 'none', label: 'None', description: 'Use the text as-is.', options: [] },
    { id: 'vigenere', label: 'Vigenère', description: 'Shift each letter by the matching key letter (A=0). The key advances only on letters; case and punctuation are preserved.', options: ['key', 'decrypt'] },
    { id: 'trithemius', label: 'Trithemius', description: 'Progressive shift: the i-th letter is shifted by start + i.', options: ['start', 'decrypt'] },
    { id: 'shiftList', label: 'Shift list', description: 'The i-th letter is shifted by the i-th number of the list, cycling (used by the "Dual Trithemius" puzzles).', options: ['numbers', 'decrypt'] },
    { id: 'caesar', label: 'Caesar', description: 'Shift every letter by a fixed amount.', options: ['shift', 'decrypt'] },
    { id: 'atbash', label: 'Atbash', description: 'Mirror the alphabet (A↔Z, B↔Y, …). Its own inverse.', options: [] },
  ];

  const ENCODINGS = [
    { id: 'bacon', label: 'Bacon', description: '26-letter Bacon: a=00000 … z=11001, space=11111. 5 bits per character; case-insensitive.', options: [] },
    { id: 'morse', label: 'Morse', description: 'dot=1, dash=11, 0 between symbols, right-padded to the row width. Spaces are dropped; rows widen if a character does not fit.', options: ['width'] },
    { id: 'binary', label: 'Binary', description: 'numbers: integers → n-bit rows; raw: 0/1 tokens verbatim; ascii: each character → 8 bits.', options: ['mode', 'bits'] },
  ];

  const api = {
    vigenere, trithemius, shiftList, caesar, atbash, applyTransform,
    baconEncode, morseEncode, binaryEncode, encode,
    baconDecode, morseDecode, binaryDecode, decode,
    TRANSFORMS, ENCODINGS,
    MORSE_TABLE: MORSE,
  };

  root.TPOF = root.TPOF || {};
  root.TPOF.ciphers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
