/**
 * Flyswarm 协议的语言法：全部消息 schema 的唯一声明处。
 *
 * 长期原则（对应 docs/PRODUCT-LATEST.md）：
 * 1. 每个 schema 由 { id, version, validate } 三元组声明，只增不改；
 *    任何字段变更 = 新版本 + 迁移事件，旧版本永远可重放。
 * 2. 所有消息携带 audit ∈ {SIM, TESTNET, MAINNET}：同一份代码跑三层结算，
 *    只有结算边界不同。这是「实验从浏览器长到全人类」的唯一开关。
 * 3. 校验器只做形状与范围检查，不做语义；语义由各模块负责。
 * 4. 时间一律显式传入（tick / observedAt），禁止 Date.now() 进入动力学。
 */
import { createRegistry } from "../registry.mjs";
import { identifier, integer, requireValue } from "../codec.mjs";

export const DATASET_CANON = "male-cns:v1.0";
export const AUDITS = Object.freeze(["SIM", "TESTNET", "MAINNET"]);
export const ETHOLOGY_ACTIONS = Object.freeze([
  "REST",
  "FORAGE",
  "AVOID",
  "EXPLORE",
]);
export const SIDES = Object.freeze(["BUY", "SELL", "HOLD"]);

const HASH64 = /^0x[0-9a-f]{64}$/;
// 纸面层允许 paper: 前缀的本地运行器；TESTNET/MAINNET 记录必须带 0x 公钥地址。
const RUNNER = /^(paper:[a-zA-Z0-9_.:-]{1,64}|0x[0-9a-fA-F]{40})$/;

const isHash = (v, name) =>
  requireValue(
    typeof v === "string" && HASH64.test(v),
    "INVALID_HASH",
    `${name} 必须是 0x 开头 64 位十六进制`,
  );
export const isRunner = (v, name) =>
  requireValue(
    typeof v === "string" && RUNNER.test(v),
    "INVALID_RUNNER",
    `${name} 格式错误`,
  );
// 带版本的组件标识（iff-runtime/1、sensory-groups/1、motor-balance/1）
const isVersionedId = (v, name) =>
  requireValue(
    typeof v === "string" &&
      /^[a-zA-Z0-9_.:-]{1,90}\/[a-zA-Z0-9_.-]{1,10}$/.test(v),
    "INVALID_ID",
    `${name} 格式错误`,
  );
const isAudit = (v) =>
  requireValue(
    AUDITS.includes(v),
    "INVALID_AUDIT",
    "audit 必须是 SIM / TESTNET / MAINNET",
  );
const isAction = (v, name) =>
  requireValue(
    ETHOLOGY_ACTIONS.includes(v),
    "INVALID_ACTION",
    `${name} 不是合法行为`,
  );

const schemaMeta = (record, id) => {
  requireValue(
    record && record.schema === id,
    "SCHEMA_MISMATCH",
    `记录不是 ${id}`,
  );
  isAudit(record.audit);
  return record;
};

/** iff.genesis/1：创世母体清单。genesisId = 本记录的 canonical 哈希（见 genesis.mjs）。 */
const genesis = {
  id: "iff.genesis",
  version: "1",
  title: "创世母体清单",
  validate(r) {
    schemaMeta(r, "iff.genesis/1");
    requireValue(
      r.dataset === DATASET_CANON,
      "GENESIS_DATASET",
      "创世必须是官方 MaleCNS",
    );
    isHash(r.graphHash, "graphHash");
    isHash(r.metadataHash, "metadataHash");
    isVersionedId(r.runtime, "runtime");
    isVersionedId(r.encoder, "encoder");
    isVersionedId(r.decoder, "decoder");
    isHash(r.overlayHash, "overlayHash");
    identifier(r.soulId, "soulId");
    integer(r.seed, 1, 0xffffffff, "seed");
    integer(r.spawnedAt, 0, Number.MAX_SAFE_INTEGER, "spawnedAt");
    return r;
  },
};

/** iff.join/1：加入声明。指向已公布的 genesisId，禁止拿冠军状态当模板。 */
const join = {
  id: "iff.join",
  version: "1",
  title: "加入声明",
  validate(r) {
    schemaMeta(r, "iff.join/1");
    isHash(r.genesisId, "genesisId");
    identifier(r.soulId, "soulId");
    isRunner(r.runnerPub, "runnerPub");
    requireValue(
      r.dataset === DATASET_CANON,
      "JOIN_DATASET",
      "加入必须声明官方 dataset",
    );
    integer(r.seed, 1, 0xffffffff, "seed");
    integer(r.joinedAt, 0, Number.MAX_SAFE_INTEGER, "joinedAt");
    return r;
  },
};

