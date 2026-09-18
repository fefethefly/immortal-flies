/**
 * phenotype-loci/3 —— 面向二级市场的基因组读出规格。
 *
 * 铸的是 Genome。性状是加权抽取，不是均值挤中间，也不是 Common/Rare 定价。
 * 出现率公开；tokenURI 只给可筛选属性。名次随已铸造集合变，不能写进元数据。
 *
 * 产品目标是生物学多样性的可观察轴（色素、复眼、腹部分节、翅斑/翅形/翅脉、性别），
 * 不是皮肤抽卡。chips 0–55 是原 7 个市场位点；56–63 仍是链下左右复眼镶嵌；
 * 64–95 是翅与性别，进 tokenURI。主网 /2 集合读不出这些属性；OpenSea 筛选
 * 需要新身份核（本解码器）。不要用 UUPS 改旧 Soul。
 */
export const PHENOTYPE_DECODER = "phenotype-loci/3";
export const CHIP_COUNT = 96;
export const ROLL_MOD = 10000;
export const GEN0_SUPPLY = 1024;
/** Kin 交叉研磨的位点数：7 个身体位点 + 3 个翅位点。性别每代重掷，不遗传表型。 */
export const CROSS_LOCUS_COUNT = 10;

export const LOCI = Object.freeze([
  { id: "hue", from: 0, to: 8 },
  { id: "sat", from: 8, to: 16 },
  { id: "light", from: 16, to: 24 },
  { id: "eye", from: 24, to: 32 },
  { id: "size", from: 32, to: 40 },
  { id: "stripes", from: 40, to: 48 },
  { id: "mark", from: 48, to: 56 },
  { id: "eyePair", from: 56, to: 60 },
  { id: "eyeOther", from: 60, to: 64 },
  { id: "wingMark", from: 64, to: 72 },
  { id: "wingShape", from: 72, to: 80 },
  { id: "wingVein", from: 80, to: 88 },
  { id: "sex", from: 88, to: 96 },
]);

export const HUES = Object.freeze([
  { id: "amber", deg: 38, en: "amber", zh: "琥珀", bps: 1600 },
  { id: "umber", deg: 24, en: "umber", zh: "赭褐", bps: 1500 },
  { id: "olive", deg: 72, en: "olive", zh: "橄榄", bps: 1300 },
  { id: "slate", deg: 210, en: "slate", zh: "青灰", bps: 400 },
  { id: "ink", deg: 230, en: "ink", zh: "墨色", bps: 350 },
  { id: "wine", deg: 350, en: "wine", zh: "酒红", bps: 850 },
  { id: "rust", deg: 16, en: "rust", zh: "铁锈", bps: 900 },
  { id: "sand", deg: 42, en: "sand", zh: "沙色", bps: 1300 },
  { id: "copper", deg: 28, en: "copper", zh: "红铜", bps: 700 },
  { id: "pine", deg: 148, en: "pine", zh: "松绿", bps: 650 },
  { id: "indigo", deg: 255, en: "indigo", zh: "靛蓝", bps: 250 },
  { id: "bone", deg: 40, en: "bone", zh: "骨白", bps: 200 },
]);

export const SATS = Object.freeze([
  { id: "muted", en: "muted", zh: "柔和", pct: 34, bps: 5000 },
  { id: "clear", en: "clear", zh: "清澈", pct: 48, bps: 3500 },
  { id: "vivid", en: "vivid", zh: "鲜明", pct: 62, bps: 1500 },
]);

export const LIGHTS = Object.freeze([
  { id: "dark", en: "dark", zh: "偏暗", pct: 30, bps: 3000 },
  { id: "mid", en: "mid", zh: "适中", pct: 42, bps: 5200 },
  { id: "light", en: "light", zh: "偏亮", pct: 54, bps: 1800 },
]);

export const EYES = Object.freeze([
  { id: "wild", en: "wild-type eyes", zh: "普通眼", hex: "#b57660", bps: 4200 },
  { id: "cinnabar", en: "cinnabar eyes", zh: "朱砂眼", hex: "#c23b2e", bps: 1800 },
  { id: "sepia", en: "sepia eyes", zh: "墨褐眼", hex: "#6b4a32", bps: 1400 },
  { id: "vermilion", en: "vermilion eyes", zh: "朱红眼", hex: "#d46a4a", bps: 1600 },
  { id: "white", en: "white eyes", zh: "白眼", hex: "#e4d9c4", bps: 700 },
  { id: "pale", en: "pale eyes", zh: "淡眼", hex: "#c4b49a", bps: 300 },
]);

