import test from "node:test";
import assert from "node:assert/strict";
import { canonical, hash, ZERO_HASH } from "../src/brain/codec.mjs";
import {
  createSchemas,
  validateRecord,
} from "../src/brain/flyswarm/schemas.mjs";
import {
  buildGenome,
  genomeOf,
  mutateRootOf,
} from "../src/brain/flyswarm/genome.mjs";
import {
  CHIP_COUNT,
  PHENOTYPE_DECODER,
  expressPhenotype,
  phenotypeOf,
} from "../src/brain/flyswarm/phenotype.mjs";
import { createOverlay, applyOutcome } from "../src/brain/learn.mjs";

const schemas = createSchemas();

test("genome schema accepts a birth record and rejects a third parent", () => {
  const genome = buildGenome({ soulId: "colony-0", seed: 43 });
  assert.equal(validateRecord(schemas, genome), genome);
  assert.throws(
    () =>
      validateRecord(schemas, {
        ...genome,
        parentSouls: ["a", "b", "c"],
      }),
    /亲本/,
  );
});

test("same genome expresses the same phenotype; soulId does not change looks", () => {
  const a = expressPhenotype(buildGenome({ soulId: "alpha", seed: 3700127 }));
  const b = expressPhenotype(buildGenome({ soulId: "beta", seed: 3700127 }));
  assert.equal(a.schema, PHENOTYPE_DECODER);
  assert.equal(a.chips.length, CHIP_COUNT);
  assert.deepEqual(a.chips, b.chips);
  assert.equal(a.summary.en, b.summary.en);
  assert.equal(a.art.body, b.art.body);
  assert.equal(a.soulId, "alpha");
  assert.equal(b.soulId, "beta");
});

test("a different seed changes the readout", () => {
  const a = expressPhenotype(buildGenome({ soulId: "fly-1", seed: 101 }));
  const b = expressPhenotype(buildGenome({ soulId: "fly-1", seed: 202 }));
  assert.notEqual(canonical(a.chips), canonical(b.chips));
});

test("overlay and pnl are not phenotype inputs", () => {
  const genome = buildGenome({ soulId: "fly-9", seed: 777 });
  const taught = applyOutcome(createOverlay(), { action: "FORAGE", pnl: 1 });
  const plain = expressPhenotype(genome);
  const afterTrade = expressPhenotype({ ...genome, overlay: taught, pnl: 1 });
  assert.equal(plain.art.body, afterTrade.art.body);
  assert.equal(plain.eye.id, afterTrade.eye.id);
});

test("decoder does not rewrite the genome", () => {
  const genome = buildGenome({ soulId: "fly-3", seed: 99, generation: 2 });
  const before = canonical(genome);
  expressPhenotype(genome);
  assert.equal(canonical(genome), before);
});

test("frozen genome wins over a later rng", () => {
  const genome = buildGenome({ soulId: "colony-4", seed: 55 });
  const member = { genome, seed: 999, session: { state: { rng: 888, soulId: "colony-4" } } };
  assert.equal(genomeOf(member).seed, 55);
  assert.equal(phenotypeOf(member).seed, 55);
});

test("spawn mutateRoot is deterministic and family seeds stay distinct", async () => {
  const parent = buildGenome({ soulId: "colony-0", seed: 100 });
  const childSeed = (100 ^ 0xabc) >>> 0 || 1;
  const child = buildGenome({
    soulId: "colony-5",
    seed: childSeed,
    generation: 1,
    parentSouls: [parent.soulId],
    inheritBias: true,
    mutateRoot: mutateRootOf(parent.seed, childSeed),
  });
  assert.equal(child.mutateRoot, mutateRootOf(parent.seed, childSeed));
  assert.match(child.mutateRoot, /^0x[0-9a-f]{64}$/);
  assert.notEqual(expressPhenotype(parent).summary.en, expressPhenotype(child).summary.en);
  const id = await hash(child);
  assert.match(id, /^0x[0-9a-f]{64}$/);
  assert.equal(parent.genesisId, ZERO_HASH);
});
