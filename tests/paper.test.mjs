import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import {
  PIT_STORE,
  bootPitSession,
  createPitSession,
  pitView,
  savePitSession,
  stepPit,
} from "../src/brain/flyswarm/pit.mjs";
import { offerObservation } from "../src/brain/flyswarm/market.mjs";
import { LAYER_IDS, paperLayer, paperLayers } from "../src/brain/flyswarm/layers.mjs";
import { START_BNB, equityOf } from "../src/swarm.mjs";
import { seedBook } from "../src/brain/book.mjs";

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

function memoryStore(start = {}) {
  const data = new Map(Object.entries(start));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
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

test("aggregator-quote observation tags focus asset and keeps SIM fills", async () => {
  const session = await makePit(9);
  offerObservation(session.aux.market, {
    payload: {
      changeBps: -400,
      activity: 80,
      assetId: "ETH",
      mid: 3_000_000,
      usd: 3_500_000_000,
    },
    provenance: {
      kind: "aggregator-quote",
      chainId: 56,
      adapter: "kyberswap",
      src: "0x55d398326f99059fF775485246999027B3197955",
      dst: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
      assetId: "ETH",
      quotedAt: Date.now(),
      quote: "LIVE",
      fill: "SIM",
    },
  });
  await stepPit(session, { compact: false });
  assert.equal(session.aux.market.last.source, "aggregator-quote");
  assert.equal(session.aux.market.last.payload.assetId, "ETH");
  assert.equal(session.kernel.colony.market.mark, "USD");
  assert.equal(session.kernel.colony.market.price, 3_500_000_000);
  const view = pitView(session);
  assert.equal(view.hive.mark, "USD");
  assert.equal(view.hive.assetId, "ETH");
  assert.ok(view.hive.equity > 0);
  assert.ok(view.hive.equity <= 5 * START_BNB * 2);
  await stepPit(session, { compact: false });
  assert.equal(session.kernel.colony.market.price, 3_500_000_000);
  assert.equal(session.aux.market.last.source, "aggregator-hold");
  const layers = paperLayers(session);
  assert.equal(layers.market.quote, "LIVE");
  assert.equal(layers.market.fill, "SIM");
  assert.equal(layers.execution.fill, "SIM");
  const tagged = session.kernel.colony.trades.find((t) => t.assetId === "ETH");
  if (tagged) {
    assert.equal(tagged.fill, "SIM");
    assert.equal(tagged.quote, "LIVE");
  }
  const store = memoryStore({
    [PIT_STORE]: JSON.stringify(savePitSession(session)),
  });
  const boot = await bootPitSession({ store, graph: fixtureGraph() });
  assert.equal(boot.session.kernel.colony.market.mark, "USD");
  assert.equal(
    boot.session.kernel.colony.trades.length,
    session.kernel.colony.trades.length,
  );
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

test("bootPitSession restores a matching snapshot", async () => {
  const graph = fixtureGraph();
  const origin = await createPitSession({ seed: 11, graph });
  const store = memoryStore({
    [PIT_STORE]: JSON.stringify(savePitSession(origin)),
  });
  const boot = await bootPitSession({ store, graph });
  assert.equal(boot.discarded, false);
  assert.equal(boot.session.aux.seed, 11);
  assert.equal(boot.session.kernel.colony.members.length, 5);
});

test("bootPitSession discards an incompatible snapshot and opens a fresh book", async () => {
  const graph = fixtureGraph();
  const store = memoryStore({
    [PIT_STORE]: JSON.stringify({ model: "iff-pit-colony-v1", members: [] }),
  });
  const boot = await bootPitSession({ store, graph, seed: 99 });
  assert.equal(boot.discarded, true);
  assert.equal(store.getItem(PIT_STORE), null);
  assert.equal(boot.session.aux.seed, 99);
  assert.equal(boot.session.kernel.colony.members.length, 5);
});

test("bootPitSession reseeds leftover IFS inventory marked as USD", async () => {
  const graph = fixtureGraph();
  const origin = await createPitSession({ seed: 4, graph });
  const leftover = seedBook();
  for (const member of origin.kernel.colony.members) {
    member.book = structuredClone(leftover);
  }
  origin.kernel.colony.market.mark = "USD";
  origin.kernel.colony.market.price = 751_050_000;
  origin.kernel.colony.market.assetId = "WBNB";
  origin.kernel.colony.trades = [{ side: "BUY", amount: 1 }];
  const store = memoryStore({
    [PIT_STORE]: JSON.stringify(savePitSession(origin)),
  });
  const boot = await bootPitSession({ store, graph });
  const colony = boot.session.kernel.colony;
  assert.equal(colony.market.mark, "USD");
  assert.equal(colony.market.price, 751_050_000);
  assert.equal(colony.trades.length, 0);
  for (const member of colony.members) {
    if (member.status !== "alive") continue;
    const equity = equityOf(member.book, colony.market.price);
    assert.ok(equity <= START_BNB * 2);
    assert.ok(equity >= START_BNB / 2);
  }
});

test("bootPitSession treats corrupt localStorage as a fresh book", async () => {
  const graph = fixtureGraph();
  const store = memoryStore({ [PIT_STORE]: "{not-json" });
  const boot = await bootPitSession({ store, graph, seed: 7 });
  assert.equal(boot.discarded, false);
  assert.equal(boot.session.aux.seed, 7);
});
