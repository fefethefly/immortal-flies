import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCALE,
  LOCALES,
  readLocale,
  resolveLocale,
  t,
  writeLocale,
} from "../src/i18n.mjs";

test("site default locale is English", () => {
  assert.equal(DEFAULT_LOCALE, "en");
  assert.equal(LOCALES[0], "en");
  assert.equal(readLocale(), "en");
  assert.equal(resolveLocale(undefined), "en");
  assert.equal(resolveLocale(""), "en");
  assert.equal(resolveLocale("fr"), "en");
  assert.equal(resolveLocale("zh"), "zh");
  assert.equal(writeLocale("nope"), "en");
  assert.equal(t("en", "nav.home"), "Home");
  assert.equal(t("xx", "nav.home"), "Home");
});

test("market copy stays paired and does not invent a floor", () => {
  for (const key of [
    "market.priceMoved",
    "market.selfBuy",
    "market.askSplit",
    "market.buySplit",
    "market.deskTransferWarn",
    "market.gen0Sell",
    "market.needBnb",
  ]) {
    assert.notEqual(t("en", key), key);
    assert.notEqual(t("zh", key), key);
  }
  assert.doesNotMatch(t("en", "market.buySplit"), /floor/i);
  assert.doesNotMatch(t("zh", "market.askSplit"), /地板/);
});

test("breed fee copy exists in both locales and does not claim a burn", () => {
  assert.match(t("en", "kin.feeFree"), /No breed fee/);
  assert.match(t("zh", "kin.feeFree"), /没有繁衍费/);
  assert.match(t("en", "kin.feePay", { n: "0.002" }), /0\.002 BNB/);
  assert.match(t("zh", "kin.feePay", { n: "0.002" }), /0\.002 BNB/);
  assert.match(t("en", "kin.buyHeld", { id: 3 }), /not a burn/i);
  assert.match(t("zh", "kin.buyFilled", { id: 3 }), /不是销毁/);
  assert.equal(t("en", "kin.wrongFee"), "Send exactly the current breed fee.");
  assert.match(t("en", "life.testnet"), /testnet/i);
  assert.match(t("zh", "life.testnet"), /测试网/);
});
