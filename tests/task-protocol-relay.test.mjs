import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { hash, canonical } from "../src/brain/codec.mjs";
import { runLocalRelay } from "../src/brain/task-local-relay.mjs";
import { runProtocolRelay } from "../src/brain/task-protocol-relay.mjs";

async function fixture() {
  const graph = bindManifest(encodeGraph({ schema: "iff.connectome/1",
    nodes: [{ id: "a", sign: 1 }, { id: "b", sign: 1 }],
    groups: { food: [0, 1], threat: [0], light: [1], left: [0], right: [1] },
  }, [{ pre: 0, post: 1, weight: 10 }, { pre: 1, post: 0, weight: 10 }]), "protocol-test");
  const payload = { schema: "iff.world/1", task: "forage-v1", size: 10000,
    envId: "protocol-test", seed: 43, food: [{ x: 5600, y: 5000, consumed: false }], threats: [] };
  return { graph, world: { ...payload, worldHash: await hash(payload) } };
}
const options = { flies: 2, seedBase: 43, rounds: 32,
  positions: [{ x: 5000, y: 5000 }, { x: 3800, y: 5000 }] };

test("protocol runner: legacy compatibility, duplicate-neutral behavior, raw costs and replay", async () => {
  const { graph, world } = await fixture();
  const before = structuredClone({ graph, world, options });
  const runs = {};
  for (const mode of ["off", "relay", "scrambled"]) {
    const single = await runProtocolRelay(graph, world, { ...options, mode });
    const duplicate = await runProtocolRelay(graph, world, { ...options, mode, deliveryCopies: 2 });
    const legacy = await runLocalRelay(graph, world, { ...options, mode });
    for (const key of ["initialStateHashes", "finalStateHashes", "messages", "receipts", "traces", "ledger", "outcome"]) {
      assert.deepEqual(single[key], legacy[key], `${mode} legacy ${key}`);
      assert.deepEqual(single[key], duplicate[key], `${mode} duplicate ${key}`);
    }
    assert.equal(single.budget.executedSteps, 64);
    for (const [key, value] of Object.entries(legacy.budget)) assert.equal(single.budget[key], value, key);
    assert.equal(duplicate.budget.rawDeliveries, 2 * single.budget.rawDeliveries);
    assert.equal(duplicate.budget.rawDeliveryPayloadBytes, 2 * single.budget.rawDeliveryPayloadBytes);
    assert.equal(duplicate.budget.deliveryPayloadBytes, single.budget.deliveryPayloadBytes);
    assert.equal(duplicate.budget.duplicateDeliveries, single.budget.deliveries);
    for (const run of [single, duplicate]) {
      assert.deepEqual(await runProtocolRelay(graph, world, run.config), run);
      const saved = JSON.parse(JSON.stringify(run)), { resultHash, ...payload } = saved;
      assert.equal(await hash(payload), resultHash);
      assert.equal(run.transmissions.length, run.budget.rawDeliveries);
      assert.equal(run.transmissions.reduce((n, t) => n + t.payloadBytes, 0), run.budget.rawDeliveryPayloadBytes);
      for (const t of run.transmissions) {
        const source = run.messages.find(m => m.id === t.messageId);
        assert.ok(source); assert.notEqual(source.from, t.to);
        assert.equal(t.round, source.observedRound + 1);
        const delivered = { ...source, x: t.deliveredX, y: t.deliveredY };
        assert.equal(new TextEncoder().encode(canonical(delivered)).byteLength, t.payloadBytes);
      }
    }
    runs[mode] = single;
  }
  assert.equal(runs.relay.traces.find(t => t.round === 2 && t.fly === 1).applied.food, 216);
  assert.equal(runs.off.budget.rawDeliveries, 0);
  assert.equal(runs.scrambled.traces.find(t => t.round === 2 && t.fly === 1).applied.food, 0);
  assert.ok(runs.relay.traces.some((t, i) => canonical(t.after) !== canonical(runs.off.traces[i].after)));
  assert.deepEqual({ graph, world, options }, before);
});

test("protocol runner: rejects invalid inputs; initial collection is unique and sends no stale food", async () => {
  const { graph, world } = await fixture();
  for (const patch of [{ deliveryCopies: 0 }, { deliveryCopies: 3 }, { mode: "bad" }, { rounds: 0 }, { positions: [] }]) {
    await assert.rejects(runProtocolRelay(graph, world, { ...options, ...patch }));
  }
  await assert.rejects(runProtocolRelay(graph, { ...world, worldHash: "bad" }, options), { code: "WORLD_HASH" });
  const run = await runProtocolRelay(graph, world, { ...options, mode: "relay", deliveryCopies: 2,
    positions: [{ x: 5600, y: 5000 }, { x: 5600, y: 5000 }] });
  assert.equal(run.outcome.collected, 1); assert.equal(run.outcome.initialCollected, 1);
  assert.equal(run.messages.length, 0); assert.equal(run.transmissions.length, 0);
});
