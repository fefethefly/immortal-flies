# Direction food-subset ordering sensitivity / 1

Offline SIM only. Plan fixed before execution in
`reports/direction-subset-plan-v1.json` and bound by hash in the result.
The bilateral holdout report is bound by hash (`baselineHash`) and the graph,
side binding, runtime and budget implementation are unchanged. This study
reuses the held-out seeds 101-108, so it is a sensitivity probe of the prior
result, NOT a new holdout or independent validation.

## Fixed experiment

- Same circuit graph, seeds 101-108, headings 0/90/180/270, four body-relative
  placements, radius 600, 36 ticks, bilateral policy only.
- Same directional / swapped / neutral arms, always 22 food nodes and 22 RNG
  draws per tick; cohort membership (L23/R57) is never changed.
- Four source orderings over the identical cohort: `index` (the baseline
  sorted-index identity) plus `subset-A`/`subset-B`/`subset-C`, each an
  ascending SHA256(`salt:side:bodyId`) order with lexical body-ID tie-break.
  Salts were fixed in the plan before execution.
- Ordering changes BOTH which nodes carry injections when fewer than k fire
  AND the RNG-to-node assignment. Attempts, node counts and total RNG calls
  stay matched; closed-loop cumulative or refractory-effective current does
  not, and is not claimed to match.
- 512 scenarios (4 orders x 128), 1536 arm runs, each run replayed twice for
  determinism; `index` runs are byte-compared to the bilateral holdout
  baseline (initial/final state hashes, paths, events).
- No best-order selection and no post-result tuning. Three fixed salts are a
  probe, not an exhaustive subset search.

## Outcomes

| Ordering | directional | swapped | neutral | dir vs neu W-T-L | dir vs swp W-T-L |
| --- | ---: | ---: | ---: | ---: | ---: |
| index | 40/128 | 32/128 | 32/128 | 8-120-0 | 8-120-0 |
| subset-A | 40/128 | 32/128 | 32/128 | 8-120-0 | 8-120-0 |
| subset-B | 48/128 | 32/128 | 36/128 | 16-108-4 | 16-112-0 |
| subset-C | 36/128 | 12/128 | 36/128 | 0-128-0 | 24-104-0 |

Reading these together:

- `index` reproduces the holdout bilateral arm exactly, including the margin
  that comes only from seeds 102 and 103.
- Reordering identities inside the same cohort moves the margin to different
  seeds (A: 102/104; B: 102/104/105/108) and shifts the NEUTRAL arm's own
  baseline (36 in B, including an 8-collect seed 103 that supplies B's four
  losses against directional). The margin tracks WHICH nodes carry the
  injections, not merely how many are injected.
- `subset-C` removes the directional margin entirely (0 wins, 128 ties,
  0 losses vs neutral) and drops the swapped arm to 12/128. Reordering alone
  - no code, budget or stimulus change - can delete the effect.

Conclusion for this round: the previously observed directional advantage is
CONTINGENT on the specific node subset and RNG-to-node assignment. It is not
shown to be an invariant property of the 22-node budget, and no ordering
is promoted. Seeds are reused and rotations are correlated, so per-order win
counts remain descriptive, not independent statistical evidence. A per-node
attribution (leave-one-out or single-node swaps) on FRESH seeds would be the
next step before any capability or robustness claim.

## Evidence and reproduction

Run from repository root:

```sh
node scripts/study-direction-subsets.mjs
node --test tests/direction-subset.test.mjs
```

- `scripts/direction-subset-core.mjs`: ordered cohorts, runner, summaries.
- `scripts/study-direction-subsets.mjs`: fixed-plan run, baseline byte
  comparison and source checks.
- `reports/direction-subset-v1.json`: full ordered cohorts, per-tick inputs,
  budgets, positions, collection events and state hashes.
- Report hash: `0xb6831ec681beb7f904f3c12ac0f4293c80bde8403b5d33bef19c9224c50039f0`.

Tests verify cohort membership and budget invariance under reordering, exact
reproduction of the bilateral holdout under `index`, replay determinism,
rejection of invalid geometry/budget inputs, full scenario coverage,
source/plan/report hash binding and recomputed paired summaries.
