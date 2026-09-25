import test from "node:test";
import assert from "node:assert/strict";
import { expressPhenotype } from "../src/brain/flyswarm/phenotype.mjs";
import { soulGenome } from "../src/life/identity.mjs";
import { MESSAGES, t } from "../src/i18n.mjs";
import {
  CROSS_LOCUS_COUNT,
  HUES,
} from "../src/brain/flyswarm/phenotype-loci.mjs";
import { previewSpecimens, previewSpotlight } from "../src/life/preview.mjs";
import {
  boardsOf,
  censusOf,
  colonyDetailKey,
  descendantCounts,
  filterColony,
  kidsOf,
  locusTally,
  paginate,
  parseColonyView,
  rarestGen0Combos,
  soulFromDetailKey,
  sortColony,
  unseenCombos,
  writeColonyView,
} from "../src/life/colony.mjs";
import {
  expectedLoci,
  sampleDescent,
  seededEntropy,
} from "../src/life/predict.mjs";
import {
  MUTATION_RATE,
  crossoverSources,
  expectedCrossoverLoci,
  grindCrossover,
  traitsOfSeed,
  verifyCrossover,
} from "../src/life/descent.mjs";

function fakeSoul({
  id,
  gen = 0,
  parentA = 0,
  parentB = 0,
  owner = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  seed = id,
}) {
  const genome = soulGenome({ seed, generation: gen });
  return {
    tokenId: id,
    generation: gen,
    parentA,
    parentB,
    owner,
    seed,
    life: `0x${id.toString(16)}`,
    givenName: "",
    phenotype: expressPhenotype(genome),
  };
}

const OWNER_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OWNER_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

test("census counts gen0, bred, highest generation and wallets", () => {
  const souls = [
    fakeSoul({ id: 1 }),
    fakeSoul({ id: 2, owner: OWNER_B }),
    fakeSoul({ id: 3, gen: 1, parentA: 1, parentB: 2 }),
    fakeSoul({ id: 4, gen: 2, parentA: 3, parentB: 2, owner: OWNER_B }),
  ];
  const census = censusOf(souls);
  assert.equal(census.total, 4);
  assert.equal(census.gen0, 2);
  assert.equal(census.bred, 2);
  assert.equal(census.highest, 2);
  assert.equal(census.wallets, 2);
});

test("kids and descendants follow parent links", () => {
  const souls = [
    fakeSoul({ id: 1 }),
    fakeSoul({ id: 2 }),
    fakeSoul({ id: 3, gen: 1, parentA: 1, parentB: 2 }),
    fakeSoul({ id: 4, gen: 2, parentA: 3, parentB: 2 }),
    fakeSoul({ id: 5, gen: 2, parentA: 3, parentB: 1 }),
  ];
  const kids = kidsOf(souls);
  assert.equal(kids.get(1), 2);
  assert.equal(kids.get(2), 2);
  assert.equal(kids.get(3), 2);
  const descendants = descendantCounts(souls);
  assert.equal(descendants.get(1), 3);
  assert.equal(descendants.get(2), 3);
  assert.equal(descendants.get(3), 2);
  assert.equal(descendants.get(4), undefined);
});

test("filterColony slices by locus, generation, wallet and query", () => {
  const souls = [
    fakeSoul({ id: 1, seed: 11 }),
    fakeSoul({ id: 2, seed: 22, owner: OWNER_B }),
    fakeSoul({ id: 3, seed: 11, gen: 1, parentA: 1, parentB: 2 }),
  ];
  const hueOf = (soul) => soul.phenotype.hue.id;
  const amber = souls.filter(
    (soul) => hueOf(soul) === souls[0].phenotype.hue.id,
  );
  const byHue = filterColony(souls, {
    hue: souls[0].phenotype.hue.id,
  });
  assert.equal(byHue.length, amber.length);
  assert.ok(
    byHue.every((soul) => soul.phenotype.hue.id === souls[0].phenotype.hue.id),
  );

  assert.deepEqual(
    filterColony(souls, { generation: "0" }).map((soul) => soul.tokenId),
    [1, 2],
  );
  assert.deepEqual(
    filterColony(souls, { generation: "1+" }).map((soul) => soul.tokenId),
    [3],
  );
  assert.deepEqual(
    filterColony(souls, { mineOnly: true, wallet: OWNER_B }).map(
      (soul) => soul.tokenId,
    ),
    [2],
  );
  assert.deepEqual(
    filterColony(souls, { query: "#2" }).map((soul) => soul.tokenId),
    [2],
  );
});

