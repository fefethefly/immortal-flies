/**
 * KinCrossover 的 JS 镜像 —— 与 contracts/life/KinCrossover.sol 逐位一致。
 *
 * 规则：每个交叉位点（hue/sat/light/eye/size/stripes/mark/wingMark/wingShape/wingVein）
 * 取自亲本 A、亲本 B，或突变（源字节 < 5，约 1.95% ≈ 2%，按公布率表重掷）。
 * 性别每代从 chips 88–95 重掷，不进研磨。子代 seed 是确定性血裔候选流中的全中候选。
 */
import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import { CROSS_LOCUS_COUNT } from "../brain/flyswarm/phenotype-loci.mjs";
import { KIN_LOCI } from "./colony.mjs";

export const CROSS_DOMAIN = keccak256(toUtf8Bytes("ifs.descent-cross/1"));
export const GRIND_DOMAIN = keccak256(toUtf8Bytes("ifs.descent-grind/1"));
export const MUTATION_BYTE_MAX = 5;
export const MUTATION_RATE = MUTATION_BYTE_MAX / 256;
/** 链下研磨的软上限：防呆用，正常配对远在百万级以下就能全中。 */
export const GRIND_LIMIT = 1 << 22;
export { CROSS_LOCUS_COUNT };

const abi = AbiCoder.defaultAbiCoder();

function hexToBytes32Array(hex) {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    out[i] = Number.parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  }
  return out;
}

const GRIND_DOMAIN_BYTES = hexToBytes32Array(GRIND_DOMAIN);

/** 与 SoulRenderer.decode / phenotype.mjs 相同的 bps 表（交叉位点位序一致）。 */
const LOCUS_WEIGHTS = [
  [1600, 1500, 1300, 400, 350, 850, 900, 1300, 700, 650, 250, 200],
  [5000, 3500, 1500],
  [3000, 5200, 1800],
  [4200, 1800, 1400, 1600, 700, 300],
  [2400, 5600, 2000],
  [1100, 2200, 3800, 2200, 700],
  [6400, 2600, 1000],
  [7000, 1800, 800, 400],
  [7800, 1200, 700, 300],
  [8600, 1000, 400],
];

const SEX_WEIGHTS = [5000, 5000];

function pickW(roll, weights) {
  let acc = 0;
  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i];
    if (roll < acc) return i;
  }
  return weights.length - 1;
}

function xorshift32(value) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function chipStart(locus) {
  return locus < 7 ? locus * 8 : 64 + (locus - 7) * 8;
}

/**
 * 精简表型解码：10 个交叉位点 + 性别（含骨白锁 light）。
 * 必须与 expressPhenotype 的位点结果一致。
 */
export function traitsOfSeed(seed) {
  let rng = seed >>> 0 || 1;
  const acc = Array(12).fill(0);
  for (let i = 0; i < 96; i += 1) {
    rng = xorshift32(rng ^ (i * 0x9e3779b9)) || 1;
    acc[i >>> 3] = acc[i >>> 3] * 31 + (rng >>> 24);
  }
  const t = [];
  t[0] = pickW(acc[0] % 10000, LOCUS_WEIGHTS[0]);
  t[1] = pickW(acc[1] % 10000, LOCUS_WEIGHTS[1]);
  t[2] = t[0] === 11 ? 2 : pickW(acc[2] % 10000, LOCUS_WEIGHTS[2]);
  t[3] = pickW(acc[3] % 10000, LOCUS_WEIGHTS[3]);
  t[4] = pickW(acc[4] % 10000, LOCUS_WEIGHTS[4]);
  t[5] = pickW(acc[5] % 10000, LOCUS_WEIGHTS[5]);
  t[6] = pickW(acc[6] % 10000, LOCUS_WEIGHTS[6]);
  t[7] = pickW(acc[8] % 10000, LOCUS_WEIGHTS[7]);
  t[8] = pickW(acc[9] % 10000, LOCUS_WEIGHTS[8]);
  t[9] = pickW(acc[10] % 10000, LOCUS_WEIGHTS[9]);
  t[10] = pickW(acc[11] % 10000, SEX_WEIGHTS);
  return t;
}

