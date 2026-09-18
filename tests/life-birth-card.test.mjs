import test from "node:test";
import assert from "node:assert/strict";
import { t } from "../src/i18n.mjs";
import {
  CARD_H,
  CARD_SERIES,
  CARD_W,
  birthFileName,
  birthHref,
  catalogBadge,
  describeBirth,
  displayName,
  rarityOf,
  mixOf,
  parentsOf,
  wantsBirthCard,
  withBirthQuery,
} from "../src/life/birth-card.mjs";
import { decorateSoul } from "../src/life/souls.mjs";

const ROOT = `0x${"ab".repeat(32)}`;

function soul(tokenId, seed, extra = {}) {
  return decorateSoul(
    {
      tokenId,
      owner: "0x1111111111111111111111111111111111111111",
      life: `0x${tokenId.toString(16).padStart(2, "0")}${"cd".repeat(31)}`,
      seed,
      givenName: extra.givenName,
      parentA: extra.parentA || 0,
      parentB: extra.parentB || 0,
      generation: extra.generation || 0,
    },
    { genesisRoot: ROOT, chainId: 97, fieldCount: 12 },
  );
}

test("English birth card keeps Latin given names and swaps CJK for the true name", () => {
  const named = soul(1, 1963528436, { givenName: "烬翅" });
  const pip = soul(8, 77, { givenName: "Pip" });
  assert.equal(displayName(named, "zh"), "烬翅");
  assert.equal(displayName(named, "en"), "grit-vein");
  assert.equal(displayName(pip, "en"), "Pip");
  assert.equal(displayName(pip, "zh"), "Pip");
});

test("gen0 birth card has no parent mix and a colony share link", () => {
  const child = soul(1, 1963528436, { givenName: "烬翅" });
  const card = describeBirth(child, [child], {
    locale: "zh",
    origin: "https://example.test",
    tx: (key, vars) => t("zh", key, vars),
  });
  assert.equal(card.bred, false);
  assert.equal(card.mix, null);
  assert.match(card.childSub, /第 0 代/);
  assert.match(card.footer, /孵化/);
  assert.equal(
    card.shareUrl,
    "https://example.test/habitat.html?soul=1&card=1&lang=zh",
  );
  assert.match(card.footer, /BNB 智能链测试网/);
  assert.match(card.header, /一只蝇出生了/);
  assert.equal(card.series, CARD_SERIES);
  assert.equal(card.plateName, "烬翅");
  assert.equal(card.tokenMark, "#1");
  assert.match(card.rarityLine, /≈.+\/1024/);
  assert.equal(card.rarityLine, rarityOf(child));
  assert.match(card.accession, /第 0 代 · 孵化/);
  assert.equal(card.parentLine, "");
  assert.equal(/rare|legendary|common|epic|mythic/i.test(card.badge), false);
  assert.equal(CARD_W, CARD_H);
  assert.equal(birthFileName(child).startsWith("iff-birth-1"), true);
  assert.equal(wantsBirthCard("?soul=1&card=1"), 1);
  assert.equal(wantsBirthCard("?soul=1"), 0);
});

test("breed card attributes loci to parents or calls them new", () => {
  const a = soul(2, 43, { givenName: "Sunny" });
  const b = soul(3, 99, { givenName: "Cora" });
  const child = soul(4, 77, {
    givenName: "Pip",
    parentA: 2,
    parentB: 3,
    generation: 2,
  });
  const mix = mixOf(child, a, b);
  assert.equal(mix.a + mix.b + mix.both + mix.novel, 7);
  const { parentA, parentB } = parentsOf(child, [a, b, child]);
  assert.equal(parentA.tokenId, 2);
  assert.equal(parentB.tokenId, 3);
  const card = describeBirth(child, [a, b, child], {
    locale: "en",
    origin: "https://example.test",
    chainName: "BNB Smart Chain",
    tx: (key, vars) => t("en", key, vars),
  });
  assert.equal(card.bred, true);
  assert.match(card.childSub, /generation 2/);
  assert.match(card.accession, /generation 2 · bred/);
  assert.match(card.parentLine, /#2 × #3/);
  assert.equal(card.plateName, "Pip");
  assert.match(card.mixLine, /match #2/);
  assert.match(card.footer, /bred and stored/);
  assert.equal(
    birthHref(child, "https://example.test").includes("card=1"),
    true,
  );
  assert.equal(
    withBirthQuery("/habitat.html?soul=4", 4, true, "en"),
    "/habitat.html?soul=4&card=1&lang=en",
  );
  assert.equal(
    withBirthQuery("/habitat.html?soul=4&card=1", 4, false, "en"),
    "/habitat.html?soul=4&lang=en",
  );
});

test("birth card copy follows the site locale", () => {
  const child = soul(1, 1963528436, { givenName: "烬翅" });
  const zh = describeBirth(child, [child], {
    locale: "zh",
    origin: "https://example.test",
    tx: (key, vars) => t("zh", key, vars),
  });
  const en = describeBirth(child, [child], {
    locale: "en",
    origin: "https://example.test",
    tx: (key, vars) => t("en", key, vars),
  });
  assert.notEqual(zh.header, en.header);
  assert.notEqual(zh.childSub, en.childSub);
  assert.notEqual(zh.footer, en.footer);
  assert.notEqual(zh.traits, en.traits);
  assert.match(zh.shareUrl, /lang=zh/);
  assert.match(en.shareUrl, /lang=en/);
  assert.match(en.footer, /BNB Smart Chain Testnet/);
  assert.match(zh.childTitle, /烬翅/);
  assert.match(en.childTitle, /grit-vein/);
  const a = soul(2, 43, { givenName: "暮翅" });
  const b = soul(3, 99, { givenName: "Cora" });
  const kid = soul(4, 77, {
    givenName: "砂脉",
    parentA: 2,
    parentB: 3,
    generation: 2,
  });
  const enBreed = describeBirth(kid, [a, b, kid], {
    locale: "en",
    origin: "https://example.test",
    tx: (key, vars) => t("en", key, vars),
  });
  const painted = [
    en.childTitle,
    en.shareText,
    en.header,
    en.footer,
    en.traits,
    en.formLine,
    en.finishLine,
    en.badge,
    en.accession,
    en.series,
    en.mixLine,
    enBreed.childTitle,
    enBreed.parentACaption,
    enBreed.parentBCaption,
    enBreed.shareText,
  ].join(" ");
  assert.equal(/[\u4e00-\u9fff]/.test(painted), false);
  assert.match(enBreed.parentBCaption, /Cora/);
});

test("catalog badge names a distinctive trait and never a rarity grade", () => {
  const child = soul(1, 1963528436, { givenName: "Pip" });
  const badge = catalogBadge(child, "en");
  assert.ok(badge);
  assert.equal(/rare|legendary|common|epic|mythic|rank/i.test(badge), false);
  assert.match(badge, /[A-Z]/);
});

test("birth card rarity matches the colony per-1024 readout", () => {
  const child = soul(1, 1963528436, { givenName: "Pip" });
  const mark = rarityOf(child);
  assert.match(mark, /^≈.+\/1024$/);
  assert.equal(/rare|legendary|common|epic|mythic/i.test(mark), false);
  assert.ok(child.phenotype.scarcity);
  const card = describeBirth(child, [child], {
    locale: "en",
    origin: "https://example.test",
    tx: (key, vars) => t("en", key, vars),
  });
  assert.equal(card.rarityLine, mark);
  assert.equal(card.traitRows.length, 2);
  assert.ok(card.traitRows.every((row) => row.text && row.color));
});
