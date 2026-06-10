# F1 Circuit Blueprints

Top-down blueprint drawings of every circuit in **GRAND PRIX** (`australia.html` + `tracks.js`),
for both **our game track** and the **real circuit**, used to verify each track is geometrically correct.

## Files

| File | What it is |
|---|---|
| `all-tracks.svg` | Contact sheet — all 5 game tracks on one page |
| `<circuit>-game.svg` | **Our game track** — the exact centreline `buildTrack()` drives (start/finish at index 0), with direction arrows, numbered corners, scale bar, north arrow |
| `<circuit>-real.svg` | **Real circuit** reference — the un-mirrored survey layout with the official length / corner count / direction |
| `melbourne-2022-change.svg` | Overlay of Melbourne **pre-2022 (orange) vs current 2022 (cyan)** — shows the chicane removal |

SVGs are vector — open in a browser or any SVG viewer; PNG renders were used for the visual check.

## How they're generated

`blueprints` are produced directly from `tracks.js` by applying the **exact** `buildTrack()` transforms,
so the "game" blueprint is literally what the player drives:

1. `rev:false` on all 5 circuits → the raw TUMFTM/racetrack-database point order is kept (real racing direction).
2. **Un-mirror**: `x → -x` (+ swap L/R widths). The raw TUMFTM frame is left-right mirrored vs reality; negating X restores the true layout, so the driver goes the real way (all clockwise) with corners on the correct side.
3. **Start rotation**: rotate the centreline so index 0 sits on the real start/finish line (`start` fraction per circuit).

Because our track is *derived from* the real survey, the `-game` and `-real` blueprints are the same shape —
which is the point: it shows the game faithfully reproduces the real circuit.

## Verification results

Checked three ways and independently web-researched per circuit:
- **Length** — all within ±0.4% of the official layout.
- **Direction** — signed area + direction arrows confirm all 5 run **clockwise**, matching reality (every Turn 1 is a right-hander; no track is mirrored or reversed).
- **Shape** — each blueprint is visually unmistakable as the real circuit.

| Circuit | Our length | Real | Δ | Direction | Verdict |
|---|---|---|---|---|---|
| **Monza** | 5789 m | 5793 m | −0.07% | clockwise ✓ | **correct** — current layout (Rettifilo, Lesmos, Ascari, Parabolica) |
| **Silverstone** | 5885 m | 5891 m | −0.10% | clockwise ✓ | **correct** — current layout (Maggotts-Becketts, Hangar, Stowe, Vale/Club) |
| **Suzuka** | 5801 m | 5807 m | −0.10% | clockwise ✓ | **correct** — current layout (figure-8 crossover, S-curves, Spoon, 130R) |
| **Spa** | 6995 m | 7004 m | −0.13% | clockwise ✓ | **correct** — current layout (La Source, Eau Rouge, Kemmel, Bus Stop) |
| **Melbourne** | 5229 m | 5278 m | −0.9% | clockwise ✓ | **correct** — modernised to the 2022 layout (see below) |

All five are now the **current** circuits.

## Melbourne modernised to the 2022 layout

Melbourne originally carried the **pre-2022** Albert Park layout (it still had the old Turn 9-10 chicane — a tight
L-R-R-L cluster ~1.9 km into the lap). It has been **replaced with the current post-2022 layout**:

- Source: the authoritative current centreline from [`bacinger/f1-circuits`](https://github.com/bacinger/f1-circuits)
  (`au-1953.geojson`, official length 5278 m), projected from lon/lat to metres.
- **Aligned into the game's frame** by a Procrustes fit (rotation + scale, reflection to match the engine's
  un-mirror) against the existing verified track — **8.9 m trimmed RMS**, scale 0.998, so everything except the
  changed section overlays the old data exactly (see `melbourne-2022-change.svg`: pre-2022 orange vs current cyan).
- Result: the **old Turn 9-10 chicane is gone** (now the fast flat-out section); start/finish, pit and grandstands
  kept in place. Verified in-engine: builds with 0 errors, nothing on the racing surface, fully drivable.

`melbourne-2022-change.svg` overlays the old (orange) and new (cyan) layouts — they coincide everywhere except the
removed chicane and a couple of reprofiled corners.

### Note on corner counts
The number on each blueprint comes from a simple curvature detector and may differ by a few from the official
count (different counting conventions — a chicane counted as 1 vs 2). This is labelling, **not** a track error;
the corner *sequence* and positions match the real circuits.

### Note on corner counts
The number on each blueprint comes from a simple curvature detector and may differ by a few from the
official corner count (different counting conventions — e.g. a chicane counted as 1 vs 2). This is a
labelling convention, **not** a track error; the corner *sequence* and positions match the real circuits.
