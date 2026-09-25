import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareGraph } from "../src/brain/graph.mjs";
import { hashBytes, hash } from "../src/brain/codec.mjs";
import { BrainSession } from "../src/brain/session.mjs";
import {
  createHomeSession,
  recordHomeStimulus,
  replayHomeStimulus,
  HOME_STEPS,
} from "../src/home-life-session.mjs";

const base = new URL("../public/data/malecns-circuit/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", base), "utf8"),
);
const metadata = await readFile(new URL(manifest.metadata.path, base));
const binary = await readFile(new URL(manifest.connectivity.path, base));
assert.equal(await hashBytes(metadata), manifest.metadata.sha256);
assert.equal(await hashBytes(binary), manifest.connectivity.sha256);
const graph = prepareGraph(
  JSON.parse(metadata),
  binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength),
);
Object.assign(graph, {
  manifest,
  datasetHash: manifest.connectivity.sha256,
  metadataHash: manifest.metadata.sha256,
});
const now = 1_800_000_000_000;

test("the homepage stimulus uses the measured subgraph, clears the input, and records real responses", async () => {
  const session = createHomeSession(graph);
  assert.deepEqual(session.state.enabledSources, ["environment"]);
  const record = await recordHomeStimulus(session, "light", now);
  assert.equal(record.frames.length, HOME_STEPS + 1);
  assert.equal(session.state.ticks, HOME_STEPS);
  assert.ok(record.frames.some((frame) => frame.spikes.length > 0));
  assert.ok(
    record.frames.every((frame) => frame.spikes.every((i) => i < graph.n)),
  );
  assert.deepEqual(session.state.signal, { food: 0, threat: 0, light: 0 });
  assert.equal(record.events[0].frame.provenance.kind, "simulation");
  assert.equal(record.stateHash, await hash(session.state));
});

test("an independent replay matches all frames without changing the current life", async () => {
  const session = createHomeSession(graph);
  const first = await recordHomeStimulus(session, "food", now);
  const second = await recordHomeStimulus(session, "threat", now + 1);
  const before = await hash(session.state);
  assert.deepEqual(await replayHomeStimulus(graph, first), first.frames);
  assert.deepEqual(await replayHomeStimulus(graph, second), second.frames);
  assert.equal(await hash(session.state), before);
  const restored = await BrainSession.restore(
    await session.checkpoint(),
    graph,
  );
  assert.deepEqual(restored.state, session.state);
});

test("changed recordings and unsupported stimuli are rejected", async () => {
  const session = createHomeSession(graph);
  const record = await recordHomeStimulus(session, "light", now);
  const changed = structuredClone(record);
  changed.frames[1].action = "REST";
  await assert.rejects(replayHomeStimulus(graph, changed), {
    code: "REPLAY_FRAMES",
  });
  await assert.rejects(
    replayHomeStimulus(graph, { ...record, stateHash: `0x${"00".repeat(32)}` }),
    { code: "REPLAY_MISMATCH" },
  );
  const count = session.events.length;
  await assert.rejects(recordHomeStimulus(session, "market", now + 1), {
    code: "HOME_STIMULUS",
  });
  assert.equal(session.events.length, count);
});

test("body presentation and history preserve the recorded response, including no movement", async () => {
  const { projectHomeBody, summarizeHomeRecord } = await import(
    "../src/home-field-state.mjs"
  );
  const session = createHomeSession(graph);
  const light = await recordHomeStimulus(session, "light", now);
  const lightSummary = summarizeHomeRecord(light);
  assert.equal(lightSummary.distance, 0);
  assert.ok(lightSummary.peak > 0);
  const food = await recordHomeStimulus(session, "food", now + 1);
  assert.ok(summarizeHomeRecord(food).distance > 0);
  for (let i = 1; i < food.frames.length; i++) {
    const previous = food.frames[i - 1].body,
      next = food.frames[i].body;
    const a = projectHomeBody(previous),
      b = projectHomeBody(next);
    const recordedDistance = Math.hypot(
      next.x - previous.x,
      next.y - previous.y,
    );
    assert.ok(
      Math.abs(Math.hypot(b.x - a.x, b.y - a.y) * 1800 - recordedDistance) <
        1e-8,
    );
  }
  const source = structuredClone(food);
  summarizeHomeRecord(food);
  assert.deepEqual(food, source);
  const frame = food.frames[6];
  assert.equal(
    projectHomeBody(frame.body).heading,
    (frame.body.heading * Math.PI) / 180 - Math.PI / 2 + 1.02,
  );
});
