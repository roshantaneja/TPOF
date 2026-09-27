/*
 * TPOF.pipeline — composes TPOF.ciphers (text cipher + bit encoding) and
 * TPOF.knots (bit rows -> knot codes) and holds the puzzle presets.
 *
 *   text -> (optional text cipher) -> bit rows -> knot codes -> formatted string
 *
 * Plain script (no ES modules) so index.html works from file://; also loads in Node.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- deps ---
  function dep(name, file) {
    const T = root.TPOF || {};
    if (T[name]) return T[name];
    if (typeof require === 'function') {
      try {
        const mod = require(file);
        if (mod) return mod;
      } catch (e) {
        if (!(e && e.code === 'MODULE_NOT_FOUND')) throw e;
      }
    }
    return null;
  }
  function C() {
    const c = dep('ciphers', './ciphers.js');
    if (!c) throw new Error('TPOF.ciphers is not loaded (js/ciphers.js missing?)');
    return c;
  }
  function K() {
    const k = dep('knots', './knots.js');
    if (!k) throw new Error('TPOF.knots is not loaded (js/knots.js missing?)');
    return k;
  }

  const DEFAULT_FORMAT = { knotSep: ',', rowSep: ' ' };
  const DEFAULT_NUMBER_LIST = '1 2 3 4 5 ...';
  const LINKED_BITS = 5;

  // ------------------------------------------------------------- helpers ---

  /**
   * Parse a user number list ("1 2 3", "1,2,3", "4 8 15 ...").
   * A trailing "..." / "…" marks the list as open-ended (see extendNumbers).
   */
  function parseNumbers(input) {
    if (Array.isArray(input)) {
      return { numbers: input.map(Number).filter(Number.isFinite), ellipsis: false, invalid: [] };
    }
    const str = String(input == null ? '' : input).trim();
    const out = { numbers: [], ellipsis: false, invalid: [] };
    if (!str) return out;
    const tokens = str.split(/[\s,;]+/).filter(Boolean);
    tokens.forEach(function (tok, i) {
      if (/^(\.{2,}|…)$/.test(tok)) {
        if (i === tokens.length - 1) out.ellipsis = true;
        else out.invalid.push(tok);
        return;
      }
      if (/^-?\d+$/.test(tok)) out.numbers.push(parseInt(tok, 10));
      else out.invalid.push(tok);
    });
    return out;
  }

  /** Continue an arithmetic progression (step = last difference, or 1) up to `count` items. */
  function extendNumbers(numbers, count) {
    const out = numbers.slice();
    if (!out.length) {
      for (let i = 1; out.length < count; i++) out.push(i);
      return out;
    }
    const step = out.length >= 2 ? out[out.length - 1] - out[out.length - 2] : 1;
    while (out.length < count) out.push(out[out.length - 1] + step);
    return out;
  }

  function countLetters(text) {
    const m = String(text || '').match(/[a-z]/gi);
    return m ? m.length : 0;
  }

  function mod(n, m) { return ((n % m) + m) % m; }

  function numberToLetter(n) { return String.fromCharCode(97 + mod(n, 26)); }

  function lettersToNumbers(text) {
    return (String(text || '').toLowerCase().match(/[a-z]/g) || []).map(function (ch) {
      return ch.charCodeAt(0) - 97;
    });
  }

  function clone(obj) { return obj == null ? obj : JSON.parse(JSON.stringify(obj)); }

  /** Normalize a transform config coming from the UI (strings) into the ciphers contract. */
  function normalizeTransform(t) {
    const out = Object.assign({ type: 'none' }, t || {});
    if (!out.type) out.type = 'none';
    if (out.shift !== undefined && out.shift !== '') out.shift = Number(out.shift) || 0;
    else delete out.shift;
    if (out.start !== undefined && out.start !== '') out.start = Number(out.start) || 0;
    else delete out.start;
    if (out.numbers !== undefined && !Array.isArray(out.numbers)) {
      out.numbers = parseNumbers(out.numbers).numbers;
    }
    out.decrypt = !!out.decrypt;
    if (out.key == null) out.key = '';
    return out;
  }

  /** Normalize an encoding config (drop empty-string numeric options so defaults apply). */
  function normalizeEncoding(e) {
    const out = Object.assign({ type: 'bacon' }, e || {});
    ['width', 'bits'].forEach(function (k) {
      if (out[k] === '' || out[k] == null || !Number.isFinite(Number(out[k])) || Number(out[k]) <= 0) {
        delete out[k];
      } else {
        out[k] = Number(out[k]);
      }
    });
    if (out.type === 'binary' && !out.mode) out.mode = 'numbers';
    return out;
  }

  /**
   * Apply a transform, catching configuration problems as warnings.
   * Returns { text, applied, warnings }.
   */
  function runTransform(text, t) {
    const warnings = [];
    if (!t || t.type === 'none') return { text: text, applied: false, warnings: warnings };
    if (t.type === 'vigenere' && !/[a-z]/i.test(t.key || '')) {
      warnings.push('Vigenère key is empty (needs letters) — text left unencrypted.');
      return { text: text, applied: false, warnings: warnings };
    }
    if (t.type === 'shiftList' && !(t.numbers && t.numbers.length)) {
      warnings.push('Shift list is empty — text left unshifted.');
      return { text: text, applied: false, warnings: warnings };
    }
    try {
      return { text: C().applyTransform(text, t), applied: true, warnings: warnings };
    } catch (e) {
      warnings.push('Cipher error: ' + (e && e.message ? e.message : e));
      return { text: text, applied: false, warnings: warnings };
    }
  }

  // -------------------------------------------------------------- encode ---

  /**
   * Encode one layer: text -> (transform) -> bit rows.
   * @returns {{cipherText:string, rows:number[][], labels:string[], warnings:string[], transformed:boolean}}
   */
  function encodeLayer(layer) {
    layer = layer || {};
    const text = String(layer.text == null ? '' : layer.text);
    const t = normalizeTransform(layer.transform);
    const tr = runTransform(text, t);
    const enc = C().encode(tr.text, normalizeEncoding(layer.encoding));
    return {
      cipherText: tr.text,
      rows: enc.rows || [],
      labels: enc.labels || [],
      warnings: tr.warnings.concat(enc.warnings || []),
      transformed: tr.applied
    };
  }

  function prefix(name, list) {
    return (list || []).map(function (w) { return name + ': ' + w; });
  }

  /**
   * Resolve the dual-layer configs, applying the preset flags:
   *   crossKeys        — RL text is encrypted with the Swap key and vice-versa.
   *   linkedShiftList  — RL layer = number list (5-bit binary); Swap layer = swap.text
   *                      shifted letter-by-letter by that list (shiftList), bacon-encoded.
   *   numbersAsLetters — (with linkedShiftList) the RL number list is written as letters
   *                      (a=0, b=1, …), encrypted with rl.transform (e.g. Vigenère) and
   *                      bacon-encoded.
   */
  function resolveDual(config) {
    const rl = clone(config.rl) || {};
    const swap = clone(config.swap) || {};
    rl.transform = rl.transform || { type: 'none' };
    swap.transform = swap.transform || { type: 'none' };
    const warnings = [];
    let numbers = null;

    if (config.crossKeys) {
      const rk = rl.transform.key;
      rl.transform.key = swap.transform.key;
      swap.transform.key = rk;
    }

    if (config.linkedShiftList) {
      const src = config.numbers == null || config.numbers === '' ? DEFAULT_NUMBER_LIST : config.numbers;
      const parsed = parseNumbers(src);
      if (parsed.invalid.length) warnings.push('Number list: ignored "' + parsed.invalid.join('", "') + '".');
      numbers = parsed.numbers;
      const letters = countLetters(swap.text);
      if (parsed.ellipsis || !numbers.length) numbers = extendNumbers(numbers, Math.max(letters, numbers.length));
      else if (numbers.length < letters) {
        warnings.push('Number list (' + numbers.length + ') is shorter than the plaintext (' + letters +
          ' letters); it cycles for the shift, but the RL layer only carries ' + numbers.length + ' rows.');
      }

      swap.transform = { type: 'shiftList', numbers: numbers, decrypt: false };
      swap.encoding = swap.encoding && swap.encoding.type ? swap.encoding : { type: 'bacon' };

      if (config.numbersAsLetters) {
        rl.text = numbers.map(numberToLetter).join('');
        rl.encoding = rl.encoding && rl.encoding.type ? rl.encoding : { type: 'bacon' };
        if (numbers.some(function (n) { return n < 0 || n > 25; })) {
          warnings.push('Numbers outside 0–25 are taken mod 26 when written as letters.');
        }
      } else {
        rl.text = numbers.join(' ');
        rl.transform = { type: 'none' };
        const bits = rl.encoding && Number(rl.encoding.bits) > 0 ? Number(rl.encoding.bits) : LINKED_BITS;
        rl.encoding = { type: 'binary', mode: 'numbers', bits: bits };
        const max = Math.pow(2, bits) - 1;
        if (numbers.some(function (n) { return n < 0 || n > max; })) {
          warnings.push('Some numbers do not fit in ' + bits + ' bits (0–' + max + ').');
        }
      }
    }
    return { rl: rl, swap: swap, numbers: numbers, warnings: warnings };
  }

  /**
   * Full encode.
   *   { mode:'color'|'rl'|'swap', layer, format }
   *   { mode:'dual', rl, swap, format, crossKeys?, linkedShiftList?, numbersAsLetters?, numbers? }
   * @returns {{knots:string[][], text:string, layers:object[], warnings:string[], stats:object, mode:string}}
   */
  function encode(config) {
    config = config || {};
    const mode = config.mode || 'color';
    const format = Object.assign({}, DEFAULT_FORMAT, config.format || {});
    const k = K();

    if (mode === 'dual') {
      const d = resolveDual(config);
      const rl = encodeLayer(d.rl);
      const swap = encodeLayer(d.swap);
      const dk = k.dualToKnots(rl.rows, swap.rows);
      const knots = dk.knots || [];
      const warnings = d.warnings
        .concat(prefix('RL', rl.warnings))
        .concat(prefix('Swap', swap.warnings))
        .concat(dk.warnings || []);
      return {
        mode: mode,
        knots: knots,
        text: k.format(knots, format),
        layers: [
          Object.assign({ name: 'rl', label: 'RL layer', config: d.rl }, rl),
          Object.assign({ name: 'swap', label: 'Swap layer', config: d.swap }, swap)
        ],
        numbers: d.numbers,
        warnings: warnings,
        stats: k.stats(knots)
      };
    }

    if (mode !== 'color' && mode !== 'rl' && mode !== 'swap') {
      throw new Error('Unknown knot mode: ' + mode);
    }
    const layerCfg = config.layer || {};
    const layer = encodeLayer(layerCfg);
    const knots = k.bitsToKnots(layer.rows, mode);
    return {
      mode: mode,
      knots: knots,
      text: k.format(knots, format),
      layers: [Object.assign({ name: 'main', label: 'Layer', config: clone(layerCfg) }, layer)],
      warnings: layer.warnings.slice(),
      stats: k.stats(knots)
    };
  }

  // -------------------------------------------------------------- decode ---

  function decodeRows(rows, opts) {
    opts = opts || {};
    const warnings = [];
    let cipherText = '';
    try {
      cipherText = C().decode(rows, normalizeEncoding(opts.encoding));
    } catch (e) {
      warnings.push('Decode error: ' + (e && e.message ? e.message : e));
    }
    const t = normalizeTransform(opts.transform);
    let text = cipherText;
    let undone = false;
    if (t.type !== 'none') {
      // Undo the transform: flip its decrypt flag (atbash is its own inverse).
      const inv = Object.assign({}, t, { decrypt: !t.decrypt });
      const tr = runTransform(cipherText, inv);
      text = tr.text;
      undone = tr.applied;
      tr.warnings.forEach(function (w) { warnings.push(w); });
    }
    return { text: text, cipherText: cipherText, rows: rows, transformUndone: undone, warnings: warnings };
  }

  /**
   * Decode a knot string.
   *   single: decode(str, { mode, encoding, transform? }) -> { text, cipherText, rows, knots, warnings }
   *   dual:   decode(str, { mode:'dual', encoding?, transform?, rl?:{encoding,transform},
   *                         swap?:{encoding,transform}, crossKeys?, linkedShiftList?, numbersAsLetters? })
   *        -> { rl:{text,cipherText,rows}, swap:{...}, knots, numbers?, warnings }
   * `text` has the transform undone when a transform is given; `cipherText` is the raw decoded text.
   * Parse errors are reported in `error` + `warnings` rather than thrown.
   */
  function decode(knotString, opts) {
    opts = opts || {};
    const mode = opts.mode || 'color';
    const k = K();
    let knots;
    try {
      knots = k.parse(String(knotString == null ? '' : knotString));
    } catch (e) {
      const msg = 'Could not parse knots: ' + (e && e.message ? e.message : e);
      if (mode === 'dual') {
        return { rl: { text: '', cipherText: '', rows: [] }, swap: { text: '', cipherText: '', rows: [] },
          knots: [], warnings: [msg], error: msg };
      }
      return { text: '', cipherText: '', rows: [], knots: [], warnings: [msg], error: msg };
    }

    if (mode !== 'dual') {
      const r = k.knotsToBits(knots, mode);
      const d = decodeRows(r.rows || [], opts);
      d.knots = knots;
      d.warnings = (r.warnings || []).concat(d.warnings);
      return d;
    }

    const r = k.knotsToBits(knots, 'dual');
    const rlOpts = clone(opts.rl) || { encoding: opts.encoding, transform: opts.transform };
    const swapOpts = clone(opts.swap) || { encoding: opts.encoding, transform: opts.transform };
    const warnings = (r.warnings || []).slice();

    if (opts.crossKeys) {
      const rk = rlOpts.transform && rlOpts.transform.key;
      const sk = swapOpts.transform && swapOpts.transform.key;
      if (rlOpts.transform) rlOpts.transform.key = sk;
      if (swapOpts.transform) swapOpts.transform.key = rk;
    }

    let numbers;
    if (opts.linkedShiftList) {
      if (opts.numbersAsLetters) {
        rlOpts.encoding = rlOpts.encoding && rlOpts.encoding.type ? rlOpts.encoding : { type: 'bacon' };
      } else {
        rlOpts.encoding = { type: 'binary', mode: 'numbers',
          bits: rlOpts.encoding && rlOpts.encoding.bits ? rlOpts.encoding.bits : LINKED_BITS };
        rlOpts.transform = { type: 'none' };
      }
    }
    const rl = decodeRows(r.rl || [], rlOpts);
    if (opts.linkedShiftList) {
      numbers = opts.numbersAsLetters ? lettersToNumbers(rl.text) : parseNumbers(rl.text).numbers;
      // dualToKnots pads the shorter layer with 0-rows; drop trailing padding beyond the
      // number of letters the Swap layer actually carries.
      const swapLetters = countLetters(decodeRows(r.swap || [], { encoding: swapOpts.encoding || { type: 'bacon' } }).text);
      if (swapLetters && numbers.length > swapLetters) {
        warnings.push('Ignored ' + (numbers.length - swapLetters) + ' trailing number(s) beyond the ' +
          swapLetters + ' plaintext letters (usually zero-row padding).');
        numbers = numbers.slice(0, swapLetters);
      }
      swapOpts.transform = { type: 'shiftList', numbers: numbers, decrypt: false };
      swapOpts.encoding = swapOpts.encoding && swapOpts.encoding.type ? swapOpts.encoding : { type: 'bacon' };
    }
    const swap = decodeRows(r.swap || [], swapOpts);
    return {
      rl: rl,
      swap: swap,
      knots: knots,
      numbers: numbers,
      warnings: warnings.concat(prefix('RL', rl.warnings)).concat(prefix('Swap', swap.warnings))
    };
  }

  // ------------------------------------------------------------- presets ---

  const NONE = { type: 'none' };
  const BACON = { type: 'bacon' };
  const MORSE = { type: 'morse', width: 10 };
  const BINARY = { type: 'binary', mode: 'numbers' };
  const vig = function (key) { return { type: 'vigenere', key: key, decrypt: false }; };
  const L = function (text, transform, encoding) {
    return { text: text, transform: transform || NONE, encoding: encoding };
  };

  const GROUPS = ['Binary', 'Bacon', 'Morse', 'Vigenère', 'Trithemius'];

  /* Presets from the team's puzzle sheet. `number` is the order on this list (grouped by type,
   * then difficulty), not a puzzle id. `difficulty` is as written on the sheet; null = not given. */
  const PRESETS_RAW = [
    { id: 'color-binary', name: 'Color Binary', group: 'Binary', difficulty: 2,
      description: 'Numbers written in binary (MSB first); 0 = black (FX), 1 = white (BX).',
      config: { mode: 'color', layer: L('3 1 4 1 5 9 2 6', NONE, BINARY) } },
    { id: 'rl-binary', name: 'L-R Binary', group: 'Binary', difficulty: 3,
      description: 'Numbers in binary; 0 = forward (F), 1 = backward (B).',
      config: { mode: 'rl', layer: L('3 1 4 1 5 9 2 6', NONE, BINARY) } },
    { id: 'swap-binary', name: 'Swap Binary', group: 'Binary', difficulty: 5,
      description: 'Numbers in binary; 0 = plain forward (F), 1 = forward swap (FX).',
      config: { mode: 'swap', layer: L('3 1 4 1 5 9 2 6', NONE, BINARY) } },

    { id: 'color-bacon', name: 'Color Bacon', group: 'Bacon', difficulty: 4,
      description: 'Bacon cipher (a=00000 … z=11001, space=11111) in black/white.',
      config: { mode: 'color', layer: L('letibus jam', NONE, BACON) } },
    { id: 'rl-bacon', name: 'L-R Bacon', group: 'Bacon', difficulty: 6,
      description: 'Bacon bits as knot direction: 0 = F, 1 = B.',
      config: { mode: 'rl', layer: L('letibus jam', NONE, BACON) } },
    { id: 'swap-bacon', name: 'Swap Bacon', group: 'Bacon', difficulty: 8,
      description: 'Bacon bits as swap / no swap: 0 = F, 1 = FX.',
      config: { mode: 'swap', layer: L('letibus jam', NONE, BACON) } },
    { id: 'dual-bacon', name: 'Dual L-R Swap Bacon', group: 'Bacon', difficulty: 10,
      description: 'Two Bacon messages in one bracelet: one in knot direction (RL), one in swaps.',
      config: { mode: 'dual', rl: L('north', NONE, BACON), swap: L('south', NONE, BACON) } },

    { id: 'color-morse', name: 'Color Morse', group: 'Morse', difficulty: '2/4',
      description: 'Morse (. = 1, - = 11, 0 between symbols, padded to 10) in black/white.',
      config: { mode: 'color', layer: L('eta n', NONE, MORSE) } },
    { id: 'rl-morse', name: 'L-R Morse', group: 'Morse', difficulty: null,
      description: 'Morse bits as knot direction: 0 = F, 1 = B.',
      config: { mode: 'rl', layer: L('eta n', NONE, MORSE) } },
    { id: 'swap-morse', name: 'Swap Morse', group: 'Morse', difficulty: null,
      description: 'Morse bits as swap / no swap: 0 = F, 1 = FX.',
      config: { mode: 'swap', layer: L('eta n', NONE, MORSE) } },
    { id: 'dual-morse', name: 'Dual Morse', group: 'Morse', difficulty: null,
      description: 'Two Morse messages: one in knot direction (RL), one in swaps.',
      config: { mode: 'dual', rl: L('ab', NONE, MORSE), swap: L('bc', NONE, MORSE) } },

    { id: 'color-bacon-vigenere', name: 'Color Bacon Vigenère', group: 'Vigenère', difficulty: 9,
      description: 'Vigenère-encrypt the text, then Bacon in black/white.',
      config: { mode: 'color', layer: L('letibus jam', vig('knot'), BACON) } },
    { id: 'rl-vigenere', name: 'L-R Vigenère', group: 'Vigenère', difficulty: 10,
      description: 'Vigenère-encrypt, then Bacon as knot direction (F/B).',
      config: { mode: 'rl', layer: L('letibus jam', vig('knot'), BACON) } },
    { id: 'swap-vigenere', name: 'Swap Vigenère', group: 'Vigenère', difficulty: 10,
      description: 'Vigenère-encrypt, then Bacon as swaps (F/FX).',
      config: { mode: 'swap', layer: L('letibus jam', vig('knot'), BACON) } },
    { id: 'dual-vigenere', name: 'Dual Vigenère', group: 'Vigenère', difficulty: 11,
      description: 'Two texts, two keys: RL layer and Swap layer each Vigenère-encrypted with their own key, Bacon-encoded.',
      config: { mode: 'dual', rl: L('meet here', vig('red'), BACON), swap: L('bring tea', vig('blue'), BACON) } },
    { id: 'wrong-key-dual-vigenere', name: 'Wrong Key Dual Vigenère', group: 'Vigenère', difficulty: 12,
      description: 'Like Dual Vigenère, but the RL text is encrypted with the Swap key and the Swap text with the RL key.',
      config: { mode: 'dual', crossKeys: true,
        rl: L('meet here', vig('red'), BACON), swap: L('bring tea', vig('blue'), BACON) } },

    { id: 'single-dual-trithemius', name: 'Single Dual Trithemius', group: 'Trithemius', difficulty: 10,
      description: 'RL layer = the number list in 5-bit binary; Swap layer = the plaintext with its i-th letter shifted by the i-th number, Bacon-encoded. A trailing "..." continues the list to the plaintext length.',
      config: { mode: 'dual', linkedShiftList: true, numbers: DEFAULT_NUMBER_LIST,
        rl: L('', NONE, { type: 'binary', mode: 'numbers', bits: 5 }),
        swap: L('bracelet', NONE, BACON) } },
    { id: 'double-dual-trithemius', name: 'Double Dual Trithemius', group: 'Trithemius', difficulty: 11,
      description: 'Interpretation — confirm with puzzle author. As Single Dual Trithemius, but the RL number list is written as letters (a=0, b=1 …), Vigenère-encrypted with a key and Bacon-encoded.',
      config: { mode: 'dual', linkedShiftList: true, numbersAsLetters: true, numbers: DEFAULT_NUMBER_LIST,
        rl: L('', vig('key'), BACON),
        swap: L('bracelet', NONE, BACON) } }
  ];

  function difficultyValue(d) {
    if (d == null) return Infinity;
    const n = parseFloat(d);
    return Number.isFinite(n) ? n : Infinity;
  }
  const MODE_ORDER = { color: 0, rl: 1, swap: 2, dual: 3 };

  const PRESETS = PRESETS_RAW
    .map(function (p, i) { return { p: p, i: i }; })
    .sort(function (a, b) {
      return (GROUPS.indexOf(a.p.group) - GROUPS.indexOf(b.p.group)) ||
        (difficultyValue(a.p.difficulty) - difficultyValue(b.p.difficulty)) ||
        (MODE_ORDER[a.p.config.mode] - MODE_ORDER[b.p.config.mode]) ||
        (a.i - b.i);
    })
    .map(function (x, i) { return Object.assign({ number: i + 1 }, x.p); });

  function getPreset(id) {
    for (let i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  const api = {
    encodeLayer: encodeLayer,
    encode: encode,
    decode: decode,
    PRESETS: PRESETS,
    GROUPS: GROUPS,
    getPreset: getPreset,
    DEFAULT_FORMAT: DEFAULT_FORMAT,
    DEFAULT_NUMBER_LIST: DEFAULT_NUMBER_LIST,
    // exposed helpers (UI + tests)
    parseNumbers: parseNumbers,
    extendNumbers: extendNumbers,
    numberToLetter: numberToLetter,
    lettersToNumbers: lettersToNumbers
  };

  root.TPOF = root.TPOF || {};
  root.TPOF.pipeline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