test("sortColony orders by id, generation, children and scarcity", () => {
  const souls = [
    fakeSoul({ id: 5, gen: 0 }),
    fakeSoul({ id: 2, gen: 2, parentA: 1, parentB: 1 }),
    fakeSoul({ id: 9, gen: 1, parentA: 1, parentB: 1 }),
  ];
  assert.deepEqual(
    sortColony(souls, "new").map((soul) => soul.tokenId),
    [9, 5, 2],
  );
  assert.deepEqual(
    sortColony(souls, "old").map((soul) => soul.tokenId),
    [2, 5, 9],
  );
  assert.deepEqual(
    sortColony(souls, "gen").map((soul) => soul.tokenId),
    [2, 9, 5],
  );
  const rare = sortColony(souls, "rare");
  for (let i = 1; i < rare.length; i += 1) {
    assert.ok(
      rare[i - 1].phenotype.scarcity.expectedPer1024 <=
        rare[i].phenotype.scarcity.expectedPer1024 + 1e-12,
    );
  }
  const withKids = [
    fakeSoul({ id: 1 }),
    fakeSoul({ id: 2 }),
    fakeSoul({ id: 3, gen: 1, parentA: 1, parentB: 2 }),
    fakeSoul({ id: 4, gen: 1, parentA: 1, parentB: 2 }),
    fakeSoul({ id: 5, gen: 1, parentA: 1, parentB: 2 }),
    fakeSoul({ id: 6, gen: 2, parentA: 2, parentB: 3 }),
  ];
  assert.deepEqual(
    sortColony(withKids, "kids").map((soul) => soul.tokenId),
    [2, 1, 3, 4, 5, 6],
  );
});

test("paginate clamps pages and slices rows", () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ tokenId: i + 1 }));
  const first = paginate(rows, 1, 24);
  assert.equal(first.pages, 3);
  assert.equal(first.slice.length, 24);
  const far = paginate(rows, 99, 24);
  assert.equal(far.page, 3);
  assert.equal(far.slice.length, 2);
});

test("colony view round-trips through the query string", () => {
  const view = parseColonyView(
    "?hue=amber&eye=white&sort=rare&gen=0&q=aa&net=test",
  );
  assert.equal(view.hue, "amber");
  assert.equal(view.eye, "white");
  assert.equal(view.generation, "0");
  assert.equal(view.sort, "rare");
  assert.equal(view.query, "aa");
  const out = writeColonyView(view, "?net=test");
  assert.match(out, /net=test/);
  assert.match(out, /hue=amber/);
  assert.match(out, /sort=rare/);
  const back = parseColonyView(out);
  assert.deepEqual(back, view);
  assert.equal(writeColonyView(parseColonyView("")), "");
});

test("locus tally only counts the asked generation and keeps tables whole", () => {
  const souls = [
    fakeSoul({ id: 1, seed: 3 }),
    fakeSoul({ id: 2, seed: 7 }),
    fakeSoul({ id: 3, seed: 9, gen: 1, parentA: 1, parentB: 2 }),
  ];
  const tally = locusTally(souls);
  assert.equal(tally.length, 12);
  for (const locus of tally) {
    assert.equal(locus.n, 2);
    const seen = locus.traits.reduce((sum, row) => sum + row.seen, 0);
    assert.equal(seen, 2);
    const expected = locus.traits.reduce(
      (sum, row) => sum + row.expectedPct,
      0,
    );
    assert.ok(Math.abs(expected - 100) < 0.01);
  }
});

test("atlas lists rarest gen0 souls and likeliest unseen combos", () => {
  const souls = [fakeSoul({ id: 1, seed: 5 }), fakeSoul({ id: 2, seed: 6 })];
  const rarest = rarestGen0Combos(souls, 2);
  assert.equal(rarest.length, 2);
  assert.ok(
    rarest[0].phenotype.scarcity.expectedPer1024 <=
      rarest[1].phenotype.scarcity.expectedPer1024,
  );
  const unseen = unseenCombos(souls, 8);
  assert.equal(unseen.length, 8);
  for (const row of unseen) {
    assert.ok(row.expectedPer1024 > 0);
    assert.ok(row.comboP > 0);
  }
  const keys = new Set(
    souls.map(
      (soul) =>
        `${soul.phenotype.hue.id}|${soul.phenotype.sat.id}|${soul.phenotype.light.id}|${soul.phenotype.eye.id}|${soul.phenotype.size.id}|${soul.phenotype.stripes.count}|${soul.phenotype.mark.id}`,
    ),
  );
  for (const row of unseen) {
    assert.ok(!keys.has(row.key));
  }
});

