import test from "node:test";
import assert from "node:assert/strict";
import { t } from "../src/i18n.mjs";
import { careSoulOf, habitatCareSoul, isOwnedSoul } from "../src/life/habitat-care.mjs";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";
const mine = { tokenId: 1, owner: alice };
const other = { tokenId: 2, owner: bob };
const mine2 = { tokenId: 3, owner: alice };

test("care rail binds to an owned soul only", () => {
  assert.equal(careSoulOf([], alice, mine), null);
  assert.equal(careSoulOf([mine, other], "", mine), null);
  assert.equal(careSoulOf([mine, other], alice, other), mine);
  assert.equal(careSoulOf([mine, mine2, other], alice, mine2), mine2);
  assert.equal(careSoulOf([other], alice, other), null);
  assert.equal(careSoulOf([mine], alice.toUpperCase(), null), mine);
  assert.equal(isOwnedSoul(other, alice), false);
  assert.equal(isOwnedSoul(mine, alice), true);
  assert.equal(
    habitatCareSoul({
      souls: [mine, other],
      wallet: alice,
      selected: other,
      walletReady: false,
    }),
    null,
  );
  assert.equal(
    habitatCareSoul({
      souls: [mine, other],
      wallet: alice,
      selected: other,
      walletReady: true,
    }),
    mine,
  );
  assert.equal(
    habitatCareSoul({
      souls: [other],
      wallet: "",
      selected: other,
      walletReady: true,
    }),
    null,
  );
});

test("habitat care copy is paired and keeps dish energy off mining", () => {
  const keys = [
    "habitat.careKicker",
    "habitat.careTitle",
    "habitat.needWallet",
    "habitat.noMine",
    "habitat.connect",
    "habitat.careWait",
    "habitat.careEnergy",
    "habitat.transferLead",
    "habitat.toHatch",
    "habitat.toMarket",
    "habitat.toHost",
    "habitat.toPerch",
  ];
  for (const key of keys) {
    assert.notEqual(t("en", key), key);
    assert.notEqual(t("zh", key), key);
  }
  assert.match(t("en", "habitat.careEnergy"), /this browser/i);
  assert.match(t("zh", "habitat.careEnergy"), /浏览器/);
  assert.doesNotMatch(t("en", "habitat.careEnergy"), /APY|yield/i);
  assert.match(t("en", "habitat.transferLead"), /NFT/i);
  assert.match(t("zh", "habitat.transferLead"), /NFT/);
});
