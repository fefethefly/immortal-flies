# Admission relay task runner / 1

Entry: `src/brain/task-admission-relay.mjs`, export `runAdmissionRelay`.
Policy `admission-relay/1`, result `iff.admission-relay-run/1`.
This integrates `relay-admission/1` into a full bounded SIM task, not just a
receiver demonstration. Previous protocol runner, receiver and evidence remain
unchanged. Native state identity labels match the old runner for compatibility;
message identity is explicitly mapped through `members` (`sim:life-0`, etc.).

## Operation

Inputs: graph, hash-checked forage world, legacy configuration (mode, flies,
seedBase, rounds, positions, deliveryCopies), plus sessionId and fault.
One admission state is carried per recipient on EVERY round, including silent
rounds. New observations carry schema/task/envId/worldHash/sessionId/instanceId.
The receiver gets body coordinates and own input, not the task world. Its applied
input goes into the unchanged native step; food settlement stays shared/unique.
No arbitrary user packets or Internet transport are accepted by this runner.

Modes remain off/relay/scrambled. Fault is an explicitly recorded transport
intervention: none, environment (wrong worldHash), mixed-environment (valid plus
wrong-world copy), conflict (same ID with two different x values), expired
(actual two-round delivery delay, not forged observed time). Unsent last-round
messages are avoided according to that delay. Off sends no messages. Scrambling
is not detected as false observation: admission validates scope, not truth.

Full wire payloads are retained in transmissions. decisions has one entry per
transmission, in the same order. receipts contains accepted decisions. Own,
applied, IDs, positions and action are retained per step; final admission state
is retained alongside native state hashes. Raw bytes include rejected/duplicate
payloads, accepted bytes exclude them; neither measures transport headers/CPU.
Duplicate rejection and total rejection are separate counters.

At most 40 delivered items per recipient per round: combinations whose worst
case exceeds this are rejected before simulation, rather than dropping messages.
E.g. 10 lives x conflict variants x duplicate copies is rejected. Seen memory
is bounded by task duration but copied each round; scalability is not established.
Session defaults are SIM convenience, not authority or replay protection between
separate runs. All identities/membership and state are caller-controlled.

## Verified

`node --test tests/task-admission-relay.test.mjs`

Two-life four-round fixture executes normal, repeated, mixed, cross-world,
expired, conflict and off configurations, with complete deterministic replays.
Accepted messages change receiver food input 0→216. Normal and duplicate/mixed
have identical effective traces and final states. Cross-world, expired and
conflict runs retain local input and match off final states. Accepted decisions
reconstruct applied input for every frame. Normal/scrambled match legacy behavior.
Additional checks cover 10-life batch capacity, message bytes, immutable inputs,
invalid configurations and unique initial food settlement. Full suite: 315/315.

These are synthetic integration results, not improved collection or T3 gain.
No larger study or new replay package was generated. The page still shows its
old replay and independent admission examples; it does not yet display these
full-task decision logs. No frontend or historical artifact was rewritten.