test("boards rank families, deepest generations and scarcest souls", () => {
  const souls = [
    fakeSoul({ id: 1 }),
    fakeSoul({ id: 2 }),
    fakeSoul({ id: 3, gen: 1, parentA: 1, parentB: 2 }),
    fakeSoul({ id: 4, gen: 2, parentA: 3, parentB: 2 }),
  ];
  const boards = boardsOf(souls, 6);
  assert.equal(boards.families[0].soul.tokenId, 1);
  assert.equal(boards.families[0].descendants, 2);
  assert.equal(boards.deepest[0].tokenId, 4);
  assert.ok(boards.rarest.length > 0);
});

test("lean decoder matches the full phenotype readout locus for locus", () => {
  const seeds = [
    1,
    2,
    43,
    99,
    20260916,
    0x7fffffff,
    0xffffffff,
    ...Array.from(
      { length: 32 },
      (_, i) => Math.imul(i + 1, 2654435761) >>> 0 || 1,
    ),
  ];
  for (const seed of seeds) {
    const ph = expressPhenotype(soulGenome({ seed }));
    const traits = traitsOfSeed(seed);
    const ids = [
      ph.hue.id,
      ph.sat.id,
      ph.light.id,
      ph.eye.id,
      ph.size.id,
      String(ph.stripes.count),
      ph.mark.id,
      ph.wingMark.id,
      ph.wingShape.id,
      ph.wingVein.id,
      ph.sex.id,
    ];
    const tables = [
      [
        "amber",
        "umber",
        "olive",
        "slate",
        "ink",
        "wine",
        "rust",
        "sand",
        "copper",
        "pine",
        "indigo",
        "bone",
      ],
      ["muted", "clear", "vivid"],
      ["dark", "mid", "light"],
      ["wild", "cinnabar", "sepia", "vermilion", "white", "pale"],
      ["petite", "typical", "large"],
      ["0", "1", "2", "3", "4"],
      ["none", "bar", "spots"],
      ["clear", "apical", "banded", "pictured"],
      ["typical", "miniature", "curly", "vestigial"],
      ["complete", "incomplete", "extra"],
      ["female", "male"],
    ];
    traits.forEach((trait, locus) => {
      assert.equal(
        tables[locus][trait],
        ids[locus],
        `seed ${seed} locus ${locus}`,
      );
    });
  }
});

test("crossover sources: deterministic, ~2% mutation, parents split the rest", () => {
  const base = {
    collection: "0xF897AFB571E54e859e0eD21517687c0ef02839aD",
    requestId: 7,
    entropy: "0x" + "ab".repeat(32),
  };
  assert.deepEqual(crossoverSources(base), crossoverSources({ ...base }));
  assert.notDeepEqual(
    crossoverSources(base),
    crossoverSources({ ...base, entropy: "0x" + "cd".repeat(32) }),
  );
  let mutations = 0;
  let fromA = 0;
  const draws = 4000;
  for (let i = 0; i < draws; i += 1) {
    const entropy = `0x${(BigInt(i * 7919 + 1) ** 3n % (1n << 256n)).toString(16).padStart(64, "0")}`;
    for (const source of crossoverSources({ ...base, entropy })) {
      if (source === 2) mutations += 1;
      else if (source === 1) fromA += 1;
    }
  }
  const total = draws * CROSS_LOCUS_COUNT;
  const mutationShare = mutations / total;
  assert.ok(
    mutationShare > 0.015 && mutationShare < 0.025,
    `mutation share ${mutationShare.toFixed(4)}`,
  );
  const nonMutation = total - mutations;
  assert.ok(Math.abs(fromA / nonMutation - 0.5) < 0.03);
});

