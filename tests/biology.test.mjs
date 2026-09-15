import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { encodeGraph, bindManifest, prepareGraph } from "../src/brain/graph.mjs";
import { createState, step } from "../src/brain/runtime.mjs";
import { BrainSession } from "../src/brain/session.mjs";
import { makeInput } from "../src/brain/adapters.mjs";
import { CANON, NOT_CANON } from "../src/brain/canon.mjs";
import { decodeEthology } from "../src/brain/ethology.mjs";
import { decodeFinance, decodeTrade } from "../src/brain/finance.mjs";
import { createColony, tickColony, colonySnapshot } from "../src/brain/colony.mjs";

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
    "biology-fixture",
  );
}

test("canon is adult MaleCNS and larva is explicitly not the organism", () => {
  assert.equal(CANON.dataset, "male-cns:v1.0");
  assert.equal(CANON.officialNeurons, 166700);
  assert.equal(CANON.stage, "adult male");
  assert.ok(NOT_CANON.some((row) => row.id.startsWith("larva-cns")));
});

test("high threat sliders cannot override food and motor spikes", () => {
  const graph = fixture();
  const state = createState(graph);
  state.signal = { food: 0, threat: 1000, light: 0 };
  state.spikes = [0, 5];
  const read = decodeEthology(state, graph);
  assert.equal(read.action, "FORAGE");
  assert.equal(read.threat, 0);
  assert.equal(read.food, 1);
});

test("ethology reads official motor sides, not the stimulus sliders", () => {
  const graph = fixture();
  const state = createState(graph);
  state.spikes = [4];
  const avoid = decodeEthology(state, graph);
  assert.equal(avoid.threat, 1);
  assert.equal(avoid.left, 1);
  assert.equal(avoid.action, "AVOID");
  assert.equal(decodeTrade(avoid.action), "SELL");
  state.spikes = [0, 5];
  const forage = decodeEthology(state, graph);
  assert.equal(forage.food, 1);
  assert.equal(forage.right, 1);
  assert.equal(forage.action, "FORAGE");
  assert.equal(decodeTrade(forage.action), "BUY");
});

test("runtime lastAction follows group spikes after a step", () => {
  const graph = fixture();
  let state = createState(graph);
  state.signal = { food: 0, threat: 1000, light: 0 };
  state = step(state, graph, 8);
  assert.ok(["REST", "FORAGE", "AVOID", "EXPLORE"].includes(state.lastAction));
  assert.equal(state.lastAction, decodeEthology(state, graph).action);
});

test("finance stays outside the connectome and can override by book only", () => {
  const buy = decodeFinance({ action: "FORAGE", left: 4, right: 1 }, { inventoryShare: 10, cashShare: 90 });
  assert.equal(buy.side, "BUY");
  const heavy = decodeFinance({ action: "FORAGE", left: 4, right: 1 }, { inventoryShare: 80, cashShare: 20 });
  assert.equal(heavy.side, "SELL");
  assert.match(heavy.reason, /产品层/);
});

test("colony refuses a larval or unsigned graph", () => {
  const graph = fixture();
  graph.metadata.dataset = "larva-cns:2023";
  assert.throws(() => createColony(graph), /male-cns:v1.0/);
});

test("a MaleCNS colony tick writes ethology then a paper book", async () => {
  const graph = fixture();
  const colony = createColony(graph, { size: 3, seed: 77, stepsPerTick: 4 });
  assert.equal(colony.canon, CANON.dataset);
  await tickColony(colony, { food: 800, threat: 40, light: 200, changeBps: 120 });
  const snap = colonySnapshot(colony);
  assert.equal(snap.members.length, 3);
  for (const row of snap.members) {
    assert.ok(["REST", "FORAGE", "AVOID", "EXPLORE"].includes(row.action));
    assert.ok(["BUY", "SELL", "HOLD"].includes(row.side));
    assert.ok(row.ticks >= 4);
    assert.match(row.soulId, /^colony-/);
  }
});

test("official circuit groups remain MaleCNS body IDs through ethology", async (t) => {
  const root = new URL("../public/data/malecns-circuit/", import.meta.url);
  if (!existsSync(new URL("manifest.json", root))) {
    t.skip("run npm run connectome:prepare first");
    return;
  }
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const meta = JSON.parse(await readFile(new URL(manifest.metadata.path, root), "utf8"));
  const binary = await readFile(new URL(manifest.connectivity.path, root));
  assert.equal(manifest.dataset, CANON.dataset);
  const graph = prepareGraph(meta, binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
  graph.datasetHash = manifest.connectivity.sha256;
  graph.metadataHash = manifest.metadata.sha256;
  graph.manifest = manifest;
  const session = new BrainSession(graph);
  const now = 1_700_000_000_000;
  await session.dispatch({
    type: "input",
    frame: makeInput(session.state, "environment", { food: 820, threat: 60, light: 200 }, { now }),
    acceptedAt: now,
  });
  await session.dispatch({ type: "step", count: 8 });
  const ethology = decodeEthology(session.state, graph);
  assert.equal(session.state.lastAction, ethology.action);
  assert.ok(Number.isInteger(ethology.left) && Number.isInteger(ethology.right));
  assert.match(graph.metadata.nodes[graph.metadata.groups.food[0]].id, /^\d+$/);
});
