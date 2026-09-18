import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { createWorld } from "../src/brain/task.mjs";
import { hash } from "../src/brain/codec.mjs";
import { runLocalRelay, observeLocal } from "../src/brain/task-local-relay.mjs";

function graph() {
  return bindManifest(encodeGraph({ schema: "iff.connectome/1", nodes: [{ id: "a", sign: 1 }, { id: "b", sign: 1 }],
    groups: { food: [0,1], threat: [0], light: [1], left: [0], right: [1] } },
  [{ pre: 0, post: 1, weight: 10 }, { pre: 1, post: 0, weight: 10 }]), "local-test");
}
async function world() {
  const w = await createWorld("local-test", 43, { foodCount: 1, threatCount: 0 });
  w.food = [{ x: 5600, y: 5000, consumed: false }];
  const { worldHash, ...payload } = w;
  w.worldHash = await hash(payload);
  return w;
}
const options = { flies: 2, seedBase: 43, rounds: 4, positions: [{ x: 5000, y: 5000 }, { x: 3800, y: 5000 }] };

test("local relay: actual unseen information arrives one round later, not via oracle", async () => {
  const g = graph(), w = await world(), original = structuredClone(w), weights = [...g.weights];
  assert.equal(observeLocal(w, options.positions[1]).signal.food, 0);
  const off = await runLocalRelay(g, w, { ...options, mode: "off" });
  const relay = await runLocalRelay(g, w, { ...options, mode: "relay" });
  const scrambled = await runLocalRelay(g, w, { ...options, mode: "scrambled" });
  assert.deepEqual(off.initialStateHashes, relay.initialStateHashes);
  assert.deepEqual(relay.initialStateHashes, scrambled.initialStateHashes);
  assert.ok(relay.traces.filter(t => t.round === 1).every(t => t.received.length === 0 && !t.changed));
  const target = relay.traces.find(t => t.round === 2 && t.fly === 1);
  assert.equal(target.own.food, 0);
  assert.ok(target.applied.food > 0);
  assert.equal(scrambled.traces.find(t => t.round === 2 && t.fly === 1).applied.food, 0);
  assert.equal(off.budget.messages, 0);
  for (const r of [off, relay, scrambled]) {
    assert.equal(r.budget.executedSteps, 8);
    assert.ok(r.budget.messages <= r.budget.messageLimit);
    assert.equal(new Set(r.ledger.map(l => l.index)).size, r.outcome.collected);
    const { resultHash, ...payload } = r;
    assert.equal(await hash(payload), resultHash);
  }
  for (const receipt of relay.receipts) {
    const m = relay.messages.find(m => m.id === receipt.messageId);
    assert.equal(receipt.round, m.observedRound + 1);
    assert.notEqual(receipt.to, m.from);
    assert.ok((m.x - m.observer.x) ** 2 + (m.y - m.observer.y) ** 2 < 1000 ** 2);
  }
  assert.deepEqual(await runLocalRelay(g, w, { ...options, mode: "relay" }), relay);
  assert.deepEqual(w, original); assert.deepEqual([...g.weights], weights);
});

test("local relay: initial pickup unique, missing sources never broadcast", async () => {
  const g = graph(), w = await world();
  const starts = [{ x: 5600, y: 5000 }, { x: 5600, y: 5000 }];
  const r = await runLocalRelay(g, w, { ...options, positions: starts, mode: "relay" });
  assert.equal(r.outcome.initialCollected, 1);
  assert.equal(r.outcome.collected, 1);
  assert.equal(r.budget.messages, 0);
  const silent = await runLocalRelay(g, w, { ...options, positions: [{ x: 0, y: 0 }, { x: 0, y: 0 }], mode: "relay" });
  assert.equal(silent.budget.messages, 0);
  assert.equal(silent.outcome.changedInputs, 0);
});

test("local relay rejects invalid configurations and tampered worlds", async () => {
  const g = graph(), w = await world();
  for (const bad of [{ mode: "unknown" }, { rounds: 0 }, { flies: 0 }, { positions: [] }, { seedBase: 0 }]) {
    await assert.rejects(runLocalRelay(g, w, { ...options, ...bad }));
  }
  await assert.rejects(runLocalRelay(g, { ...w, worldHash: "bad" }, options), { code: "WORLD_HASH" });
});
