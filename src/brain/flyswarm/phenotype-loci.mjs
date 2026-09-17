/**
 * phenotype-loci/2 —— 面向二级市场的基因组读出规格。
 *
 * 铸的是 Genome。性状是加权抽取，不是均值挤中间，也不是 Common/Rare 定价。
 * 出现率公开；tokenURI 只给可筛选属性。名次随已铸造集合变，不能写进元数据。
 */
export const PHENOTYPE_DECODER = "phenotype-loci/2";
export const CHIP_COUNT = 64;
export const ROLL_MOD = 10000;
export const GEN0_SUPPLY = 1024;

export const LOCI = Object.freeze([
  { id: "hue", from: 0, to: 8 },
  { id: "sat", from: 8, to: 16 },
  { id: "light", from: 16, to: 24 },
  { id: "eye", from: 24, to: 32 },
  { id: "size", from: 32, to: 40 },
  { id: "stripes", from: 40, to: 48 },
  { id: "mark", from: 48, to: 56 },
  { id: "seal", from: 56, to: 64 },
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

export const MARKET_TRAITS = Object.freeze([
  "Body",
  "Saturation",
  "Light",
  "Eyes",
  "Size",
  "Stripes",
  "Mark",
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
    combo:
      (hueBps / ROLL_MOD) *
      (satBps / ROLL_MOD) *
      (lightBps / ROLL_MOD) *
      (eyeBps / ROLL_MOD) *
      (sizeBps / ROLL_MOD) *
      (stripeBps / ROLL_MOD) *
      (markBps / ROLL_MOD),
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
    { trait_type: "Generation", value: generation },
  ];
}

export function buildPhenotypeManifest() {
  const describe = (table, extra = (row) => ({ ...row })) =>
    table.map((row) => extra({ id: row.id, bps: row.bps, pct: row.bps / 100, expectedPer1024: (row.bps / ROLL_MOD) * GEN0_SUPPLY }));
  return {
    schema: "iff.phenotype-loci/2",
    decoder: PHENOTYPE_DECODER,
    supply: GEN0_SUPPLY,
    rollModulus: ROLL_MOD,
    rules: [
      "Each locus folds its chips with x * 31 + chip, then rolls against a 10000-bps table.",
      "Bone body locks Light to light. That lock is visible, not a hidden bonus.",
      "tokenURI carries filterable attributes only. No rarity rank, grade, or price.",
      "Collection rank is computed after mint from the live set and changes until sold out.",
    ],
    traits: {
      hue: describe(HUES),
      sat: describe(SATS),
      light: describe(LIGHTS),
      eye: describe(EYES),
      size: describe(SIZES),
      stripes: describe(STRIPES, (row) => ({ ...row, count: Number(row.id) })),
      mark: describe(MARKS),
    },
    market: {
      tokenUriContains: [...MARKET_TRAITS],
      tokenUriMustNotContain: [...FORBIDDEN_METADATA],
      listingKey: "chainId + collection + tokenId + lifeId",
      clones: "Same looks may exist. Looks are not a unique key.",
      transfer: "ERC-721 transfer clears authorizedRunner and increments controlEpoch.",
    },
  };
}