test("crossover grind: deterministic, canonical, obeys drawn sources exactly", () => {
  const base = {
    collection: "0xF897AFB571E54e859e0eD21517687c0ef02839aD",
    seedA: 12345,
    seedB: 67890,
    requestId: 7,
    entropy: "0x" + "ab".repeat(32),
  };
  const grind = grindCrossover(base);
  assert.deepEqual(grind, grindCrossover({ ...base }));
  assert.ok(
    Number.isInteger(grind.seed) && grind.seed >= 1 && grind.seed <= 0xffffffff,
  );
  assert.ok(grind.tries >= 1);
  // 正典性：n 之前的候选都不全中
  const check = verifyCrossover({ ...base, n: grind.n });
  assert.equal(check.ok, true);
  assert.equal(check.seed, grind.seed);
  const ta = traitsOfSeed(base.seedA);
  const tb = traitsOfSeed(base.seedB);
  const tc = traitsOfSeed(grind.seed);
  grind.sources.forEach((source, locus) => {
    if (source === 2) return;
    assert.equal(
      tc[locus],
      source === 1 ? ta[locus] : tb[locus],
      `locus ${locus} must follow its drawn source exactly`,
    );
  });
  // 换熵重研磨仍然成功且合法
  const other = grindCrossover({ ...base, entropy: "0x" + "cd".repeat(32) });
  assert.ok(other.seed >= 1 && other.seed <= 0xffffffff);
  assert.equal(
    verifyCrossover({ ...base, entropy: "0x" + "cd".repeat(32), n: other.n })
      .ok,
    true,
  );
});

test("sampleDescent is deterministic per rng and reports the child generation", () => {
  const parentA = fakeSoul({ id: 3, gen: 1, seed: 12345 });
  const parentB = fakeSoul({ id: 9, gen: 0, seed: 67890 });
  const run = () =>
    sampleDescent({
      parentA,
      parentB,
      collection: "0xF897AFB571E54e859e0eD21517687c0ef02839aD",
      requestId: 7,
      count: 3,
      rng: seededEntropy("0x77"),
    });
  const first = run();
  const second = run();
  assert.equal(first.generation, 2);
  assert.equal(first.samples.length, 3);
  assert.deepEqual(
    first.samples.map((sample) => sample.seed),
    second.samples.map((sample) => sample.seed),
  );
  const rng = seededEntropy("0x77");
  const entropies = [0, 1, 2].map((i) => rng(i));
  for (const [index, sample] of first.samples.entries()) {
    assert.ok(sample.seed >= 1 && sample.seed <= 0xffffffff);
    assert.ok(sample.mutations >= 0 && sample.mutations <= CROSS_LOCUS_COUNT);
    assert.ok(sample.expectedPer1024 > 0);
    // 每只样本都是真实可验证的全中候选
    assert.equal(
      verifyCrossover({
        collection: "0xF897AFB571E54e859e0eD21517687c0ef02839aD",
        seedA: parentA.seed,
        seedB: parentB.seed,
        requestId: 7,
        entropy: entropies[index],
        n: sample.n,
      }).ok,
      true,
    );
  }
  assert.ok(first.rarest && first.rarest.expectedPer1024 > 0);
});

test("ground children inherit each drawn locus exactly; strays only from mutation", () => {
  const seedA = 3957492134;
  const seedB = 4154599858;
  const traitsA = traitsOfSeed(seedA);
  const traitsB = traitsOfSeed(seedB);
  assert.notEqual(traitsA[0], traitsB[0], "fixture should differ on hue");
  const collection = "0xF897AFB571E54e859e0eD21517687c0ef02839aD";
  const draws = 24;
  let mutatedLoci = 0;
  for (let i = 0; i < draws; i += 1) {
    const entropy = `0x${(BigInt(i * 7919 + 1) ** 3n % (1n << 256n)).toString(16).padStart(64, "0")}`;
    const grind = grindCrossover({
      seedA,
      seedB,
      collection,
      requestId: 1,
      entropy,
    });
    const child = traitsOfSeed(grind.seed);
    for (let locus = 0; locus < CROSS_LOCUS_COUNT; locus += 1) {
      const source = grind.sources[locus];
      if (source === 2) {
        mutatedLoci += 1;
        continue;
      }
      assert.equal(
        child[locus],
        source === 1 ? traitsA[locus] : traitsB[locus],
        `draw ${i} locus ${locus}: full-match child must equal its source`,
      );
    }
  }
  // 抽样 24×7 位点里突变比例应接近 1.95%（0 到 ~5 个）
  assert.ok(
    mutatedLoci <= 10,
    `mutation count ${mutatedLoci} in ${draws * CROSS_LOCUS_COUNT} loci`,
  );
});