export const SIZES = Object.freeze([
  { id: "petite", en: "petite", zh: "偏小", scale: 0.88, bps: 2400 },
  { id: "typical", en: "typical", zh: "普通", scale: 1, bps: 5600 },
  { id: "large", en: "large", zh: "粗壮", scale: 1.12, bps: 2000 },
]);

export const STRIPES = Object.freeze([
  { id: "0", count: 0, en: "0 stripes", zh: "0 条条纹", bps: 1100 },
  { id: "1", count: 1, en: "1 stripe", zh: "1 条条纹", bps: 2200 },
  { id: "2", count: 2, en: "2 stripes", zh: "2 条条纹", bps: 3800 },
  { id: "3", count: 3, en: "3 stripes", zh: "3 条条纹", bps: 2200 },
  { id: "4", count: 4, en: "4 stripes", zh: "4 条条纹", bps: 700 },
]);

export const MARKS = Object.freeze([
  { id: "none", en: "unmarked", zh: "无斑", bps: 6400 },
  { id: "bar", en: "dorsal bar", zh: "背斑", bps: 2600 },
  { id: "spots", en: "twin spots", zh: "双斑", bps: 1000 },
]);

/** 链下多样性轴：约 2% 左右异色。不进 tokenURI，避免做成市场分级。 */
export const EYE_PAIRS = Object.freeze([
  { id: "matched", en: "matched eyes", zh: "双眼同色", bps: 9800 },
  { id: "split", en: "split eyes", zh: "左右异色", bps: 200 },
]);

/** 翅斑 / 翅纹：黑腹透明翅为多数；端斑、横带、花翅覆盖属内多样性。 */
export const WING_MARKS = Object.freeze([
  { id: "clear", en: "clear wings", zh: "透明翅", bps: 7000 },
  { id: "apical", en: "apical spot", zh: "端斑", bps: 1800 },
  { id: "banded", en: "banded wings", zh: "横带翅", bps: 800 },
  { id: "pictured", en: "pictured wings", zh: "花翅", bps: 400 },
]);

/** 翅形：野生型为主；miniature / curly / vestigial 是可观察的形态突变。 */
export const WING_SHAPES = Object.freeze([
  { id: "typical", en: "typical wings", zh: "普通翅", bps: 7800 },
  { id: "miniature", en: "miniature wings", zh: "小翅", bps: 1200 },
  { id: "curly", en: "curly wings", zh: "卷翅", bps: 700 },
  { id: "vestigial", en: "vestigial wings", zh: "残翅", bps: 300 },
]);

/** 翅脉式：完全脉序为主；缺脉与额外横脉是可筛选的脉序轴。 */
export const WING_VEINS = Object.freeze([
  { id: "complete", en: "complete veins", zh: "完全脉", bps: 8600 },
  { id: "incomplete", en: "incomplete veins", zh: "缺脉", bps: 1000 },
  { id: "extra", en: "extra crossvein", zh: "额外横脉", bps: 400 },
]);

/** 性别。性梳、腹部分节随性别画出；Sex 进 tokenURI。 */
export const SEXES = Object.freeze([
  { id: "female", en: "female", zh: "雌", bps: 5000 },
  { id: "male", en: "male", zh: "雄", bps: 5000 },
]);

export const MARKET_TRAITS = Object.freeze([
  "Body",
  "Saturation",
  "Light",
  "Eyes",
  "Size",
  "Stripes",
  "Mark",
  "Wings",
  "Wing shape",
  "Veins",
  "Sex",
  "Generation",
]);

export const FORBIDDEN_METADATA = Object.freeze([
  "Rarity",
  "Rank",
  "Legendary",
  "Epic",
  "Common",
  "Rare",
  "Mythic",
  "price",
  "floor",
]);

function assertBps(table, name) {
  const sum = table.reduce((n, row) => n + row.bps, 0);
  if (sum !== ROLL_MOD) throw new Error(`${name} weights must sum to ${ROLL_MOD}, got ${sum}`);
}

