# Step 45 playable (G1e build): what is in it and what is not

Open `play_g1g.html` (or `game45/dist/play.html`) in Chrome (double-click works). It runs from the file, with no network. Spec v3.8.2. Smallest supported window: 960 x 540; below it the page asks for a larger one.

## What you can play

The ground is a 1,000 m by 500 m section, drawn twice: the left panel is the borebots, the right panel is the rig. Both panels show the same painting.

1. The page opens at Level 1. The card has six level buttons (1 to 6) under "level select"; any level can be picked in any order. Next after a result goes to the next level; after Level 6 the campaign ends and the button reads Play again.
2. Show formation (reveal and fade times come from the level: Level 1 shows for 8 seconds, Level 4 for 5, each then fades over 2).
3. Paint where you remember it. Brush sizes 2, 5, 8, 12, 20 cells, Erase, Fill, Undo (last 20 strokes, Ctrl+Z), Clear all. The paint cap is a fraction of the 20,000 cells set by the level (Level 4: 4,000 cells). At most 3 bodies. Small stray patches under 50 cells dissolve when you press Done painting. Peeks: set by the level (Levels 1 to 3 have some). Back to paint keeps the plan; the Undo history is cleared at Done painting by design, and the page says so.
4. Plan, left panel (borebots).
   - Click the surface or the left panel to place a portal (3 at most, 25 m apart). Drag a portal along the surface to move it. A click within 25 m of the portal you just placed or moved, inside about half a second, is ignored.
   - Remove a portal four ways: its x handle (shown on the selected portal), the Remove portal button, Delete or Backspace, or right-click on the portal. Dragging it off both panels also removes it. Removing a portal drops its clicks; if that makes another portal's clicks no longer fit, the line under the left panel says how many were dropped and which portal. A removal cannot be undone.
   - The dBranch slider (20 to 100 m) sets the branch length. Next generation adds a ghosted layer, Grow to 12 repeats it, Undo (also Ctrl+Z) takes one click back; the Undo button names its action ("Undo: portal 825 m, gen 2"). Next generation and Grow to 12 are grey, with the reason under the left panel, when the next generation cannot be drilled: no branch from the portal reaches the painted formation at this dBranch, or the next generation would exceed the 2,000 m limit. Redo does not exist; Ctrl+Y does nothing.
   - The meter shows metres used of the 2,000 m cap and "unspent N m of 2,000 m". When the next generation would pass the cap the note under the meter reads "Next generation would exceed the 2,000 m limit" and Start stays available.
5. Plan, right panel (rig).
   - Click the right panel to place a rig hole (12 at most, one per column, drilled in the order placed). Drag a hole to move it, drag its square handle or use the wheel or + and - to set its depth (1 to 100 cells), Delete removes the selected hole. With no holes placed, Balrog plans the rig.
   - Placement is never refused for length. The rig has its own 2,000 m, apart from the borebots (spec v3.8.2): both sides can each drill 2,000 m. A rig total above 2,000 m draws its past-the-limit cells in red, the status line reads "Rig: Max Length Exceeded", and Start is blocked until the rig total is at or under 2,000 m. The line "unspent N m of 2,000 m" is 2,000 m minus the rig total. With no holes placed, Balrog plans up to 12 holes within 2,000 m. A new hole is as deep as the formation in its column plus one cell (a body that reaches the grid floor gives 100 cells), else 10 cells.
6. Start. The run begins at 4x; the controls are Pause, 1x, 2x, 4x, 8x, 16x and Skip to end. A run at 16x lasts at least 6.5 seconds. Pause holds at every speed.
7. The formation fades in with what you hit (solid), what radar imaged (lighter) and what you missed (unmarked), then the readout shows percent intersected, imaged and total for each side, the metres drilled and "unspent N m of 2,000 m" (cap minus drilled, the same wording as the plan and the run).

## What is in the code but not on the page

- Mid-run moves: re-aiming a borebot and adding a rig hole while the run plays. The core Round class implements both and has unit tests; the game state machine has no intent for them and the page has no control. The re-aims and adds counters are hidden.

## What is not wired

- The Vex advisor and its pop-ups.
- Final art. Every colour is a flat placeholder. There is no strata texture.
- Onboarding, tooltips, final captions, a colour-blind check.
- Sound.
- Undo for a removed portal or a removed rig hole; redo of anything.
- Auto-plan and Clear buttons for the rig list (removing every hole returns to Balrog's plan).
- Touch removal of a rig hole is drag-off only (no Remove hole button).

## Behaviour the playtest asked about

- After Back to paint the network can change even though you only added paint: each portal's target set is recomputed from the new painting (spec 4b item 11), so clicks that no longer reach it drop. The message names the portal and the count.
- "formation top N m" is the depth of the shallowest painted cell the selected portal serves. The painting is one region shared by all portals; a portal's number changes when the painting does.
- The gold flags along the surface are distance flags every 250 m (0, 250, 500, 750 m), not a game object.

## Placeholder numbers (change them after you play)

| Field | Value now |
|---|---|
| Landmark step | by level: 50, 50, 100, 100, 100, 200 m |
| Formation | generated per level from the level table (Level 1 to 6, variant 0) |
| Drill cap | 2,000 m on every level |
| Time | 1 game second = 2.5 real hours of drilling; the run clock reads real hours |
| Run pace | 16x lasts 6.5 s at the least; 1x of a long plan lasts minutes |

## Frame rate

Press P to show a small readout at the top right: frame time, the 95th percentile frame time, and the time the plan takes to rebuild after an edit. Press P again to hide it. To report speed, play to the plan screen, press P, drag the dBranch slider for a few seconds, start a run at 1x, and send me the three numbers you see (frame ms, p95, rebuild p95) plus your machine and browser.
