# Protocol replay smoke package / 1

Status: reproducible SIM integration fixture, NOT T3 gain evidence.
Two synthetic neurons, two lives, 32 rounds per arm. Uses the versioned group
runner and receiver. Does not load or modify MaleCNS data, old reports or runtime.

## Verify the delivered package

```sh
node scripts/protocol-replay.mjs verify
```

Default artifact:
`reports/protocol-replay-smoke-v1.json`

To regenerate without overwriting evidence, choose an unused path in an
existing directory:

```sh
node scripts/protocol-replay.mjs build /tmp/protocol-smoke-new.json
node scripts/protocol-replay.mjs verify /tmp/protocol-smoke-new.json
```

Build refuses an existing destination. Verify is read-only. Both require a
matching repository checkout and Node (tested on Node 22), not just the JSON.
No downloaded or embedded code is executed. Ten source files are fingerprinted
before and after work. Current CLI supports only this fixed smoke scenario.

The package embeds graph metadata and edge list, world, seeds, positions,
configuration, all four arm results and summaries. Graph identities are actual
SHA256 hashes of encoded graph bytes and canonical metadata, not fixture marker
hashes. The graph is synthetic and is explicitly NOT an official connectome.
The current graph encoder uses native Uint32 representation; cross-endian
portability is not established. File hashes do not establish authorship.

## Actual result

| Arm | Collected | Changed input frames | Raw deliveries | Accepted | Raw / accepted payload bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| off | 0 | 0 | 0 | 0 | 0 / 0 |
| relay | 0 | 31 | 31 | 31 | 4035 / 4035 |
| duplicate | 0 | 31 | 62 | 31 | 8070 / 4035 |
| scrambled | 0 | 0 | 31 | 31 | 3911 / 3911 |

Every arm executes 64 state steps (256 per complete replay). Single and double
relay produce identical effective traces, accepted receipts and final state.
Receiver ends at (3830,4970), heading 342 under relay, versus (3800,5000),
heading 0 under off/scrambled. This is input/behavior causality, not task gain:
ALL arms collect zero food. The receiver uses engineered scalar input, not a
learned communication policy. No training, confidence gate, identity authority,
experience promotion or external replication is included.

## Validation and frontend use

```sh
node --test tests/protocol-replay.test.mjs
```

Verification does not stop at the outer hash: it reconstructs the graph/world,
executes all four arms, and compares the complete package. Tests reject modified
logs even after the outer hash is recomputed, omitted arms and changed source
maps. Separate CLI processes test export, reload, replay and overwrite refusal.

A future read-only protocol experiment page can use `plan` for the scene,
`runs[arm].traces` for life positions and input, `messages/transmissions/receipts`
for delivery evidence, and `summary` for cost/outcome comparison. Nothing has
been connected to live.html, swarm.html or a browser worker in this change.

Bundle hash:
`0x387e9c965369f942b4e946862e84644c4efb5f9e0a63bb397652e3c0613dbd30`
