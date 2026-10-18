# Step 45 playable (G1d build): what is in it and what is not

Open `play_g1d.html` in Chrome (double-click works). It runs from the file, with no network. Spec v3.7.7.

## What you can play

The ground is a 1,000 m by 500 m section, drawn twice: the left panel is the borebots, the right panel is the rig. Both panels show the same painting.

1. Show formation (reveal and fade times come from the level: Level 4 shows for 5 seconds, then fades over 2).
2. Paint where you remember it. Brush sizes 2, 5, 8, 12, 20 cells, Erase, Fill, Undo (last 20), Clear all. The paint cap is a fraction of the 20,000 cells set by the level (Level 4: 4,000 cells). At most 3 bodies. Small stray patches under 50 cells dissolve when you press Done painting. Peeks: set by the level (Level 4 has none).
3. Plan, left panel (borebots).
   - Click the surface or the left panel to place a portal (3 at most, 25 m apart). Drag a portal along the surface to move it.
   - Remove a portal four ways: its x handle (shown on the selected portal), the Remove portal button under the left panel, Delete or Backspace, or right-click on the portal. Dragging it off both panels also removes it. You can remove all three. Removing a portal drops its clicks and frees its length; if that makes another portal's clicks no longer fit, the message line says how many clicks were dropped. A removal cannot be undone.
   - The dBranch slider (20 to 100 m) sets the branch length. Next generation adds a ghosted layer, Grow to 12 repeats it, Undo takes one click back. The first click of a portal is one straight segment; later clicks fork it.
   - The meter shows metres used of the 2,000 m cap. When the next generation would pass the cap, the meter and the note under it read "Max Length Exceeded" and Next stops.
4. Plan, right panel (rig).
   - Click the right panel to place a rig hole (12 at most, one per column, drilled in the order placed). Drag a hole to move it, drag its square handle or use the wheel or + and - to set its depth (1 to 100 cells), Delete removes the selected hole. With no holes placed, Balrog plans the rig.
   - Placement is never refused for length. The rig may total more than the borebot length while you edit. The cells past the borebot length draw in red, the status line reads "Max Length Exceeded", and Start is blocked until the rig total is at or under the borebot length (shorten a hole, remove one, or grow the left network). Edits to the left never change your holes.
5. Start. The run plays at 1x, 4x or 16x, with Pause and Skip to end.
6. The formation fades in with what you hit (solid), what radar imaged (lighter) and what you missed (unmarked), then the readout shows percent intersected, imaged and total for each side, the metres drilled and spent / unspent.
7. Next. After the readout, Next loads the next level. The page boots Level 4 (the fixed GV4 formation); Next goes to Level 5, then Level 6 (generated formations), then "all six levels played"; after that the button reads Play again and replays Level 6.

## What is in the code but not on the page

Six levels exist in the level table (Levels 1 to 6, each with its own reveal time, peeks, paint cap, cover cap and generated formation), but the page boots Level 4 and has no level select. Levels 1 to 3 cannot be reached from the page.

## What is not wired

- Mid-run moves: re-aiming a borebot and adding a rig hole while the run plays. The core Round class implements both and has unit tests, but the game state machine has no intent for them and the page has no control for them. The run status lines show "re-aims left" and "adds left" counters; there is nothing to press.
- The Vex advisor and its pop-ups.
- Level select. The campaign runs 4, 5, 6 and ends; it does not loop back.
- Final art. Every colour is a flat placeholder. There is no strata texture.
- Onboarding, tooltips, final captions, a colour-blind check.
- Sound.
- Undo for a removed portal or a removed rig hole.
- Auto-plan and Clear buttons for the rig list (removing every hole returns to Balrog's plan).

## Placeholder numbers (change them after you play)

| Field | Value now |
|---|---|
| Landmark step | Level 4: every 100 m |
| Formation seed | Level 4: 31678 (the GV4 formation) |
| Drill cap | 2,000 m on every level |
| Time | 1 game second = 2.5 real hours of drilling; the run clock reads real hours |

## Frame rate

Press P to show a small readout at the top right: frame time, the 95th percentile frame time, and the time the plan takes to rebuild after an edit. Press P again to hide it. To report speed, play to the plan screen, press P, drag the dBranch slider for a few seconds, start a run at 1x, and send me the three numbers you see (frame ms, p95, rebuild p95) plus your machine and browser.
