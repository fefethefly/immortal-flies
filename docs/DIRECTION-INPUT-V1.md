# Direction observation / 1 — experimental interface

Status: candidate sensory encoding implemented; no neural mapping or behavior claim.

## Contract

Module: `/Users/caonanya/Documents/ChatGPT/immoratalflies/src/brain/task-direction.mjs`.
`encodeDirection(observations, body)` consumes the immediate output observations of
`observeLocal`, plus integer body x/y (0–10000) and heading (0–359).
It does not read the world, graph, reward, runtime state or motor output.
There is at most one food and one threat observation; duplicates, unknown
modalities and observations outside the strict radius of 1000 are rejected.
The caller remains responsible for observation authenticity and freshness.
This interface is not a relay-message input and does not validate timestamps.

Output has schema `iff.direction-observation/1`, encoder `local-body-direction/1`
and food/threat/light channel records:

- `intensity`: floor(900 * (1000000 - distanceSquared) / 1000000), matching
  the existing local observation baseline, not forage-v1's linear falloff.
- `directionValid`: false for absent targets and zero-distance contact.
- `forward`, `right`: signed integer L1-normalized components in [-1000, 1000].
  Positive means ahead/right; negative means behind/left. They are geometry,
  not movement commands. Intensity is kept separate.

Heading is floor(heading / 45), with axes
(1,0), (1,1), (0,1), (-1,1), (-1,0), (-1,-1), (0,-1), (1,-1).
This matches the runtime movement bins: heading 0 points +x, +y is down.
For axis (hx,hy) and relative displacement (dx,dy):
forwardRaw = dx*hx + dy*hy; rightRaw = -dx*hy + dy*hx.
Divide each by abs(forwardRaw)+abs(rightRaw), scale by 1000 and truncate
 toward zero; negative zero is canonicalized. This avoids trig and square roots.
L1 normalization is not a Euclidean unit vector; rounding and 45-degree bins
lose fine angular information. Body-relative rotation invariance is tested at
90-degree rotations; arbitrary rotations are not claimed.

Absent channels are zero/invalid. Contact intensity is 900 but direction is
undefined. Light remains zero/invalid because observeLocal does not observe it.
Nearest-target selection, ties and consumed-food filtering stay upstream.
Coordinates and heading are not included in the output, so those fields alone
cannot create a false positive for direction-vector distinguishability.

## Evidence and boundaries

Existing metadata audit: food 80 unknown sides; threat L42/R37/unknown1;
light L79/unknown1. Threat overlaps motor readout groups at 64 of 80 nodes.
Motor groups are not suitable substitutes for directional sensory groups.
The preparation script chooses side columns with differing priority in seed
selection (somaSide first) and metadata export (side first), which masked the
food rootSide split in exported metadata. Raw Feather verification has since
completed read-only with /usr/local/bin/python3 (pyarrow 25.0.1): raw food
somaSide is empty for all 80 selected neurons while rootSide is R57/L23;
threat somaSide is L42/R37/1 unknown; light is 79L/1 unknown. The audit is
reproducible via scripts/data/audit-side-mapping.py and committed as
reports/side-mapping-audit.json (schema iff.side-mapping-audit/1, self-hashed,
reads cached official files and shipped manifests only). A separately versioned
plan module exists (side-route/1, src/brain/task-direction-mapping.mjs): it
routes only the right component of food/threat to caller-provided per-side
index groups with integer drive round(|right| permille x intensity / 1000);
forward and light are never routed, routing groups are validated even when
silent, and it remains pure data that no runtime consumes. Soma/root side
locates neuron position; it is not evidence of directional response tuning,
and no biological direction claim is made.


No production runtime, old encoder, graph, task, adapter or diagnostic report
was changed. This new schema is not wired into sensory-groups/1; callers must
not treat it as an iff.input/1 signal. A spatially resolved positional sensor is
an engineered simulation assumption, not a model of an actual fly's olfaction.

The nine direction tests cover four directions, rotations, reflection, all
eight heading bins, contact/absence, radius boundaries, modality isolation,
invalid inputs, side routing, drive arithmetic, eager routing-group validation,
the committed audit report and 20 existing paired diagnostic records. The 20
records repeat a
geometric invariant; the encoder has no RNG and these are not 20 independent
behavior trials. Tests also verify the existing report hash, world hashes and
source fingerprints. Old diagnostic tests still test the original neural path.

## Neural-stage result (iff.direction-neural-diagnostic/1)

`scripts/diagnose-direction-neural.mjs` + `reports/direction-neural-probe-v1.json`
probe whether side-route/1 carries direction into the UNMODIFIED production
kernel (`src/brain/runtime.mjs` `step()`), via a per-probe view graph that
reroutes the sensory food/threat groups to the planned side neurons. The kernel
file is untouched; fingerprints of all 10 kernel/task/adapter files recorded in
the pre-existing `reports/direction-diagnostic-v2.json` still match byte-for-byte.

20 paired seeds, 1400-node subgraph, open loop, drive from the initial
observation, voltage and spike hashes compared across equal-distance targets:

- leftRightDivergent 20/20: left vs right targets produce different voltage and
  spike traces in the production kernel — direction information now reaches
  neural state.
- forwardUnrepresented 20/20: ahead == behind == empty. Expected consequence of
  side-route/1 never routing the forward component; a mapping limit, not a
  kernel result.
