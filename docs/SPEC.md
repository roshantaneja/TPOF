# TPOF Knot Encoder — Spec & Module Contract

A static, dependency-free site (open `index.html` directly, or `python3 -m http.server`)
that turns plaintext into bracelet knot codes for the Letibus Jam puzzles.

Pipeline:  **text → (optional text cipher) → bit rows → knot codes → formatted string / visual grid**

## Knot codes (Letibus Jam)

| Code | Meaning                               |
|------|---------------------------------------|
| F    | forward knot (Left expressed, no swap)|
| B    | backward knot (Right expressed, no swap)|
| FX   | forward swap knot (Left expressed, swap)|
| BX   | backward swap knot (Right expressed, swap)|

Output format: knots joined with `,`, rows separated by a space (or newline, user option).

## Knot modes (bit → knot)

* **Color** (always swap): `0 → FX` (Black), `1 → BX` (White)
* **RL**: `0 → F`, `1 → B`
* **Swap**: `0 → F`, `1 → FX`
* **Dual** (two bit layers, RL layer r + Swap layer s, same position):
  `r0 s0 → F`, `r1 s0 → B`, `r0 s1 → FX`, `r1 s1 → BX`

## Bit encodings (text → rows of bits, one row per character)

* **Bacon** (26-letter, a=00000 … z=11001), 5 bits/row. Space → `11111`. Case-insensitive.
  Other characters are skipped with a warning.
  - `"ab c"` → `00000 00001 11111 00010`
* **Morse**: `.` = `1`, `-` = `11`, a single `0` between symbols, right-padded with `0`
  to width 10. Spaces are dropped (every character is already its own row).
  - `"eta n"` → `1000000000 1100000000 1011000000 1101000000`
  - Letters always fit in 10 bits; digits/punctuation may not → row width grows to the
    longest row and a warning is emitted.
* **Binary**: numbers (space/comma separated) → n-bit MSB-first rows; `bits` option, default
  = min bits for the largest number. Also a `raw` mode (tokens of 0/1 used verbatim) and
  an `ascii` mode (each char → 8 bits).

## Text ciphers (applied before bit encoding; letters only, other chars pass through)

* **Vigenère** (key letters advance only on letters; case preserved; encrypt/decrypt)
* **Trithemius** (progressive shift; shift for the i-th letter = start + i)
* **Shift list** (i-th letter shifted by the i-th number of a user list, cycling) — used by the
  "Dual Trithemius" puzzles
* **Caesar**, **Atbash** (cheap extras)

## Worked examples (must pass as tests)

| Input | Mode | Output |
|---|---|---|
| Morse "eta n" | Color | `BX,FX,FX,FX,FX,FX,FX,FX,FX,FX BX,BX,FX,FX,FX,FX,FX,FX,FX,FX BX,FX,BX,BX,FX,FX,FX,FX,FX,FX BX,BX,FX,BX,FX,FX,FX,FX,FX,FX` |
| Morse "eta n" | RL | `B,F,F,F,F,F,F,F,F,F B,B,F,F,F,F,F,F,F,F B,F,B,B,F,F,F,F,F,F B,B,F,B,F,F,F,F,F,F` |
| Morse "eta n" | Swap | `FX,F,F,F,F,F,F,F,F,F FX,FX,F,F,F,F,F,F,F,F FX,F,FX,FX,F,F,F,F,F,F FX,FX,F,FX,F,F,F,F,F,F` |
| Morse "ab" (RL) + "bc" (Swap) | Dual | `BX,FX,B,BX,F,FX,F,FX,F,F BX,BX,F,BX,F,BX,FX,B,FX,F` |
| Bacon "ab c" | Color | `FX,FX,FX,FX,FX FX,FX,FX,FX,BX BX,BX,BX,BX,BX FX,FX,FX,BX,FX` |
| Bacon "ab c" | RL | `F,F,F,F,F F,F,F,F,B B,B,B,B,B F,F,F,B,F` |
| Bacon "ab c" | Swap | `F,F,F,F,F F,F,F,F,FX FX,FX,FX,FX,FX F,F,F,FX,F` |
| Bacon "ab" (RL) + "de" (Swap) | Dual | `F,F,F,FX,FX F,F,FX,F,B` |

(The source notes list the Color-Bacon row for `b` as `FX,FX,FX,FX,FX`; that is a typo —
`b = 00001` → `FX,FX,FX,FX,BX`.)

## Module contract

All modules are plain scripts (no ES modules, no build step) so `index.html` works from
`file://`. Each file uses this wrapper so it also loads in Node for tests:

```js
(function (root) {
  const api = { /* ... */ };
  root.TPOF = root.TPOF || {};
  root.TPOF.<name> = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

A "bit row" is `number[]` of 0/1. Encoders return
`{ rows: number[][], labels: string[], warnings: string[] }` where `labels[i]` is the
source character(s) for `rows[i]`.

### `js/ciphers.js` → `TPOF.ciphers`
```
vigenere(text, key, { decrypt=false } = {}) -> string
trithemius(text, { start=0, decrypt=false } = {}) -> string
shiftList(text, numbers:number[], { decrypt=false } = {}) -> string
caesar(text, shift, { decrypt=false } = {}) -> string
atbash(text) -> string
applyTransform(text, { type:'none'|'vigenere'|'trithemius'|'shiftList'|'caesar'|'atbash',
                       key, shift, start, numbers, decrypt }) -> string

baconEncode(text) -> Encoded
morseEncode(text, { width=10 } = {}) -> Encoded
binaryEncode(text, { mode='numbers'|'raw'|'ascii', bits } = {}) -> Encoded
encode(text, { type:'bacon'|'morse'|'binary', ...opts }) -> Encoded

baconDecode(rows) -> string
morseDecode(rows) -> string
binaryDecode(rows, { mode='numbers' } = {}) -> string
decode(rows, { type, ...opts }) -> string

TRANSFORMS, ENCODINGS  // metadata arrays [{id, label, description}] for the UI
```

### `js/knots.js` → `TPOF.knots`
```
CODES = ['F','B','FX','BX']
MODES  // [{id:'color'|'rl'|'swap'|'dual', label, description}]
describe(code) -> { code, expresses:'L'|'R', swap:boolean, label }
bitsToKnots(rows, mode:'color'|'rl'|'swap') -> string[][]
dualToKnots(rlRows, swapRows) -> { knots: string[][], warnings: string[] }   // pads shorter layer with 0s
knotsToBits(knots, mode) -> { rows, warnings }            // mode 'dual' -> { rl, swap, warnings }
format(knots, { knotSep=',', rowSep=' ' } = {}) -> string
parse(str) -> string[][]    // rows split on whitespace/newlines, knots on ','; empty tokens ignored;
                            // case-insensitive; throws Error on an unknown code
simulate(knots, { left='#111111', right='#f5f5f5' } = {})
    -> Array<Array<{ code, shown, leftIn, rightIn, leftOut, rightOut }>>
    // 2-thread strip; thread state carries across rows
stats(knots) -> { rows, knots, counts: {F,B,FX,BX} }
```

### `js/pipeline.js` → `TPOF.pipeline`  (owned by the site)
Composes ciphers + knots, holds the puzzle presets.

### Tests
`node --test` (or `node --test tests/*.test.js`) — `tests/ciphers.test.js`, `tests/knots.test.js`, `tests/pipeline.test.js`.
