import test from "node:test";
import assert from "node:assert/strict";
import {
  activityOf,
  applyQuote,
  changeBpsOf,
  createVenueState,
  fetchKyberRoute,
  loadWatchlist,
  observationFromFocus,
  parseRouteSummary,
  pollVenue,
  selectFocus,
  venueView,
} from "../src/brain/flyswarm/venue.mjs";
import { offerObservation, createMarketFeed, stepMarketFeed } from "../src/brain/flyswarm/market.mjs";
import { createAdapters, makeInput, validateInput } from "../src/brain/adapters.mjs";
import { BrainSession } from "../src/brain/session.mjs";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { fillBook, seedBook } from "../src/brain/book.mjs";
import { createVenueService } from "../server/src/venue/service.mjs";
import { createConfig } from "../server/src/config.mjs";

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
    "venue-fixture",
  );
}

function mockRoute(amountOut, amountOutUsd = "100") {
  return {
    data: {
      routeSummary: {
        tokenIn: "0x55d398326f99059fF775485246999027B3197955",
        tokenOut: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        amountIn: "1000000000000000000",
        amountOut: String(amountOut),
        amountOutUsd: String(amountOutUsd),
        gas: "120000",
        gasPrice: "3000000000",
        gasUsd: "0.01",
        extraFee: { feeAmount: "0", chargeFeeBy: "", isInBps: false, feeReceiver: "" },
        route: [],
      },
      routerAddress: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
    },
  };
}

test("watchlist loads WBNB BTCB ETH against USDT", () => {
  const list = loadWatchlist();
  assert.equal(list.chainId, 56);
  assert.equal(list.assets.length, 3);
  assert.ok(list.assets.every((a) => /^0x[0-9a-f]{40}$/i.test(a.address)));
  assert.match(list.quote.address, /^0x55d398/i);
});

test("venue poller defaults on unless explicitly disabled", () => {
  assert.equal(createConfig({}).venue.enabled, true);
  assert.equal(createConfig({ IFF_VENUE_ENABLED: "" }).venue.enabled, true);
  assert.equal(createConfig({ IFF_VENUE_ENABLED: "0" }).venue.enabled, false);
  assert.equal(createConfig({ IFF_VENUE_ENABLED: "false" }).venue.enabled, false);
});

test("changeBps and activity math", () => {
  assert.equal(changeBpsOf("1000", "1100"), 1000);
  assert.equal(changeBpsOf("1000", "900"), -1000);
  assert.equal(changeBpsOf("0", "100"), 0);
  assert.equal(activityOf("100", "110"), 100);
  assert.equal(activityOf("100", "200"), 1000);
});

test("parseRouteSummary rejects calldata fields", () => {
  assert.throws(
    () =>
      parseRouteSummary(
        { amountOut: "1", calldata: "0xdead" },
        { amountIn: "1", assetId: "WBNB" },
      ),
    /calldata|VENUE_FORBIDDEN|must not carry/,
  );
});

test("applyQuote + selectFocus picks largest |bps|", () => {
  const state = createVenueState();
  applyQuote(state, "WBNB", mockRoute("1000000000000000000", "600"), { now: 1000 });
  applyQuote(state, "WBNB", mockRoute("1010000000000000000", "606"), { now: 2000 });
  applyQuote(state, "BTCB", mockRoute("100000000000000", "90000"), { now: 2000 });
  applyQuote(state, "BTCB", mockRoute("105000000000000", "94500"), { now: 3000 });
  applyQuote(state, "ETH", mockRoute("1000000000000000", "3000"), { now: 3000 });
  applyQuote(state, "ETH", mockRoute("1005000000000000", "3015"), { now: 4000 });
  const focus = selectFocus(state.quotes, { now: 4000, staleMs: 15_000 });
  assert.equal(focus.assetId, "BTCB");
  assert.ok(Math.abs(focus.changeBps) > 400);
  assert.equal(focus.usd, state.quotes.BTCB.usd);
  assert.ok(state.quotes.WBNB.usd > 0);
  assert.ok(state.quotes.BTCB.usd > state.quotes.WBNB.usd);
});

test("observationFromFocus feeds aggregator-quote into market-feed", () => {
  const state = createVenueState();
  applyQuote(state, "WBNB", mockRoute("1000000000000000000"), { now: 1 });
  applyQuote(state, "WBNB", mockRoute("1020000000000000000"), { now: 2 });
  const obs = observationFromFocus(state, { now: 2 });
  assert.equal(obs.provenance.kind, "aggregator-quote");
  assert.equal(obs.provenance.adapter, "kyberswap");
  assert.equal(obs.provenance.chainId, 56);
  assert.equal(obs.payload.assetId, "WBNB");
  const feed = createMarketFeed();
  offerObservation(feed, obs);
  const stepped = stepMarketFeed(feed, { rng: 1, price: 11170, tick: 1 });
  assert.equal(stepped.source, "aggregator-quote");
  assert.equal(stepped.assetId, "WBNB");
  assert.equal(stepped.changeBps, obs.payload.changeBps);
});

