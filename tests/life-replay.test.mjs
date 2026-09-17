import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import {
  buildLifeArchive,
  verifyLifeArchive,
} from "../src/life/replay.mjs";
import { lifeId } from "../src/life/identity.mjs";

function fixtureGraph() {
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
    "life-replay-fixture",
  );
}

test("ordered journal inputs replay to a stable archive", async () => {
  const graph = fixtureGraph();
  const identity = {
    life: lifeId(31337, "0x2222222222222222222222222222222222222222", 1),
    seed: 43,
  };
  const inputs = [
    { index: 1, kind: 0, intensity: 400 },
    { index: 2, kind: 2, intensity: 200 },
  ];
  const archive = await buildLifeArchive(graph, identity, inputs);
  assert.equal(archive.payload.schema, "ifs.life-archive/1");
  assert.match(archive.sha256, /^0x[0-9a-f]{64}$/);
  await verifyLifeArchive(graph, archive, identity, inputs);
});

test("replay rejects skipped or mutated inputs", async () => {
  const graph = fixtureGraph();
  const identity = {
    life: lifeId(31337, "0x2222222222222222222222222222222222222222", 1),
    seed: 43,
  };
  const inputs = [{ index: 1, kind: 0, intensity: 400 }];
  const archive = await buildLifeArchive(graph, identity, inputs);
  await assert.rejects(
    () =>
      verifyLifeArchive(graph, archive, identity, [
        { index: 2, kind: 0, intensity: 400 },
      ]),
    /unordered|differ/i,
  );
  await assert.rejects(
    () =>
      verifyLifeArchive(
        graph,
        { ...archive, sha256: archive.stateRoot },
        identity,
        inputs,
      ),
    /integrity/i,
  );
});
