import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { encodeDirection } from "../src/brain/task-direction.mjs";
import { planSideStimulation, DIRECTION_MAPPING } from "../src/brain/task-direction-mapping.mjs";
import { canonical, hashBytes } from "../src/brain/codec.mjs";

const body = { x: 5000, y: 5000, heading: 0 };
const frame = (dx, dy, heading = 0, channel = "food") => encodeDirection(
  [{ channel, x: body.x + dx, y: body.y + dy }], { ...body, heading });
const SIDES = { food: { left: [30, 10], right: [20, 40] }, threat: { left: [50], right: [60] } };

test("side mapping: right/left components route to annotated sides with integer drive", () => {
  const ahead = planSideStimulation(frame(600, 0), SIDES);
  assert.equal(ahead.plan.food.stimulated, false); // forward-only is never routed
  const right = planSideStimulation(frame(0, 600), SIDES).plan.food;
  assert.deepEqual(right, { channel: "food", stimulated: true, drive: 576, side: "right", left: [], right: [20, 40] });
  const left = planSideStimulation(frame(0, -600), SIDES).plan.food;
  assert.deepEqual(left, { channel: "food", stimulated: true, drive: 576, side: "left", left: [10, 30], right: [] });
  const diagonal = frame(300, 400);
  const partial = planSideStimulation(diagonal, SIDES).plan.food;
  assert.equal(partial.side, "right");
  assert.equal(diagonal.channels.food.right, 571); // trunc(1000*400/700)
  assert.equal(diagonal.channels.food.intensity, 675);
  assert.equal(partial.drive, Math.round(571 * 675 / 1000)); // normalized ‰ x intensity
  const threat = planSideStimulation(
    encodeDirection([{ channel: "threat", x: 5000, y: 4400 }], body), SIDES).plan.threat;
  assert.equal(threat.side, "left");
  assert.deepEqual(threat.left, [50]);
  assert.deepEqual(planSideStimulation(frame(0, 600), SIDES).plan.food,
    planSideStimulation(frame(0, 600), SIDES).plan.food);
});

test("side mapping: silent, contact and sub-rounding drives stay unstimulated", () => {
  const silent = planSideStimulation(encodeDirection([], body), SIDES).plan;
  for (const channel of ["food", "threat"]) {
    assert.deepEqual(silent[channel], { channel, stimulated: false, drive: 0, left: [], right: [] });
  }
  assert.equal(planSideStimulation(frame(0, 0), SIDES).plan.food.stimulated, false);
  assert.equal(planSideStimulation(frame(999, -1), SIDES).plan.food.stimulated, false);
  const noDrive = planSideStimulation(frame(600, 0), {
    food: { left: [], right: [] }, threat: { left: [1], right: [2] } });
  assert.equal(noDrive.plan.food.stimulated, false);
});

test("side mapping: validates routing groups eagerly and rejects bad inputs", () => {
  const overlapping = { food: { left: [7], right: [7] }, threat: { left: [1], right: [2] } };
  assert.throws(() => planSideStimulation(frame(0, 600), overlapping), /MAPPING_SIDE_OVERLAP/);
  assert.throws(() => planSideStimulation(encodeDirection([], body), overlapping), /MAPPING_SIDE_OVERLAP/);
  assert.throws(() => planSideStimulation(frame(0, 600), {
    food: { left: [1.5], right: [2] }, threat: { left: [1], right: [2] } }));
  assert.throws(() => planSideStimulation(frame(0, 600), {
    food: { left: [1] }, threat: { left: [1], right: [2] } }), /MAPPING_GROUPS/);
  assert.throws(() => planSideStimulation(frame(0, 600), {
    food: { left: [1], right: [] }, threat: { left: [1], right: [2] } }), /MAPPING_EMPTY_SIDE/);
  assert.throws(() => planSideStimulation({ schema: "iff.input/1" }, SIDES), /MAPPING_FRAME/);
  assert.throws(() => planSideStimulation(frame(0, 600), null), /MAPPING_SIDES/);
  const sides = structuredClone(SIDES), observation = frame(0, 600);
  planSideStimulation(observation, sides);
  assert.deepEqual(sides, SIDES);
  assert.deepEqual(observation, frame(0, 600));
  assert.deepEqual(DIRECTION_MAPPING.unsupported, ["forward", "light"]);
  assert.deepEqual(Object.keys(planSideStimulation(frame(0, 600), SIDES).plan), ["food", "threat"]);
});

test("side mapping: committed audit report matches official annotation evidence", async () => {
  const root = new URL("../", import.meta.url);
  const report = JSON.parse(await readFile(new URL("reports/side-mapping-audit.json", root), "utf8"));
  const { reportHash, ...payload } = report;
  assert.equal(await hashBytes(new TextEncoder().encode(canonical(payload))), reportHash);
  assert.equal(report.audit, "READ-ONLY");
  assert.deepEqual(report.groups.food.sideCounts.rootSide, { L: 23, R: 57 });
  assert.deepEqual(report.groups.food.sideCounts.somaSide, { unknown: 80 });
  assert.deepEqual(report.groups.threat.sideCounts.somaSide, { L: 42, R: 37, unknown: 1 });
  assert.deepEqual(report.groups.light.sideCounts.somaSide, { L: 79, unknown: 1 });
  assert.deepEqual(report.groups.left.sideCounts.somaSide, { L: 90 });
  assert.deepEqual(report.groups.right.sideCounts.somaSide, { R: 90 });
  assert.deepEqual(report.motorOverlap, { food: 0, threat: 64, light: 0, left: 90, right: 90 });
  const manifest = JSON.parse(await readFile(new URL("public/data/malecns-circuit/manifest.json", root), "utf8"));
  assert.deepEqual(report.dataset.manifest.connectivity, manifest.connectivity);
  const feather = new URL("scripts/data/cache/body-annotations-male-cns-v1.0-minconf-0.5.feather", root);
  if (existsSync(feather)) {
    assert.equal(report.annotations.sha256, await hashBytes(new Uint8Array(await readFile(feather))));
  }
});
