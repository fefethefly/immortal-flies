import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encodeDirection } from "../src/brain/task-direction.mjs";
import { observeLocal } from "../src/brain/task-local-relay.mjs";
import { hash, hashBytes } from "../src/brain/codec.mjs";

const body = { x: 5000, y: 5000, heading: 0 };
const encode = (dx, dy, heading = 0) => encodeDirection(
  [{ channel: "food", x: body.x + dx, y: body.y + dy }], { ...body, heading });

test("direction encoding: equal-distance targets produce distinct body-relative vectors", () => {
  const offsets = [[600, 0], [0, -600], [0, 600], [-600, 0]];
  const expected = [[1000, 0], [0, -1000], [0, 1000], [-1000, 0]];
  const vectors = offsets.map(([dx, dy], i) => {
    const world = { food: [{ x: body.x + dx, y: body.y + dy, consumed: false }], threats: [] };
    const before = structuredClone(world);
    const view = observeLocal(world, body);
    const frame = encodeDirection(view.observations, body);
    assert.equal(frame.channels.food.intensity, view.signal.food);
    assert.equal(frame.channels.food.intensity, 576);
    assert.equal(frame.channels.food.directionValid, true);
    assert.deepEqual([frame.channels.food.forward, frame.channels.food.right], expected[i]);
    assert.deepEqual(encodeDirection(view.observations, body), frame);
    assert.deepEqual(world, before);
    return JSON.stringify(frame.channels);
  });
  assert.equal(new Set(vectors).size, 4);
});

test("direction encoding: rotation, mirror and all eight heading bins", () => {
  assert.deepEqual(encode(600, 0), encode(0, 600, 90));
  assert.deepEqual(encode(600, 0), encode(-600, 0, 180));
  assert.deepEqual(encode(600, 0), encode(0, -600, 270));
  const a = encode(300, 400).channels.food, b = encode(300, -400).channels.food;
  assert.equal(a.intensity, b.intensity);
  assert.equal(a.forward, b.forward);
  assert.equal(a.right, -b.right);
  const axes = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  axes.forEach(([x,y], bin) => {
    const frame = encode(x * 300, y * 300, bin * 45);
    assert.equal(frame.channels.food.forward, 1000);
    assert.equal(frame.channels.food.right, 0);
    assert.deepEqual(frame, encode(x * 300, y * 300, bin * 45 + 44));
  });
  assert.notDeepEqual(encode(600, 0, 44), encode(600, 0, 45));
});

test("direction encoding: absent, contact, local boundary and modality semantics", () => {
  const empty = encodeDirection([], body);
  for (const channel of Object.values(empty.channels)) {
    assert.deepEqual(channel, { intensity: 0, directionValid: false, forward: 0, right: 0 });
  }
  assert.deepEqual(encode(0, 0).channels.food,
    { intensity: 900, directionValid: false, forward: 0, right: 0 });
  assert.equal(encode(999, 0).channels.food.intensity, 1);
  const observations = [{ channel: "threat", x: 5000, y: 4400 }, { channel: "food", x: 5600, y: 5000 }];
  const before = structuredClone(observations);
  const frame = encodeDirection(observations, body);
  assert.equal(frame.channels.threat.right, -1000);
  assert.deepEqual(frame.channels.food, encode(600, 0).channels.food);
  assert.deepEqual(observations, before);
  const local = observeLocal({ food: [{ x: 5600, y: 5000, consumed: true }], threats: [] }, body);
  assert.deepEqual(encodeDirection(local.observations, body), empty);
});

test("direction encoding: reject invalid bodies, duplicates and non-local targets", () => {
  for (const heading of [-1, 360, 1.5, NaN]) assert.throws(() => encode(600, 0, heading));
  assert.throws(() => encodeDirection([], null));
  assert.throws(() => encodeDirection([], { ...body, x: -1 }));
  assert.throws(() => encode(1000, 0));
  assert.throws(() => encodeDirection(null, body));
  const observation = { channel: "food", x: 5600, y: 5000 };
  assert.throws(() => encodeDirection([observation, observation], body));
  assert.throws(() => encodeDirection([{ ...observation, channel: "light" }], body));
  assert.throws(() => encodeDirection([{ ...observation, x: Infinity }], body));
});

test("direction encoding: 20 recorded paired seeds retain scalar baseline and distinguish directions", async () => {
  const root = new URL("../", import.meta.url);
  const report = JSON.parse(await readFile(new URL("reports/direction-diagnostic-v2.json", root), "utf8"));
  const { reportHash, ...payload } = report;
  assert.equal(await hash(payload), reportHash);
  assert.equal(report.probes.length, 20);
  for (const [path, expected] of Object.entries(report.sources)) {
    assert.equal(await hashBytes(await readFile(new URL(path, root))), expected, path);
  }
  for (const probe of report.probes) {
    const vectors = [];
    for (const row of probe.rows) {
      const { worldHash, ...world } = row.world;
      assert.equal(await hash(world), worldHash);
      const view = observeLocal(row.world, body);
      assert.deepEqual(view.signal, row.localSignal);
      const frame = encodeDirection(view.observations, body);
      vectors.push(JSON.stringify(frame.channels));
    }
    assert.equal(new Set(vectors).size, 4);
  }
});
