import test from "node:test";
import assert from "node:assert/strict";
import { seedBook } from "../src/brain/book.mjs";
import { applyLiveMark, repairLiveBooks, resetSharedBook } from "../src/brain/colony.mjs";
import { createMarketFeed, offerObservation, stepMarketFeed } from "../src/brain/flyswarm/market.mjs";
import { START_BNB, equityOf } from "../src/swarm.mjs";
import {
  formatUsd,
  priceAtomsFromUsd,
  saneUsdAtoms,
} from "../src/venue-price.mjs";

const WBNB = 751_050_000;

function paperColony() {
  return {
    market: { price: 11_170, mark: "IFS", quote: "SIM", assetId: null },
    members: [
      { status: "alive", book: seedBook() },
      { status: "alive", book: seedBook() },
    ],
    trades: [{ side: "BUY", amount: 1 }],
  };
}

test("saneUsdAtoms accepts watchlist dollars and rejects wei", () => {
  assert.equal(saneUsdAtoms(WBNB), WBNB);
  assert.equal(saneUsdAtoms(3_500_000_000), 3_500_000_000);
  assert.equal(priceAtomsFromUsd(751.05), WBNB);
  assert.equal(saneUsdAtoms(1_000_000_000_000_000), null);
  assert.equal(priceAtomsFromUsd(1.331e15), null);
  assert.equal(formatUsd(32_201_867_483_530_680), "—");
});

test("first Kyber mark reseeds IFS inventory so hive stays ~$1000/fly", () => {
  const colony = paperColony();
  const ifsToken = colony.members[0].book.token;
  assert.ok(ifsToken > 100_000);
  assert.equal(applyLiveMark(colony, WBNB, { assetId: "WBNB" }), true);
  assert.equal(colony.market.mark, "USD");
  assert.equal(colony.market.price, WBNB);
  assert.equal(colony.trades.length, 0);
  for (const member of colony.members) {
    assert.ok(member.book.token < ifsToken / 10);
    const equity = equityOf(member.book, WBNB);
    assert.ok(equity <= START_BNB * 2);
    assert.ok(equity >= START_BNB / 2);
  }
});

test("already-USD leftover IFS inventory is repaired instead of marked to WBNB", () => {
  const colony = paperColony();
  colony.market.mark = "USD";
  colony.market.price = WBNB;
  colony.market.assetId = "WBNB";
  const blown = equityOf(colony.members[0].book, WBNB);
  assert.ok(blown > START_BNB * 20);
  assert.equal(applyLiveMark(colony, WBNB, { assetId: "WBNB" }), true);
  assert.ok(equityOf(colony.members[0].book, WBNB) <= START_BNB * 2);
  assert.equal(colony.trades.length, 0);
});

test("wei-scale usd never becomes the live mark", () => {
  const colony = paperColony();
  assert.equal(applyLiveMark(colony, 1_331_557_922_770_973), false);
  assert.equal(colony.market.mark, "IFS");
  assert.equal(colony.market.price, 11_170);
});

test("repairLiveBooks reseeds a corrupt USD snapshot", () => {
  const colony = paperColony();
  colony.market.mark = "USD";
  colony.market.price = WBNB;
  assert.equal(repairLiveBooks(colony), true);
  assert.equal(colony.market.mark, "USD");
  assert.ok(equityOf(colony.members[0].book, WBNB) <= START_BNB * 2);
});

test("resetSharedBook lays a $1000 book at the live mark", () => {
  const colony = paperColony();
  applyLiveMark(colony, WBNB, { assetId: "WBNB" });
  colony.members[0].book.bnb = 1;
  colony.trades = [{ side: "SELL", amount: 1 }];
  const reset = resetSharedBook(colony);
  assert.equal(reset.mark, "USD");
  assert.equal(reset.price, WBNB);
  assert.equal(colony.trades.length, 0);
  const equity = equityOf(colony.members[0].book, WBNB);
  assert.ok(equity <= START_BNB * 2);
  assert.ok(equity >= START_BNB / 2);
});

test("aggregator quotes hold the USD price instead of paper-walking it", () => {
  const feed = createMarketFeed();
  offerObservation(feed, {
    payload: { changeBps: 12, activity: 12, assetId: "WBNB", usd: WBNB },
    provenance: {
      kind: "aggregator-quote",
      chainId: 56,
      adapter: "kyberswap",
      src: "0x55d398326f99059fF775485246999027B3197955",
      dst: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      quotedAt: Date.now(),
    },
  });
  const first = stepMarketFeed(feed, { rng: 1, price: 11_170, tick: 1 });
  assert.equal(first.source, "aggregator-quote");
  assert.equal(first.usd, WBNB);
  const held = stepMarketFeed(first.feed, { rng: first.rng, price: WBNB, tick: 2 });
  assert.equal(held.source, "aggregator-hold");
  assert.equal(held.usd, WBNB);
  assert.equal(held.changeBps, 0);
});

test("offerObservation omits wei-scale usd instead of throwing", () => {
  const feed = createMarketFeed();
  const pending = offerObservation(feed, {
    payload: { changeBps: 10, activity: 1, usd: 1_331_557_922_770_973 },
    provenance: { kind: "simulation" },
  });
  assert.equal(pending.payload.usd, undefined);
  assert.equal(pending.payload.changeBps, 10);
});
