import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { hash, hashBytes } from "../src/brain/codec.mjs";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { auditPaths, remapSidesByBodyId, verifySideFile } from "../scripts/audit-direction-paths.mjs";

const SIDES = { food: { left: [0, 1, 2, 5], right: [6] },
  threat: { left: [0], right: [3] } };
function fixture() {
  return bindManifest(encodeGraph({ schema: "iff.connectome/1",
    nodes: [1, -1, 0, 1, 0, 1, 1].map((sign, i) => ({ id: String(100 + i), sign })),
    groups: { food: [0, 1, 2, 5, 6], threat: [0, 3], light: [2], left: [0, 4], right: [3, 4] } },
  [[0, 0, 2], [0, 1, 3], [0, 2, 5], [0, 4, 7], [1, 4, 11],
    [2, 4, 13], [4, 3, 17], [3, 4, 19]].map(([pre, post, weight]) => ({ pre, post, weight }))));
}
const row = (result, s, t, hops) => result.rows.find(r =>
  r.sourceChannel === "food" && r.sourceSide === s && r.targetSide === t && r.hops === hops);

test("exact analytical walks: inhibition, silence, repeats, overlap and disconnected sources", () => {
  const graph = fixture(), before = structuredClone(graph), sides = structuredClone(SIDES);
  const result = auditPaths(graph, sides);
  // One hop LL: 2+7+11+13; signed 2+7-11+0.
  // Two hops LL: 2*2+2*7+3*11+5*13; signed 4+14-33+0.
  // Two hops LR adds 7*17+11*17+13*17 (silent intermediate 4).
  for (const [targetSide, hops, raw, signed, walks, reached] of [
    ["left", 1, 33, -2, 4, 2], ["left", 2, 116, -15, 4, 2],
    ["right", 1, 31, -4, 3, 1], ["right", 2, 639, -19, 6, 2],
  ]) assert.deepEqual(row(result, "left", targetSide, hops), {
    sourceChannel: "food", sourceSide: "left", targetSide, hops, sourceCount: 4, targetCount: 2,
    rawWeightSum: raw, signedWeightSum: signed, walkCount: walks,
    reachableTargetCount: reached, normalizedRawPerSource: raw / 4, meanWeightPerWalk: raw / walks,
  });
  for (const r of result.rows.filter(r => r.sourceChannel === "food" && r.sourceSide === "right")) {
    assert.deepEqual([r.rawWeightSum, r.signedWeightSum, r.walkCount,
      r.reachableTargetCount, r.normalizedRawPerSource], [0, 0, 0, 0, 0]);
  }
  assert.equal(result.overlaps.motorLeftRight, 1);
  assert.deepEqual(result.overlaps.sensoryToMotor.threat, { left: 1, right: 1, either: 2 });
  assert.deepEqual(result.overlaps.annotatedToMotor.food.left, { left: 1, right: 0, either: 1 });
  assert.equal(result.overlaps.groupPairs.food.light, 1);
  assert.deepEqual(graph, before);
  assert.deepEqual(sides, SIDES);
});

test("parallel records count separately; cancellation/silent source do not erase reachability", () => {
  const graph = fixture();
  const edges = [[0, 4, 7], [0, 4, 4], [1, 4, 11], [2, 4, 13]]
    .map(([pre, post, weight]) => ({ pre, post, weight }));
  const r = auditPaths(encodeGraph(graph.metadata, edges), SIDES);
  const direct = row(r, "left", "left", 1);
  assert.deepEqual([direct.rawWeightSum, direct.signedWeightSum, direct.walkCount,
    direct.reachableTargetCount], [35, 0, 4, 1]);
  assert.equal(row(r, "left", "left", 2).walkCount, 0);
  const empty = auditPaths(graph, { food: { left: [], right: [] } });
  assert.ok(empty.rows.every(r => r.normalizedRawPerSource === null && r.walkCount === 0));
});

test("reject malformed indices, groups, signs and CSR, including unreachable bad edges", () => {
  for (const mutate of [
    g => { g.targets[0] = g.n; }, g => { g.weights[0] = 0; },
    g => { g.offsets[1] = g.e + 1; }, g => { g.metadata.nodes[0].sign = 2; },
    g => { g.metadata.groups.left = [0, 0]; }, g => { g.metadata.groups.food = [0, -1]; },
    g => { delete g.metadata.groups.right; }, g => { g.e++; },
  ]) { const g = fixture(); mutate(g); assert.throws(() => auditPaths(g, SIDES)); }
  for (const food of [null, { left: [0] }, { left: [0, 0], right: [6] },
    { left: [0], right: [0] }, { left: [3], right: [6] },
    { left: [0.5], right: [6] }, { left: [7], right: [6] }]) {
    assert.throws(() => auditPaths(fixture(), { food }));
  }
});

test("fail rather than round unsafe accumulated two-hop sums", () => {
  const g = fixture();
  // 96 parallel edges per hop: 9216 products of 999999^2 exceed MAX_SAFE_INTEGER.
  const edges = Array.from({ length: 96 }, () => [
    { pre: 0, post: 1, weight: 999999 }, { pre: 1, post: 4, weight: 999999 },
  ]).flat();
  assert.throws(() => auditPaths(encodeGraph(g.metadata, edges), SIDES),
    { code: "PATH_UNSAFE_INTEGER" });
});
