import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { createState, step } from "../src/brain/runtime.mjs";
import { observeLocal } from "../src/brain/task-local-relay.mjs";
import { receiveRelayInbox } from "../src/brain/relay-inbox.mjs";
import { canonical } from "../src/brain/codec.mjs";

// Integration harness, not a forage benchmark: fixed food, no pickup/reward,
// no world access by the receiver, and no production/protocol-runner changes.
function fixture() {
  return bindManifest(encodeGraph({ schema: "iff.connectome/1",
    nodes: [{ id: "a", sign: 1 }, { id: "b", sign: 1 }],
    groups: { food: [0, 1], threat: [0], light: [1], left: [0], right: [1] },
  }, [{ pre: 0, post: 1, weight: 10 }, { pre: 1, post: 0, weight: 10 }]), "inbox-integration");
}

function simulate(copies) {
  const graph = fixture();
  const world = { food: [{ x: 5600, y: 5000, consumed: false }], threats: [] };
  const states = [43, 44].map((seed, i) => {
    const s = createState(graph, { seed, soulId: `inbox-${i}`, branchId: "integration" });
    s.body.x = i === 0 ? 5000 : 3800;
    return s;
  });
  const initial = structuredClone(states), trace = [];
  let pending = [], rawDeliveries = 0, rawBytes = 0;
  for (let round = 1; round <= 32; round++) {
    const sensed = states.map(s => observeLocal(world, s.body));
    // Only life 0 broadcasts, isolating the causal effect on life 1.
    const outgoing = round === 32 ? [] : sensed[0].observations.map(o => ({
      id: `${round}:0:${o.channel}`, from: 0, observedRound: round, deliveryRound: round + 1,
      observer: { x: states[0].body.x, y: states[0].body.y }, ...o,
    }));
    const wire = pending.flatMap(m => Array.from({ length: copies }, () => structuredClone(m)));
    rawDeliveries += wire.length;
    rawBytes += wire.reduce((n, m) => n + new TextEncoder().encode(canonical(m)).byteLength, 0);
    const inbox = receiveRelayInbox(wire, {
      to: 1, round, body: states[1].body, own: sensed[1].signal,
    });
    states[0].signal = sensed[0].signal;
    states[1].signal = inbox.applied;
    for (let i = 0; i < 2; i++) states[i] = step(states[i], graph, 1);
    trace.push({ round, own: sensed[1].signal, inbox, states: structuredClone(states) });
    pending = outgoing;
  }
  return { initial, states, trace, rawDeliveries, rawBytes };
}

test("two lives / 64 state steps: duplicate delivery preserves inputs and behavior; silence does not", () => {
  const single = simulate(1), duplicate = simulate(2), silent = simulate(0);
  assert.deepEqual(single.initial, duplicate.initial);
  assert.deepEqual(single.initial, silent.initial);
  assert.deepEqual(single.trace, duplicate.trace);
  assert.deepEqual(single.states, duplicate.states);
  assert.deepEqual(simulate(1), single, "complete deterministic replay");
  assert.ok(single.rawDeliveries > 0);
  assert.equal(duplicate.rawDeliveries, 2 * single.rawDeliveries);
  assert.equal(duplicate.rawBytes, 2 * single.rawBytes);
  assert.equal(silent.rawDeliveries, 0);
  for (const run of [single, duplicate, silent]) {
    assert.equal(run.states.reduce((n, s) => n + s.ticks, 0), 64);
    assert.deepEqual(run.trace[0].inbox.receipts, [], "one-round delay");
    assert.ok(run.trace.every(t => t.own.food === 0), "receiver never observes the food locally");
  }
  assert.ok(single.trace.some(t => t.inbox.applied.food > 0));
  assert.ok(silent.trace.every(t => t.inbox.applied.food === 0 && t.inbox.receipts.length === 0));
  assert.deepEqual(single.states[0], silent.states[0], "sender unaffected by transport");
  const pose = s => [s.body.x, s.body.y, s.body.heading];
  assert.deepEqual(pose(silent.states[1]), pose(silent.initial[1]));
  assert.equal(silent.states[1].body.energy, silent.initial[1].body.energy - 32);
  assert.notDeepEqual(pose(single.states[1]), pose(silent.states[1]), "received input changes bodily behavior");
  assert.ok(single.trace.some((t, i) => canonical(t.states[1].spikes) !== canonical(silent.trace[i].states[1].spikes)), "neural output changes");
  for (const t of single.trace) {
    assert.equal(new Set(t.inbox.receipts.map(r => r.messageId)).size, t.inbox.receipts.length);
  }
});
