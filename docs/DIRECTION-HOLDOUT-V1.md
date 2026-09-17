# Direction budget holdout and axial ablation / 1

Offline SIM only. Plan fixed before execution in
`reports/direction-budget-holdout-plan-v1.json` and bound by hash in the result.
Previous reports, budget implementation, production runtime and graph are
unchanged. This is a separate experimental version.

## Fixed experiment

- Circuit graph; held-out seeds 101–108 (pilot used 43–46).
- Headings 0/90/180/270 degrees; four body-relative placements at radius 600.
- Integer quarter-turn placement; start at (5000,5000), pickup radius 400.
- 36 ticks, rotating sorted-index selection from the same L23/R57 cohort.
- Directional / swapped / neutral, always 22 food nodes and 22 RNG draws.
- Bilateral policy preserves intensity when lateral component is zero.
- Silent policy suppresses intensity whenever the CURRENT lateral component
  is zero, including both ahead/behind and the neutral arm. It does not skip
  RNG draws, alter the selected count or rewrite motion.
- 128 scenarios per policy, 768 arm runs; each run fully replayed and compared.
- All scenarios and headings retained; no tuning or seed selection after results.

The plan was fixed locally and fingerprinted before execution, not externally
preregistered. Repeated rotations/placements are correlated, not independent
statistical samples. Intensity after movement and refractory handling may
still differ across arms: equal calls are not equal effective current.

## Outcomes

| Policy | directional | swapped | neutral |
| --- | ---: | ---: | ---: |
| Bilateral | 40/128 | 32/128 | 32/128 |
| Silent | 8/128 | 0/128 | 0/128 |

Within either policy, directional vs neutral AND vs swapped: 8 wins, 120 ties,
0 losses (binary collection per matched scenario). Bilateral vs silent adds
32 collections for EACH arm, all initially-ahead cases. Behind remains 0.
Lateral successes are 4 initially-left and 4 initially-right for directional;
controls have 0. Thus the observed directional margin persists under this
axial ablation; restored axial intensity explains the shared baseline gain,
not the extra directional collections in these scenarios.

Crucial seed-level qualification: only seeds 102 and 103 supply the margin;
each repeats its success at four rotated headings. The other six seeds tie.
Every heading stratum is identical: bilateral 10/8/8 and silent 2/0/0.
Do not treat rotations as replication over independent brains, or 8 wins as
8 independent seed successes. This is limited holdout support, not statistical
significance, robust navigation, learning, or biological olfactory tuning.
The sign-only route, short horizon, fixed distance and selected neuron subsets
remain limitations. A future independently fixed subset/heading sensitivity
study would be necessary before broader claims. No full-graph run this round.

## Evidence and reproduction

Run from repository root:

```sh
node scripts/study-direction-holdout.mjs
node --test tests/direction-holdout.test.mjs
```

- `scripts/direction-holdout-core.mjs`: separate runner and paired summaries.
- `scripts/study-direction-holdout.mjs`: fixed-plan run and source checks.
- `reports/direction-budget-holdout-v1.json`: full selected indices, stimuli,
  RNG budgets, positions, collection events and initial/final state hashes.
- Report hash: `0x1b28481a2dc23b68d15b43aea8bfe13cb3fe1349f6cdac8aaa801590e16e2f48`.

Tests verify rotation geometry, invalid inputs, exact compatibility with the
pilot at heading zero/bilateral policy, silent policy RNG invariance, full
scenario coverage, source/plan/report hashes and recomputed paired summaries.
Budget calls remain matched in both policies; cumulative/effective current is
NOT claimed to match in closed loop. No movement instruction receives target
coordinates. Initial heading is set only before simulation starts.
