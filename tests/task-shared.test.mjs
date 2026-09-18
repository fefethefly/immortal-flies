import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { createState } from "../src/brain/runtime.mjs";
import { hash } from "../src/brain/codec.mjs";
import { createWorld, runEpisode, runSharedCohort } from "../src/brain/task.mjs";

// 01. Inputs: validated immutable world + graph; N independently seeded states.
// 02. Local data: one cloned food ledger, N states, per-fly counters and traces.
// 03. Initial contact settles once at round 0; it is reported separately.
// 04. Each of exactly stepsPerFly rounds observes the same pre-action world.
// 05. Every fly senses each round, then executes exactly one existing LIF step.
// 06. Only after ALL actions settle food contacts and per-fly hazard exposure.
// 07. Each unconsumed food awards one unit; lowest fly index wins contact ties.
// 08. Consumed food disappears for every fly next round; no messages or learning.
// 09. Actual state tick deltas sum to N * stepsPerFly; trace lengths prove this.
// 10. Replays/hash checks are deterministic; input objects and graph stay unchanged.

function fixture() {
  return bindManifest(encodeGraph({
    schema: "iff.connectome/1", dataset: "male-cns:v1.0",
    nodes: [{ id: "a", sign: 1 }, { id: "b", sign: 1 }],
    groups: { food: [0, 1], threat: [0], light: [1], left: [0], right: [1] },
  }, [{ pre: 0, post: 1, weight: 10 }, { pre: 1, post: 0, weight: 10 }]), "shared-test");
}
async function at(foodX = 5000) {
  const world = await createWorld("shared-test", 43, { foodCount: 1, threatCount: 1 });
  world.food = [{ x: foodX, y: 5000, consumed: false }];
  world.threats = [{ x: 5000, y: 5000, consumed: false }];
  const { worldHash, ...payload } = world;
  world.worldHash = await hash(payload);
  return world;
}

test("shared: exactly budgeted steps, same-round observations, no duplicate pickup", async () => {
  const graph = fixture(), world = await at();
  const before = structuredClone(world), weights = Array.from(graph.weights);
  const result = await runSharedCohort(graph, world, { flies: 3, seedBase: 43, stepsPerFly: 4 });
  assert.equal(result.budget.executedSteps, 12);
  assert.equal(result.perFly.reduce((n, fly) => n + fly.executedSteps, 0), 12);
  assert.ok(result.traces.every(trace => trace.length === 4));
  assert.equal(result.outcome.totalCollected, 1);
  assert.equal(result.outcome.initialCollected, 1);
  assert.deepEqual(result.outcome.perFlyCollected, [1, 0, 0]);
  assert.equal(result.ledger[0].round, 0);
  assert.ok(result.traces.every(trace => trace[0].signal.food === 0));
  assert.ok(result.traces.every(trace => trace[0].signal.threat === 900));
  assert.equal(new Set(result.ledger.map(row => row.index)).size, result.ledger.length);
  assert.deepEqual(world, before);
  assert.deepEqual(Array.from(graph.weights), weights);
  const { cohortHash, ...payload } = result;
  assert.equal(await hash(payload), cohortHash);
  assert.deepEqual(await runSharedCohort(graph, world, { flies: 3, seedBase: 43, stepsPerFly: 4 }), result);
});

test("shared: one fly matches solo dynamics and post-step collection", async () => {
  const graph = fixture(), world = await at(5406);
  const shared = await runSharedCohort(graph, world, { flies: 1, seedBase: 43, stepsPerFly: 12 });
  const solo = await runEpisode(createState(graph, { seed: 43 }), graph, world, { ticks: 12, stepsPerTick: 1 });
  assert.deepEqual(shared.perFly[0].body, solo.trace.at(-1).after);
  assert.equal(shared.outcome.totalCollected, solo.outcome.collected);
  assert.equal(shared.outcome.threatExposureSteps, solo.outcome.threatHits);
  assert.deepEqual(shared.traces[0].map(r => r.signal), solo.trace.map(r => r.signal));
  assert.ok(shared.ledger.some(row => row.round > 0));
});

test("shared: rejects altered worlds, unsupported sensing intervals and invalid budgets", async () => {
  const graph = fixture(), world = await at();
  for (const options of [{ flies: 0 }, { stepsPerFly: 0 }, { stepsPerFly: 1.5 }, { seedBase: 0 }, { senseEvery: 6 }]) {
    await assert.rejects(runSharedCohort(graph, world, options));
  }
  await assert.rejects(runSharedCohort(graph, { ...world, worldHash: "bad" }), { code: "WORLD_HASH" });
  const bad = structuredClone(world);
  bad.food[0].x = -1;
  const { worldHash, ...payload } = bad;
  bad.worldHash = await hash(payload);
  await assert.rejects(runSharedCohort(graph, bad));
});
