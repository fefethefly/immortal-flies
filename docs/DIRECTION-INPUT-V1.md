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

## Closed-loop stage (iff.direction-closed-loop/1)

`scripts/run-direction-closed-loop.mjs` + `reports/direction-closed-loop-v1.json`.
Three arms share the world, start state, observation layer and the UNMODIFIED
production kernel; only stimulus routing differs: directional (side-route/1),
swapped (left/right exchanged control), legacy (full-group scalar). Sensing is
recomputed every round from the moved body; movement comes only from the
kernel's own motor decode; no directional current enters motor groups. Trace
entries carry a round-0 baseline, so metrics stay defined out of sensor range.

20 seeds x 36 rounds on the 1400-node subgraph, replays 20/20:

- Behavioral divergence: directional final states differ from legacy 20/20 —
  side routing changes the neural-to-behavior trajectory in closed loop.
- No foraging benefit demonstrated: collected = 0 in all arms; directional vs
  swapped diverges in only 6/20 seeds (targets are mostly beyond the 1000
  local radius in a 10000-wide world within 36 rounds).
- Cost signal: directional threat exposure 27 vs legacy 6 across seeds;
  larger total injected current has behavioral consequences.
- Mechanism check (standalone, not a committed report): a synthetic graph with
  same-side sensory-to-motor wiring collects 1/1 under directional routing
  while legacy collects 0 — encoding, plan, view-graph routing, kernel motor
  decode, movement and pickup all compose end to end.

Reading: with side-route/1 held fixed, the remaining bottleneck is the circuit
wiring between the routed sensory sides and the left/right motor readout
groups in the malecns-circuit subgraph, not the direction interface. A
malecns-full study is the next lever, separately versioned. Sides locate
neuron position, not response tuning; no biological or significance claim.

## Next gate

Closed-loop study only, separately versioned: re-sense each round while moving,
verify direction-informed trajectories differ behaviorally, then foraging
outcomes. Do not touch the legacy baseline path or motor readout groups; do not
claim biological directional olfaction from side-of-soma annotation.

