import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { diagnoseDirectionNeural } from "../scripts/diagnose-direction-neural.mjs";
import { hash, hashBytes } from "../src/brain/codec.mjs";

function fixture() {
  return bindManifest(encodeGraph({ schema: "iff.connectome/1",
    nodes: [{ id: "fl", sign: 1 }, { id: "fr", sign: 1 }, { id: "ml", sign: 1 }, { id: "mr", sign: 1 }],
    groups: { food: [0, 1], threat: [0], light: [1], left: [2], right: [3] } },
  [{ pre: 0, post: 2, weight: 10 }, { pre: 1, post: 3, weight: 10 }]), "direction-neural-test");
}
const SIDES = { food: { left: [0], right: [1] }, threat: { left: [0], right: [1] } };

test("direction neural: side-routed drive differentiates states in the unmodified kernel", async () => {
  const graph = fixture(), before = [...graph.weights], sides = structuredClone(SIDES);
  const r = await diagnoseDirectionNeural(graph, { sideGroups: sides, seed: 7, steps: 6, distance: 600 });
  assert.equal(r.checks.leftRightDivergent, true);
  assert.equal(r.checks.aheadBehindIdentical, true);
  assert.equal(r.checks.aheadEqualsEmpty, true);
  assert.equal(r.checks.legacyIdentical, true);
  assert.deepEqual(r.rows.right.plan.food,
    { channel: "food", stimulated: true, drive: 576, side: "right", left: [], right: [1] });
  assert.equal(r.rows.right.trace[0].signal.food, 576);
  assert.ok(r.rows.right.trace.some((t) => t.spikes.includes(1)));
  assert.ok(r.rows.left.trace.some((t) => t.spikes.includes(0)));
  assert.ok(r.rows.ahead.trace.every((t) => t.spikes.length === 0));
  // Legacy path injects the SAME intensity for all four directions (the original bottleneck).
  assert.equal(r.rows.ahead.legacyTrace[0].signal.food, 576);
  assert.equal(r.rows.left.legacyTrace[0].signal.food, 576);
  assert.equal(r.rows.left.legacyTrace[0].signal.food, r.rows.right.legacyTrace[0].signal.food);
  assert.deepEqual([...graph.weights], before);
  assert.deepEqual(sides, SIDES);
  assert.deepEqual(await diagnoseDirectionNeural(graph, { sideGroups: sides, seed: 7, steps: 6, distance: 600 }), r);
});

test("direction neural: motor asymmetry stays observational, no directional motor injection", async () => {
  const graph = fixture();
  const r = await diagnoseDirectionNeural(graph, { sideGroups: SIDES, seed: 7, steps: 6, distance: 600 });
  for (const row of Object.values(r.rows)) {
    for (const entry of row.trace) {
      assert.deepEqual(Object.keys(entry.motor).sort(), ["action", "left", "right", "turn"]);
      assert.deepEqual(entry.motor.left, 0);
      assert.deepEqual(entry.motor.right, 0);
    }
  }
});

test("direction neural: reject invalid budgets, distances and routing groups", async () => {
  for (const config of [{ steps: 0 }, { steps: 129 }, { distance: 400 }, { distance: 1000 },
    { seed: 0 }, { sideGroups: null }, { sideGroups: { food: { left: [0] } } }]) {
    await assert.rejects(diagnoseDirectionNeural(fixture(), { sideGroups: SIDES, ...config }));
  }
});

test("direction neural: committed 20-seed report matches current kernel fingerprints", async () => {
  const root = new URL("../", import.meta.url);
  const file = new URL("reports/direction-neural-probe-v1.json", root);
  if (!existsSync(file)) return;
  const report = JSON.parse(await readFile(file, "utf8"));
  const { reportHash, ...payload } = report;
  assert.equal(await hash(payload), reportHash);
  assert.deepEqual(report.summary,
    { probes: 20, leftRightDivergent: 20, forwardUnrepresented: 20, legacyIdentical: 20 });
  for (const [path, expected] of Object.entries(report.sources)) {
    assert.equal(await hashBytes(await readFile(new URL(path, root))), expected, path);
  }
  const sideGroups = JSON.parse(await readFile(new URL("reports/side-groups.json", root), "utf8"));
  const { reportHash: sgHash, ...sgPayload } = sideGroups;
  assert.equal(await hash(sgPayload), sgHash);
  assert.equal(report.sideGroupsHash, sgHash);
  assert.deepEqual(sideGroups.counts.food, { left: 23, right: 57, unknownSide: 0 });
  assert.deepEqual(sideGroups.counts.threat, { left: 42, right: 37, unknownSide: 1 });
  for (const probe of report.probes) {
    assert.equal(probe.checks.leftRightDivergent, true);
    assert.equal(probe.checks.aheadBehindIdentical, true);
    assert.equal(probe.checks.legacyIdentical, true);
    assert.ok(probe.rows.right.plan.food.drive > 0);
    assert.equal(probe.rows.ahead.plan.food.stimulated, false);
    const { worldHash, ...world } = probe.rows.right.world;
    assert.equal(await hash(world), worldHash);
  }
});
