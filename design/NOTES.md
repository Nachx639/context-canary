# Context Canary — pixel art

Four original sprites at their final resolution. **`tiny` and `small` are drawn by hand
for their own grid; they are not downscaled from `normal` or `large`.**

| Size | Pixels | Terminal (columns × rows) |
| --- | --- | --- |
| `tiny` | 10 × 6 | 10 × 3 |
| `small` | 14 × 8 | 14 × 4 |
| `normal` | 20 × 12 | 20 × 6 |
| `large` | 24 × 16 | 24 × 8 |

Each terminal row holds two vertical pixels, so every height in pixels is even.

## Design

- Right-facing profile, warm yellow, rounded crown, a one-pixel orange beak at rest and a
  long ochre tail ending in a point. The eye pairs a dark pupil with an ivory highlight.
- The light breast and the ochre wing are solid masses: no noise, dithering or
  anti-aliasing. Light comes from the top left. Ochres outline the bird on light
  backgrounds; yellow and the breast separate it from dark ones.
- Grey three-tone cage with a ring, a stepped dome and a tray. The bars always sit
  behind the bird. Within a size, the cage is the same in every frame.
- Frames: `idle`; `blink` (a two-pixel dark line, no highlight); `chirp` (the beak opens
  in two orange halves); `hop` (head, body and tail one pixel higher, feet tucked);
  `dead` (grey, belly-up on the tray, feet pointing up, a dark X eye where it fits and a
  dull beak; in `normal` and `large` the perch moves up and stays empty).
- `small` drops the ring and the perch to give the height to the bird; `tiny` reduces
  the cage to a dome, two bars and a base. In both, the dead bird keeps its pose and
  grey, but the eye is a single dark pixel because a full X does not fit.
- No musical note and no sound: the animation lives in the beak and the hop.

## Palette

| Use | Characters and colors |
| --- | --- |
| Cage: light, structure, bars and base | `H` #b6c0c6 · `G` #87939e · `g` #576571 |
| Wood: perch and ends | `B` #a77849 · `b` #714c32 |
| Feathers: yellow, breast, transition | `Y` #f7cc32 · `y` #ffe99a · `U` #dfa927 |
| Wing, tail and warm outline | `W` #bd8826 · `S` #895e24 |
| Beak and feet; dull `o` when dead | `O` #ed8c36 · `o` #a85e30 |
| Eye and highlight | `K` #252b35 · `w` #fff9dc |
| Dead: body, light, shadow, outline | `D` #b7bbb8 · `E` #d5d7cf · `d` #828b8e · `s` #59636c |
| Dead: X and a reserved tone | `x` #303742 · `t` #979184 |

`.` is transparency, not a palette color. Sprites never assume a background.

## Files

- `sprites.json`: the art source, with `palette` and `sizes` (width, height and five
  frames of rows per size). `node scripts/build-sprites.mjs` turns it into
  `plugins/context-canary/hooks/sprites.js`.
- `render.py`: reads the JSON and writes enlarged PNGs and a contact sheet with Python 3
  and Pillow (`python3 render.py`, optional `--scale 16`). It also refreshes the JSON
  embedded in `preview.html`.
- `preview.html`: open it directly in a browser, offline. It animates every size, has a
  dark/light switch and a second view drawn with real `▀` characters, the way the
  terminal shows it.

## Half blocks

In the terminal each cell is one pixel wide and two tall: the glyph `▀` takes the color
of `frame[2*y][x]` and its background `frame[2*y+1][x]`. A transparent upper half uses
`▄` with the lower color, and a fully transparent cell is a space in the terminal's
default colors. The exact half-block shape depends on the terminal font.