- legacyIdentical 20/20: the legacy scalar path injects the same intensity for
  all four directions and yields identical neural states — the original
  bottleneck, kept intact as the contrast baseline.

Recorded limitations: open-loop fixed drive; total injected current scales with
stimulated side size (food L23/R57, per-neuron drive uniform); RNG consumption
depends on stimulated group size, so traces are compared per direction only;
motor-group activity is read-only ethology, no directional current enters
left/right groups; no re-sensing, learning, behavior or foraging claim.

## Historical closed-loop stage: interpretation corrected

The preserved `iff.direction-closed-loop/1` report used 20 seeds x 36 rounds.
All arms collected zero. Its divergence metric compared whole-state hashes,
including RNG, exposure and energy: **20/20 unequal hashes alone do not prove
20/20 different body paths**. Threat exposure differences cannot be attributed
to larger current without controlled interventions. In particular, 64 threat
nodes overlap motor readouts, so the old blanket claim of no direct motor-group
stimulation is withdrawn for hazard-containing experiments. Keeping kernel
source unchanged does not remove this overlap.

A synthetic same-side sensory-to-motor graph collecting food demonstrates that
software components can compose. It does NOT localize the real graph's failure
to wiring. The earlier assertion that circuit wiring was the established
remaining bottleneck, and full the next remedy, is withdrawn.

## Circuit/full audit and bounded study (2026-09-17)

New reports: `iff.direction-paths/1` and `iff.direction-full-study/1`.
Circuit: 1,400 nodes / 42,031 edges; full: 161,839 / 2,749,558.
Full is a filtered annotated graph, not every biological synapse. Thresholds
are 8 and 10 respectively, so full is not a strict edge superset: circuit's
single direct food-right to motor-right edge of weight 8 is absent in full.
Indices are remapped by official body ID; the selected sensory and motor ID
cohorts match across graphs. Anatomical side is not response-tuning evidence.

Two-hop food walks (counts; weight products and signed sums in the report):

| Source → target | circuit | full |
| --- | ---: | ---: |
| L → L | 32 | 112 |
| L → R | 47 | 93 |
| R → L | 214 | 266 |
| R → R | 347 | 491 |

Both graphs contain two-hop food-to-motor walks. Walks allow repeated nodes;
products of two edge weights are not synapse counts or LIF efficacy. Signed
sums apply the project's transmitter rule; zero/negative sums do not establish
absence of functional paths. Longer paths and threshold dynamics remain open.

Paired study: four initial seeds (43–46), four placements at distance 600,
36 closed-loop steps and six open-loop neural steps; food only, no hazards.
Food routes explicitly reject overlap with motor readouts. Each of the 96
closed-loop arm runs (2 graphs × 16 scenarios × 3 arms) is replayed and its
entire returned trace/state compared. Paths are x/y/heading, not whole-state
hashes. The scenario worlds and paths are stored, and source fingerprints are
checked before/after execution.

| Measurement | circuit | full |
| --- | ---: | ---: |
| Left/right open-loop neural records differ | 4/4 | 4/4 |
| Directional vs legacy body paths differ | 16/16 | 16/16 |
| Directional vs swapped body paths differ | 8/16 | 8/16 |
| Directional collections | 0 | 1 |
| Swapped collections | 0 | 1 |
| Legacy collections | 4 | 4 |

Full does not establish a directional advantage: swapped matches directional
collection and legacy is higher. Four seeds are a bounded pilot, not a
significance test. Left/right group sizes (23/57), current budget, RNG draws,
forward-drive suppression, graph threshold and horizon remain confounds.
Next work should control these before increasing scale or claiming navigation.

A one-off instrumented circuit replay (all 16 scenarios) matched the original
runner's bodies and final states exactly. Ahead/behind have zero drive and
motion by mapping design. Lateral cases have sensory spikes and 15–34 moving
ticks; their closest observed distance was about 471.84, outside radius 400.
This does not prove broken wiring. Geometry permits collection: initial distance
600 requires 200 approach, while 36 steps permit up to 1260 per axis. Legacy
actually collects ahead at tick 11 (circuit) or 9 (full); full directional
collects on seed 44/right at tick 35, swapped on seed 46/right at tick 34.
Do not change budget merely to force a positive result.

## Reproduction and workspace handoff

Run from the repository root:

```sh
node scripts/audit-direction-paths.mjs
node scripts/study-direction-full.mjs
node --test tests/direction-paths.test.mjs tests/direction-full-study.test.mjs
```

Full files are intentionally ignored by git. Reproduction needs the local
hash-matching `public/data/malecns-full` dataset (the existing preparation
instructions describe regeneration); neither this study nor the commit adds
those large files. Existing diagnostic reports and production source are not
rewritten.

During this session 205 modified/untracked files were fingerprinted for
coordination (excluding scratch IDE directories); none of those files changed
between that snapshot and completed validation. This is not a lock or proof
that other developers have stopped. The staging area was initially empty.
Only this research line's named files are staged; no stash, reset, broad add,
push, deployment or unrelated commit is performed. Frontend/life/contracts and
server/package edits remain with their owners. Before each separate owner
commit: inspect the exact staged diff, verify that source fingerprints did not
change during tests, and run that slice's tests plus integration checks.

