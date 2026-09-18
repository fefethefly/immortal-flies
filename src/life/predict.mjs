/**
 * Descent predictor —— 预测器取样层。
 *
 * SoulKinCross / SoulKinCrossFee 的规则（见 KinCrossover.sol 与 descent.mjs）：
 * 每个位点等概率取自一位亲本，约 2% 突变按公布率表重掷，子代 seed 研磨产生。
 * 百分比展示用规则的解析期望（expectedCrossoverLoci）；样本子代逐只经真实
 * 研磨公式生成——是真实可铸出的 seed，不是示意图片。
 */
import { expressPhenotype } from "../brain/flyswarm/phenotype.mjs";
import {
  EYES,
  HUES,
  LIGHTS,
  MARKS,
  SATS,
  SEXES,
  SIZES,
  STRIPES,
  WING_MARKS,
  WING_SHAPES,
  WING_VEINS,
} from "../brain/flyswarm/phenotype-loci.mjs";
import { soulGenome } from "./identity.mjs";
import { grindCrossover } from "./descent.mjs";

function randomEntropy() {
  const bytes = new Uint8Array(32);
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.getRandomValues) {
    cryptoRef.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "0x";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** 确定性熵源：测试与「重放同一次预测」用。step 混入避免重复熵。 */
export function seededEntropy(root = "0x1") {
  let state = BigInt(root) || 1n;
  return (step = 0) => {
    state =
      (state * 6364136223846793005n + 1442695040888963407n) &
      0xffffffffffffffffn;
    const mix = (state ^ BigInt(step + 1)) & 0xffffffffffffffffn;
    return `0x${mix.toString(16).padStart(16, "0").repeat(4)}`;
  };
}

/** 公布率表的解析期望（%）—— Gen0 口径。 */
export function expectedLoci() {
  const toRows = (table) =>
    table.map((row) => ({ id: String(row.id), pct: row.bps / 100 }));
  return {
    hue: toRows(HUES),
    sat: toRows(SATS),
    light: toRows(LIGHTS),
    eye: toRows(EYES),
    size: toRows(SIZES),
    stripes: toRows(STRIPES),
    mark: toRows(MARKS),
    wingMark: toRows(WING_MARKS),
    wingShape: toRows(WING_SHAPES),
    wingVein: toRows(WING_VEINS),
    sex: toRows(SEXES),
  };
}

/**
 * 研磨出 count 只样本子代。每只走完整的 childSeedOfCrossover ——
 * 与链上 breed() 在同一熵下必然产出同一 seed。
 */
export function sampleDescent({
  parentA,
  parentB,
  collection,
  requestId = 1,
  chainId = 0,
  genesisRoot,
  count = 6,
  rng = randomEntropy,
}) {
  if (!parentA || !parentB) throw new Error("Two parents are required");
  if (Number(parentA.tokenId) === Number(parentB.tokenId)) {
    throw new Error("Parents must differ");
  }
  const generation =
    Math.max(Number(parentA.generation) || 0, Number(parentB.generation) || 0) +
    1;
  const parentSouls = [parentA.life, parentB.life].filter(Boolean);
  const samples = [];
  let rarest = null;
  for (let i = 0; i < count; i += 1) {
    const entropy = rng(i);
    const grind = grindCrossover({
      seedA: parentA.seed,
      seedB: parentB.seed,
      collection,
      requestId,
      entropy,
    });
    const phenotype = expressPhenotype(
      soulGenome({
        seed: grind.seed,
        genesisRoot,
        chainId,
        generation,
        parentSouls,
      }),
    );
    const expected = phenotype.scarcity?.expectedPer1024;
    const sample = {
      seed: grind.seed,
      n: grind.n,
      generation,
      phenotype,
      expectedPer1024: typeof expected === "number" ? expected : Infinity,
      mutations: grind.sources.filter((source) => source === 2).length,
      sources: grind.sources,
    };
    if (typeof expected === "number") {
      if (!rarest || expected < rarest.expectedPer1024) rarest = sample;
    }
    samples.push(sample);
  }
  return { generation, requestId, samples, rarest, draws: count };
}
