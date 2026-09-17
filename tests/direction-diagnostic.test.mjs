import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { diagnoseDirection } from "../scripts/diagnose-direction.mjs";

function fixture() {
  return bindManifest(encodeGraph({ schema: "iff.connectome/1",
    nodes: [{ id: "a", sign: 1 }, { id: "b", sign: 1 }],
    groups: { food: [0, 1], threat: [0], light: [1], left: [0], right: [1] } },
  [{ pre: 0, post: 1, weight: 10 }, { pre: 1, post: 0, weight: 10 }]), "direction-test");
}

test("direction: coordinates differ, instantaneous scalars and open-loop neural states do not", async () => {
  const graph = fixture(), before = [...graph.weights];
  const r = await diagnoseDirection(graph);
  assert.equal(r.checks.distinctCoordinateObservations, 4);
  assert.equal(r.checks.sameLocalSignal, true);
  assert.equal(r.checks.sameLegacySignal, true);
  assert.equal(r.checks.sameOpenLoopStatesAndMotor, true);
  assert.equal(r.checks.anyMovement, true);
  assert.equal(r.checks.sameClosedLoopTrace, false);
  for (const row of r.rows) {
    assert.equal(row.localSignal.food, 576);
    assert.equal(row.legacySignal.food, 684);
    assert.equal(row.openTrace.length, 8);
    assert.match(row.openTrace[0].spikesHash, /^0x[0-9a-f]{64}$/);
    assert.match(row.openTrace[0].voltageHash, /^0x[0-9a-f]{64}$/);
    const f = row.world.food[0];
    assert.equal((f.x - 5000) ** 2 + (f.y - 5000) ** 2, 600 ** 2);
    assert.deepEqual(row.closedTrace[0].input, row.localSignal);
    assert.equal(row.closedTrace[0].stateHash, row.openTrace[0].stateHash);
  }
  assert.deepEqual(await diagnoseDirection(graph), r);
  assert.deepEqual([...graph.weights], before);
});

test("direction: reject invalid probe budgets and out-of-scope radii", async () => {
  for (const config of [{ steps: 0 }, { steps: 129 }, { distance: 400 }, { distance: 1000 }, { seed: 0 }]) {
    await assert.rejects(diagnoseDirection(fixture(), config));
  }
});
