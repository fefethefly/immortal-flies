import test from "node:test";
import assert from "node:assert/strict";
import { buildGenome } from "../src/brain/flyswarm/genome.mjs";
import { expressPhenotype } from "../src/brain/flyswarm/phenotype.mjs";
import {
  EYES,
  EYE_PAIRS,
  FORBIDDEN_METADATA,
  GEN0_SUPPLY,
  HUES,
  LIGHTS,
  MARKET_TRAITS,
  MARKS,
  PHENOTYPE_DECODER,
  ROLL_MOD,
  SATS,
  SEXES,
  SIZES,
  STRIPES,
  WING_MARKS,
  WING_SHAPES,
  WING_VEINS,
  bpsOf,
  buildPhenotypeManifest,
  comboCatalog,
  formatExpected,
  marketAttributes,
  pickExcluding,
  scarcityOf,
} from "../src/brain/flyswarm/phenotype-loci.mjs";

test("every locus table sums to 10000 bps and bone is the rarest body", () => {
  for (const table of [HUES, SATS, LIGHTS, EYES, SIZES, STRIPES, MARKS, EYE_PAIRS, WING_MARKS, WING_SHAPES, WING_VEINS, SEXES]) {
    assert.equal(table.reduce((n, row) => n + row.bps, 0), ROLL_MOD);
  }
  assert.equal(HUES.at(-1).id, "bone");
  assert.equal(bpsOf(HUES, "bone"), 200);
  assert.equal(bpsOf(EYES, "pale"), 300);
});

test("bone always locks light; overlay still cannot paint the body", () => {
  let found = 0;
  for (let seed = 1; seed < 200000 && found < 3; seed += 1) {
    const ph = expressPhenotype(buildGenome({ soulId: "lock", seed }));
    if (ph.hue.id !== "bone") continue;
    assert.equal(ph.light.id, "light");
    assert.equal(ph.scarcity.rates.lightLocked, true);
    found += 1;
  }
  assert.ok(found >= 1);
});

test("weighted rolls can produce every advertised body color", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 25000; seed += 1) {
    seen.add(expressPhenotype(buildGenome({ soulId: "sweep", seed })).hue.id);
    if (seen.size === HUES.length) break;
  }
  assert.deepEqual([...seen].sort(), [...HUES.map((row) => row.id)].sort());
});

test("sample frequencies stay near the published weights", () => {
  const N = 20000;
  const counts = Object.fromEntries(HUES.map((row) => [row.id, 0]));
  for (let seed = 1; seed <= N; seed += 1) {
    counts[expressPhenotype(buildGenome({ soulId: "freq", seed })).hue.id] += 1;
  }
  for (const row of HUES) {
    const got = (counts[row.id] / N) * 100;
    const want = row.bps / 100;
    assert.ok(Math.abs(got - want) < 1.6, `${row.id} ${got} vs ${want}`);
  }
});

test("combo catalog is a probability measure and market metadata stays filter-only", () => {
  const catalog = comboCatalog();
  const mass = catalog.rows.reduce((n, row) => n + row.p, 0);
  assert.ok(Math.abs(mass - 1) < 1e-9);
  const ph = expressPhenotype(buildGenome({ soulId: "card", seed: 43 }));
  const scarce = scarcityOf(ph);
  assert.equal(ph.decoder, PHENOTYPE_DECODER);
  assert.ok(scarce.expectedPer1024 > 0);
  assert.ok(scarce.expectedPer1024 < GEN0_SUPPLY);
  const attrs = marketAttributes(ph);
  assert.deepEqual(attrs.map((row) => row.trait_type), [...MARKET_TRAITS]);
  const blob = JSON.stringify(attrs).toLowerCase();
  for (const word of FORBIDDEN_METADATA) assert.equal(blob.includes(word.toLowerCase()), false);
  const manifest = buildPhenotypeManifest();
  assert.equal(manifest.decoder, PHENOTYPE_DECODER);
  assert.equal(manifest.supply, 1024);
  assert.deepEqual(manifest.market.displayOnly, ["eyePair"]);
  assert.ok(manifest.traits.sex);
  assert.ok(manifest.traits.wingMark);
  assert.ok(manifest.market.tokenUriContains.includes("Sex"));
  assert.ok(manifest.market.tokenUriContains.includes("Wings"));
  assert.match(formatExpected(0.04), /<0\.1|0\.04/);
});

test("split eyes are a leftover-chip mosaic and never collide with the primary eye", () => {
  let split = 0;
  let matched = 0;
  for (let seed = 1; seed <= 8000; seed += 1) {
    const ph = expressPhenotype(buildGenome({ soulId: "pair", seed }));
    if (ph.eyePair.id === "split") {
      split += 1;
      assert.notEqual(ph.eye.id, ph.eyeOther.id);
      assert.equal(ph.art.eyeLeft, ph.eye.hex);
      assert.equal(ph.art.eyeRight, ph.eyeOther.hex);
      assert.notEqual(ph.art.eyeLeft, ph.art.eyeRight);
    } else {
      matched += 1;
      assert.equal(ph.eye.id, ph.eyeOther.id);
      assert.equal(ph.art.eyeLeft, ph.art.eyeRight);
    }
  }
  const got = (split / (split + matched)) * 100;
  assert.ok(Math.abs(got - 2) < 1.2, `split rate ${got}`);
  const other = pickExcluding(0, EYES, "wild");
  assert.notEqual(other.id, "wild");
});

test("sex and wing loci appear in market metadata and stay near published weights", () => {
  const N = 12000;
  const sexes = { female: 0, male: 0 };
  const shapes = Object.fromEntries(WING_SHAPES.map((row) => [row.id, 0]));
  const seenMark = new Set();
  const seenVein = new Set();
  for (let seed = 1; seed <= N; seed += 1) {
    const ph = expressPhenotype(buildGenome({ soulId: "dimorph", seed }));
    sexes[ph.sex.id] += 1;
    shapes[ph.wingShape.id] += 1;
    seenMark.add(ph.wingMark.id);
    seenVein.add(ph.wingVein.id);
    assert.ok(["female", "male"].includes(ph.art.sex));
  }
  assert.ok(Math.abs((sexes.female / N) * 100 - 50) < 2.5, `female ${sexes.female}`);
  for (const row of WING_SHAPES) {
    const got = (shapes[row.id] / N) * 100;
    assert.ok(Math.abs(got - row.bps / 100) < 1.8, `${row.id} ${got}`);
  }
  assert.deepEqual([...seenMark].sort(), [...WING_MARKS.map((row) => row.id)].sort());
  assert.deepEqual([...seenVein].sort(), [...WING_VEINS.map((row) => row.id)].sort());
  const attrs = marketAttributes(expressPhenotype(buildGenome({ soulId: "card", seed: 43 })));
  assert.equal(attrs.find((row) => row.trait_type === "Sex").value.length > 0, true);
});
