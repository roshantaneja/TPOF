# TPOF Knot Encoder

A small static, local-only tool the puzzle team uses to turn plaintext into
friendship-bracelet knot codes for the **Letibus Jam** puzzles, and to check a finished
bracelet by decoding its knot string back to text.

```
text → (optional text cipher) → bit rows → knot codes → formatted string / visual grid
```

No build step, no dependencies, no network. Everything runs in the page; inputs are
remembered in your browser's `localStorage` only.

The binding contract for the modules is [`docs/SPEC.md`](docs/SPEC.md).

## Running it

Open `index.html` directly in a browser (it works from `file://`), or serve the folder:

```sh
python3 -m http.server
# then visit http://localhost:8000/
```

(The Copy button uses the Clipboard API when it's available, which needs `http://localhost`
or HTTPS. From `file://` it falls back to a legacy copy, or selects the string for you to copy.)

## Using it

**Encode tab**

1. Pick a **puzzle preset** (grouped by type, with difficulty) or **Custom**.
2. Pick the **knot mode**: Color, RL, Swap or Dual. Dual shows two layer panels, *RL layer*
   and *Swap layer*.
3. In each layer, type the text, choose a text cipher (with its key, shift, start, number list
   or decrypt option) and a bit encoding (Morse width, binary mode and bits).
4. The output updates as you type: the knot string (with a Copy button and row/knot separator
   choices), stats, warnings, the cipher text, a bracelet grid and a table of bit rows labelled
   with their source characters. *Simulate threads* colours each knot with the thread it
   shows, for two thread colours you pick.

Changing the structure of a preset (mode, cipher type, encoding type or dual options) switches
the picker to *Custom* and keeps your settings. Editing text, keys or numbers does not.

**Decode / check tab**: paste a knot string, choose the mode, encoding and any cipher and key,
and you get the recovered bits and text back. *Check in decoder →* on the Encode tab copies
the current output and settings across.

## Tests

```sh
node --test            # runs tests/*.test.js
node --test tests/*.test.js
```

On Node 22, `node --test tests/` (a bare directory argument) fails with "Cannot find module".
Use one of the forms above.

## Knot codes

| Code | Meaning | Grid |
|------|---------|------|
| `F`  | forward knot (Left expressed, no swap) | ↘ |
| `B`  | backward knot (Right expressed, no swap) | ↙ |
| `FX` | forward swap knot (Left expressed, threads swap) | ↘ + ⇄ |
| `BX` | backward swap knot (Right expressed, threads swap) | ↙ + ⇄ |

Output format: knots joined with `,` (or `, `), rows separated by a space (or a newline).

| Mode | bit → knot |
|------|-----------|
| Color | `0 → FX` (black), `1 → BX` (white). The grid draws FX black and BX white |
| RL    | `0 → F`, `1 → B` |
| Swap  | `0 → F`, `1 → FX` |
| Dual  | RL bit r + Swap bit s: `00 → F`, `10 → B`, `01 → FX`, `11 → BX`. The shorter layer is padded with 0 rows |

Bit encodings: **Bacon** (a=00000 … z=11001, space=11111), **Morse** (`.`=1, `-`=11, 0 between
symbols, padded to width 10), **Binary** (numbers → n-bit rows, `raw` 0/1 tokens, or `ascii`).
Text ciphers: Vigenère, Trithemius, Shift list, Caesar, Atbash.

Example: Morse `eta n` in Color mode →
`BX,FX,FX,FX,FX,FX,FX,FX,FX,FX BX,BX,FX,FX,FX,FX,FX,FX,FX,FX BX,FX,BX,BX,FX,FX,FX,FX,FX,FX BX,BX,FX,BX,FX,FX,FX,FX,FX,FX`

## Presets

Numbers are this tool's list order (by type, then difficulty), not puzzle ids. "–" means the
puzzle sheet gives no difficulty.

| # | Preset | Difficulty | Mode | Encoding / notes |
|---|--------|-----------|------|------------------|
| 1 | Color Binary | 2 | Color | binary numbers |
| 2 | L-R Binary | 3 | RL | binary numbers |
| 3 | Swap Binary | 5 | Swap | binary numbers |
| 4 | Color Bacon | 4 | Color | Bacon |
| 5 | L-R Bacon | 6 | RL | Bacon |
| 6 | Swap Bacon | 8 | Swap | Bacon |
| 7 | Dual L-R Swap Bacon | 10 | Dual | Bacon / Bacon |
| 8 | Color Morse | 2/4 | Color | Morse |
| 9 | L-R Morse | – | RL | Morse |
| 10 | Swap Morse | – | Swap | Morse |
| 11 | Dual Morse | – | Dual | Morse / Morse |
| 12 | Color Bacon Vigenère | 9 | Color | Vigenère → Bacon |
| 13 | L-R Vigenère | 10 | RL | Vigenère → Bacon |
| 14 | Swap Vigenère | 10 | Swap | Vigenère → Bacon |
| 15 | Dual Vigenère | 11 | Dual | two texts, two keys, Vigenère → Bacon |
| 16 | Wrong Key Dual Vigenère | 12 | Dual | as 15, but each layer is encrypted with the *other* layer's key (`crossKeys: true`) |
| 17 | Single Dual Trithemius | 10 | Dual | RL = number list as 5-bit binary; Swap = plaintext shifted letter-by-letter by that list, then Bacon (`linkedShiftList: true`) |
| 18 | Double Dual Trithemius | 11 | Dual | as 17, but the number list is written as letters (a=0, b=1 …), Vigenère-encrypted with a key and Bacon-encoded (`numbersAsLetters: true`). **This is our interpretation; confirm it with the puzzle author.** |

For the Trithemius presets the number list defaults to `1 2 3 4 5 ...`. A trailing `...`
continues the arithmetic pattern up to the number of letters in the plaintext.

## Layout

```
index.html          page (loads the four scripts below, in order)
css/style.css       styles (light + dark via prefers-color-scheme, responsive)
js/ciphers.js       TPOF.ciphers  — text ciphers + bit encodings (see SPEC)
js/knots.js         TPOF.knots    — bits ↔ knots, format/parse, simulate, stats (see SPEC)
js/pipeline.js      TPOF.pipeline — composes the two, holds the presets
js/app.js           DOM wiring
tests/*.test.js     node:test suites
```

### `TPOF.pipeline`

```
encodeLayer({ text, transform:{type,...}, encoding:{type,...} })
    -> { cipherText, rows, labels, warnings, transformed }
encode({ mode:'color'|'rl'|'swap', layer, format:{knotSep,rowSep} })
encode({ mode:'dual', rl, swap, format, crossKeys?, linkedShiftList?, numbersAsLetters?, numbers? })
    -> { knots, text, layers, warnings, stats, mode, numbers? }
decode(knotString, { mode, encoding, transform? })                  -> { text, cipherText, rows, knots, warnings, error? }
decode(knotString, { mode:'dual', rl:{encoding,transform}, swap:{…}, crossKeys?, linkedShiftList?, numbersAsLetters? })
    -> { rl:{text,cipherText,rows}, swap:{…}, knots, numbers?, warnings, error? }
PRESETS   // [{ id, number, name, group, difficulty, description, config }]
GROUPS, getPreset(id), parseNumbers(str), extendNumbers(nums, n)
```

When `decode` gets a `transform`, it undoes it (`text`) and also returns the raw decoded
`cipherText`. A dual `decode` also accepts a single `encoding`/`transform` for both layers.
Parse errors come back in `error`/`warnings` rather than being thrown.