assertBps(HUES, "hue");
assertBps(SATS, "sat");
assertBps(LIGHTS, "light");
assertBps(EYES, "eye");
assertBps(SIZES, "size");
assertBps(STRIPES, "stripes");
assertBps(MARKS, "mark");
assertBps(EYE_PAIRS, "eyePair");
assertBps(WING_MARKS, "wingMark");
assertBps(WING_SHAPES, "wingShape");
assertBps(WING_VEINS, "wingVein");
assertBps(SEXES, "sex");

export function foldChips(chips, from, to) {
  let x = 0n;
  for (let i = from; i < to; i += 1) x = x * 31n + BigInt(chips[i]);
  return Number(x % BigInt(ROLL_MOD));
}

export function pickWeighted(roll, table) {
  let acc = 0;
  for (const row of table) {
    acc += row.bps;
    if (roll < acc) return row;
  }
  return table[table.length - 1];
}

/** 在排除某一档之后按原权重再掷。用于左右异色时第二只眼不能撞上第一只。 */
export function pickExcluding(roll, table, excludeId) {
  const filtered = table.filter((row) => row.id !== excludeId);
  if (!filtered.length) return table[table.length - 1];
  const total = filtered.reduce((n, row) => n + row.bps, 0);
  return pickWeighted(roll % total, filtered);
}

export function bpsOf(table, id) {
  const row = table.find((item) => item.id === id);
  if (!row) throw new Error(`Unknown trait ${id}`);
  return row.bps;
}

export function formatRate(bps) {
  const pct = bps / 100;
  return pct >= 10 ? String(Math.round(pct)) : pct.toFixed(1);
}

export function formatExpected(count) {
  if (count >= 10) return String(Math.round(count));
  if (count >= 1) return count.toFixed(1);
  if (count >= 0.1) return count.toFixed(2);
  return "<0.1";
}

export function traitProbability(phenotype) {
  const hueBps = bpsOf(HUES, phenotype.hue.id);
  const satBps = bpsOf(SATS, phenotype.sat.id);
  const eyeBps = bpsOf(EYES, phenotype.eye.id);
  const sizeBps = bpsOf(SIZES, phenotype.size.id);
  const stripeBps = bpsOf(STRIPES, String(phenotype.stripes.count));
  const markBps = bpsOf(MARKS, phenotype.mark.id);
  const wingMarkBps = bpsOf(WING_MARKS, phenotype.wingMark.id);
  const wingShapeBps = bpsOf(WING_SHAPES, phenotype.wingShape.id);
  const wingVeinBps = bpsOf(WING_VEINS, phenotype.wingVein.id);
  const sexBps = bpsOf(SEXES, phenotype.sex.id);
  const lightLocked = phenotype.hue.id === "bone";
  const lightBps = lightLocked ? ROLL_MOD : bpsOf(LIGHTS, phenotype.light.id);
  return {
    hue: hueBps,
    sat: satBps,
    light: lightBps,
    lightLocked,
    eye: eyeBps,
    size: sizeBps,
    stripes: stripeBps,
    mark: markBps,
    wingMark: wingMarkBps,
    wingShape: wingShapeBps,
    wingVein: wingVeinBps,
    sex: sexBps,
    combo:
      (hueBps / ROLL_MOD) *
      (satBps / ROLL_MOD) *
      (lightBps / ROLL_MOD) *
      (eyeBps / ROLL_MOD) *
      (sizeBps / ROLL_MOD) *
      (stripeBps / ROLL_MOD) *
      (markBps / ROLL_MOD) *
      (wingMarkBps / ROLL_MOD) *
      (wingShapeBps / ROLL_MOD) *
      (wingVeinBps / ROLL_MOD) *
      (sexBps / ROLL_MOD),
  };
}

let catalogCache = null;

