import test from "node:test";
import assert from "node:assert/strict";
import { bindManifest, encodeGraph } from "../src/brain/graph.mjs";
import { createState } from "../src/brain/runtime.mjs";
import { compareVerification } from "../src/life/verify-compare.mjs";

function fixture() {
  return bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        nodes: [
          { id: "a", sign: 1 },
          { id: "b", sign: 1 },
          { id: "c", sign: -1 },
          { id: "d", sign: 1 },
        ],
        groups: { food: [0, 1], threat: [0], light: [1], left: [2], right: [3] },
      },
      [
        { pre: 0, post: 1, weight: 10 },
        { pre: 1, post: 0, weight: 10 },
        { pre: 1, post: 2, weight: 5 },
        { pre: 2, post: 3, weight: 7 },
        { pre: 3, post: 0, weight: 3 },
      ],
    ),
    "verify-compare",
  );
}

test("full replay checks every step; sampling misses unprobed intermediate leaves", async () => {
  const graph = fixture();
  const state = createState(graph, { seed: 43, soulId: "cmp-1", branchId: "sim" });
  const report = await compareVerification(graph, state, {
    steps: 100,
    checkpointEvery: 10,
    leafEvery: 10,
    probeCount: 3,
    inputs: [{ kind: 0, intensity: 400 }],
  });
  assert.equal(report.yield, false);
  assert.equal(report.fullReplay.ok, true);
  assert.equal(report.sampling.ok, true);
  assert.equal(report.recovery.continueMatchesPriorFinal, true);
  assert.equal(report.shape.leafCount, 10);
  assert.equal(report.coverage.finalLeafAlwaysChecked, 1);
  assert.equal(report.coverage.otherLeavesHitBySample + report.coverage.otherLeavesMissed, 9);
  assert.ok(report.coverage.otherLeavesMissed > 0);
  assert.ok(report.sampling.replayedSteps < report.fullReplay.steps);
  assert.ok(report.storage.restorePackBytes < report.storage.trajectoryWithTreeBytes);
  assert.ok(report.storage.samplingOpeningsBytes < report.storage.trajectoryWithTreeBytes);
});
