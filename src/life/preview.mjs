/**
 * 预览图鉴 —— 未出生标本的确定性目录。
 *
 * 顺序扫描 seed（1..cap），收录每个「首位出现」的性状值，直到市场位点
 * 全部性状值都至少出现过一次。每张标本都是真实可铸的 seed 读出，不是合成的示意图；
 * 但链上还没有任何灵魂 —— 页面上必须带「未出生」标注。
 */
import { expressPhenotype } from "../brain/flyswarm/phenotype.mjs";
import { soulGenome } from "./identity.mjs";
import { traitsOfSeed } from "./descent.mjs";

export const PREVIEW_LOCUS_COUNT = 11;
/** hue12+sat3+light3+eye6+size3+stripes5+mark3 + wingMark4+wingShape4+wingVein3+sex2 = 48 */
export const PREVIEW_VALUE_COUNT = 48;

let cache = null;

/** 每个性状值收录几个标本（2 = 目录更丰满，扫描仍是毫秒级）。 */
const PER_VALUE = 4;

export function previewSpecimens({ cap = 12000 } = {}) {
  if (cache) return cache;
  const counts = new Map();
  const taken = new Set();
  const rows = [];
  const saturated = () =>
    counts.size === PREVIEW_VALUE_COUNT &&
    [...counts.values()].every((n) => n >= PER_VALUE);
  for (let seed = 1; seed <= cap && !saturated(); seed += 1) {
    const traits = traitsOfSeed(seed);
    const combo = traits.join("|");
    if (taken.has(combo)) continue;
    const fresh = [];
    for (let locus = 0; locus < PREVIEW_LOCUS_COUNT; locus += 1) {
      const key = `${locus}:${traits[locus]}`;
      if ((counts.get(key) || 0) < PER_VALUE) fresh.push(key);
    }
    if (!fresh.length) continue;
    for (const key of fresh) counts.set(key, (counts.get(key) || 0) + 1);
    taken.add(combo);
    const phenotype = expressPhenotype(soulGenome({ seed, generation: 0 }));
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
  cache = rows;
  return rows;
}
