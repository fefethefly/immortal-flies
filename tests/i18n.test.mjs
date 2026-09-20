import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCALE,
  LOCALES,
  MESSAGES,
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

test("blueprint swarm copy is paired and does not claim intelligence is live", () => {
  const keys = [
    "blue.swarmTitle",
    "blue.swarmKicker",
    "blue.swarmLead",
    "blue.iface.task",
    "blue.iface.message",
    "blue.iface.learn",
    "blue.iface.pool",
    "blue.iface.identity",
    "blue.honest4",
    "blue.split.meshp",
    "blue.phasesNote",
    "blue.market",
    "public.doorBlueprint",
    "public.laterLead",
    "public.researchLead",
    "public.researchGo",
    "public.footTag",
  ];
  for (const key of keys) {
    assert.notEqual(t("en", key), key);
    assert.notEqual(t("zh", key), key);
  }
  assert.match(t("en", "blue.swarmKicker"), /not implemented/i);
  assert.match(t("zh", "blue.swarmKicker"), /未实现/);
  assert.match(
    t("en", "blue.honest4"),
    /do not say swarm intelligence is achieved/i,
  );
  assert.match(t("zh", "blue.honest4"), /不说群体智能已实现/);
  assert.match(t("en", "blue.split.meshp"), /Mesh is not swarm intelligence/i);
  assert.match(t("zh", "blue.split.meshp"), /托管网不是群体智慧/);
  assert.doesNotMatch(t("en", "blue.vault"), /burned|destroyed/i);
  assert.doesNotMatch(t("zh", "blue.vault"), /已销毁/);
  assert.equal(t("en", "blue.h1"), "Drawn, not shipped.");
  assert.equal(t("zh", "blue.h1"), "画好了，还没上线。");
});

test("homepage public copy is user-facing and does not cite T3/T4", () => {
  const keys = [
    "public.laterLead",
    "public.laterGo",
    "public.researchLead",
    "public.censusNote",
    "public.researchEm",
    "public.doorBlueprint",
    "public.mesh.lead",
    "public.archLead",
    "public.footTag",
    "meta.blueprintDesc",
    "blue.lead",
  ];
  for (const locale of ["en", "zh"]) {
    for (const key of keys) {
      const copy = t(locale, key);
      assert.doesNotMatch(copy, /\bT3\b|\bT4\b/);
      assert.doesNotMatch(copy, /五个可验证接口|verifiable interfaces/i);
      assert.doesNotMatch(copy, /复算包|recomputable/i);
    }
  }
  assert.match(t("zh", "public.researchLead"), /不把这称作已经实现的群体智能/);
  assert.match(
    t("en", "public.researchLead"),
    /do not call this swarm intelligence/i,
  );
  assert.match(t("zh", "public.laterTitle"), /接下来/);
  assert.match(t("en", "public.laterTitle"), /What's next/);
  assert.equal(t("en", "public.footFlap"), "Trade $IFS On Flap");
  assert.equal(t("zh", "public.footFlap"), "在 Flap 交易 $IFS");
  assert.match(t("en", "public.openX"), /Follow on X/);
  assert.match(t("zh", "public.openX"), /关注 X/);
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

test("host copy is paired and does not call the mesh MiningHub", () => {
  const keys = Object.keys(MESSAGES.en).filter((key) =>
    key.startsWith("host."),
  );
  const zh = Object.keys(MESSAGES.zh).filter((key) => key.startsWith("host."));
  assert.deepEqual(new Set(keys), new Set(zh));
  assert.ok(keys.length > 40);
  for (const key of keys) {
    assert.notEqual(t("en", key), key);
    assert.notEqual(t("zh", key), key);
  }
  assert.match(t("en", "host.boundary"), /unchallenged/i);
  assert.match(t("en", "host.policy"), /pay if unchallenged/i);
  assert.match(t("zh", "host.boundary"), /无人挑战/);
  assert.match(t("en", "host.notMesh"), /not this product/i);
  assert.match(t("zh", "host.notMesh"), /不是这个产品/);
  assert.match(t("en", "host.policyArbiter"), /timeout double-loss/i);
  assert.match(t("zh", "host.policyArbiter"), /超时双输/);
  assert.match(t("en", "host.revenue"), /not protocol income/i);
  assert.match(t("zh", "host.revenue"), /不是协议收入/);
  assert.match(t("en", "host.mockIfs"), /not live IFS/i);
  assert.doesNotMatch(t("en", "host.lead"), /APY|yield farming/i);
  assert.equal(t("en", "nav.host"), "Hosting");
  assert.equal(t("zh", "nav.host"), "生命托管");
  assert.equal(t("zh", "host.dash"), "仪表盘");
  assert.match(t("en", "host.wageLead"), /not mining yield/i);
  assert.doesNotMatch(t("en", "host.wage"), /APY/);
  assert.equal(t("zh", "host.okRefresh"), "已刷新。");
  assert.equal(t("en", "host.tank"), "Vial");
  assert.equal(t("zh", "host.tank"), "培养基");
  assert.equal(t("en", "host.refuel"), "Replenish");
  assert.equal(t("zh", "host.refuel"), "添料");
  assert.equal(t("en", "host.ownerFuel"), "Owner stock");
  assert.equal(t("zh", "host.ownerFuel"), "主人料");
  assert.equal(t("zh", "host.giftFuel"), "投喂料");
  assert.equal(t("zh", "public.doorHost"), "给生命添料");
  assert.doesNotMatch(t("en", "host.lead"), /\b(refuel|fuel|tank)\b/i);
  assert.doesNotMatch(t("zh", "host.lead"), /加油|油罐|燃油|主人油|打赏油/);
  for (const key of keys) {
    assert.doesNotMatch(t("zh", key), /加油|油罐|燃油|主人油|打赏油/);
  }
});
