import test from "node:test";
import assert from "node:assert/strict";
import {
  askFee,
  askProceeds,
  askWei,
  externalAskUrl,
  filterListed,
  formatAsk,
  hasMarketFilters,
  isOpenListing,
  isSelfAsk,
  breedTouchesListing,
  listingForToken,
  listingKey,
  matchListed,
  parseMarketView,
  readListingRow,
  sortListed,
  writeMarketView,
} from "../src/life/market.mjs";
import { withNet } from "../src/life/net.mjs";

const soul = {
  generation: 0,
  phenotype: { hue: { id: "amber" }, eye: { id: "wild" }, mark: { id: "none" } },
};
const later = {
  generation: 1,
  phenotype: { hue: { id: "ink" }, eye: { id: "white" }, mark: { id: "bar" } },
};

test("withNet keeps the testnet flag on market and habitat jumps", () => {
  assert.equal(withNet("/market.html", ""), "/market.html");
  assert.equal(withNet("/market.html?soul=4", "?net=test"), "/market.html?soul=4&net=test");
  assert.equal(withNet("/habitat.html?soul=2", "?net=test"), "/habitat.html?soul=2&net=test");
});

test("listing key keeps chain, collection, token and life apart", () => {
  assert.equal(
    listingKey({
      chainId: 56,
      collection: "0xAbcD000000000000000000000000000000000001",
      tokenId: 2,
      lifeId: "0xAA",
    }),
    "56:0xabcd000000000000000000000000000000000001:2:0xaa",
  );
});

test("open listing ignores zero price and empty seller", () => {
  assert.equal(isOpenListing({ seller: "0x1", price: "0" }), false);
  assert.equal(
    isOpenListing({
      seller: "0x0000000000000000000000000000000000000000",
      price: "1",
    }),
    false,
  );
  assert.equal(isOpenListing({ seller: "0x1", price: "1" }), true);
});

test("search and sort stay on ask fields, not a floor", () => {
  const rows = [
    { seller: "0x1", price: "3", tokenId: 2, listedAt: 1, soul: { givenName: "Moss" } },
    { seller: "0x2", price: "1", tokenId: 9, listedAt: 8, soul: { givenName: "Ember" } },
  ];
  assert.equal(matchListed(rows, "ember")[0].tokenId, 9);
  assert.equal(matchListed(rows, "#2")[0].tokenId, 2);
  assert.equal(sortListed(rows, "price")[0].tokenId, 9);
  assert.equal(sortListed(rows, "new")[0].tokenId, 9);
  assert.equal(listingForToken(rows, 2).price, "3");
  assert.equal(breedTouchesListing({ parentA: 2, parentB: 5 }, 5), true);
  assert.equal(breedTouchesListing({ parentA: 2, parentB: 5 }, 9), false);
});

test("filterListed uses tokenURI traits, not a rarity rank", () => {
  const rows = [
    { seller: "0x1", price: "1", soul },
    { seller: "0x2", price: "2", soul: later },
  ];
  assert.equal(filterListed(rows).length, 2);
  assert.equal(filterListed(rows, { body: "amber" }).length, 1);
  assert.equal(filterListed(rows, { eyes: "white" })[0].soul.generation, 1);
  assert.equal(filterListed(rows, { mark: "none", generation: "0" }).length, 1);
  assert.equal(filterListed(rows, { generation: "1+" }).length, 1);
});

test("ask helpers and Element URL stay mainnet-only", () => {
  assert.equal(formatAsk("2000000000000000"), "0.002");
  assert.equal(askWei("0.001"), 1000000000000000n);
  assert.equal(
    externalAskUrl(56, "0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F", 1),
    "https://element.market/assets/bsc/0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F/1",
  );
  assert.equal(
    externalAskUrl(97, "0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F", 1),
    "",
  );
});

test("ask split and market URL keep net and soul, not a floor", () => {
  assert.equal(askFee("1000000000000000000", 200).toString(), "20000000000000000");
  assert.equal(askProceeds("1000000000000000000", 200).toString(), "980000000000000000");
  assert.equal(isSelfAsk({ seller: "0xAbC" }, "0xabc"), true);
  assert.equal(hasMarketFilters({ query: "moss" }), true);
  assert.equal(hasMarketFilters({}), false);
  const view = parseMarketView("?net=test&soul=4&q=ember&sort=price&gen=0&body=amber");
  assert.deepEqual(view, {
    query: "ember",
    sort: "price",
    body: "amber",
    eyes: "",
    mark: "",
    generation: "0",
  });
  assert.equal(
    writeMarketView(view, "?net=test&soul=4"),
    "?net=test&soul=4&q=ember&sort=price&body=amber&gen=0",
  );
  assert.equal(writeMarketView({ sort: "new" }, "?soul=2"), "?soul=2");
});

test("readListingRow drops empty mapping slots", () => {
  assert.equal(
    readListingRow(3, {
      seller: "0x0000000000000000000000000000000000000000",
      lifeId: "0x01",
      price: 0n,
      listedAt: 0n,
    }),
    null,
  );
  assert.deepEqual(
    readListingRow(3, ["0x1111111111111111111111111111111111111111", "0xab", 5n, 9n]),
    {
      tokenId: 3,
      seller: "0x1111111111111111111111111111111111111111",
      lifeId: "0xab",
      price: "5",
      listedAt: 9,
    },
  );
});
