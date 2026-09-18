import test from "node:test";
import assert from "node:assert/strict";
import { expressPhenotype } from "../src/brain/flyswarm/phenotype.mjs";
import {
  bodyTrait,
  catalogCount,
  catalogIndex,
  eyeTrait,
  traitSwatches,
  vitalOf,
} from "../src/life/fly-traits.mjs";

const soul = {
  tokenId: 7,
  generation: 2,
  phenotype: expressPhenotype({ seed: 424242, generation: 2 }),
};

test("body row reads the genome hue and carries the real body colour", () => {
  const zh = bodyTrait(soul, "zh");
  const en = bodyTrait(soul, "en");
  assert.equal(zh.text, `${soul.phenotype.hue.zh}身`);
  assert.equal(en.text, `${soul.phenotype.hue.en} body`);
  assert.equal(zh.color, soul.phenotype.art.body);
  assert.ok(zh.detail.includes(soul.phenotype.light.zh));
  assert.ok(zh.detail.includes(soul.phenotype.sat.zh));
});

test("eye row reads the genome eye and carries the real eye colour", () => {
  const zh = eyeTrait(soul, "zh");
  const en = eyeTrait(soul, "en");
  const split = soul.phenotype.eyePair?.id === "split";
  if (split) {
    assert.equal(
      zh.text,
      `${soul.phenotype.eye.zh} / ${soul.phenotype.eyeOther.zh}`,
    );
    assert.equal(
      en.text,
      `${soul.phenotype.eye.en} / ${soul.phenotype.eyeOther.en}`,
    );
    assert.equal(zh.color, soul.phenotype.art.eyeLeft);
    assert.equal(zh.color2, soul.phenotype.art.eyeRight);
    assert.ok(zh.detail.includes(soul.phenotype.eyePair.zh));
  } else {
    assert.equal(zh.text, soul.phenotype.eye.zh);
    assert.equal(en.text, soul.phenotype.eye.en);
    assert.equal(zh.color, soul.phenotype.art.eye);
    assert.equal(zh.color2, undefined);
  }
  assert.ok(zh.detail.includes(soul.phenotype.stripes.zh));
  assert.ok(zh.detail.includes(soul.phenotype.mark.zh));
});

test("a card keeps the reference layout of exactly two swatch rows", () => {
  const rows = traitSwatches(soul, "zh");
  assert.deepEqual(
    rows.map((row) => row.key),
    ["body", "eye"],
  );
  assert.deepEqual(traitSwatches(null), []);
  assert.deepEqual(traitSwatches({ phenotype: {} }), []);
});

test("vital line distinguishes hatched from unborn previews", () => {
  assert.deepEqual(vitalOf(soul), {
    generation: 2,
    statusKey: "ledger.card.alive",
  });
  assert.equal(vitalOf({ generation: 0 }).generation, 0);
  assert.equal(vitalOf({ generation: -3 }).generation, 0);
  assert.equal(vitalOf({ preview: true }).statusKey, "ledger.previewBadge");
  assert.equal(vitalOf(undefined).statusKey, "ledger.card.alive");
});

test("catalog index is a four digit plate number", () => {
  assert.equal(catalogIndex(soul), "#0007");
  assert.equal(catalogIndex({ tokenId: 12345 }), "#12345");
  assert.equal(catalogIndex({ seed: 3 }), "#0003");
  assert.equal(catalogIndex(undefined), "#0000");
});

test("catalog count separates distinct forms from total souls", () => {
  const twin = { ...soul, tokenId: 8 };
  assert.equal(catalogCount([soul, twin], "zh"), "1 种形态 · 共 2 只");
  const other = {
    tokenId: 9,
    generation: 0,
    phenotype: expressPhenotype({ seed: 99, generation: 0 }),
  };
  const text = catalogCount([soul, twin, other], "en");
  assert.ok(text.startsWith("2 forms"), text);
  assert.equal(catalogCount([], "zh"), "0 种形态 · 共 0 只");
  assert.equal(catalogCount(undefined, "en"), "0 forms · 0 souls");
});
