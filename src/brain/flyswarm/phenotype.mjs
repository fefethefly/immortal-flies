/**
 * phenotype-loci/3 —— 基因组的确定性读出。纯函数，不写 Genome。
 *
 * 96 个 genome chips 是 seed / mutateRoot 的可检查展开，不是神经元。
 */
import { genomeOf } from "./genome.mjs";
import {
  CHIP_COUNT,
  EYES,
  EYE_PAIRS,
  HUES,
  LIGHTS,
  LOCI,
  MARKS,
  PHENOTYPE_DECODER,
  SATS,
  SEXES,
  SIZES,
  STRIPES,
  WING_MARKS,
  WING_SHAPES,
  WING_VEINS,
  foldChips,
  pickExcluding,
  pickWeighted,
  scarcityOf,
} from "./phenotype-loci.mjs";

export {
  CHIP_COUNT,
  PHENOTYPE_DECODER,
  foldChips,
  marketAttributes,
  scarcityOf,
} from "./phenotype-loci.mjs";

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
  for (let i = 0; i < CHIP_COUNT; i += 1) {
    rng = xorshift32(rng ^ (i * 0x9e3779b9) ^ mix) || 1;
    chips.push(rng >>> 24);
  }
  return chips;
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const lit = l / 100;
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
  return { id: row.id, en: row.en, zh: row.zh, bps: row.bps };
}

function rollLocus(chips, id, table) {
  const locus = LOCI.find((row) => row.id === id);
  return pickWeighted(foldChips(chips, locus.from, locus.to), table);
}

export function expressPhenotype(genomeInput) {
  const genome = genomeOf(genomeInput);
  const chips = expandChips(genome.seed, genome.mutateRoot);
  const hue = rollLocus(chips, "hue", HUES);
  const sat = rollLocus(chips, "sat", SATS);
  const light = hue.id === "bone" ? LIGHTS[2] : rollLocus(chips, "light", LIGHTS);
  const eye = rollLocus(chips, "eye", EYES);
  const size = rollLocus(chips, "size", SIZES);
  const stripe = rollLocus(chips, "stripes", STRIPES);
  const mark = rollLocus(chips, "mark", MARKS);
  const pair = rollLocus(chips, "eyePair", EYE_PAIRS);
  const wingMark = rollLocus(chips, "wingMark", WING_MARKS);
  const wingShape = rollLocus(chips, "wingShape", WING_SHAPES);
  const wingVein = rollLocus(chips, "wingVein", WING_VEINS);
  const sex = rollLocus(chips, "sex", SEXES);
  const other =
    pair.id === "split"
      ? pickExcluding(foldChips(chips, 60, 64), EYES, eye.id)
      : eye;
  const body = hslToHex(hue.deg, sat.pct, light.pct);
  const locusOf = (i) => LOCI.find((row) => i >= row.from && i < row.to).id;
  const eyePhrase =
    pair.id === "split"
      ? { en: `${eye.en} / ${other.en}`, zh: `${eye.zh} / ${other.zh}` }
      : { en: eye.en, zh: eye.zh };
  const summary = {
    en: `${hue.en} · ${sex.en} · ${eyePhrase.en} · ${wingShape.en} · ${wingMark.en} · ${size.en} · ${stripe.en}`,
    zh: `${hue.zh} · ${sex.zh} · ${eyePhrase.zh} · ${wingShape.zh} · ${wingMark.zh} · ${size.zh} · ${stripe.zh}`,
  };
  const phenotype = {
    schema: PHENOTYPE_DECODER,
    decoder: PHENOTYPE_DECODER,
    soulId: genome.soulId,
    seed: genome.seed,
    generation: genome.generation,
    chips: chips.map((value, i) => ({ i, value, locus: locusOf(i) })),
    hue: { ...named(hue), deg: hue.deg, from: 0, to: 7 },
    sat: { ...named(sat), from: 8, to: 15 },
    light: { ...named(light), from: 16, to: 23 },
    eye: { ...named(eye), hex: eye.hex, from: 24, to: 31 },
    size: { ...named(size), scale: size.scale, from: 32, to: 39 },
    stripes: {
      id: stripe.id,
      count: stripe.count,
      en: stripe.en,
      zh: stripe.zh,
      bps: stripe.bps,
      from: 40,
      to: 47,
    },
    mark: { ...named(mark), from: 48, to: 55 },
    eyePair: { ...named(pair), from: 56, to: 59 },
    eyeOther: { ...named(other), hex: other.hex, from: 60, to: 63 },
    wingMark: { ...named(wingMark), from: 64, to: 71 },
    wingShape: { ...named(wingShape), from: 72, to: 79 },
    wingVein: { ...named(wingVein), from: 80, to: 87 },
    sex: { ...named(sex), from: 88, to: 95 },
    art: {
      body,
      eye: eye.hex,
      eyeLeft: eye.hex,
      eyeRight: other.hex,
      vein: "#e6e0cf",
      gold: "#f0b90b",
      scale: size.scale,
      stripes: stripe.count,
      mark: mark.id,
      wingMark: wingMark.id,
      wingShape: wingShape.id,
      wingVein: wingVein.id,
      sex: sex.id,
    },
    summary,
  };
  phenotype.scarcity = scarcityOf(phenotype);
  return phenotype;
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
  if (chip.locus === "eyePair") {
    return phenotype.eyePair?.id === "split" ? "#f0b90b" : phenotype.eye.hex;
  }
  if (chip.locus === "eyeOther") {
    return phenotype.art?.eyeRight || phenotype.eye.hex;
  }
  if (chip.locus === "size") return hslToHex(38, 36, 28 + t * 40);
  if (chip.locus === "mark") {
    if (phenotype.mark.id === "bar") return "#f0b90b";
    if (phenotype.mark.id === "spots") return "#8a6a3a";
    return "#2f2a1f";
  }
  if (chip.locus === "wingMark") {
    if (phenotype.wingMark.id === "apical") return "#30271d";
    if (phenotype.wingMark.id === "banded") return "#5a4632";
    if (phenotype.wingMark.id === "pictured") return "#8a6a3a";
    return "#e6e0cf";
  }
  if (chip.locus === "wingShape") {
    if (phenotype.wingShape.id === "vestigial") return "#6b5340";
    if (phenotype.wingShape.id === "curly") return "#c4a574";
    if (phenotype.wingShape.id === "miniature") return "#d9cbb0";
    return "#e6e0cf";
  }
  if (chip.locus === "wingVein") return t > 0.5 ? "#cfc6b4" : "#8a8172";
  if (chip.locus === "sex") return phenotype.sex.id === "male" ? "#f0b90b" : "#d9d0bb";
  return t > 0.45 ? "#f0b90b" : "#2f2a1f";
}
