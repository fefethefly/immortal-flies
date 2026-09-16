/**
 * Flyswarm 协议核心 —— 面向「全人类共同参与的果蝇集群实验」的开放群体层。
 *
 * 模块图（详见 docs/PRODUCT-LATEST.md）：
 *   schemas.mjs   协议语言法：版本化消息三元组，只增不改
 *   genesis.mjs   创世母体内容寻址（复制可验证的一半）
 *   membership.mjs 名册与双层成员制（金库声音有成本的一半）
 *   log.mjs       era 分片全序日志（实验的哈希链账本）
 *   quorum.mjs    话语 → 群体动作的公开规则（confidence-hold）
 *   mesh.mjs      托管网：分区 / 分片 / 运行器（不改官方连接组）
 *   hosting.mjs   计算托管单：IFS 占用质押，BNB 只作轨道
 */
export { createSchemas, validateRecord, FLYSWARM_SCHEMAS, DATASET_CANON, AUDITS, SIDES, ETHOLOGY_ACTIONS } from "./schemas.mjs";
export { buildGenesis, genesisIdOf, verifyGenesis, sameGenesis } from "./genesis.mjs";
export { createRoster, FLYSWARM_POLICY, utteranceWeight } from "./membership.mjs";
export { createLog, replayEntries, sameEntries } from "./log.mjs";
export { createQuorums, QUORUM_CONFIDENCE_HOLD } from "./quorum.mjs";
export {
  createMesh,
  meshView,
  joinMesh,
  OFFICIAL_NEURONS,
  MESH_REGIONS,
} from "./mesh.mjs";
export {
  createHosting,
  quoteHosting,
  hostFromJoin,
  hostingView,
  HOSTING_POLICY,
} from "./hosting.mjs";
