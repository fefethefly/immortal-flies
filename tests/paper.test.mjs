import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { createPitSession, stepPit } from "../src/brain/flyswarm/pit.mjs";
import { offerObservation } from "../src/brain/flyswarm/market.mjs";
import { LAYER_IDS, paperLayer, paperLayers } from "../src/brain/flyswarm/layers.mjs";

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
    "paper-fixture",
  );
}

async function makePit(seed = 11) {
  return createPitSession({ seed, graph: fixtureGraph() });
}

test("same seed paper walk is bit-identical", async () => {
  const a = await makePit(2026);
  const b = await makePit(2026);
  await stepPit(a, { compact: false });
  await stepPit(b, { compact: false });
  assert.equal(a.kernel.colony.market.price, b.kernel.colony.market.price);
  assert.equal(a.aux.market.history[0].source, "paper-walk");
});

test("observation queues changeBps and never accepts calldata", async () => {
  const session = await makePit(5);
  const before = session.kernel.colony.market.price;
  assert.throws(
    () => offerObservation(session.aux.market, { changeBps: 10, calldata: "0xdead" }),
    /签名或 calldata/,
  );
  offerObservation(session.aux.market, {
    payload: { changeBps: 800, activity: 10 },
    provenance: { kind: "simulation" },
  });
  await stepPit(session, { compact: false });
  assert.equal(session.aux.market.last.source, "offered-sim");
  assert.ok(session.kernel.colony.market.price !== before);
});

test("P2 layers split colony/intent/risk/execution and expose baseline", async () => {
  const session = await makePit(8);
  for (let i = 0; i < 6; i++) await stepPit(session, { compact: false });
  const layers = paperLayers(session);
  assert.equal(layers.schema, "iff.paper-layers/1");
  for (const id of LAYER_IDS) assert.ok(layers[id]);
  assert.ok(layers.colony.society.status);
  assert.ok(Array.isArray(layers.intent.intents));
  assert.ok(layers.risk.drawdown);
  assert.equal(layers.execution.taxBps, 500);
  assert.equal(layers.baseline.kind, "buy-and-hold");
  assert.ok(layers.baseline.now.holdEquity > 0);
  assert.ok(Number.isInteger(layers.transparency.netCost.total));
  assert.ok("flaggedFills" in layers.transparency.failures);
  const riskOnly = paperLayer(session, "risk");
  assert.equal(riskOnly.layer, "risk");
  assert.ok(riskOnly.risk.aggregate.equity > 0);
});
