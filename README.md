# Drilling_Game

A prospecting game. A hidden underground formation is shown briefly, then fades. Paint where you remember it, plan the drilling, then watch two methods compete to find it: a branching network of self-steering borebots (left panel) and a conventional surface rig with straight-down holes (right panel).

## Play

Open `game45/dist/play.html` in Chrome. It is a single file with no network access.

Phases: memorize, paint, plan, run, result. Six levels (the current build starts at Level 4 and runs through Level 6). Known gaps are in `game45/docs/known_gaps.md`.

## Layout

- `game45/core/` rules engine (no DOM), ES modules
- `game45/ui/` canvas 2D rendering and input
- `game45/build.mjs` concatenates everything into `dist/play.html`
- `game45/test/` unit, parity, hygiene, end-to-end and performance tests
- `cr_scratch/step45_toymaker_spec_v3.md` the design spec
- `cr_scratch/step45_reference_sim_v3.py` the Python reference simulation the JavaScript core is checked against (golden files in `game45/test/`)

## Build and test

```
node game45/build.mjs
node --test game45/test/unit game45/test/parity game45/test/hygiene
```

End-to-end tests need `playwright-core` and `pngjs` installed under the directory named by `S45_DEPS` (default `C:/borebot_render/step45`). Parity tests need Python 3.

## License

Unlicense (public domain). See `LICENSE`.