test("expected crossover mix: parents take ~half each plus the mutation table share", () => {
  const traitsA = traitsOfSeed(3957492134);
  const traitsB = traitsOfSeed(4154599858);
  const loci = expectedCrossoverLoci(traitsA, traitsB);
  assert.equal(loci.length, CROSS_LOCUS_COUNT);
  for (const locus of loci) {
    const total = locus.rows.reduce((sum, row) => sum + row.pct, 0);
    assert.ok(Math.abs(total - 100) < 0.01, `${locus.locus} sums ${total}`);
  }
  const hue = loci.find((row) => row.locus === "hue");
  // A 的 hue 是 rust（900bps）；A 行 ≈ (1-m)/2 + m·9%
  const shareA =
    ((1 - MUTATION_RATE) / 2 + (MUTATION_RATE * 900) / 10000) * 100;
  const rowA = hue.rows[traitsA[0]];
  assert.ok(
    Math.abs(rowA.pct - shareA) < 0.2,
    `A hue ${rowA.pct.toFixed(2)}% vs ${shareA.toFixed(2)}%`,
  );
  // published tables 仍可用作 Gen0 对照
  assert.ok(expectedLoci().hue.length === 12);
});

test("sampleDescent refuses an identical pair", () => {
  const soul = fakeSoul({ id: 3 });
  assert.throws(() =>
    sampleDescent({
      parentA: soul,
      parentB: soul,
      collection: "0xF897AFB571E54e859e0eD21517687c0ef02839aD",
      requestId: 1,
      count: 2,
      rng: seededEntropy(),
    }),
  );
});

test("colony copy stays paired in both locales and keeps the honesty lines", () => {
  const en = Object.keys(MESSAGES.en).filter((key) =>
    key.startsWith("ledger."),
  );
  const zh = Object.keys(MESSAGES.zh).filter((key) =>
    key.startsWith("ledger."),
  );
  assert.deepEqual(new Set(en), new Set(zh));
  assert.ok(en.length > 60);
  for (const key of en) {
    assert.notEqual(t("en", key), key);
    assert.notEqual(t("zh", key), key);
  }
  assert.match(t("en", "ledger.boundary"), /never prices/i);
  assert.match(t("zh", "ledger.boundary"), /不是定价/);
  assert.match(t("en", "ledger.method"), /not guarantees/i);
  assert.match(t("zh", "ledger.method"), /不是保证/);
  assert.match(t("en", "ledger.undecidedLead"), /blockhash/i);
  assert.match(t("zh", "ledger.undecidedLead"), /区块哈希/);
  assert.match(t("en", "ledger.atlasUnseenLead"), /not a promise/i);
  assert.match(t("zh", "ledger.atlasUnseenLead"), /不是承诺/);
  assert.equal(t("en", "nav.colony"), "Colony");
  assert.equal(t("zh", "nav.colony"), "群体");
});

test("preview cabinet covers every trait value deterministically", () => {
  const rows = previewSpecimens();
  assert.ok(
    rows.length >= 24 && rows.length <= 200,
    `row count ${rows.length}`,
  );
  const hues = new Set(rows.map((row) => row.phenotype.hue.id));
  const eyes = new Set(rows.map((row) => row.phenotype.eye.id));
  const sizes = new Set(rows.map((row) => row.phenotype.size.id));
  const stripes = new Set(
    rows.map((row) => String(row.phenotype.stripes.count)),
  );
  const marks = new Set(rows.map((row) => row.phenotype.mark.id));
  const sats = new Set(rows.map((row) => row.phenotype.sat.id));
  const lights = new Set(rows.map((row) => row.phenotype.light.id));
  assert.equal(hues.size, 12);
  assert.equal(eyes.size, 6);
  assert.equal(sizes.size, 3);
  assert.equal(stripes.size, 5);
  assert.equal(marks.size, 3);
  assert.equal(sats.size, 3);
  assert.equal(lights.size, 3);
  assert.equal(new Set(rows.map((row) => row.phenotype.sex.id)).size, 2);
  assert.equal(new Set(rows.map((row) => row.phenotype.wingShape.id)).size, 4);
  assert.ok(
    rows.filter((row) => row.phenotype.eyePair.id === "split").length >= 4,
  );
  // 确定性 + 稀缺排序 + 未出生标记 + seed 可解码回同一表型
  assert.deepEqual(previewSpecimens(), rows);
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i - 1].expectedPer1024 <= rows[i].expectedPer1024 + 1e-12);
  }
  for (const row of rows) {
    assert.equal(row.preview, true);
    assert.equal(row.generation, 0);
    const traits = traitsOfSeed(row.seed);
    assert.equal(
      String(traits[0]),
      String(HUES.findIndex((hue) => hue.id === row.phenotype.hue.id)),
    );
  }
});

