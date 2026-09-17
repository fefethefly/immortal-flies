# Relay admission / 1

Implemented: deterministic, task-scoped receiver plus fixed browser examples.
Not yet integrated into `runProtocolRelay`; its historical evidence is unchanged.

## API

`src/brain/relay-admission.mjs` exports `receiveAdmitted(messages, context, state)`.
It returns applied input, accepted messages, one decision per delivered item,
and explicit state for the next call. Pass the returned state to prevent replay
across calls. Caller owns and trusts that state, membership list and context.

Message schema `iff.relay-observation/1` contains exactly: schema, id, task,
envId, worldHash, sessionId, instanceId, observedRound, channel, x, y, observer.
Coordinates are integer task-world coordinates in [0,10000], not body-relative;
rounds are logical ticks. Only food/threat observations are supported. Unknown
schema/extra fields are rejected with a decision, not applied as commands.

Context binds task, envId AND worldHash, sessionId, recipient and members.
Admission requires a known non-self instance and observation age exactly one
round. ID uniqueness is scoped by sender and receiver session. Conflicting
same-ID content within a valid-scope batch is rejected for ALL copies before
input application; previously accepted IDs cannot be used with different content.
Same accepted content is rejected as DUPLICATE on later calls. Backward time or
state/context mismatch throws; zero fresh messages is a valid batch.

Accepted messages use the existing distance-based 50% scalar relay intensity and
max-merge into own input. ACCEPTED_INPUT means this item increases the current
merged input; ACCEPTED_NO_GAIN means admission without increase. Input deltas
are incremental in delivery order. No body, graph or world state is written.

Limits: 40 messages per call, 10 local members, rounds 1–1000. Seen state is
caller-owned and not pruned during this bounded task. This is NOT an Internet
security boundary: known instance strings are not authenticated identities,
worldHash is not proof of truthful observation, caller state can be reset.
Rejected future/invalid messages do not reserve IDs. Changes to membership or
scope require a new state and session discipline managed by the caller.

## Page and tests

`/protocol.html#admission`
shows a separate section 05. Eleven fixed examples execute only the pure
admission function in the browser. They do not modify the four-arm replay,
perform neural simulation, access wallets, train a model or demonstrate T3 gain.

Tests cover all examples, state replay, schema/scope/time errors, recipient
isolation, no mutation and native neural stepping driven only by admitted input.
The browser test verifies displayed reasons and values without disturbing the
historical replay. At delivery: 313/313 workspace tests and build-backed Chrome
smoke passed. The protocol runner/old receiver/reports were not changed.
