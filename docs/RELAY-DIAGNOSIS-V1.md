# Relay behavior diagnosis / 1

## Question and fixed development design

Where does useful coordinate information fail to become collection behavior?
This is a diagnostic intervention, NOT a new holdout, preregistered inference,
full swarm benchmark or learning experiment. All settings appear in the hashed
report plan; no seed/geometry adjustment after observing this run.

Historical real graph: MaleCNS sensory-motor subgraph, 1400 nodes / 42031 edges,
loaded from commit df7b372 with metadata/binary hashes checked. The mutable
working-tree graph is not used. Engineered sensory/motor mapping remains a limit.

Four development seeds 301–304, four cardinal placements, initial heading zero,
48 rounds. Receiver starts at (5000,5000), target radius 1200 (outside local
sense radius 1000), observer radius 1800 (600 from food, outside pickup 400).
Observer is stationary and cannot collect. It accesses the world only through
observeLocal and broadcasts actual observations with a one-round delay. Only
the receiver can collect; depletion is per run. There are no threats.

Four arms: native neural off/relay and handwritten off/coordinate-relay.
The handwritten controller uses only own observations plus current delayed
messages, moves at most 35 per axis per round, and has no world/target access.
It is a feasibility control with different actuation/compute, NOT neural or
biological capability. Its four repeated seed results per bearing are identical
because it does not use RNG; do not call them 16 independent replications.
Native receiver input goes through the unchanged receiveRelayInbox and step.
The observer is not a second neural life in this diagnostic.

## Results

| Arm | Collected | Mean net distance reduction | First movement |
| --- | ---: | ---: | --- |
| Neural, off | 0/16 | 0 | none |
| Neural, scalar relay | 0/16 | -128.344 | round 4 |
| Handwritten, off | 0/16 | 0 | none |
| Handwritten, coordinate relay | 16/16 | 840 | round 2 |

Handwritten collection occurs on round 24 in every placement. A one-round
stale message can cause movement after collection, so final distance reduction
840 is not the collection threshold crossing distance. Full paths/collection
times are recorded. Negative progress means farther from food at the end.

All 16 neural relay/off pairs: first applied-input difference round 2,
first spike difference round 2, first body difference round 4. Thus delivery
and neural excitation work; absence of behavioral influence is ruled out here.

For every seed, the four distinct equal-distance target coordinates become
EXACTLY the same food intensity 346 at round 2. Entire neural states at that
round are identical across bearings. The coordinates survive in messages and
receipts but are absent from the neural signal, whose food component depends
on distance alone. This proves an immediate direction-information collision,
not that all future closed-loop signals are identical: movement can turn later
intensity changes into temporal cues.

Bearing asymmetry: all four initially-right cases reduce final distance
(+425.679 to +505.859), none collect; all initially-left and behind cases move
farther away. Ahead is mixed. These descriptive observations do not localize
a particular neuron or distinguish graph asymmetry from motor readout effects.

## Conclusion and next action

Confirmed bottleneck: coordinate-to-scalar injection discards instantaneous
bearing. Messages contain enough spatial information for a simple controller,
and they do affect native neural dynamics, but this receiver does not exploit
them reliably for collection in these settings. No claim of learning: no
weights, overlay or policy are updated. No claim that direction encoding alone
will fix navigation (prior direction experiments already showed sensitivity).

Next experiment should isolate an explicitly versioned direction-preserving
input adapter against the same scalar baseline, checking both neural direction
separation and distance/collection outcomes. Do not patch body movement in the
neural arm or credit handwritten control gains to neural intelligence.

## Reproduction and limits

Report: reports/relay-diagnosis-v1.json

```sh
node scripts/study-relay-diagnosis.mjs verify
node --test tests/relay-diagnosis.test.mjs
```

64 arm runs, each executed twice and compared in full; a separate verify run
reconstructed and compared the entire saved report. Report includes source
fingerprints, graph manifest, stimuli, messages, receipts, RNG, spikes, native
state hashes, paths, first-change metrics and all strata. CLI refuses overwrite.
Matching repository and historical git objects are required; this is not a
standalone artifact. Native floating-point square root is used only for distance
summaries; report replay verified on the current platform. Seeds and bearings
are correlated, no confidence interval or significance claim. No UI changes.
