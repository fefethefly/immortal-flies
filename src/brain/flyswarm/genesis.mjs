/**
 * iff.genesis/1 内容寻址。
 *
 * 长期原则：创世母体的「身份」不是网页上一段话，而是一个可复算的哈希。
 * genesisId = canonical(genesis) 的 SHA-256。任何人在任何机器上复制同一份
 * 母体，都能算出同一个 genesisId —— 这是「创世可复制」可验证的那一半；
 * 「金库声音」的另一半（有成本身份）见 membership.mjs。
 */
import { canonical, hash, requireValue } from "../codec.mjs";
import { validateRecord, createSchemas } from "./schemas.mjs";

const schemas = createSchemas();

/**
 * 用一份图（graph.manifest）与空 overlay 组装创世母体记录。
 * 图必须已通过 graph.mjs 的清单哈希校验。
 */
export async function buildGenesis({ graph, overlayHash, soulId = "genesis-0", seed = 1, audit = "SIM" }) {
  requireValue(graph?.manifest?.schema === "iff.dataset/1", "GENESIS_GRAPH", "创世需要已绑定清单的 MaleCNS 图");
  const genesis = {
    schema: "iff.genesis/1",
    audit,
    dataset: graph.manifest.dataset,
    graphHash: graph.manifest.connectivity.sha256,
    metadataHash: graph.manifest.metadata.sha256,
    runtime: "iff-runtime/1",
    encoder: "sensory-groups/1",
    decoder: "motor-balance/1",
    overlayHash,
    soulId,
    seed,
    spawnedAt: 0,
  };
  return validateRecord(schemas, genesis);
}

/** genesisId = 创世记录的 canonical 哈希。发布一次，永不复算出第二个。 */
export async function genesisIdOf(genesis) {
  validateRecord(schemas, genesis);
  return hash(genesis);
}

/** 校验一段自称的创世记录是否与已公布的 genesisId 一致（防换母体）。 */
export async function verifyGenesis(genesis, expectedId) {
  validateRecord(schemas, genesis);
  const computed = await genesisIdOf(genesis);
  requireValue(computed === expectedId, "GENESIS_MISMATCH", "创世记录与公布的 genesisId 不一致");
  return computed;
}

/** 两条创世记录是否逐位同源（含 canonical 比较，不依赖字段顺序）。 */
export function sameGenesis(a, b) {
  return canonical(a) === canonical(b);
}
