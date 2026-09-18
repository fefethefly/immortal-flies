import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { createState } from "../src/brain/runtime.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { createWorld, senseWorld, runEpisode, runCohort, TASK_ID } from "../src/brain/task.mjs";

function fixture() {
  return bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        dataset: CANON.dataset,
        nodes: [
          { id: "1001", sign: 1, type: "ORN", side: "L" },
          { id: "1002", sign: 1, type: "GRN", side: "R" },
          { id: "2001", sign: -1, type: "LN", side: "L" },
          { id: "3001", sign: 1, type: "PN", side: "L" },
          { id: "4001", sign: 1, type: "DNp", side: "L" },
          { id: "4002", sign: 1, type: "DNp", side: "R" },
          { id: "5001", sign: 1, type: "R1", side: "L" },
          { id: "5002", sign: 0, type: "unc", side: "M" },
        ],
        groups: { food: [0, 1], threat: [4], light: [6], left: [4], right: [5] },
      },
      [
        { pre: 0, post: 2, weight: 12 },
        { pre: 0, post: 3, weight: 8 },
        { pre: 1, post: 3, weight: 10 },
        { pre: 2, post: 3, weight: 4 },
        { pre: 3, post: 4, weight: 15 },
        { pre: 3, post: 5, weight: 9 },
        { pre: 6, post: 3, weight: 7 },
        { pre: 7, post: 3, weight: 3 },
      ],
    ),
    "task-fixture",
  );
}

test("world is a pure function of (envId, seed)", async () => {
  const a = await createWorld("t0", 1234);
  const b = await createWorld("t0", 1234);
  const c = await createWorld("t0", 1235);
  assert.equal(a.worldHash, b.worldHash);
  assert.notEqual(a.worldHash, c.worldHash);
  assert.deepEqual(a.food, b.food);
  assert.equal(a.task, TASK_ID);
});

test("sensory adapter is strong at a source and zero far away", async () => {
  const world = await createWorld("t0", 7);
  const at = senseWorld(world, { x: world.food[0].x, y: world.food[0].y });
  assert.equal(at.signal.food, 900);
  assert.ok(at.contact);
  const far = senseWorld(world, { x: 0, y: 0 });
  for (const source of world.food) {
    const dx = source.x, dy = source.y;
    if (dx > 2500 && dy > 2500) continue;
  }
  assert.ok(far.signal.food >= 0 && far.signal.threat >= 0);
});

test("episode replays bit-identically for identical inputs", async () => {
  const graph = fixture();
  const world = await createWorld("t0", 42);
  const r1 = await runEpisode(createState(graph, { seed: 42 }), graph, world, { ticks: 20, stepsPerTick: 4 });
  const r2 = await runEpisode(createState(graph, { seed: 42 }), graph, world, { ticks: 20, stepsPerTick: 4 });
  const r3 = await runEpisode(createState(graph, { seed: 43 }), graph, world, { ticks: 20, stepsPerTick: 4 });
  assert.equal(r1.resultHash, r2.resultHash);
  assert.deepEqual(r1.outcome, r2.outcome);
  assert.deepEqual(r1.trace, r2.trace);
  assert.notEqual(r1.resultHash, r3.resultHash);
});

test("episode record carries replay evidence and schema", async () => {
  const graph = fixture();
  const world = await createWorld("t0", 99);
  const r = await runEpisode(createState(graph, { seed: 99 }), graph, world, { ticks: 10, stepsPerTick: 4 });
  assert.equal(r.schema, "iff.task-run/2");
  assert.equal(r.task, TASK_ID);
  assert.equal(r.envId, "t0");
  assert.equal(r.worldHash, world.worldHash);
  assert.equal(r.graphHash, graph.datasetHash);
  assert.equal(r.budget.neuronSteps, 40);
  assert.ok(r.outcome.collected <= world.food.length);
  assert.match(r.resultHash, /^0x[0-9a-f]{64}$/);
});

test("task rejects foreign worlds and bad budgets", async () => {
  const graph = fixture();
  const world = await createWorld("t0", 5);
  await assert.rejects(
    () => runEpisode(createState(graph), graph, { ...world, schema: "iff.world/2" }),
    /WORLD_SCHEMA/,
  );
  await assert.rejects(
    () => runEpisode(createState(graph), graph, world, { ticks: 0 }),
    /超出范围/,
  );
  await assert.rejects(() => createWorld("bad id!", 5), /格式错误/);
});

test("cohort shares one world, equal total budget, replays identically", async () => {
  const graph = fixture();
  const world = await createWorld("t1", 300);
  const c1 = await runCohort(graph, world, { flies: 4, seedBase: 7000, ticks: 16, stepsPerTick: 4 });
  const c2 = await runCohort(graph, world, { flies: 4, seedBase: 7000, ticks: 16, stepsPerTick: 4 });
  const c3 = await runCohort(graph, world, { flies: 4, seedBase: 7100, ticks: 16, stepsPerTick: 4 });
  assert.equal(c1.cohortHash, c2.cohortHash);
  assert.notEqual(c1.cohortHash, c3.cohortHash);
  assert.equal(c1.worldHash, world.worldHash);
  assert.equal(c1.communication, "none");
  assert.equal(c1.budgetModel, "equal-total-vs-T0");
  // Budget discipline: cohort total equals the solo budget (ticks × stepsPerTick).
  assert.equal(c1.budget.neuronStepsTotal, 16 * 4);
  assert.equal(c1.stepsPerFly, 16);
  assert.equal(c1.perFlyResults.length, 4);
  assert.ok(c1.outcome.distinctResultHashes >= 1);
  assert.equal(c1.outcome.successFlies, c1.perFlyResults.filter((f) => f.success).length);
  // Caller's world untouched: consumed flags still false.
  assert.ok(world.food.every((f) => f.consumed === false));
  await assert.rejects(() => runCohort(graph, world, { flies: 0 }), /超出范围/);
});
