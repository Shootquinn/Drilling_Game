# Drilling_Game

A prospecting game. A hidden underground formation is shown briefly, then fades. Paint where you remember it, plan the drilling, then watch two methods compete to find it: a branching network of self-steering borebots (left panel) and a conventional surface rig with straight-down holes (right panel).

## Play

Play in the browser: https://shootquinn.github.io/Drilling_Game/

Or open `game45/dist/play.html` locally in Chrome. It is a single file with no network access. The smallest supported window is 960 x 540.

`index.html` at the repo root is a copy of `game45/dist/play.html` for GitHub Pages; recopy it after each build.

Phases: memorize, paint, plan, run, result. Six levels: the page opens at Level 1, the start card has a level select (any level, any order), and Next after a result goes to the next level through Level 6. Known gaps are in `game45/docs/known_gaps.md`.

## Layout

- `game45/core/` rules engine (no DOM), ES modules
- `game45/ui/` canvas 2D rendering and input
- `game45/build.mjs` concatenates everything into `dist/play.html` (whitespace-minified; `--no-minify` keeps the source layout)
- `game45/test/` unit, parity, hygiene, end-to-end and performance tests
- `cr_scratch/step45_toymaker_spec_v3.md` the design spec (v3.8.1)
- `cr_scratch/step45_reference_sim_v3.py` the Python reference simulation the JavaScript core is checked against (golden files in `game45/test/`)

## Build and test

```
node game45/build.mjs
node --test "game45/test/unit/*.test.mjs" "game45/test/parity/*.test.mjs" "game45/test/hygiene/*.test.mjs"
node --test --test-concurrency=1 "game45/test/e2e/*.test.mjs"
```

End-to-end tests need `playwright-core` and `pngjs` installed under the directory named by `S45_DEPS` (default `C:/borebot_render/step45`) and Chrome. Parity tests need Python 3.

## License

Unlicense (public domain). See `LICENSE`.
