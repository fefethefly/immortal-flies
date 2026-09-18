import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BNB_UNIT, TOKEN_UNIT } from "../src/swarm.mjs";
import {
  formatBook,
  formatMarketPrice,
  formatPaperFill,
  hiveBook,
  railMarket,
  sensedAsset,
} from "../src/paper-units.mjs";
import { observationFromQuotes, decorateQuotes } from "../src/venue-quotes.mjs";

const watchlist = JSON.parse(
  readFileSync(
    new URL("../public/token/venue-watchlist.json", import.meta.url),
    "utf8",
  ),
);

const quotes = decorateQuotes({
  schema: "iff.venue/1",
  enabled: true,
  quoteToken: watchlist.quote,
  assets: [
    {
      id: "WBNB",
      symbol: "WBNB",
      address: watchlist.assets[0].address,
      ok: true,
      amountOut: "1666666666666667",
      usd: 600,
      changeBps: 12,
    },
    {
      id: "BTCB",
      symbol: "BTCB",
      address: watchlist.assets[1].address,
      ok: true,
      amountOut: "10000000000000",
      usd: 100000,
      changeBps: 400,
    },
  ],
  focus: { assetId: "BTCB", changeBps: 400, usd: 100000 },
});

test("watchlist is Kyber WBNB/BTCB/ETH and excludes IFS/IFL", () => {
  assert.deepEqual(
    watchlist.assets.map((row) => row.id),
    ["WBNB", "BTCB", "ETH"],
  );
  assert.equal(watchlist.quote.symbol, "USDT");
  assert.ok(
    !watchlist.assets.some((row) => /IFS|IFL/i.test(row.id + row.symbol)),
  );
  assert.match(watchlist.note, /IFS is excluded/i);
});

test("paper fills never print IFL and follow the book mark", () => {
  const buy = { side: "BUY", amount: BNB_UNIT, assetId: null };
  const sell = { side: "SELL", amount: TOKEN_UNIT, assetId: null };
  assert.equal(formatPaperFill(buy, { mark: "IFS" }), "1.0000 BNB");
  assert.equal(formatPaperFill(sell, { mark: "IFS" }), "1.0 IFS");
  assert.equal(
    formatPaperFill(
      { ...buy, amount: 12_000_000, assetId: "WBNB" },
      { mark: "USD", assetId: "WBNB" },
    ),
    "$12.00 USDT",
  );
  assert.equal(
    formatPaperFill(
      { ...sell, assetId: "WBNB" },
      { mark: "USD", assetId: "WBNB" },
    ),
    "1.0 WBNB",
  );
  assert.equal(sensedAsset({ mark: "USD", assetId: "WBNB" }), "WBNB");
  assert.equal(sensedAsset({ mark: "IFS" }), "IFS");
});

test("USD mark is never formatted as a BNB paper price", () => {
  const usd = formatMarketPrice({
    mark: "USD",
    price: 600_000_000,
    assetId: "WBNB",
  });
  assert.equal(usd.text, "$600.00");
  assert.equal(usd.suffix, "WBNB");
  const paper = formatMarketPrice({ mark: "IFS", price: 11_170 });
  assert.equal(paper.suffix, "BNB");
  assert.doesNotMatch(paper.text, /\$/);
});

test("hero rail keeps paper price until the book actually marks USD", () => {
  const paper = railMarket(
    { market: { mark: "IFS", price: 11_170 }, prices: [11_170] },
    quotes,
  );
  assert.equal(paper.kind, "paper");
  assert.equal(paper.loopId, null);
  assert.ok(paper.liveQuotes.length >= 2);
  assert.doesNotMatch(paper.value, /\$/);

  const live = railMarket(
    { market: { mark: "USD", price: 600_000_000, assetId: "WBNB" } },
    quotes,
  );
  assert.equal(live.kind, "usd");
  assert.equal(live.loopId, "WBNB");
  assert.equal(live.symbol, "WBNB");
  assert.equal(live.value, "$600.00");
});

test("Kyber observations pin WBNB, not the jumpy max-change focus", () => {
  const obs = observationFromQuotes(quotes);
  assert.equal(obs.payload.assetId, "WBNB");
  assert.equal(obs.provenance.assetId, "WBNB");
  assert.equal(quotes.focus.assetId, "BTCB");
});

test("hive balance is equity not cash, and PnL stays in the book unit", () => {
  const swarm = {
    market: { mark: "USD", price: 600_000_000, assetId: "WBNB" },
    hive: {
      cash: 650_000_000,
      token: 5833,
      equity: 1_000_000_000,
      vsStart: -12_000_000,
    },
  };
  const book = hiveBook(swarm);
  assert.equal(book.cash + book.inventory, book.equity);
  assert.equal(book.inventory, 350_000_000);
  const shown = formatBook(swarm.market, book);
  assert.equal(shown.equity, "$1,000.00 USDT");
  assert.equal(shown.cash, "$650.00 USDT");
  assert.equal(shown.inventory, "$350.00 USDT");
  assert.match(shown.qty, /WBNB/);
  assert.equal(shown.pnl, "−$12.00 USDT");
  assert.equal(shown.down, true);
  assert.doesNotMatch(shown.equity, /BNB/);

  const blown = formatBook(
    { mark: "USD", assetId: "WBNB" },
    { cash: 0, token: 0, inventory: 0, equity: 32_201_867_483_530_680_000_000, vsStart: 0 },
  );
  assert.equal(blown.equity, "—");

  const paper = formatBook(
    { mark: "IFS" },
    hiveBook({
      market: { mark: "IFS", price: 11_170 },
      hive: {
        cash: 650_000_000,
        token: 300_000,
        equity: 1_000_000_000,
        vsStart: 0,
      },
    }),
  );
  assert.equal(paper.equity, "1.0000 BNB");
  assert.equal(paper.pnl, "0.0000 BNB");
  assert.doesNotMatch(paper.equity, /\$/);
});