export function comboCatalog() {
  if (catalogCache) return catalogCache;
  const rows = [];
  for (const hue of HUES) {
    const lights = hue.id === "bone" ? [{ ...LIGHTS[2], bps: ROLL_MOD }] : LIGHTS;
    for (const sat of SATS) {
      for (const light of lights) {
        for (const eye of EYES) {
          for (const size of SIZES) {
            for (const stripe of STRIPES) {
              for (const mark of MARKS) {
                const combo =
                  (hue.bps / ROLL_MOD) *
                  (sat.bps / ROLL_MOD) *
                  (light.bps / ROLL_MOD) *
                  (eye.bps / ROLL_MOD) *
                  (size.bps / ROLL_MOD) *
                  (stripe.bps / ROLL_MOD) *
                  (mark.bps / ROLL_MOD);
                rows.push({
                  key: `${hue.id}|${sat.id}|${light.id}|${eye.id}|${size.id}|${stripe.count}|${mark.id}`,
                  p: combo,
                });
              }
            }
          }
        }
      }
    }
  }
  rows.sort((a, b) => b.p - a.p);
  let seen = 0;
  const byKey = new Map();
  for (const row of rows) {
    row.commonerShare = seen;
    seen += row.p;
    row.scarcerThan = row.commonerShare;
    byKey.set(row.key, row);
  }
  catalogCache = { rows, byKey };
  return catalogCache;
}

export function scarcityOf(phenotype) {
  const rates = traitProbability(phenotype);
  const key = [
    phenotype.hue.id,
    phenotype.sat.id,
    phenotype.light.id,
    phenotype.eye.id,
    phenotype.size.id,
    phenotype.stripes.count,
    phenotype.mark.id,
  ].join("|");
  const row = comboCatalog().byKey.get(key);
  return {
    comboP: rates.combo,
    scoreBits: -Math.log2(rates.combo),
    expectedPer1024: rates.combo * GEN0_SUPPLY,
    scarcerThan: row ? row.scarcerThan : 0,
    rates,
  };
}

export function marketAttributes(phenotype, generation = "Gen0") {
  return [
    { trait_type: "Body", value: phenotype.hue.id },
    { trait_type: "Saturation", value: phenotype.sat.id },
    { trait_type: "Light", value: phenotype.light.id },
    { trait_type: "Eyes", value: phenotype.eye.id },
    { trait_type: "Size", value: phenotype.size.id },
    { trait_type: "Stripes", value: phenotype.stripes.count, display_type: "number", max_value: 4 },
    { trait_type: "Mark", value: phenotype.mark.id },
    { trait_type: "Wings", value: phenotype.wingMark.id },
    { trait_type: "Wing shape", value: phenotype.wingShape.id },
    { trait_type: "Veins", value: phenotype.wingVein.id },
    { trait_type: "Sex", value: phenotype.sex.id },
    { trait_type: "Generation", value: generation },
  ];
}

export function buildPhenotypeManifest() {
  const describe = (table, extra = (row) => ({ ...row })) =>
    table.map((row) => extra({ id: row.id, bps: row.bps, pct: row.bps / 100, expectedPer1024: (row.bps / ROLL_MOD) * GEN0_SUPPLY }));
  return {
    schema: "iff.phenotype-loci/3",
    decoder: PHENOTYPE_DECODER,
    supply: GEN0_SUPPLY,
    rollModulus: ROLL_MOD,
    rules: [
      "Each locus folds its chips with x * 31 + chip, then rolls against a 10000-bps table.",
      "Bone body locks Light to light. That lock is visible, not a hidden bonus.",
      "tokenURI carries filterable attributes only. No rarity rank, grade, or price.",
      "Collection rank is computed after mint from the live set and changes until sold out.",
      "Chips 56–63 read eye-pair mosaicism off chain. Split eyes are not a tokenURI trait.",
      "Chips 64–95 read wing mark / shape / veins and sex. Those four are tokenURI filters.",
      "Sex is rolled each generation. Wing loci enter Kin crossover; sex does not.",
    ],
    traits: {
      hue: describe(HUES),
      sat: describe(SATS),
      light: describe(LIGHTS),
      eye: describe(EYES),
      size: describe(SIZES),
      stripes: describe(STRIPES, (row) => ({ ...row, count: Number(row.id) })),
      mark: describe(MARKS),
      wingMark: describe(WING_MARKS),
      wingShape: describe(WING_SHAPES),
      wingVein: describe(WING_VEINS),
      sex: describe(SEXES),
      eyePair: describe(EYE_PAIRS),
    },
    market: {
      tokenUriContains: [...MARKET_TRAITS],
      tokenUriMustNotContain: [...FORBIDDEN_METADATA],
      displayOnly: ["eyePair"],
      listingKey: "chainId + collection + tokenId + lifeId",
      clones: "Same looks may exist. Looks are not a unique key.",
      transfer: "ERC-721 transfer clears authorizedRunner and increments controlEpoch.",
    },
  };
}