test("offerObservation rejects calldata on aggregator-quote", () => {
  const feed = createMarketFeed();
  assert.throws(
    () =>
      offerObservation(feed, {
        payload: { changeBps: 10, activity: 1, calldata: "0x01" },
        provenance: {
          kind: "aggregator-quote",
          chainId: 56,
          adapter: "kyberswap",
          src: "0x55d398326f99059fF775485246999027B3197955",
          dst: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
          quotedAt: Date.now(),
        },
      }),
    /calldata|签名/,
  );
});

test("adapters accept aggregator-quote provenance for market", () => {
  const graph = fixtureGraph();
  const session = new BrainSession(graph);
  const now = 1_700_000_000_000;
  const frame = makeInput(
    session.state,
    "market",
    { changeBps: -120, activity: 40 },
    {
      now,
      provenance: {
        kind: "aggregator-quote",
        chainId: 56,
        adapter: "kyberswap",
        src: "0x55d398326f99059fF775485246999027B3197955",
        dst: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        quotedAt: now,
      },
    },
  );
  const value = validateInput(frame, session.state, createAdapters(), now);
  assert.equal(value.threat, 12);
});

test("fillBook tags LIVE quote / SIM fill", () => {
  const book = seedBook();
  const trade = fillBook(
    book,
    11170,
    { side: "BUY", confidence: 40 },
    3,
    1,
    { assetId: "WBNB", mid: 600000, quoteSource: "kyberswap", quote: "LIVE" },
  );
  assert.ok(trade);
  assert.equal(trade.audit, "SIM");
  assert.equal(trade.fill, "SIM");
  assert.equal(trade.quote, "LIVE");
  assert.equal(trade.assetId, "WBNB");
});

test("pollVenue with mock fetch and failure fallback", async () => {
  const state = createVenueState();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (String(url).includes("7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c")) {
      return { ok: false, status: 500, text: async () => "boom" };
    }
    const out = 1_000_000_000_000_000_000n + BigInt(calls) * 10_000_000_000_000_000n;
    return {
      ok: true,
      json: async () => mockRoute(out.toString(), "600"),
    };
  };
  await pollVenue(state, { fetchImpl, now: 10_000, staleMs: 15_000 });
  assert.ok(state.quotes.WBNB.ok);
  assert.equal(state.quotes.BTCB.ok, false);
  const view = venueView(state, { now: 10_000, staleMs: 15_000 });
  assert.equal(view.fill, "SIM");
  assert.equal(view.quote, "LIVE");
  assert.ok(view.assets.some((a) => a.id === "WBNB" && a.ok));
});

test("fetchKyberRoute rejects response with calldata", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      data: {
        routeSummary: { amountOut: "1" },
        data: "0xdeadbeef",
      },
    }),
  });
  await assert.rejects(
    () =>
      fetchKyberRoute({
        tokenIn: "0x55d398326f99059fF775485246999027B3197955",
        tokenOut: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        amountIn: "1000000000000000000",
        fetchImpl,
      }),
    /calldata|VENUE_FORBIDDEN|must not carry/,
  );
});

test("venue service disabled returns empty quotes", () => {
  const venue = createVenueService({
    config: { venue: { enabled: false } },
    logger: { info() {}, warn() {} },
  });
  const q = venue.getQuotes();
  assert.equal(q.enabled, false);
  assert.equal(q.fill, "SIM");
});

test("venue service polls and exposes observation", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    const out = (1_000_000_000_000_000_000n + BigInt(n) * 20_000_000_000_000_000n).toString();
    return { ok: true, json: async () => mockRoute(out, "610") };
  };
  const venue = createVenueService({
    config: {
      venue: {
        enabled: true,
        pollMs: 60_000,
        staleMs: 15_000,
        clientId: "test",
      },
    },
    logger: { info() {}, warn() {} },
    fetchImpl,
  });
  await venue.refresh();
  await venue.refresh();
  const quotes = venue.getQuotes();
  assert.equal(quotes.enabled, true);
  assert.ok(quotes.focus || quotes.assets.some((a) => a.ok));
  const obs = await venue.observationForTick();
  // second poll establishes changeBps; may still be 0 on first pair if all fresh same — focus exists
  if (obs) {
    assert.equal(obs.provenance.kind, "aggregator-quote");
    assert.ok(!("calldata" in obs) && !("calldata" in (obs.payload || {})));
  }
  venue.stop();
});
