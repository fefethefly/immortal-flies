import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { usdPerToken, formatUsd, formatBpsPct } from "../src/venue-price.mjs";
import {
  decorateQuotes,
  headlineAsset,
  loadVenueQuotes,
  observationFromQuotes,
} from "../src/venue-quotes.mjs";

const watchlist = JSON.parse(
  readFileSync(
    new URL("../public/token/venue-watchlist.json", import.meta.url),
    "utf8",
  ),
);

const OUT = {
  WBNB: "1666666666666667",
  BTCB: "10000000000000",
  ETH: "285714285714286",
};

function kyberBody(amountOut) {
  return {
    data: {
      routeSummary: {
        amountOut: String(amountOut),
        amountOutUsd: "1",
      },
    },
  };
}

function mockFetch({ server = null, kyber = true } = {}) {
  return async (url) => {
    const href = String(url);
    if (href.includes("/v1/venue/quotes")) {
      if (server instanceof Error) throw server;
      if (server == null) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => server };
    }
    if (href.includes("/token/venue-watchlist.json")) {
      return { ok: true, status: 200, json: async () => watchlist };
    }
    if (href.includes("aggregator-api.kyberswap.com")) {
      if (!kyber) return { ok: false, status: 503, json: async () => ({}) };
      const parsed = new URL(href);
      const tokenOut = parsed.searchParams.get("tokenOut")?.toLowerCase();
      const asset = watchlist.assets.find(
        (a) => a.address.toLowerCase() === tokenOut,
      );
      return {
        ok: true,
        status: 200,
        json: async () => kyberBody(OUT[asset?.id] || "1"),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test("usdPerToken is USDT per 1 asset", () => {
  assert.equal(usdPerToken("0"), null);
  const bnb = usdPerToken(OUT.WBNB);
  assert.ok(bnb > 590 && bnb < 610);
  assert.equal(usdPerToken(OUT.BTCB), 100000);
  assert.match(formatUsd(612.34), /^\$612\.34$/);
  assert.match(formatUsd(95000.5), /95,000/);
  assert.equal(formatBpsPct(123), "+1.23%");
  assert.equal(formatBpsPct(-50), "-0.50%");
});

test("decorateQuotes fills usd and headline prefers WBNB", () => {
  const quotes = decorateQuotes({
    schema: "iff.venue/1",
    enabled: true,
    quoteToken: watchlist.quote,
    assets: [
      {
        id: "BTCB",
        symbol: "BTCB",
        ok: true,
        amountOut: OUT.BTCB,
        changeBps: 400,
      },
      {
        id: "WBNB",
        symbol: "WBNB",
        ok: true,
        amountOut: OUT.WBNB,
        changeBps: 10,
      },
    ],
    focus: { assetId: "BTCB", changeBps: 400 },
  });
  assert.equal(quotes.source, "server");
  assert.ok(quotes.assets.find((a) => a.id === "WBNB").usd > 500);
  assert.equal(quotes.assets.find((a) => a.id === "BTCB").usd, 100000);
  assert.equal(headlineAsset(quotes).id, "WBNB");
  assert.match(formatUsd(headlineAsset(quotes).usd), /^\$/);
});

test("loadVenueQuotes falls back to Kyber when /v1 is missing", async () => {
  const quotes = await loadVenueQuotes({ fetchImpl: mockFetch() });
  assert.equal(quotes.source, "kyber");
  assert.equal(quotes.enabled, true);
  assert.equal(quotes.fill, "SIM");
  assert.equal(quotes.quote, "LIVE");
  assert.equal(quotes.assets.length, 3);
  assert.ok(quotes.assets.every((a) => a.ok && a.usd > 0));
  const obs = observationFromQuotes(quotes);
  assert.equal(obs.provenance.kind, "aggregator-quote");
  assert.equal(obs.provenance.fill, "SIM");
  assert.ok(obs.payload.assetId);
  assert.equal(quotes.focus.assetId, obs.payload.assetId);
});

test("loadVenueQuotes uses live server quotes and skips Kyber", async () => {
  let kyberHits = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes("aggregator-api")) kyberHits += 1;
    return mockFetch({
      server: {
        schema: "iff.venue/1",
        enabled: true,
        quoteToken: watchlist.quote,
        focus: { assetId: "ETH", changeBps: 12 },
        assets: [
          {
            id: "WBNB",
            symbol: "WBNB",
            ok: true,
            amountOut: OUT.WBNB,
            usd: 601.25,
            changeBps: 8,
          },
        ],
      },
    })(url);
  };
  const quotes = await loadVenueQuotes({ fetchImpl });
  assert.equal(quotes.source, "server");
  assert.equal(kyberHits, 0);
  assert.equal(headlineAsset(quotes).usd, 601.25);
});

test("disabled server poller still quotes from Kyber", async () => {
  const quotes = await loadVenueQuotes({
    fetchImpl: mockFetch({
      server: { schema: "iff.venue/1", enabled: false, assets: [], focus: null },
    }),
  });
  assert.equal(quotes.source, "kyber");
  assert.equal(quotes.assets.filter((a) => a.ok).length, 3);
});
