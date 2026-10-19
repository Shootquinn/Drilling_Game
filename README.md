# Drilling_Game

A prospecting game. A hidden underground formation is shown briefly, then fades. Paint where you remember it, plan the drilling, then watch two methods compete to find it: a branching network of self-steering borebots (left panel) and a conventional surface rig with straight-down holes (right panel).

## Play

Play in the browser: https://shootquinn.github.io/Drilling_Game/

Or open `index.html` (a copy of `game45/dist/play.html`) locally in Chrome. It is one file with no network access. The smallest supported window is 960 x 540.

Phases: memorize, paint, plan, run, result. The page boots Level 1. The level start card has a level select: six buttons, any level in any order (picking one restarts the campaign from that level). After a result, Next goes on to the next level through Level 6.

Branching: every borebot branch splits into two children at a fixed 15 degree half-angle (30 degrees between siblings). Spec v3.8.0 and later.

Known gaps: `game45/docs/known_gaps.md`.

## Layout

- `game45/core/` rules engine (no DOM), ES modules
- `game45/ui/` canvas 2D rendering and input
- `game45/build.mjs` concatenates everything into `game45/dist/play.html` (whitespace-minified; `--no-minify` keeps the source layout)
- `game45/test/` unit, parity, hygiene, end-to-end and performance tests; golden files `goldens_v36.json` to `goldens_v42.json` (v40 reserved)
- `cr_scratch/step45_toymaker_spec_v3.md` design spec (v3.8.3)
- `cr_scratch/step45_reference_sim_v3.py` Python reference simulation the JavaScript core is checked against; `step45_07_export_goldens.py` writes the goldens; `step45_swe_v42_independent.py` is the independent oracle
- `cr_scratch/step45_storyboard_v3/` storyboard builder (`build_storyboard.js`), sim export (`export_sim.py`, `sim_export.json`)
- `review_manifest.json` the build copied to the review folder (`../review` next to this repo in the Drilling_Game layout)

## Build and test

Requirements: Node 20 or later, Python 3, Google Chrome. The end-to-end tests need `playwright-core` and `pngjs`, installed outside the repo (and outside any OneDrive folder) in a scratch directory named by `S45_DEPS`.

```
mkdir C:\borebot_render\step45
cd C:\borebot_render\step45
npm init -y
npm i playwright-core pngjs
```

Then from the repo root:

```
set S45_DEPS=C:/borebot_render/step45
node game45/build.mjs
node --test "game45/test/unit/*.test.mjs" "game45/test/parity/*.test.mjs" "game45/test/hygiene/*.test.mjs"
node --test --test-concurrency=1 "game45/test/e2e/*.test.mjs"
```

(PowerShell: `$env:S45_DEPS = 'C:/borebot_render/step45'`; bash: `export S45_DEPS=C:/borebot_render/step45`.) Parity tests run the Python sim and need `python` on the PATH. Screenshots and other large output go to the scratch directory, never the repo.

## Publish

Run the build, copy `game45/dist/play.html` to `index.html`, commit, push to `main`. GitHub Pages serves `index.html` at https://shootquinn.github.io/Drilling_Game/.

## License

Unlicense (public domain). See `LICENSE`.