/** iff.spawn/1：繁殖事件。子代从亲本检查点分叉，不是从空白钱包出生。 */
const spawn = {
  id: "iff.spawn",
  version: "1",
  title: "繁殖事件",
  validate(r) {
    schemaMeta(r, "iff.spawn/1");
    identifier(r.parentSoul, "parentSoul");
    isHash(r.parentCheckpoint, "parentCheckpoint");
    identifier(r.childSoul, "childSoul");
    requireValue(
      r.childSoul !== r.parentSoul,
      "SPAWN_SELF",
      "子代灵魂不能与亲本相同",
    );
    integer(r.childSeed, 1, 0xffffffff, "childSeed");
    requireValue(typeof r.inheritBias === "boolean", "SPAWN_INHERIT");
    isHash(r.mutateRoot, "mutateRoot");
    integer(r.spawnedAt, 0, Number.MAX_SAFE_INTEGER, "spawnedAt");
    return r;
  },
};

/** iff.utterance/1：行为话语（旧版，保留解析与重放）。ethology + 产品层 side/confidence。 */
const utterance = {
  id: "iff.utterance",
  version: "1",
  title: "行为话语（旧版）",
  validate(r) {
    schemaMeta(r, "iff.utterance/1");
    identifier(r.soulId, "soulId");
    isRunner(r.runnerPub, "runnerPub");
    integer(r.tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    integer(r.sequence, 1, Number.MAX_SAFE_INTEGER, "sequence");
    requireValue(r.dataset === DATASET_CANON, "UTTERANCE_DATASET");
    const e = r.ethology;
    requireValue(e && e.schema === "iff.ethology/1", "UTTERANCE_ETHOLOGY");
    isAction(e.action, "行为");
    for (const k of ["food", "threat", "light", "left", "right"])
      integer(e[k], 0, 1_000_000, `ethology.${k}`);
    requireValue(SIDES.includes(r.side), "UTTERANCE_SIDE");
    integer(r.confidence, 0, 100, "confidence");
    isHash(r.prevHash, "prevHash");
    return r;
  },
};

/**
 * iff.utterance/2：行为话语（当前版）。只携带原生 ethology —— 行为与强度，
 * 不含 BUY/SELL/HOLD、置信度、仓位或任何金融语义；金融解释只存在于 TradePort。
 */
const utteranceV2 = {
  id: "iff.utterance",
  version: "2",
  title: "行为话语",
  validate(r) {
    schemaMeta(r, "iff.utterance/2");
    identifier(r.soulId, "soulId");
    isRunner(r.runnerPub, "runnerPub");
    integer(r.tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    integer(r.sequence, 1, Number.MAX_SAFE_INTEGER, "sequence");
    requireValue(r.dataset === DATASET_CANON, "UTTERANCE_DATASET");
    const e = r.ethology;
    requireValue(e && e.schema === "iff.ethology/1", "UTTERANCE_ETHOLOGY");
    isAction(e.action, "行为");
    for (const k of ["food", "threat", "light", "left", "right"])
      integer(e[k], 0, 1_000_000, `ethology.${k}`);
    requireValue(
      !("side" in r),
      "UTTERANCE_V2_NO_SIDE",
      "行为话语不得携带金融方向",
    );
    requireValue(
      !("confidence" in r),
      "UTTERANCE_V2_NO_CONF",
      "行为话语不得携带产品层置信度",
    );
    isHash(r.prevHash, "prevHash");
    return r;
  },
};

/** iff.experience/1：经历/记忆。检查点与根的哈希，可下载重放，不可改边权。 */
const experience = {
  id: "iff.experience",
  version: "1",
  title: "经历记忆",
  validate(r) {
    schemaMeta(r, "iff.experience/1");
    identifier(r.soulId, "soulId");
    isRunner(r.runnerPub, "runnerPub");
    integer(r.tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    integer(r.sequence, 1, Number.MAX_SAFE_INTEGER, "sequence");
    isHash(r.checkpointHash, "checkpointHash");
    isHash(r.eventRoot, "eventRoot");
    isHash(r.overlayHash, "overlayHash");
    isHash(r.inputBatchRoot, "inputBatchRoot");
    isHash(r.prevHash, "prevHash");
    return r;
  },
};

/** iff.sense/1：感觉注入。带来源身份与过期时间；永不直接下单。 */
const sense = {
  id: "iff.sense",
  version: "1",
  title: "感觉注入",
  validate(r) {
    schemaMeta(r, "iff.sense/1");
    identifier(r.sourceId, "sourceId");
    identifier(r.adapter, "adapter");
    identifier(r.adapterVersion, "adapterVersion");
    isRunner(r.by, "by");
    integer(r.intensity, 0, 100, "intensity");
    integer(r.tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    integer(r.sequence, 1, Number.MAX_SAFE_INTEGER, "sequence");
    integer(r.observedAt, 0, Number.MAX_SAFE_INTEGER, "observedAt");
    integer(
      r.expiresAt,
      r.observedAt + 1,
      Number.MAX_SAFE_INTEGER,
      "expiresAt",
    );
    const p = r.payload;
    requireValue(p && typeof p === "object", "SENSE_PAYLOAD");
    for (const k of ["food", "threat", "light"])
      integer(p[k], 0, 1000, `payload.${k}`);
    return r;
  },
};

/** iff.quorum/1：本步聚合结果（旧版，保留解析与重放）。按 BUY/SELL/HOLD 压池。 */
const quorum = {
  id: "iff.quorum",
  version: "1",
  title: "群体聚合（旧版）",
  validate(r) {
    schemaMeta(r, "iff.quorum/1");
    identifier(r.quorum, "quorum");
    identifier(r.quorumVersion, "quorumVersion");
    integer(r.tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    integer(r.era, 0, Number.MAX_SAFE_INTEGER, "era");
    for (const k of ["buyWeight", "sellWeight", "holdWeight", "totalWeight"])
      integer(r[k], 0, Number.MAX_SAFE_INTEGER, k);
    requireValue(
      r.buyWeight + r.sellWeight + r.holdWeight === r.totalWeight,
      "QUORUM_WEIGHT",
    );
    requireValue(SIDES.includes(r.side), "QUORUM_SIDE");
    requireValue(typeof r.split === "boolean", "QUORUM_SPLIT");
    requireValue(
      Array.isArray(r.dissents) && r.dissents.length <= 1000,
      "QUORUM_DISSENTS",
    );
    r.dissents.forEach((d) => {
      identifier(d.soulId, "soulId");
      requireValue(SIDES.includes(d.side), "QUORUM_DISSENT_SIDE");
      integer(d.weight, 0, Number.MAX_SAFE_INTEGER, "weight");
    });
    return r;
  },
};

/**
 * iff.quorum/2：本步聚合结果（当前版）。聚合原生行为方向：
 * approach（趋近）/ retreat（退避）/ still（静止），不含金融方向。
 * 金融含义由 TradePort 在聚合之后解释。
 */
const DIRECTIONS = Object.freeze(["approach", "retreat", "still"]);
const quorumV2 = {
  id: "iff.quorum",
  version: "2",
  title: "群体聚合",
  validate(r) {
    schemaMeta(r, "iff.quorum/2");
    identifier(r.quorum, "quorum");
    identifier(r.quorumVersion, "quorumVersion");
    integer(r.tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    integer(r.era, 0, Number.MAX_SAFE_INTEGER, "era");
    for (const k of [
      "approachWeight",
      "retreatWeight",
      "stillWeight",
      "totalWeight",
    ]) {
      integer(r[k], 0, Number.MAX_SAFE_INTEGER, k);
    }
    requireValue(
      r.approachWeight + r.retreatWeight + r.stillWeight === r.totalWeight,
      "QUORUM_WEIGHT",
    );
    requireValue(
      !("side" in r),
      "QUORUM_V2_NO_SIDE",
      "行为聚合不得携带金融方向",
    );
    requireValue(typeof r.split === "boolean", "QUORUM_SPLIT");
    requireValue(
      Array.isArray(r.dissents) && r.dissents.length <= 1000,
      "QUORUM_DISSENTS",
    );
    r.dissents.forEach((d) => {
      identifier(d.soulId, "soulId");
      requireValue(
        DIRECTIONS.includes(d.direction),
        "QUORUM_DISSENT_DIRECTION",
      );
      integer(d.weight, 0, Number.MAX_SAFE_INTEGER, "weight");
    });
    return r;
  },
};

export const FLYSWARM_SCHEMAS = Object.freeze([
  genesis,
  join,
  spawn,
  utterance,
  utteranceV2,
  experience,
  sense,
  quorum,
  quorumV2,
]);

/** 协议 schema 注册表：新消息类型 = register 一个新三元组，旧类型永不改写。 */
export function createSchemas(additional = []) {
  return createRegistry("flyswarm-schema", [
    ...FLYSWARM_SCHEMAS,
    ...additional,
  ]);
}

/** 按记录上的 schema 字段（如 "iff.utterance/1"）拆出 id 与版本，找到校验器并校验；未知 schema 大声拒绝，绝不静默放行。 */
export function validateRecord(registry, record) {
  requireValue(
    record && typeof record.schema === "string",
    "RECORD_SCHEMA",
    "记录缺少 schema 字段",
  );
  const [id, version = "1"] = record.schema.split("/");
  return registry.require(id, version).validate(record);
}
