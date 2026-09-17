# Equal-budget direction pilot (2026-09-17)

Status: offline SIM experiment, not production routing and not a biological
navigation claim. Previous encoders, runtime and reports are unchanged.

## Intervention

`equal-food-budget/1` selects 22 food neurons per tick, the largest even count
not exceeding either annotated side (L23/R57). Each side is sorted by graph
index and rotated by tick, without RNG. Directional uses the sign of the
body-relative right component; swapped reverses the side; neutral uses 11
neurons per side. Ahead/behind (right=0) also use 11+11, preserving intensity
without inventing front/back discrimination. This uses anatomical labels only;
rotating subsets are not matched cell-type pairs and IDs imply no tuning.

The original local food intensity is used, without multiplying by lateral
magnitude. All three arms set threat/light groups empty and drive zero. All
selected nodes are checked to belong to food and not to motor readouts.
The production step() and graph weights are untouched; a temporary group view
is the experimental routing interface.

Every tick has 22 RNG draws, including absent/consumed food. The audit mirrors
runtime xorshift draws and verifies the actual resulting RNG. Open-loop arms
share intensity and exactly match successful external injection attempts and
their summed 1100-unit currents. This does NOT equal effective voltage/current
after refractory handling; the kernel can discard input to refractory nodes.
Closed-loop arms match attempts/RNG only: once bodies/collection diverge,
intensity and cumulative injection totals can legitimately differ.

## Pilot and results

Circuit graph, seeds 43–46, target at radius 600 in ahead/left/right/behind
placements, pickup radius 400. Open loop holds initial sensing for six ticks;
closed loop recomputes sensing for 36 ticks. Three arms per scenario, 96 runs
in total, each fully replayed and deep-compared. Output stores selected indices,
input, audited RNG/budget, body path, voltage/spike hashes and collection ticks.

| Closed-loop metric (16 scenarios) | directional | swapped | neutral |
| --- | ---: | ---: | ---: |
| Collections | 6 | 4 | 4 |
| Body paths differing from neutral | 13 | 12 | 0 |

Exploratory positive difference, NOT statistical significance or proof of
robust direction benefit. Four seeds share four geometric placements. Group
identity, rotation/subset choice, fixed heading and short horizon remain
limitations. Compared with previous studies this changes both budget and
forward-drive policy; it is not a one-factor attribution against old results.
Neutral is a new equal-budget baseline, not the old full-group legacy encoder.
No parameters were tuned after seeing results; full-graph runs were not added.

## Reproduce

From repository root:

```sh
node scripts/study-direction-budget.mjs
node --test tests/direction-budget.test.mjs
```

Sources: scripts/direction-budget-core.mjs and scripts/study-direction-budget.mjs.
Report: reports/direction-budget-v1.json, self-hashed with before/after source
fingerprints. Tests recompute source hashes, budget invariants and aggregates.

## Clean checkout verification

Previous commit 24f0434 was separately checked out into a detached temporary
worktree, installed with its own npm ci lockfile, and passed 170 tests and build.
The mixed development workspace passed 259 tests after this addition; those
counts include other developers' uncommitted tests and are not interchangeable.
With only these five new files added to that clean checkout, 173/173 tests
and build passed; rerunning the experiment produced the identical report hash
0x4cb344f9c2a3f9e3a63da6843900a3712c3432b807c685482c14ddb7debc2d44.
No stash, reset, broad staging, unrelated commit, push or deployment is used.

Next useful step: a predeclared held-out seed/heading set and cell-subset
sensitivity check; do not select only seeds or subsets that win. Test a forward
policy ablation separately before attributing improvements to budget control.
