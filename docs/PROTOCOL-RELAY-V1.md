# Protocol relay runner / 1

Status: offline SIM candidate integrated with the deduplicating receiver.
Not a frontend, network service, full T3 protocol, learning or gain claim.

## Entry point

`/Users/caonanya/Documents/ChatGPT/immoratalflies/src/brain/task-protocol-relay.mjs`
exports `runProtocolRelay(graph, world, options)` and `PROTOCOL_RELAY`.
Use the existing graph loader and `createWorld` from `task.mjs`. The world must
carry its valid worldHash; caller supplies graph artifacts and retains them.

Options follow the legacy local relay: `mode` (off/relay/scrambled), `flies`
(1–10), `seedBase`, `rounds` (1–1000), `positions`. `deliveryCopies` (1 or 2,
default 1) duplicates each eligible transmission after coordinate intervention
and before the receiver. No messages are produced in off mode or the last round.

The simulation now executes observation → one-round delayed transmission →
`receiveRelayInbox` → sensory input → native state step → shared food settlement.
The receiver has no world access and does not write body positions directly.
A shared food item is collected at most once; initial pickups are recorded.

## Evidence and costs

The result schema is `iff.protocol-relay-run/1`, policy `protocol-relay/1`.
State soul/branch labels intentionally match the legacy runner for exact
compatibility checks; these are local SIM identifiers, not on-chain identity.

- `messages`: unique observations before transport intervention.
- `transmissions`: every delivery copy, receiver, round, coordinates and bytes.
- `receipts`: accepted unique deliveries, with applied candidate intensity.
- `traces`: per-life local/applied input, received IDs, body before/after, action.
- `ledger`, initial/final state hashes, config, graph/world hashes and resultHash.
- `budget.rawDeliveries` and `rawDeliveryPayloadBytes`: pre-dedup transport.
- `budget.deliveries` and `deliveryPayloadBytes`: post-dedup accepted payloads.
- `duplicateDeliveries`: raw minus accepted count. Byte counts exclude network
  headers; duplicate validation still consumes CPU. Equal steps are not equal
  compute or communication cost.

Single and double delivery intentionally have different config, transport logs
and report hashes. Their effective input, receipts, trajectories, final state
and outcomes must match. Replaying the SAME configuration reproduces the
whole result. Retain matching source, world and graph artifacts: hashes alone
do not make a self-contained replay package.

## Validation

```sh
node --test /Users/caonanya/Documents/ChatGPT/immoratalflies/tests/task-protocol-relay.test.mjs
```

Two-life / 32-round tests use a tiny synthetic graph, not MaleCNS capability
validation. They compare all three modes with the unchanged legacy runner,
repeat single/double deliveries, recompute report hashes after JSON round-trip,
reconstruct transport payload bytes and check changed input/behavior vs silence.
Invalid inputs and unique initial collection are covered. The related suite
passed 20/20 at implementation. Historical runtime, receiver and reports remain
unchanged. No larger study, frontend, authentication, cross-run deduplication,
experience promotion or learning is included.