test("preview spotlight shows all wing shapes and a genuine split-eye specimen", () => {
  const rows = previewSpecimens();
  const spotlight = previewSpotlight(rows);
  assert.equal(spotlight.length, 6);
  assert.equal(new Set(spotlight.map((s) => s.seed)).size, 6);
  assert.equal(new Set(spotlight.map((s) => s.phenotype.wingShape.id)).size, 4);
  assert.equal(
    spotlight.filter((s) => s.phenotype.wingShape.id === "vestigial").length,
    1,
  );
  const split = spotlight.find((s) => s.phenotype.eyePair.id === "split");
  assert.ok(split);
  assert.notEqual(split.phenotype.art.eyeLeft, split.phenotype.art.eyeRight);
  for (const row of spotlight) assert.ok(rows.includes(row));
  assert.deepEqual(previewSpotlight(rows), spotlight);
  assert.deepEqual(previewSpotlight([]), []);
});

test("preview cap does not reuse a different catalog's cache", () => {
  const bounded = previewSpecimens({ cap: 10 });
  assert.ok(bounded.length > 0);
  assert.ok(bounded.every((s) => s.seed <= 10));
  assert.ok(previewSpecimens().some((s) => s.seed > 10));
});

test("eye filters find split pairs and either anatomical eye", () => {
  const split = fakeSoul({ id: 1, seed: 151 });
  const matched = fakeSoul({ id: 2, seed: 1 });
  assert.equal(split.phenotype.eyePair.id, "split");
  assert.notEqual(split.phenotype.eye.id, split.phenotype.eyeOther.id);
  assert.deepEqual(filterColony([split, matched], { eye: "split" }), [split]);
  assert.ok(
    filterColony([split], { eye: split.phenotype.eyeOther.id }).includes(split),
  );
  assert.equal(parseColonyView(writeColonyView({ eye: "split" })).eye, "split");
});

test("preview cabinet follows the same locus filters as the roster", () => {
  const rows = previewSpecimens();
  const bone = rows.find((row) => row.phenotype.hue.id === "bone");
  assert.ok(bone, "bone should be covered");
  const filtered = filterColony(rows, { hue: "bone" });
  assert.ok(filtered.length >= 1);
  assert.ok(filtered.every((row) => row.phenotype.hue.id === "bone"));
  const white = filterColony(rows, { eye: "white" });
  assert.ok(white.length >= 1);
  assert.ok(
    white.every(
      (row) =>
        row.phenotype.eye.id === "white" ||
        row.phenotype.eyeOther.id === "white",
    ),
  );
  assert.equal(filterColony(rows, { generation: "1+" }).length, 0);
});

test("colony detail keys keep preview seeds apart from on-chain token ids", () => {
  const souls = [fakeSoul({ id: 1 })];
  const previews = previewSpecimens().slice(0, 3);
  const preview = { ...previews[0], seed: 1, tokenId: 1, preview: true };
  assert.equal(colonyDetailKey(souls[0]), "s:1");
  assert.equal(colonyDetailKey(preview), "p:1");
  assert.equal(
    soulFromDetailKey("s:1", { souls, previews: [preview] })?.preview,
    undefined,
  );
  assert.equal(
    soulFromDetailKey("s:1", { souls, previews: [preview] })?.tokenId,
    1,
  );
  assert.equal(
    soulFromDetailKey("p:1", { souls, previews: [preview] })?.preview,
    true,
  );
  assert.equal(
    soulFromDetailKey(colonyDetailKey(previews[1]), {
      souls,
      previews,
    })?.seed,
    previews[1].seed,
  );
  assert.equal(soulFromDetailKey("", { souls, previews }), null);
});