function streamOf({ collection, requestId, entropy }) {
  return keccak256(
    abi.encode(
      ["bytes32", "address", "uint256", "bytes32"],
      [CROSS_DOMAIN, collection, Number(requestId), entropy],
    ),
  );
}

function byteOf(hex, index) {
  return Number.parseInt(hex.slice(2 + index * 2, 4 + index * 2), 16);
}

/** 每个交叉位点的来源：0 = 亲本 B，1 = 亲本 A，2 = 突变。 */
export function crossoverSources({ collection, requestId, entropy }) {
  const stream = streamOf({ collection, requestId, entropy });
  const sources = [];
  for (let i = 0; i < CROSS_LOCUS_COUNT; i += 1) {
    const b = byteOf(stream, i);
    sources.push(b < MUTATION_BYTE_MAX ? 2 : b >> 7);
  }
  return sources;
}

/**
 * 全中校验，与 KinCrossover.matchesAll 逐位一致。
 */
function matchesAll(seed, ta, tb, sources) {
  let rng = seed >>> 0 || 1;
  let hue = 0;
  let nextI = 0;
  for (let locus = 0; locus < CROSS_LOCUS_COUNT; locus += 1) {
    const start = chipStart(locus);
    while (nextI < start) {
      rng = xorshift32(rng ^ (nextI * 0x9e3779b9)) || 1;
      nextI += 1;
    }
    let x = 0;
    for (let j = 0; j < 8; j += 1) {
      rng = xorshift32(rng ^ (nextI * 0x9e3779b9)) || 1;
      x = x * 31 + (rng >>> 24);
      nextI += 1;
    }
    let trait = pickW(x % 10000, LOCUS_WEIGHTS[locus]);
    if (locus === 0) hue = trait;
    else if (locus === 2 && hue === 11) trait = 2;
    if (
      sources[locus] !== 2 &&
      trait !== (sources[locus] === 1 ? ta[locus] : tb[locus])
    ) {
      return false;
    }
  }
  return true;
}

function candidateFactory(stream) {
  const streamBytes = hexToBytes32Array(stream);
  const input = new Uint8Array(96);
  input.set(GRIND_DOMAIN_BYTES, 0);
  input.set(streamBytes, 32);
  return (n) => {
    input[92] = (n / 2 ** 24) & 0xff;
    input[93] = (n / 2 ** 16) & 0xff;
    input[94] = (n / 2 ** 8) & 0xff;
    input[95] = n & 0xff;
    return Number.parseInt(keccak256(input).slice(-8), 16) || 1;
  };
}

export function grindCrossover({
  seedA,
  seedB,
  collection,
  requestId,
  entropy,
  from = 0,
  limit = GRIND_LIMIT,
}) {
  const sources = crossoverSources({ collection, requestId, entropy });
  const ta = traitsOfSeed(seedA);
  const tb = traitsOfSeed(seedB);
  const candidateAt = candidateFactory(
    streamOf({ collection, requestId, entropy }),
  );
  for (let n = from; n < limit; n += 1) {
    const cand = candidateAt(n);
    if (matchesAll(cand, ta, tb, sources)) {
      return { seed: cand, n, sources, tries: n - from + 1 };
    }
  }
  throw new Error(
    `crossover grind exceeded ${limit} candidates; try a higher limit`,
  );
}

export function verifyCrossover({
  seedA,
  seedB,
  collection,
  requestId,
  entropy,
  n,
}) {
  const sources = crossoverSources({ collection, requestId, entropy });
  const ta = traitsOfSeed(seedA);
  const tb = traitsOfSeed(seedB);
  const cand = candidateFactory(streamOf({ collection, requestId, entropy }))(
    n,
  );
  return { seed: cand, ok: matchesAll(cand, ta, tb, sources), sources };
}

export function expectedCrossoverLoci(traitA, traitB) {
  const mix = (i, id) =>
    100 *
    ((1 - MUTATION_RATE) * (traitA[i] === id ? 0.5 : 0) +
      (1 - MUTATION_RATE) * (traitB[i] === id ? 0.5 : 0) +
      (MUTATION_RATE * LOCUS_WEIGHTS[i][id]) / 10000);
  return KIN_LOCI.map(({ id: locus, table }, i) => ({
    locus,
    rows: table.map((row, id) => ({
      id: String(row.id),
      pct: mix(i, id),
    })),
  }));
}
