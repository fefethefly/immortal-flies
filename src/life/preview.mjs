/**
 * 预览图鉴 —— 未出生标本的确定性目录。
 *
 * 顺序扫描 seed（1..cap），收录每个「首位出现」的性状值，直到市场位点
 * 全部性状值及链下复眼配对都被覆盖。每张标本都是真实可铸的 seed 读出，不是合成的示意图；
 * 但链上还没有任何灵魂 —— 页面上必须带「未出生」标注。
 */
import { expressPhenotype } from "../brain/flyswarm/phenotype.mjs";
import { soulGenome } from "./identity.mjs";
import { traitsOfSeed } from "./descent.mjs";

export const PREVIEW_LOCUS_COUNT = 11;
/** hue12+sat3+light3+eye6+size3+stripes5+mark3 + wingMark4+wingShape4+wingVein3+sex2 = 48 */
export const PREVIEW_VALUE_COUNT = 48;

const cache = new Map();

/** Keep several real seeds for each trait, including display-only eye pairs. */
const PER_VALUE = 4;

export function previewSpecimens({ cap = 12000 } = {}) {
  if (cache.has(cap)) return cache.get(cap);
  const counts = new Map();
  const taken = new Set();
  const rows = [];
  const saturated = () =>
    counts.size === PREVIEW_VALUE_COUNT + 2 &&
    [...counts.values()].every((n) => n >= PER_VALUE);
  for (let seed = 1; seed <= cap && !saturated(); seed += 1) {
    const traits = traitsOfSeed(seed);
    const phenotype = expressPhenotype(soulGenome({ seed, generation: 0 }));
    const combo = [...traits, phenotype.eyePair.id, phenotype.eyeOther.id].join(
      "|",
    );
    if (taken.has(combo)) continue;
    const fresh = [];
    for (let locus = 0; locus < PREVIEW_LOCUS_COUNT; locus += 1) {
      const key = `${locus}:${traits[locus]}`;
      if ((counts.get(key) || 0) < PER_VALUE) fresh.push(key);
    }
    const pairKey = `eyePair:${phenotype.eyePair.id}`;
    if ((counts.get(pairKey) || 0) < PER_VALUE) fresh.push(pairKey);
    if (!fresh.length) continue;
    for (const key of fresh) counts.set(key, (counts.get(key) || 0) + 1);
    taken.add(combo);
    rows.push({
      seed,
      tokenId: seed,
      generation: 0,
      owner: "",
      life: "",
      givenName: "",
      parentA: 0,
      parentB: 0,
      phenotype,
      expectedPer1024: phenotype.scarcity?.expectedPer1024 ?? Infinity,
      preview: true,
    });
  }
  rows.sort((a, b) => a.expectedPer1024 - b.expectedPer1024 || a.seed - b.seed);
  cache.set(cap, rows);
  return rows;
}

/** Curated morphology examples, not a frequency sample or a rarity ranking. */
export function previewSpotlight(rows = previewSpecimens()) {
  const selected = [];
  const candidates = [...rows].sort((a, b) => a.seed - b.seed);
  const add = (test) => {
    const row = candidates.find(
      (soul) => !selected.includes(soul) && test(soul),
    );
    if (row) selected.push(row);
  };
  for (const shape of [
    "typical",
    "typical",
    "miniature",
    "curly",
    "vestigial",
  ]) {
    const matching = (soul) => soul.phenotype.wingShape.id === shape;
    const before = selected.length;
    add(
      (soul) =>
        matching(soul) &&
        !selected.some((s) => s.phenotype.hue.id === soul.phenotype.hue.id),
    );
    if (before === selected.length) add(matching);
  }
  // Prefer a naturally contrasting pair so the small card teaches the trait.
  const contrast = (soul) => {
    const a = soul.phenotype.art.eyeLeft
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    const b = soul.phenotype.art.eyeRight
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16));
    return a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
  };
  const split = candidates
    .filter(
      (soul) =>
        soul.phenotype.eyePair.id === "split" && !selected.includes(soul),
    )
    .sort((a, b) => contrast(b) - contrast(a) || a.seed - b.seed)[0];
  if (split) selected.push(split);
  return selected;
}
