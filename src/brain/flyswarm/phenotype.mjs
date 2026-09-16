/**
 * phenotype-loci/1 —— 基因组的确定性读出。纯函数，不写 Genome。
 *
 * 64 个 genome chips 是 seed / mutateRoot 的可检查展开，不是神经元。
 */
import { genomeOf } from "./genome.mjs";

export const PHENOTYPE_DECODER = "phenotype-loci/1";
export const CHIP_COUNT = 64;

const LOCI = Object.freeze([
  { id: "hue", from: 0, to: 24 },
  { id: "sat", from: 24, to: 36 },
  { id: "light", from: 36, to: 48 },
  { id: "eye", from: 48, to: 56 },
  { id: "size", from: 56, to: 60 },
  { id: "stripes", from: 60, to: 64 },
]);

const HUES = Object.freeze([
  { id: "amber", deg: 38, en: "amber", zh: "琥珀" },
  { id: "umber", deg: 24, en: "umber", zh: "赭褐" },
  { id: "olive", deg: 72, en: "olive", zh: "橄榄" },
  { id: "slate", deg: 210, en: "slate", zh: "青灰" },
  { id: "ink", deg: 230, en: "ink", zh: "墨色" },
  { id: "wine", deg: 350, en: "wine", zh: "酒红" },
  { id: "rust", deg: 16, en: "rust", zh: "铁锈" },
  { id: "sand", deg: 42, en: "sand", zh: "沙色" },
  { id: "copper", deg: 28, en: "copper", zh: "红铜" },
  { id: "pine", deg: 148, en: "pine", zh: "松绿" },
  { id: "indigo", deg: 255, en: "indigo", zh: "靛蓝" },
  { id: "bone", deg: 40, en: "bone", zh: "骨白" },
]);

const SATS = Object.freeze([
  { id: "muted", en: "muted", zh: "柔和", pct: 34 },
  { id: "clear", en: "clear", zh: "清澈", pct: 48 },
  { id: "vivid", en: "vivid", zh: "鲜明", pct: 62 },
]);

const LIGHTS = Object.freeze([
  { id: "dark", en: "dark", zh: "偏暗", pct: 30 },
  { id: "mid", en: "mid", zh: "适中", pct: 42 },
  { id: "light", en: "light", zh: "偏亮", pct: 54 },
]);

const EYES = Object.freeze([
  { id: "wild", en: "wild-type eyes", zh: "普通眼", hex: "#b57660" },
  { id: "cinnabar", en: "cinnabar eyes", zh: "朱砂眼", hex: "#c23b2e" },
  { id: "sepia", en: "sepia eyes", zh: "墨褐眼", hex: "#6b4a32" },
  { id: "vermilion", en: "vermilion eyes", zh: "朱红眼", hex: "#d46a4a" },
  { id: "white", en: "white eyes", zh: "白眼", hex: "#e4d9c4" },
  { id: "pale", en: "pale eyes", zh: "淡眼", hex: "#c4b49a" },
]);

const SIZES = Object.freeze([
  { id: "petite", en: "petite", zh: "偏小", scale: 0.88 },
  { id: "typical", en: "typical", zh: "普通", scale: 1 },
  { id: "large", en: "large", zh: "粗壮", scale: 1.12 },
]);

function xorshift32(value) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function mixRoot(mutateRoot) {
  if (typeof mutateRoot !== "string" || mutateRoot.length < 10) return 0;
  return Number.parseInt(mutateRoot.slice(2, 10), 16) || 0;
}

function expandChips(seed, mutateRoot) {
  let rng = seed >>> 0 || 1;
  const mix = mixRoot(mutateRoot);
  const chips = [];
  for (let i = 0; i < CHIP_COUNT; i++) {
    rng = xorshift32(rng ^ (i * 0x9e3779b9) ^ mix) || 1;
    chips.push(rng >>> 24);
  }
  return chips;
}

function meanOf(chips, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += chips[i];
  return Math.round(sum / Math.max(1, to - from));
}

function pick(list, value) {
  return list[Math.min(list.length - 1, Math.floor((value * list.length) / 256))];
}

function hslToHex(h, s, l) {
  const sat = s / 100,
    lit = l / 100;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = lit - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function named(row) {
  return { id: row.id, en: row.en, zh: row.zh };
}

export function expressPhenotype(genomeInput) {
  const genome = genomeOf(genomeInput);
  const chips = expandChips(genome.seed, genome.mutateRoot);
  const hueMean = meanOf(chips, 0, 24);
  const satMean = meanOf(chips, 24, 36);
  const lightMean = meanOf(chips, 36, 48);
  const eyeMean = meanOf(chips, 48, 56);
  const sizeMean = Math.min(
    255,
    meanOf(chips, 56, 60) + genome.generation * 10 + (genome.inheritBias ? 16 : 0),
  );
  const stripeMean = meanOf(chips, 60, 64);
  const hue = pick(HUES, hueMean);
  const sat = pick(SATS, satMean);
  const light = hue.id === "bone" ? LIGHTS[2] : pick(LIGHTS, lightMean);
  const eye = pick(EYES, eyeMean);
  const size = pick(SIZES, sizeMean);
  const stripeCount = Math.min(4, Math.floor((stripeMean * 5) / 256));
  const stripeLabel = {
    en: stripeCount === 1 ? "1 stripe" : `${stripeCount} stripes`,
    zh: `${stripeCount} 条条纹`,
  };
  const body = hslToHex(hue.deg, sat.pct, light.pct);
  const locusOf = (i) => LOCI.find((row) => i >= row.from && i < row.to).id;
  const summary = {
    en: `${hue.en} · ${sat.en} · ${light.en} · ${eye.en} · ${size.en} · ${stripeLabel.en}`,
    zh: `${hue.zh} · ${sat.zh} · ${light.zh} · ${eye.zh} · ${size.zh} · ${stripeLabel.zh}`,
  };
  return {
    schema: PHENOTYPE_DECODER,
    decoder: PHENOTYPE_DECODER,
    soulId: genome.soulId,
    seed: genome.seed,
    generation: genome.generation,
    chips: chips.map((value, i) => ({ i, value, locus: locusOf(i) })),
    hue: { ...named(hue), deg: hue.deg, from: 0, to: 23 },
    sat: { ...named(sat), from: 24, to: 35 },
    light: { ...named(light), from: 36, to: 47 },
    eye: { ...named(eye), hex: eye.hex, from: 48, to: 55 },
    size: { ...named(size), scale: size.scale, from: 56, to: 59 },
    stripes: {
      count: stripeCount,
      en: stripeLabel.en,
      zh: stripeLabel.zh,
      from: 60,
      to: 63,
    },
    art: {
      body,
      eye: eye.hex,
      vein: "#e6e0cf",
      gold: "#c9a25e",
      scale: size.scale,
      stripes: stripeCount,
    },
    summary,
  };
}

export function phenotypeOf(source) {
  return expressPhenotype(genomeOf(source));
}

export function chipFill(chip, phenotype) {
  const t = chip.value / 255;
  if (chip.locus === "hue") return hslToHex(phenotype.hue.deg, 46, 28 + t * 36);
  if (chip.locus === "sat") return hslToHex(phenotype.hue.deg, 22 + t * 50, 44);
  if (chip.locus === "light") return hslToHex(phenotype.hue.deg, 28, 18 + t * 52);
  if (chip.locus === "eye") return phenotype.eye.hex;
  if (chip.locus === "size") return hslToHex(38, 36, 28 + t * 40);
  return t > 0.45 ? "#c9a25e" : "#2f2a1f";
}
