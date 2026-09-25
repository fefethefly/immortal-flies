import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  decodeConnectomeOverview,
  createConnectomeOverview,
} from "../src/home-connectome-overview.mjs";
const dataBase = new URL("../public/data/", import.meta.url);
const assetBase = new URL("../public/assets/first-contact/", import.meta.url);
const source = JSON.parse(
  await readFile(new URL("malecns-full/metadata.json", dataBase), "utf8"),
);
const circuit = JSON.parse(
  await readFile(new URL("malecns-circuit/metadata.json", dataBase), "utf8"),
);
const overview = JSON.parse(
  await readFile(new URL("connectome-overview.json", assetBase), "utf8"),
);
const raw = await readFile(new URL("connectome-overview.bin", assetBase));
const mappingRaw = await readFile(
  new URL("connectome-overview-activity.bin", assetBase),
);
const buffer = raw.buffer.slice(
  raw.byteOffset,
  raw.byteOffset + raw.byteLength,
);
const mappingBuffer = mappingRaw.buffer.slice(
  mappingRaw.byteOffset,
  mappingRaw.byteOffset + mappingRaw.byteLength,
);
const data = decodeConnectomeOverview(buffer);
const mapping = new Int32Array(mappingBuffer);
const positioned = source.nodes.filter(
  (node) => node.position?.length === 3 && node.position.every(Number.isFinite),
);

test("overview contains every known source position with no invented neuron positions", () => {
  assert.equal(data.neurons, positioned.length);
  assert.equal(data.neurons, overview.positionedNeurons);
  assert.equal(data.edges, overview.displayedEdges);
  for (let i = 0; i < positioned.length; i += 83)
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(
        Math.abs(
          data.positions[i * 3 + axis] / 32767 - positioned[i].position[axis],
        ) <=
          1 / 32767,
      );
    }
  assert.equal(overview.neurons, source.nodes.length);
});

test("activity map preserves source neuron identities and omits missing positions", () => {
  assert.equal(mapping.length, circuit.nodes.length);
  const ids = new Set(positioned.map((node) => node.id));
  circuit.nodes.forEach((node, i) => {
    if (mapping[i] < 0) assert.ok(!ids.has(node.id));
    else assert.equal(positioned[mapping[i]].id, node.id);
  });
});

test("overview provenance pins both the full graph and the preview metadata", async () => {
  for (const [path, expected] of [
    ["malecns-full/metadata.json", overview.sourceMetadataHash],
    ["malecns-circuit/metadata.json", overview.circuitMetadataHash],
    ["malecns-full/graph.bin", overview.sourceConnectivityHash],
  ]) {
    assert.equal(
      `0x${createHash("sha256")
        .update(await readFile(new URL(path, dataBase)))
        .digest("hex")}`,
      expected,
    );
  }
});

test("full overview lights only recorded subgraph spikes and clears them on the next frame", () => {
  const scene = createConnectomeOverview();
  scene.setData(buffer, mappingBuffer);
  const valid = [...mapping].findIndex((value) => value >= 0);
  const omitted = [...mapping].findIndex((value) => value < 0);
  scene.update({
    alpha: 1,
    pixel: 1,
    frame: { spikes: [valid, omitted, -1, mapping.length] },
  });
  const activity = scene.group.children[0].geometry.attributes.activity.array;
  assert.equal(
    activity.reduce((sum, n) => sum + n, 0),
    1,
  );
  assert.equal(activity[mapping[valid]], 1);
  scene.update({ alpha: 1, pixel: 1, frame: { spikes: [] } });
  assert.ok(activity.every((n) => n === 0));
});

test("truncated overview data is rejected", () => {
  assert.throws(() => decodeConnectomeOverview(buffer.slice(0, 7)));
  assert.throws(() => decodeConnectomeOverview(buffer.slice(0, -1)));
});
