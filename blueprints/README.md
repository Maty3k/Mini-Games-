# F1 Circuit Blueprints

Top-down blueprint drawings of every circuit in **GRAND PRIX** (`australia.html` + `tracks.js`),
for both **our game track** and the **real circuit**, used to verify each track is geometrically correct.

## Files

| File | What it is |
|---|---|
| `all-tracks.svg` | Contact sheet — all 6 game tracks on one page |
| `<circuit>-game.svg` | **Our game track** — the exact centreline `buildTrack()` drives (start/finish at index 0), with direction arrows, detector-numbered corners (blue = right-hander, amber = left), scale bar, north arrow |
| `<circuit>-real.svg` | **Real circuit** reference — the survey layout with the official length / corner count / direction |
| `melbourne-2022-change.svg` | Overlay of Melbourne **pre-2022 (orange) vs current 2022 (cyan)** — shows the chicane removal |

SVGs are vector — open in a browser or any SVG viewer.

## How they're generated

Blueprints are produced directly from `tracks.js` by applying the **exact** `buildTrack()` transforms,
so the "game" blueprint is literally what the player drives:

1. `rev:false` on all circuits → the stored point order is kept (the real racing direction).
2. **Un-mirror**: the raw survey frame is left-right flipped vs reality; the engine reflects it back
   (`y → −y` + L/R width swap). Reflecting **Y** rather than X keeps the world **north-up**: on every
   blueprint — and on the in-game minimap — north is up and east is right, matching real circuit maps.
3. **Start rotation**: rotate the centreline so index 0 sits on the real start/finish line (`start` fraction per circuit).

Because our track is *derived from* the real survey, the `-game` and `-real` blueprints are the same shape —
which is the point: it shows the game faithfully reproduces the real circuit.

## Verification results

Checked per circuit, with the corner *sequence* (position + left/right handedness, read from the in-engine
driven path and calibrated against known corners) matched to the real lap:

| Circuit | Our length | Real | Δ | Direction | S/F anchor | Verdict |
|---|---|---|---|---|---|---|
| **Melbourne** | 5242 m | 5278 m | −0.7% | clockwise ✓ | T1 ~280 m after the line | **correct** — current (post-2022) layout |
| **Monza** | 5789 m | 5793 m | −0.07% | clockwise ✓ | Rettifilo ~550 m after the line | **correct** — Rettifilo, Lesmos, Ascari (L-R-L), Parabolica |
| **Silverstone** | 5885 m | 5891 m | −0.10% | clockwise ✓ | Abbey ~300 m after the line | **correct** — Village/Loop, Maggotts-Becketts, Stowe, Vale/Club |
| **Suzuka** | 5801 m | 5807 m | −0.10% | clockwise ✓ | T1 ~300 m after the line | **correct** — figure-8 crossover, S-curves, Spoon, 130R |
| **Spa** | 6995 m | 7004 m | −0.13% | clockwise ✓ | La Source ~155 m after the line | **correct** — La Source, Eau Rouge/Raidillon, Kemmel, Bus Stop |
| **Monaco** | 3306 m | 3337 m | −0.9% | clockwise ✓ | Ste Devote ~220 m after the line | **correct** — Ste Devote (R), Casino, **Fairmont hairpin (L)**, tunnel after Portier, Piscine, Rascasse |

Notes from the 2026-06 accuracy pass:

- **Start/finish lines re-anchored.** Suzuka's line used to sit ~160 m too far forward (the grid was
  practically in Turn 1); Monaco's ~110 m too far back. Both now match the real straight-split
  (verified against the distance to T1 ahead and to the final corner behind).
- **Monaco was mirrored and has been fixed.** Every corner used to bend the wrong way (Ste Devote read
  as a left, the Fairmont hairpin as a right — the real hairpin is a **left**). The data is now
  un-mirrored, verified by the full corner sequence and by landmark geography (hairpin NE of Ste Devote,
  Piscine south of the port). The tunnel was also re-anchored to the real seafront stretch after Portier
  (it previously roofed the hairpin).
- **North-up frame.** The world (and minimap) used to be 180° rotated vs real maps; all blueprints and
  the game now render north-up.

### Note on corner counts
The number on each blueprint comes from a simple curvature detector and may differ by a few from the
official corner count (different counting conventions — e.g. a chicane counted as 1 vs 2). This is a
labelling convention, **not** a track error; the corner *sequence* and positions match the real circuits.

## Melbourne modernised to the 2022 layout

Melbourne originally carried the **pre-2022** Albert Park layout (it still had the old Turn 9-10 chicane — a tight
L-R-R-L cluster ~1.9 km into the lap). It has been **replaced with the current post-2022 layout**:

- Source: the authoritative current centreline from [`bacinger/f1-circuits`](https://github.com/bacinger/f1-circuits)
  (`au-1953.geojson`, official length 5278 m), projected from lon/lat to metres and Procrustes-aligned
  into the game frame (8.9 m trimmed RMS).
- Result: the **old Turn 9-10 chicane is gone** (now the fast flat-out section); start/finish, pit and grandstands
  kept in place.

`melbourne-2022-change.svg` overlays the old (orange) and new (cyan) layouts — they coincide everywhere except the
removed chicane and a couple of reprofiled corners.
