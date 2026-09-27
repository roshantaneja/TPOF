/*
 * TPOF Knot Encoder — DOM wiring. Depends on TPOF.ciphers, TPOF.knots, TPOF.pipeline
 * (loaded before this file by plain <script> tags).
 */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const T = window.TPOF || {};
  const STORAGE_KEY = 'tpof.knot-encoder.v1';

  function showFatal(msg) {
    const b = $('load-error');
    if (b) { b.textContent = msg; b.hidden = false; }
    if (window.console) console.warn('[TPOF] ' + msg);
  }

  const missing = ['ciphers', 'knots', 'pipeline'].filter(function (n) { return !T[n]; });
  if (missing.length) {
    showFatal('Could not load ' + missing.map(function (n) { return 'js/' + n + '.js'; }).join(', ') +
      ' — the encoder needs all of js/ciphers.js, js/knots.js and js/pipeline.js next to index.html.');
    return;
  }
  const C = T.ciphers, K = T.knots, P = T.pipeline;

  // ---------------------------------------------------------- metadata ---
  const TRANSFORM_FALLBACK = {
    none: { label: 'None', options: [] },
    vigenere: { label: 'Vigenère', options: ['key', 'decrypt'] },
    trithemius: { label: 'Trithemius', options: ['start', 'decrypt'] },
    shiftList: { label: 'Shift list', options: ['numbers', 'decrypt'] },
    caesar: { label: 'Caesar', options: ['shift', 'decrypt'] },
    atbash: { label: 'Atbash', options: [] }
  };
  const ENCODING_FALLBACK = {
    bacon: { label: 'Bacon (5-bit)', options: [] },
    morse: { label: 'Morse', options: ['width'] },
    binary: { label: 'Binary', options: ['mode', 'bits'] }
  };
  const MODE_FALLBACK = [
    { id: 'color', label: 'Color', description: '0 → FX (black), 1 → BX (white)' },
    { id: 'rl', label: 'RL', description: '0 → F, 1 → B' },
    { id: 'swap', label: 'Swap', description: '0 → F, 1 → FX' },
    { id: 'dual', label: 'Dual', description: 'RL layer + Swap layer: 00 → F, 10 → B, 01 → FX, 11 → BX' }
  ];
  const KNOWN_OPTIONS = ['key', 'shift', 'start', 'numbers', 'decrypt', 'width', 'mode', 'bits'];

  function optionNames(opts) {
    return (opts || []).map(function (o) {
      return typeof o === 'string' ? o : (o && (o.id || o.name || o.key));
    }).filter(function (n) { return KNOWN_OPTIONS.indexOf(n) >= 0; });
  }

  function normMeta(list, fallback) {
    const out = [];
    if (Array.isArray(list) && list.length) {
      list.forEach(function (m) {
        if (!m || !m.id) return;
        const fb = fallback[m.id] || {};
        out.push({
          id: m.id,
          label: m.label || fb.label || m.id,
          description: m.description || '',
          options: Array.isArray(m.options) ? optionNames(m.options) : (fb.options || [])
        });
      });
    }
    if (!out.length) {
      Object.keys(fallback).forEach(function (id) {
        out.push({ id: id, label: fallback[id].label, description: '', options: fallback[id].options });
      });
    }
    return out;
  }

  const TRANSFORMS = normMeta(C.TRANSFORMS, TRANSFORM_FALLBACK);
  if (!TRANSFORMS.some(function (t) { return t.id === 'none'; })) {
    TRANSFORMS.unshift({ id: 'none', label: 'None', description: '', options: [] });
  }
  const ENCODINGS = normMeta(C.ENCODINGS, ENCODING_FALLBACK);
  const MODES = (Array.isArray(K.MODES) && K.MODES.length ? K.MODES : MODE_FALLBACK).map(function (m) {
    const fb = MODE_FALLBACK.filter(function (f) { return f.id === m.id; })[0] || {};
    return { id: m.id, label: m.label || fb.label || m.id, description: m.description || fb.description || '' };
  });
  function metaFor(list, id) {
    return list.filter(function (m) { return m.id === id; })[0] || { id: id, label: id, description: '', options: [] };
  }

  // ------------------------------------------------------------- state ---
  function defaultLayer(text, encType) {
    return {
      text: text || '',
      transform: { type: 'none', key: '', shift: '3', start: '0', numbers: '1 2 3', decrypt: false },
      encoding: { type: encType || 'bacon', width: '10', mode: 'numbers', bits: '' }
    };
  }
  function mergeLayer(base, src) {
    const out = JSON.parse(JSON.stringify(base));
    if (!src || typeof src !== 'object') return out;
    if (typeof src.text === 'string') out.text = src.text;
    ['transform', 'encoding'].forEach(function (k) {
      const s = src[k];
      if (!s || typeof s !== 'object') return;
      Object.keys(out[k]).forEach(function (f) {
        if (s[f] === undefined || s[f] === null) return;
        if (f === 'decrypt') out[k][f] = !!s[f];
        else if (f === 'numbers' && Array.isArray(s[f])) out[k][f] = s[f].join(' ');
        else out[k][f] = String(s[f]);
      });
    });
    return out;
  }

  function defaultState() {
    return {
      tab: 'encode',
      enc: {
        presetId: 'color-morse',
        mode: 'color',
        layers: {
          main: defaultLayer('eta n', 'morse'),
          rl: defaultLayer('ab', 'morse'),
          swap: defaultLayer('bc', 'morse')
        },
        crossKeys: false, linked: false, asLetters: false,
        numbers: P.DEFAULT_NUMBER_LIST || '1 2 3 4 5 ...',
        fmtRow: 'space', fmtKnot: 'comma',
        sim: false, left: '#1d3557', right: '#f4a261'
      },
      dec: {
        input: '',
        mode: 'color',
        layers: { main: defaultLayer('', 'morse'), rl: defaultLayer('', 'bacon'), swap: defaultLayer('', 'bacon') },
        crossKeys: false, linked: false, asLetters: false
      }
    };
  }

  function loadState() {
    const s = defaultState();
    let saved = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { saved = null; }
    if (!saved || typeof saved !== 'object') {
      applyPresetTo(s.enc, P.getPreset(s.enc.presetId));
      return s;
    }
    if (saved.tab === 'decode') s.tab = 'decode';
    ['enc', 'dec'].forEach(function (side) {
      const src = saved[side];
      if (!src || typeof src !== 'object') return;
      const dst = s[side];
      Object.keys(dst).forEach(function (k) {
        if (k === 'layers') {
          if (src.layers) ['main', 'rl', 'swap'].forEach(function (n) {
            dst.layers[n] = mergeLayer(dst.layers[n], src.layers[n]);
          });
        } else if (typeof src[k] === typeof dst[k]) {
          dst[k] = src[k];
        }
      });
    });
    if (!MODES.some(function (m) { return m.id === s.enc.mode; })) s.enc.mode = 'color';
    if (!MODES.some(function (m) { return m.id === s.dec.mode; })) s.dec.mode = 'color';
    if (s.enc.presetId !== 'custom' && !P.getPreset(s.enc.presetId)) s.enc.presetId = 'custom';
    return s;
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }, 250);
  }

  function applyPresetTo(enc, preset) {
    if (!preset) return;
    const cfg = preset.config;
    enc.presetId = preset.id;
    enc.mode = cfg.mode;
    if (cfg.mode === 'dual') {
      enc.layers.rl = mergeLayer(defaultLayer(), cfg.rl);
      enc.layers.swap = mergeLayer(defaultLayer(), cfg.swap);
    } else {
      enc.layers.main = mergeLayer(defaultLayer(), cfg.layer);
    }
    enc.crossKeys = !!cfg.crossKeys;
    enc.linked = !!cfg.linkedShiftList;
    enc.asLetters = !!cfg.numbersAsLetters;
    enc.numbers = cfg.numbers != null ? String(cfg.numbers) : (P.DEFAULT_NUMBER_LIST || '1 2 3 4 5 ...');
  }

  const state = loadState();

  // ----------------------------------------------------------- helpers ---
  function el(tag, attrs) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    });
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function bitsStr(row) { return row ? row.join('') : ''; }
  function describeCode(code) {
    try { const d = K.describe(code); return (d && d.label) || code; } catch (e) { return code; }
  }
  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff';
  }
  function showLabel(s) {
    if (s === ' ') return '␣';
    if (s == null || s === '') return '';
    return String(s);
  }
  function formatOpts() {
    return {
      rowSep: state.enc.fmtRow === 'newline' ? '\n' : ' ',
      knotSep: state.enc.fmtKnot === 'comma-space' ? ', ' : ','
    };
  }
  const ARROW = { F: '↘', B: '↙', FX: '↘', BX: '↙' };

  // ------------------------------------------------------- layer panel ---
  const OPTION_DEFS = {
    key: { group: 'transform', label: 'Key', input: 'text' },
    shift: { group: 'transform', label: 'Shift', input: 'number' },
    start: { group: 'transform', label: 'Start shift', input: 'number' },
    numbers: { group: 'transform', label: 'Number list', input: 'text', placeholder: '1 2 3' },
    decrypt: { group: 'transform', label: 'Decrypt instead of encrypt', input: 'checkbox' },
    width: { group: 'encoding', label: 'Row width (bits)', input: 'number', min: 1 },
    mode: { group: 'encoding', label: 'Binary mode', input: 'select',
      choices: [['numbers', 'Numbers → n-bit rows'], ['raw', 'Raw 0/1 tokens'], ['ascii', 'ASCII (8 bits/char)']] },
    bits: { group: 'encoding', label: 'Bits per number', input: 'number', min: 1, placeholder: 'auto' }
  };

  /**
   * A layer editor: text (optional), cipher transform + options, bit encoding + options.
   * It edits whatever layer object is bound via bind(); onChange(structural) fires on edits.
   */
  function LayerPanel(container, prefix, cfg) {
    const self = this;
    this.layer = null;
    this.cfg = cfg;
    this.locks = { text: true, transform: true, encoding: true, note: '' };

    const titleId = prefix + '-title';
    this.root = el('section', { class: 'card layer-card', 'aria-labelledby': titleId });
    this.title = el('h2', { id: titleId, text: cfg.title });
    this.note = el('p', { class: 'layer-note', hidden: true });
    this.root.appendChild(this.title);
    this.root.appendChild(this.note);

    // text
    this.textWrap = el('div', { class: 'field' });
    this.textLabel = el('label', { for: prefix + '-text', text: cfg.textLabel || 'Plaintext' });
    this.text = el('textarea', { id: prefix + '-text', rows: '3', spellcheck: 'false', autocomplete: 'off' });
    this.textWrap.appendChild(this.textLabel);
    this.textWrap.appendChild(this.text);
    if (cfg.withText) this.root.appendChild(this.textWrap);
    this.text.addEventListener('input', function () {
      if (!self.layer) return;
      self.layer.text = self.text.value;
      cfg.onChange(false);
    });

    const row = el('div', { class: 'layer-grid' });
    this.root.appendChild(row);

    function makeSelect(id, label, items, group) {
      const wrap = el('div', { class: 'field' });
      const sel = el('select', { id: id });
      items.forEach(function (m) { sel.appendChild(el('option', { value: m.id, text: m.label })); });
      const hint = el('p', { class: 'hint', id: id + '-hint' });
      sel.setAttribute('aria-describedby', id + '-hint');
      wrap.appendChild(el('label', { for: id, text: label }));
      wrap.appendChild(sel);
      wrap.appendChild(hint);
      sel.addEventListener('change', function () {
        if (!self.layer) return;
        self.layer[group].type = sel.value;
        self.sync();
        cfg.onChange(true);
      });
      return { wrap: wrap, sel: sel, hint: hint };
    }

    this.transform = makeSelect(prefix + '-transform', cfg.transformLabel || 'Text cipher', TRANSFORMS, 'transform');
    this.encoding = makeSelect(prefix + '-encoding', 'Bit encoding', ENCODINGS, 'encoding');
    this.tBox = el('div', { class: 'opt-box' });
    this.eBox = el('div', { class: 'opt-box' });
    const tCol = el('div', { class: 'layer-col' }, this.transform.wrap, this.tBox);
    const eCol = el('div', { class: 'layer-col' }, this.encoding.wrap, this.eBox);
    this.tCol = tCol; this.eCol = eCol;
    row.appendChild(tCol);
    row.appendChild(eCol);

    this.opts = {};
    Object.keys(OPTION_DEFS).forEach(function (name) {
      const d = OPTION_DEFS[name];
      const id = prefix + '-opt-' + name;
      let input, wrap;
      const label = (name === 'key' && cfg.keyLabel) ? cfg.keyLabel :
        (name === 'decrypt' && cfg.decryptLabel) ? cfg.decryptLabel : d.label;
      if (d.input === 'checkbox') {
        input = el('input', { type: 'checkbox', id: id });
        wrap = el('label', { class: 'check field' }, input, ' ' + label);
      } else if (d.input === 'select') {
        input = el('select', { id: id });
        d.choices.forEach(function (c) { input.appendChild(el('option', { value: c[0], text: c[1] })); });
        wrap = el('div', { class: 'field' }, el('label', { for: id, text: label }), input);
      } else {
        input = el('input', {
          type: d.input, id: id, autocomplete: 'off', spellcheck: 'false',
          min: d.min != null ? String(d.min) : null, placeholder: d.placeholder || null,
          inputmode: d.input === 'number' ? 'numeric' : null
        });
        wrap = el('div', { class: 'field' }, el('label', { for: id, text: label }), input);
      }
      (d.group === 'transform' ? self.tBox : self.eBox).appendChild(wrap);
      self.opts[name] = { input: input, wrap: wrap, def: d };
      input.addEventListener(d.input === 'checkbox' || d.input === 'select' ? 'change' : 'input', function () {
        if (!self.layer) return;
        const obj = self.layer[d.group];
        obj[name] = d.input === 'checkbox' ? input.checked : input.value;
        if (name === 'mode') self.sync();
        cfg.onChange(false);
      });
    });

    container.appendChild(this.root);
  }

  LayerPanel.prototype.bind = function (layer) {
    this.layer = layer;
    this.text.value = layer.text || '';
    this.transform.sel.value = layer.transform.type;
    if (this.transform.sel.value !== layer.transform.type) {
      layer.transform.type = 'none';
      this.transform.sel.value = 'none';
    }
    this.encoding.sel.value = layer.encoding.type;
    if (this.encoding.sel.value !== layer.encoding.type) {
      layer.encoding.type = ENCODINGS[0].id;
      this.encoding.sel.value = layer.encoding.type;
    }
    const self = this;
    Object.keys(this.opts).forEach(function (name) {
      const o = self.opts[name];
      const v = layer[o.def.group][name];
      if (o.def.input === 'checkbox') o.input.checked = !!v;
      else o.input.value = v == null ? '' : v;
    });
    this.sync();
  };

  /** locks: { text:bool, transform:bool, encoding:true|false|'bits', note:string } */
  LayerPanel.prototype.configure = function (locks) {
    this.locks = Object.assign({ text: true, transform: true, encoding: true, note: '' }, locks || {});
    this.sync();
  };

  LayerPanel.prototype.setTitle = function (t) { this.title.textContent = t; };

  LayerPanel.prototype.sync = function () {
    if (!this.layer) return;
    const L = this.locks;
    this.textWrap.hidden = !L.text;
    this.note.hidden = !L.note;
    this.note.textContent = L.note || '';

    const tMeta = metaFor(TRANSFORMS, this.layer.transform.type);
    const eMeta = metaFor(ENCODINGS, this.layer.encoding.type);
    this.tCol.hidden = !L.transform;
    this.transform.hint.textContent = tMeta.description || '';
    this.transform.hint.hidden = !tMeta.description;
    this.eCol.hidden = !L.encoding;
    this.encoding.wrap.hidden = L.encoding === 'bits';
    this.encoding.hint.textContent = eMeta.description || '';
    this.encoding.hint.hidden = !eMeta.description;

    const self = this;
    Object.keys(this.opts).forEach(function (name) {
      const o = self.opts[name];
      let show;
      if (o.def.group === 'transform') show = tMeta.options.indexOf(name) >= 0;
      else if (L.encoding === 'bits') show = name === 'bits';
      else {
        show = eMeta.options.indexOf(name) >= 0;
        if (name === 'bits' && self.layer.encoding.type === 'binary' && self.layer.encoding.mode !== 'numbers') show = false;
      }
      o.wrap.hidden = !show;
    });
    this.tBox.hidden = !tMeta.options.length;

    // text placeholder follows the encoding
    const e = this.layer.encoding;
    this.text.placeholder = e.type === 'binary'
      ? (e.mode === 'raw' ? '0/1 tokens, e.g. 01101 11000' : e.mode === 'ascii' ? 'Any text' : 'Numbers, e.g. 3 1 4 1 5')
      : 'Plaintext, e.g. letibus jam';
    this.textLabel.textContent = e.type === 'binary' && e.mode === 'numbers'
      ? (this.cfg.numbersLabel || 'Numbers') : (this.cfg.textLabel || 'Plaintext');
  };

  // ---------------------------------------------------- encode: setup ---
  const presetSel = $('preset');
  (function buildPresetPicker() {
    presetSel.appendChild(el('option', { value: 'custom', text: 'Custom — everything editable' }));
    const groups = P.GROUPS || [];
    const seen = {};
    groups.concat(P.PRESETS.map(function (p) { return p.group || 'Other'; })).forEach(function (g) {
      if (seen[g]) return;
      seen[g] = true;
      const items = P.PRESETS.filter(function (p) { return (p.group || 'Other') === g; });
      if (!items.length) return;
      const og = el('optgroup', { label: g });
      items.forEach(function (p) {
        const diff = p.difficulty == null ? '–' : p.difficulty;
        og.appendChild(el('option', { value: p.id, text: p.number + '. ' + p.name + '  (difficulty ' + diff + ')' }));
      });
      presetSel.appendChild(og);
    });
  })();

  function buildModeRadios(container, name, onPick) {
    const inputs = {};
    MODES.forEach(function (m) {
      const id = name + '-' + m.id;
      const input = el('input', { type: 'radio', name: name, id: id, value: m.id });
      input.addEventListener('change', function () { if (input.checked) onPick(m.id); });
      container.appendChild(el('span', { class: 'seg' }, input, el('label', { for: id, text: m.label, title: m.description })));
      inputs[m.id] = input;
    });
    return inputs;
  }

  const encModeInputs = buildModeRadios($('enc-mode'), 'enc-mode', function (mode) {
    state.enc.mode = mode;
    markCustom();
    refreshEncodeLayout();
    renderEncode();
  });

  function encOnChange(structural) {
    if (structural) markCustom();
    renderEncode();
  }
  const encPanels = {
    main: new LayerPanel($('enc-layers'), 'enc-main', { title: 'Text layer', withText: true, onChange: encOnChange }),
    rl: new LayerPanel($('enc-layers'), 'enc-rl', { title: 'RL layer', withText: true, keyLabel: 'RL key',
      textLabel: 'RL plaintext', numbersLabel: 'RL numbers', onChange: encOnChange }),
    swap: new LayerPanel($('enc-layers'), 'enc-swap', { title: 'Swap layer', withText: true, keyLabel: 'Swap key',
      textLabel: 'Swap plaintext', numbersLabel: 'Swap numbers', onChange: encOnChange })
  };

  function markCustom() {
    if (state.enc.presetId !== 'custom') {
      state.enc.presetId = 'custom';
      presetSel.value = 'custom';
      updatePresetDesc();
    }
  }

  function updatePresetDesc() {
    const p = P.getPreset(state.enc.presetId);
    const d = $('preset-desc');
    if (!p) {
      d.textContent = 'Custom: pick a knot mode, then set up each layer. Structural edits to a preset switch here, keeping your settings.';
      return;
    }
    clear(d);
    if (/confirm with puzzle author/i.test(p.description)) d.appendChild(el('span', { class: 'badge badge-warn', text: 'interpretation' }));
    d.appendChild(document.createTextNode(p.description + ' '));
    d.appendChild(el('span', { class: 'muted', text: 'Difficulty ' + (p.difficulty == null ? 'not given' : p.difficulty) + '.' }));
  }

  presetSel.addEventListener('change', function () {
    const p = P.getPreset(presetSel.value);
    if (p) {
      applyPresetTo(state.enc, p);
      bindEncode();
    } else {
      state.enc.presetId = 'custom';
      updatePresetDesc();
    }
    renderEncode();
  });

  function wireFlag(id, key, target, after) {
    const input = $(id);
    input.addEventListener('change', function () {
      target()[key] = input.checked;
      after();
    });
    return input;
  }
  const encFlagInputs = {
    crossKeys: wireFlag('enc-crossKeys', 'crossKeys', function () { return state.enc; }, function () { markCustom(); refreshEncodeLayout(); renderEncode(); }),
    linked: wireFlag('enc-linked', 'linked', function () { return state.enc; }, function () { markCustom(); refreshEncodeLayout(); renderEncode(); }),
    asLetters: wireFlag('enc-asLetters', 'asLetters', function () { return state.enc; }, function () { markCustom(); refreshEncodeLayout(); renderEncode(); })
  };
  $('enc-numbers').addEventListener('input', function () {
    state.enc.numbers = $('enc-numbers').value;
    renderEncode();
  });

  function refreshEncodeLayout() {
    const s = state.enc;
    const dual = s.mode === 'dual';
    Object.keys(encModeInputs).forEach(function (id) { encModeInputs[id].checked = id === s.mode; });
    const m = metaFor(MODES, s.mode);
    $('enc-mode-desc').textContent = m.description || '';
    $('enc-flags').hidden = !dual;
    $('enc-asLetters-wrap').hidden = !s.linked;
    $('enc-numbers-wrap').hidden = !s.linked;
    encPanels.main.root.hidden = dual;
    encPanels.rl.root.hidden = !dual;
    encPanels.swap.root.hidden = !dual;

    if (!dual) {
      encPanels.main.configure({});
      return;
    }
    if (s.linked) {
      encPanels.rl.configure(s.asLetters
        ? { text: false, transform: true, encoding: true,
          note: 'Carries the number list, written as letters (a=0, b=1 …) and encrypted with the cipher below.' }
        : { text: false, transform: false, encoding: 'bits',
          note: 'Carries the number list as binary numbers (default 5 bits each).' });
      encPanels.swap.configure({ text: true, transform: false, encoding: true,
        note: 'The plaintext, each letter shifted by the matching number of the list (shift list).' });
    } else {
      const cross = s.crossKeys ? 'Wrong key: encrypted with the other layer’s key.' : '';
      encPanels.rl.configure({ note: cross });
      encPanels.swap.configure({ note: cross });
    }
  }

  function bindEncode() {
    const s = state.enc;
    presetSel.value = P.getPreset(s.presetId) ? s.presetId : 'custom';
    updatePresetDesc();
    encPanels.main.bind(s.layers.main);
    encPanels.rl.bind(s.layers.rl);
    encPanels.swap.bind(s.layers.swap);
    encFlagInputs.crossKeys.checked = !!s.crossKeys;
    encFlagInputs.linked.checked = !!s.linked;
    encFlagInputs.asLetters.checked = !!s.asLetters;
    $('enc-numbers').value = s.numbers;
    $('fmt-row').value = s.fmtRow;
    $('fmt-knot').value = s.fmtKnot;
    $('sim-toggle').checked = !!s.sim;
    $('sim-left').value = s.left;
    $('sim-right').value = s.right;
    $('sim-controls').hidden = !s.sim;
    refreshEncodeLayout();
  }

  function buildEncodeConfig() {
    const s = state.enc;
    if (s.mode === 'dual') {
      return {
        mode: 'dual', rl: s.layers.rl, swap: s.layers.swap,
        crossKeys: !!s.crossKeys, linkedShiftList: !!s.linked,
        numbersAsLetters: !!(s.linked && s.asLetters), numbers: s.numbers,
        format: formatOpts()
      };
    }
    return { mode: s.mode, layer: s.layers.main, format: formatOpts() };
  }

  // --------------------------------------------------- encode: output ---
  let lastEncode = null;

  function renderList(ul, items) {
    clear(ul);
    items.forEach(function (w) { ul.appendChild(el('li', { text: w })); });
    ul.hidden = !items.length;
  }

  function renderStats(dl, stats) {
    clear(dl);
    if (!stats) return;
    function add(k, v, cls) {
      dl.appendChild(el('div', { class: 'stat' + (cls ? ' ' + cls : '') }, el('dt', { text: k }), el('dd', { text: String(v) })));
    }
    add('Rows', stats.rows);
    add('Knots', stats.knots);
    const counts = stats.counts || {};
    (K.CODES || ['F', 'B', 'FX', 'BX']).forEach(function (c) { add(c, counts[c] || 0, 'stat-code k-' + c); });
  }

  function renderEncode() {
    save();
    let out;
    try {
      out = P.encode(buildEncodeConfig());
    } catch (e) {
      lastEncode = null;
      $('knot-string').textContent = '';
      renderList($('warnings'), ['Error: ' + (e && e.message ? e.message : e)]);
      clear($('bracelet')); clear($('rows-table')); clear($('stats'));
      return;
    }
    lastEncode = out;
    const ks = $('knot-string');
    ks.textContent = out.text || '';
    ks.classList.toggle('empty', !out.text);
    if (!out.text) ks.textContent = 'Type some text to see its knots.';
    $('copy-btn').disabled = !out.text;
    renderStats($('stats'), out.stats);
    renderList($('warnings'), out.warnings || []);
    renderCipher(out);
    renderLegend(out.mode);
    renderGrid(out);
    renderRowsTable(out);
  }

  function renderCipher(out) {
    const box = $('cipher-out');
    clear(box);
    const shown = (out.layers || []).filter(function (l) { return l.transformed; });
    $('cipher-card').hidden = !shown.length;
    shown.forEach(function (l) {
      const lbl = out.mode === 'dual' ? l.label : 'Cipher text';
      box.appendChild(el('div', { class: 'cipher-line' },
        el('span', { class: 'cipher-label', text: lbl }),
        el('code', { class: 'cipher-text', text: l.cipherText })));
    });
    if (out.numbers && out.numbers.length) {
      box.appendChild(el('div', { class: 'cipher-line' },
        el('span', { class: 'cipher-label', text: 'Number list' }),
        el('code', { class: 'cipher-text', text: out.numbers.join(' ') })));
      $('cipher-card').hidden = false;
    }
  }

  function renderLegend(mode) {
    const box = $('legend');
    clear(box);
    const names = mode === 'color'
      ? { FX: 'FX · black', BX: 'BX · white' }
      : { F: 'F · forward', B: 'B · backward', FX: 'FX · fwd swap', BX: 'BX · back swap' };
    Object.keys(names).forEach(function (c) {
      box.appendChild(el('span', { class: 'legend-item' },
        el('span', { class: 'knot mini k-' + c + (mode === 'color' ? ' color' : '') },
          el('span', { class: 'arrow', text: ARROW[c] })),
        names[c]));
    });
  }

  function rowLabel(out, i) {
    if (out.mode === 'dual') {
      const a = out.layers[0].labels[i], b = out.layers[1].labels[i];
      return showLabel(a == null ? '·' : a) + '/' + showLabel(b == null ? '·' : b);
    }
    return showLabel(out.layers[0].labels[i]);
  }

  function knotCell(code, mode, extra) {
    const cell = el('span', { class: 'knot k-' + code + (mode === 'color' ? ' color' : '') + (extra ? ' ' + extra : '') },
      el('span', { class: 'arrow', 'aria-hidden': 'true', text: ARROW[code] || '?' }),
      el('span', { class: 'code', text: code }));
    return cell;
  }

  function renderGrid(out) {
    const box = $('bracelet');
    clear(box);
    const s = state.enc;
    let sim = null;
    if (s.sim && typeof K.simulate === 'function') {
      try { sim = K.simulate(out.knots, { left: s.left, right: s.right }); } catch (e) { sim = null; }
    }
    const frag = document.createDocumentFragment();
    out.knots.forEach(function (row, i) {
      const r = el('div', { class: 'brow', role: 'group', 'aria-label': 'Row ' + (i + 1) + ' (' + rowLabel(out, i) + '): ' + row.join(', ') });
      r.appendChild(el('span', { class: 'brow-num', 'aria-hidden': 'true', text: String(i + 1) }));
      r.appendChild(el('span', { class: 'brow-label', 'aria-hidden': 'true', text: rowLabel(out, i) }));
      const cells = el('span', { class: 'brow-cells', 'aria-hidden': 'true' });
      row.forEach(function (code, j) {
        const cell = knotCell(code, out.mode, sim ? 'sim' : '');
        let title = 'Row ' + (i + 1) + ', knot ' + (j + 1) + ': ' + describeCode(code);
        const info = sim && sim[i] && sim[i][j];
        if (info) {
          cell.style.background = info.shown;
          cell.style.color = textColorFor(info.shown);
          title += ' — shows ' + info.shown;
        }
        cell.title = title;
        cells.appendChild(cell);
      });
      r.appendChild(cells);
      frag.appendChild(r);
    });
    box.appendChild(frag);
    if (!out.knots.length) box.appendChild(el('p', { class: 'hint', text: 'No rows yet.' }));
  }

  function renderRowsTable(out) {
    const table = $('rows-table');
    clear(table);
    const dual = out.mode === 'dual';
    const head = dual ? ['#', 'RL', 'RL bits', 'Swap', 'Swap bits', 'Knots'] : ['#', 'Char', 'Bits', 'Knots'];
    const thead = el('thead', null, el('tr', null));
    head.forEach(function (h) { thead.firstChild.appendChild(el('th', { scope: 'col', text: h })); });
    table.appendChild(thead);
    const tbody = el('tbody');
    const fmt = { knotSep: ',', rowSep: ' ' };
    out.knots.forEach(function (row, i) {
      const tr = el('tr');
      tr.appendChild(el('td', { class: 'num', text: String(i + 1) }));
      if (dual) {
        out.layers.forEach(function (l) {
          const has = i < l.rows.length;
          tr.appendChild(el('td', { class: 'lbl', text: has ? showLabel(l.labels[i]) : '' }));
          tr.appendChild(el('td', { class: 'bits' + (has ? '' : ' pad'), text: has ? bitsStr(l.rows[i]) : '(padding)' }));
        });
      } else {
        const l = out.layers[0];
        tr.appendChild(el('td', { class: 'lbl', text: showLabel(l.labels[i]) }));
        tr.appendChild(el('td', { class: 'bits', text: bitsStr(l.rows[i]) }));
      }
      tr.appendChild(el('td', { class: 'knots', text: K.format([row], fmt) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  // format + copy + sim
  $('fmt-row').addEventListener('change', function () { state.enc.fmtRow = this.value; renderEncode(); });
  $('fmt-knot').addEventListener('change', function () { state.enc.fmtKnot = this.value; renderEncode(); });
  $('sim-toggle').addEventListener('change', function () {
    state.enc.sim = this.checked;
    $('sim-controls').hidden = !this.checked;
    renderEncode();
  });
  $('sim-left').addEventListener('input', function () { state.enc.left = this.value; renderEncode(); });
  $('sim-right').addEventListener('input', function () { state.enc.right = this.value; renderEncode(); });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      const ta = el('textarea', { readonly: true, 'aria-hidden': 'true', class: 'offscreen' });
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }
  let copyTimer = null;
  $('copy-btn').addEventListener('click', function () {
    const btn = this;
    if (!lastEncode || !lastEncode.text) return;
    copyText(lastEncode.text).then(function () {
      btn.textContent = 'Copied';
      $('copy-status').textContent = 'Knot string copied to clipboard.';
    }, function () {
      btn.textContent = 'Select & copy';
      $('copy-status').textContent = 'Could not copy automatically; the knot string is selected — press Ctrl/Cmd+C.';
      const range = document.createRange();
      range.selectNodeContents($('knot-string'));
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
    });
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () { btn.textContent = 'Copy'; $('copy-status').textContent = ''; }, 2000);
  });

  // ------------------------------------------------------------ decode ---
  const decModeInputs = buildModeRadios($('dec-mode'), 'dec-mode', function (mode) {
    state.dec.mode = mode;
    refreshDecodeLayout();
    renderDecode();
  });
  function decOnChange() { renderDecode(); }
  const decPanels = {
    main: new LayerPanel($('dec-layers'), 'dec-main', { title: 'How it was encoded', withText: false,
      decryptLabel: 'Cipher was applied in decrypt direction', onChange: decOnChange }),
    rl: new LayerPanel($('dec-layers'), 'dec-rl', { title: 'RL layer', withText: false, keyLabel: 'RL key',
      decryptLabel: 'Cipher was applied in decrypt direction', onChange: decOnChange }),
    swap: new LayerPanel($('dec-layers'), 'dec-swap', { title: 'Swap layer', withText: false, keyLabel: 'Swap key',
      decryptLabel: 'Cipher was applied in decrypt direction', onChange: decOnChange })
  };
  const decFlagInputs = {
    crossKeys: wireFlag('dec-crossKeys', 'crossKeys', function () { return state.dec; }, function () { refreshDecodeLayout(); renderDecode(); }),
    linked: wireFlag('dec-linked', 'linked', function () { return state.dec; }, function () { refreshDecodeLayout(); renderDecode(); }),
    asLetters: wireFlag('dec-asLetters', 'asLetters', function () { return state.dec; }, function () { refreshDecodeLayout(); renderDecode(); })
  };
  $('dec-input').addEventListener('input', function () { state.dec.input = this.value; renderDecode(); });

  function refreshDecodeLayout() {
    const s = state.dec;
    const dual = s.mode === 'dual';
    Object.keys(decModeInputs).forEach(function (id) { decModeInputs[id].checked = id === s.mode; });
    $('dec-flags').hidden = !dual;
    $('dec-asLetters-wrap').hidden = !s.linked;
    decPanels.main.root.hidden = dual;
    decPanels.rl.root.hidden = !dual;
    decPanels.swap.root.hidden = !dual;
    decPanels.main.configure({});
    if (dual && s.linked) {
      decPanels.rl.configure(s.asLetters
        ? { transform: true, encoding: true, note: 'Number list written as letters (a=0 …); undo its cipher here.' }
        : { transform: false, encoding: 'bits', note: 'Number list in binary (default 5 bits).' });
      decPanels.swap.configure({ transform: false, note: 'Shifted back letter-by-letter by the recovered numbers.' });
    } else {
      decPanels.rl.configure({ note: s.crossKeys && dual ? 'Wrong key: enter the RL key here; it is used on the Swap layer.' : '' });
      decPanels.swap.configure({ note: s.crossKeys && dual ? 'Wrong key: enter the Swap key here; it is used on the RL layer.' : '' });
    }
  }

  function bindDecode() {
    const s = state.dec;
    $('dec-input').value = s.input;
    decPanels.main.bind(s.layers.main);
    decPanels.rl.bind(s.layers.rl);
    decPanels.swap.bind(s.layers.swap);
    decFlagInputs.crossKeys.checked = !!s.crossKeys;
    decFlagInputs.linked.checked = !!s.linked;
    decFlagInputs.asLetters.checked = !!s.asLetters;
    refreshDecodeLayout();
  }

  function decodeLayerOpts(l) { return { encoding: l.encoding, transform: l.transform }; }

  function perRowChar(row, encoding) {
    try { return C.decode([row], encoding); } catch (e) { return '?'; }
  }

  function renderDecode() {
    save();
    const s = state.dec;
    const textBox = $('dec-text');
    clear(textBox);
    clear($('dec-rows'));
    clear($('dec-stats'));
    if (!s.input.trim()) {
      textBox.appendChild(el('p', { class: 'hint', text: 'Paste a knot string to decode it.' }));
      renderList($('dec-warnings'), []);
      return;
    }
    const dual = s.mode === 'dual';
    const opts = dual
      ? { mode: 'dual', rl: decodeLayerOpts(s.layers.rl), swap: decodeLayerOpts(s.layers.swap),
        crossKeys: !!s.crossKeys, linkedShiftList: !!s.linked, numbersAsLetters: !!(s.linked && s.asLetters) }
      : Object.assign({ mode: s.mode }, decodeLayerOpts(s.layers.main));
    let res;
    try { res = P.decode(s.input, opts); } catch (e) {
      renderList($('dec-warnings'), ['Error: ' + (e && e.message ? e.message : e)]);
      return;
    }
    renderList($('dec-warnings'), res.warnings || []);
    if (res.error) return;

    function textLine(label, r) {
      const line = el('div', { class: 'dec-line' }, el('span', { class: 'cipher-label', text: label }),
        el('code', { class: 'dec-plain', text: r.text === '' ? '(empty)' : r.text }));
      textBox.appendChild(line);
      if (r.cipherText !== undefined && r.cipherText !== r.text) {
        textBox.appendChild(el('div', { class: 'dec-line sub' }, el('span', { class: 'cipher-label', text: 'before cipher' }),
          el('code', { class: 'cipher-text', text: r.cipherText })));
      }
    }
    if (dual) {
      textLine('RL layer', res.rl);
      textLine('Swap layer', res.swap);
      if (res.numbers) {
        textBox.appendChild(el('div', { class: 'dec-line sub' }, el('span', { class: 'cipher-label', text: 'number list' }),
          el('code', { class: 'cipher-text', text: res.numbers.join(' ') })));
      }
    } else {
      textLine('Text', res);
    }
    try { renderStats($('dec-stats'), K.stats(res.knots || [])); } catch (e) { /* ignore */ }

    // recovered bits table
    const table = $('dec-rows');
    const head = dual ? ['#', 'Knots', 'RL bits', 'RL', 'Swap bits', 'Swap'] : ['#', 'Knots', 'Bits', 'Char'];
    const thead = el('thead', null, el('tr'));
    head.forEach(function (h) { thead.firstChild.appendChild(el('th', { scope: 'col', text: h })); });
    table.appendChild(thead);
    const tbody = el('tbody');
    const rlEnc = s.linked && !s.asLetters
      ? { type: 'binary', mode: 'numbers', bits: s.layers.rl.encoding.bits || 5 } : s.layers.rl.encoding;
    (res.knots || []).forEach(function (row, i) {
      const tr = el('tr');
      tr.appendChild(el('td', { class: 'num', text: String(i + 1) }));
      tr.appendChild(el('td', { class: 'knots', text: row.join(',') }));
      if (dual) {
        const a = res.rl.rows[i], b = res.swap.rows[i];
        tr.appendChild(el('td', { class: 'bits', text: bitsStr(a) }));
        tr.appendChild(el('td', { class: 'lbl', text: a ? showLabel(perRowChar(a, rlEnc)) : '' }));
        tr.appendChild(el('td', { class: 'bits', text: bitsStr(b) }));
        tr.appendChild(el('td', { class: 'lbl', text: b ? showLabel(perRowChar(b, s.layers.swap.encoding)) : '' }));
      } else {
        const r = res.rows[i];
        tr.appendChild(el('td', { class: 'bits', text: bitsStr(r) }));
        tr.appendChild(el('td', { class: 'lbl', text: r ? showLabel(perRowChar(r, s.layers.main.encoding)) : '' }));
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  // "Check in decoder": copy the current encode setup + output across.
  $('to-decode').addEventListener('click', function () {
    if (!lastEncode) return;
    const e = state.enc, d = state.dec;
    d.input = lastEncode.text;
    d.mode = e.mode;
    const copy = function (l) { return JSON.parse(JSON.stringify(l)); };
    if (e.mode === 'dual') {
      d.layers.rl = mergeLayer(defaultLayer(), copy(e.layers.rl));
      d.layers.swap = mergeLayer(defaultLayer(), copy(e.layers.swap));
      d.crossKeys = !!e.crossKeys; d.linked = !!e.linked; d.asLetters = !!e.asLetters;
      if (e.linked) d.layers.swap.transform.type = 'none';
    } else {
      d.layers.main = mergeLayer(defaultLayer(), copy(e.layers.main));
    }
    bindDecode();
    renderDecode();
    selectTab('decode', true);
  });

  // -------------------------------------------------------------- tabs ---
  const tabs = [$('tab-encode'), $('tab-decode')];
  function selectTab(name, focus) {
    state.tab = name;
    tabs.forEach(function (t) {
      const on = t.id === 'tab-' + name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    });
    save();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t.id.replace('tab-', '')); });
    t.addEventListener('keydown', function (ev) {
      let j = null;
      if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (ev.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (ev.key === 'Home') j = 0;
      else if (ev.key === 'End') j = tabs.length - 1;
      if (j === null) return;
      ev.preventDefault();
      selectTab(tabs[j].id.replace('tab-', ''), true);
    });
  });

  // -------------------------------------------------------------- init ---
  bindEncode();
  bindDecode();
  renderEncode();
  renderDecode();
  selectTab(state.tab);
})();
