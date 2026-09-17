import test from "node:test";
import assert from "node:assert/strict";
import { buildGenome } from "../src/brain/flyswarm/genome.mjs";
import { expressPhenotype } from "../src/brain/flyswarm/phenotype.mjs";
import {
  EYES,
  FORBIDDEN_METADATA,
  GEN0_SUPPLY,
  HUES,
  LIGHTS,
  MARKET_TRAITS,
  MARKS,
  PHENOTYPE_DECODER,
  ROLL_MOD,
  SATS,
  SIZES,
  STRIPES,
  bpsOf,
  buildPhenotypeManifest,
  comboCatalog,
  formatExpected,
  marketAttributes,
  scarcityOf,
} from "../src/brain/flyswarm/phenotype-loci.mjs";

test("every locus table sums to 10000 bps and bone is the rarest body", () => {
  for (const table of [HUES, SATS, LIGHTS, EYES, SIZES, STRIPES, MARKS]) {
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
  assert.match(formatExpected(0.04), /<0\.1|0\.04/);
});
