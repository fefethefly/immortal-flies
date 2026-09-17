import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { createState } from "../src/brain/runtime.mjs";
import { runClosedLoop, runClosedLoopArm } from "../scripts/run-direction-closed-loop.mjs";
import { hash, hashBytes } from "../src/brain/codec.mjs";

function fixture() {
  return bindManifest(encodeGraph({ schema: "iff.connectome/1",
    nodes: [{ id: "fl", sign: 1 }, { id: "fr", sign: 1 }, { id: "ml", sign: 1 }, { id: "mr", sign: 1 }],
    groups: { food: [0, 1], threat: [0], light: [1], left: [2], right: [3] } },
  [{ pre: 0, post: 2, weight: 10 }, { pre: 1, post: 3, weight: 10 }]), "closed-loop-test");
}
const SIDES = { food: { left: [0], right: [1] }, threat: { left: [0], right: [1] } };
const world = (dx, dy = 0) => ({ schema: "iff.world/1", task: "forage-v1", envId: "t",
  size: 10000, pickupRadius: 400, senseRadius: 2500,
  food: [{ x: 5000 + dx, y: 5000 + dy, consumed: false }], threats: [],
  worldHash: "0x" + "0".repeat(64) });

test("closed loop: documented routing semantics (right/left drive, ahead silent)", async () => {
  const graph = fixture(), before = [...graph.weights];
  const startState = await createState(graph, { seed: 7, soulId: "cl", branchId: "test" });
  // RIGHT food: right permille = +1000 -> drive 576 into the right sensory neuron.
  const right = await runClosedLoopArm(graph, world(0, 600), startState, { rounds: 8, sides: SIDES });
  assert.equal(right.trace[0].round, 0);
  assert.equal(right.trace[1].signal.food, 576);
  assert.equal(right.trace[1].sense.right, 1000);
  assert.equal(right.trace.some((t) => t.action === "EXPLORE"), true);
  // LEFT food: mirror case; drive is a magnitude (|right| x intensity), the
  // signed component lives in sense.right = -1000, side routing carries left.
  const left = await runClosedLoopArm(graph, world(0, -600), startState, { rounds: 8, sides: SIDES });
  assert.equal(left.trace[1].signal.food, 576);
  assert.equal(left.trace[1].sense.right, -1000);
  // AHEAD food: forward is never routed -> drive 0 every round (documented limit).
  const ahead = await runClosedLoopArm(graph, world(600, 0), startState, { rounds: 8, sides: SIDES });
  assert.equal(ahead.trace[0].sense.forward, 1000);
  assert.ok(ahead.trace.every((t) => t.signal.food === 0));
  // Legacy injects the same scalar regardless of direction -> different outcome.
  const legacy = await runClosedLoopArm(graph, world(0, 600), startState, { rounds: 8 });
  assert.equal(legacy.trace[1].signal.food, 576);
  assert.notEqual(await hash(right.finalState), await hash(legacy.finalState));
  assert.deepEqual([...graph.weights], before);
  const replay = await runClosedLoopArm(graph, world(0, 600), startState, { rounds: 8, sides: SIDES });
  assert.equal(await hash(replay.finalState), await hash(right.finalState));
  const batch = await runClosedLoop(graph, SIDES, { seedCount: 1, seedBase: 7, rounds: 8 });
  assert.equal(batch[0].replayMatchesDirectional, true);
  assert.equal(new Set(Object.values(batch[0].finalStateHashes)).size >= 2, true);
});

test("closed loop: invalid inputs are rejected", async () => {
  const graph = fixture();
  const startState = await createState(graph, { seed: 7, soulId: "cl2", branchId: "test" });
  await assert.rejects(runClosedLoopArm(graph, world(0, 600), startState, { rounds: 0, sides: SIDES }));
  await assert.rejects(runClosedLoopArm(graph, world(600), startState,
    { rounds: 8, sides: { food: { left: [7], right: [7] } } }));
  await assert.rejects(runClosedLoop(graph, SIDES, { seedCount: 0, rounds: 8 }));
});

test("closed loop: committed 20-seed report is self-consistent", async () => {
  const root = new URL("../", import.meta.url);
  const file = new URL("reports/direction-closed-loop-v1.json", root);
  if (!existsSync(file)) return;
  const report = JSON.parse(await readFile(file, "utf8"));
  const { reportHash, ...payload } = report;
  assert.equal(await hash(payload), reportHash);
  assert.equal(report.summary.seeds, 20);
  assert.equal(report.summary.replaysMatched, 20);
  assert.equal(report.config.seedCount, 20);
  for (const [path, expected] of Object.entries(report.sources)) {
    assert.equal(await hashBytes(await readFile(new URL(path, root))), expected, path);
  }
});
