/* TPOF knot codes: bit rows <-> Letibus Jam knot codes (F, B, FX, BX). */
(function (root) {
  'use strict';

  const CODES = ['F', 'B', 'FX', 'BX'];

  // expresses: which thread colour shows on the knot; swap: whether threads exchange positions.
  const INFO = {
    F:  { expresses: 'L', swap: false, label: 'Forward knot (Left, no swap)' },
    B:  { expresses: 'R', swap: false, label: 'Backward knot (Right, no swap)' },
    FX: { expresses: 'L', swap: true,  label: 'Forward swap knot (Left, swap)' },
    BX: { expresses: 'R', swap: true,  label: 'Backward swap knot (Right, swap)' },
  };

  const MODES = [
    { id: 'color', label: 'Color',
      description: 'Always swap; the bit picks the colour: 0 → FX (Black), 1 → BX (White).' },
    { id: 'rl', label: 'RL',
      description: 'Bit picks the expressed side, no swap: 0 → F (Left), 1 → B (Right).' },
    { id: 'swap', label: 'Swap',
      description: 'Bit picks whether threads swap, always Left: 0 → F (no swap), 1 → FX (swap).' },
    { id: 'dual', label: 'Dual',
      description: 'Two layers, RL bit r + Swap bit s at the same position: ' +
        'r0 s0 → F, r1 s0 → B, r0 s1 → FX, r1 s1 → BX.' },
  ];

  const BIT_MAPS = {
    color: ['FX', 'BX'],
    rl: ['F', 'B'],
    swap: ['F', 'FX'],
  };

  function normCode(code) {
    return String(code).trim().toUpperCase();
  }

  function describe(code) {
    const c = normCode(code);
    const info = INFO[c];
    if (!info) throw new Error('Unknown knot code "' + code + '" (expected one of ' + CODES.join(', ') + ')');
    return { code: c, expresses: info.expresses, swap: info.swap, label: info.label };
  }

  function checkMode(mode, allowed) {
    if (allowed.indexOf(mode) === -1) {
      throw new Error('Unknown knot mode "' + mode + '" (expected one of ' + allowed.join(', ') + ')');
    }
  }

  function bitsToKnots(rows, mode) {
    checkMode(mode, ['color', 'rl', 'swap']);
    const map = BIT_MAPS[mode];
    return rows.map(function (row) {
      return row.map(function (b) { return map[b ? 1 : 0]; });
    });
  }

  function dualToKnots(rlRows, swapRows) {
    const warnings = [];
    rlRows = rlRows || [];
    swapRows = swapRows || [];
    const nRows = Math.max(rlRows.length, swapRows.length);
    if (rlRows.length !== swapRows.length) {
      const shorter = rlRows.length < swapRows.length ? 'RL' : 'Swap';
      warnings.push('RL layer has ' + rlRows.length + ' row' + (rlRows.length === 1 ? '' : 's') +
        ', Swap layer has ' + swapRows.length + ' row' + (swapRows.length === 1 ? '' : 's') +
        '; padded the ' + shorter + ' layer with zero rows');
    }
    const widthMismatch = [];
    const knots = [];
    for (let i = 0; i < nRows; i++) {
      const r = rlRows[i] || [];
      const s = swapRows[i] || [];
      const w = Math.max(r.length, s.length);
      if (i < rlRows.length && i < swapRows.length && r.length !== s.length) {
        widthMismatch.push('row ' + (i + 1) + ' (RL ' + r.length + ', Swap ' + s.length + ')');
      }
      const row = [];
      for (let j = 0; j < w; j++) {
        const rb = r[j] ? 1 : 0;
        const sb = s[j] ? 1 : 0;
        row.push(sb ? (rb ? 'BX' : 'FX') : (rb ? 'B' : 'F'));
      }
      knots.push(row);
    }
    if (widthMismatch.length) {
      warnings.push('RL and Swap layers differ in width at ' + widthMismatch.join(', ') +
        '; padded the shorter with zeros');
    }
    return { knots: knots, warnings: warnings };
  }

  function knotsToBits(knots, mode) {
    checkMode(mode, ['color', 'rl', 'swap', 'dual']);
    const warnings = [];
    const invalid = [];
    const rl = [];
    const swap = [];
    const rows = [];
    knots.forEach(function (row, i) {
      const rlRow = [], swRow = [], out = [];
      row.forEach(function (code, j) {
        const d = describe(code);
        const r = d.expresses === 'R' ? 1 : 0;
        const s = d.swap ? 1 : 0;
        rlRow.push(r);
        swRow.push(s);
        if (mode === 'color') {
          if (!d.swap) { invalid.push('row ' + (i + 1) + ' knot ' + (j + 1) + ' (' + d.code + ')'); out.push(0); }
          else out.push(r);
        } else if (mode === 'rl') out.push(r);
        else if (mode === 'swap') out.push(s);
      });
      rl.push(rlRow); swap.push(swRow); rows.push(out);
    });
    if (mode === 'dual') return { rl: rl, swap: swap, warnings: warnings };
    if (invalid.length) {
      warnings.push('Color mode only uses FX/BX; non-swap knots read as 0 at ' + invalid.join(', '));
    }
    return { rows: rows, warnings: warnings };
  }

  function format(knots, opts) {
    const o = opts || {};
    const knotSep = o.knotSep == null ? ',' : o.knotSep;
    const rowSep = o.rowSep == null ? ' ' : o.rowSep;
    return knots.map(function (row) { return row.join(knotSep); }).join(rowSep);
  }

  function parse(str) {
    const rows = [];
    String(str == null ? '' : str).split(/[\s|;]+/).forEach(function (chunk) {
      const row = [];
      chunk.split(',').forEach(function (tok) {
        const t = tok.trim();
        if (!t) return;
        const c = t.toUpperCase();
        if (!INFO[c]) {
          throw new Error('Unknown knot code "' + t + '" in row ' + (rows.length + 1) +
            ' (expected one of ' + CODES.join(', ') + ')');
        }
        row.push(c);
      });
      if (row.length) rows.push(row);
    });
    return rows;
  }

  function simulate(knots, opts) {
    const o = opts || {};
    let left = o.left == null ? '#111111' : o.left;
    let right = o.right == null ? '#f5f5f5' : o.right;
    return knots.map(function (row) {
      return row.map(function (code) {
        const d = describe(code);
        const leftIn = left, rightIn = right;
        const shown = d.expresses === 'L' ? leftIn : rightIn;
        const leftOut = d.swap ? rightIn : leftIn;
        const rightOut = d.swap ? leftIn : rightIn;
        left = leftOut; right = rightOut;
        return { code: d.code, shown: shown, leftIn: leftIn, rightIn: rightIn, leftOut: leftOut, rightOut: rightOut };
      });
    });
  }

  function stats(knots) {
    const counts = { F: 0, B: 0, FX: 0, BX: 0 };
    let n = 0;
    knots.forEach(function (row) {
      row.forEach(function (code) { counts[describe(code).code]++; n++; });
    });
    return { rows: knots.length, knots: n, counts: counts };
  }

  const api = {
    CODES: CODES, MODES: MODES, describe: describe, bitsToKnots: bitsToKnots, dualToKnots: dualToKnots,
    knotsToBits: knotsToBits, format: format, parse: parse, simulate: simulate, stats: stats,
  };
  root.TPOF = root.TPOF || {};
  root.TPOF.knots = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
