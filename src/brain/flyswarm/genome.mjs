/**
 * iff.genome/1 —— 出生承诺的个体初值。
 *
 * 表型只读这份记录。MaleCNS 边权、overlay、PnL、能量都不进基因组。
 * genomeId = canonical hash；解码器版本不在记录里，以免升级改写身份。
 */
import { identifier, integer, requireValue, ZERO_HASH } from "../codec.mjs";

export const GENOME_SCHEMA = "iff.genome/1";

function xorshift32(value) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/** 亲本与子代种子的确定性承诺，形状像哈希，不调用 crypto。 */
export function mutateRootOf(parentSeed, childSeed) {
  let x = ((parentSeed >>> 0) ^ (childSeed >>> 0)) || 1;
  let out = "0x";
  for (let i = 0; i < 8; i++) {
    x = xorshift32(x) || 1;
    out += x.toString(16).padStart(8, "0");
  }
  return out;
}

export function buildGenome({
  soulId,
  seed,
  genesisId = ZERO_HASH,
  parentSouls = [],
  mutateRoot = ZERO_HASH,
  generation = 0,
  inheritBias = false,
  audit = "SIM",
} = {}) {
  identifier(soulId, "soulId");
  integer(seed, 1, 0xffffffff, "seed");
  integer(generation, 0, 1_000_000, "generation");
  requireValue(Array.isArray(parentSouls) && parentSouls.length <= 2, "GENOME_PARENTS");
  parentSouls.forEach((id) => identifier(id, "parentSoul"));
  requireValue(typeof inheritBias === "boolean", "GENOME_INHERIT");
  requireValue(typeof audit === "string", "GENOME_AUDIT");
  return {
    schema: GENOME_SCHEMA,
    audit,
    soulId,
    seed: seed >>> 0,
    genesisId,
    parentSouls: [...parentSouls],
    mutateRoot,
    generation,
    inheritBias,
  };
}

/** 从已有蝇/成员重建基因组。已冻结的 genome 原样返回，不读当前 rng。 */
export function genomeOf(source = {}) {
  if (source?.genome?.schema === GENOME_SCHEMA) return source.genome;
  const seed = (source.seed ?? source.dna ?? 1) >>> 0 || 1;
  const generation = source.gen ?? source.generation ?? 0;
  const parentSouls = [];
  if (source.parentSoul) parentSouls.push(source.parentSoul);
  else if (source.parent != null) parentSouls.push(`fly-${source.parent}`);
  return buildGenome({
    soulId: source.soulId || `fly-${source.id ?? 0}`,
    seed,
    generation,
    parentSouls,
    inheritBias: generation > 0,
    mutateRoot:
      source.mutateRoot ||
      (parentSouls.length ? mutateRootOf(seed ^ 0x9e3779b9, seed) : ZERO_HASH),
    audit: source.audit || "SIM",
  });
}
