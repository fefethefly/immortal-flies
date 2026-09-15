/**
 * 名册（roster）与双层成员制 —— 对 Sybil / 克隆攻击的正式回答（V8 §6.1）。
 *
 * 长期原则：把「开放」与「话语权」分成两层。
 *   guest   免费、可旁听、可发 utterance、可被重放；金库票 = 0（或政策开启后的折扣票）。
 *   bonded  一公钥一灵魂、需质押、金库票权重封顶（单票 + 单运行器两层）。
 *
 * 「创世可复制」属于研究/重放层；「金库声音」只属于有成本身份。
 * 重放免费，声音付费。这是协议能同时保持开放与不可女巫的唯一结构。
 *
 * 本文件是纯纸面实现：质押与解锁在 settlement=TESTNET/MAINNET 才由链上
 * 登记合约裁决，这里只保留规则与状态，不允许悄悄放行。
 */
import { identifier, integer, requireValue } from "../codec.mjs";
import { isRunner } from "./schemas.mjs";

export const FLYSWARM_POLICY = Object.freeze({
  id: "flyswarm-1",
  version: "1",
  tiers: Object.freeze(["guest", "bonded"]),
  /** 单条 utterance 的票权上限（置信封顶，防单只幸运蝇吞掉蜂巢） */
  voteCapPerUtterance: 25,
  /** 单个运行器在同一 tick 内的合计票权上限（防一公钥开多魂刷票） */
  voteCapPerRunner: 40,
  /** 分裂门：买压与卖压同时超过总权重的这个比例（bps），蜂巢 HOLD */
  splitThresholdBps: 3500,
  /** guest 金库票折扣（bps，默认 0 = 旁听；开启前必须有过重放证明的单独评审） */
  guestTreasuryBps: 0,
  /** bonded 质押门槛（$IFS 原子单位）。SIM 层登记时不校验余额，结算层强制执行。 */
  bondedStakeMin: 10_000,
  /** 质押解锁期（tick）。SIM 层仅记录，结算层强制执行。 */
  bondedUnlockTicks: 7 * 86400,
  /** 每多少 tick 写一条记忆（iff.experience/1） */
  memoryEveryTicks: 100,
  /** 每多少 tick 结算一次：最弱退役（灵魂不删）、冠军繁衍（子代从检查点分叉） */
  settleEveryTicks: 1800,
  /** 日志 era 长度：全局日志的分片单位 */
  eraTicks: 1000,
});

export function createRoster(policy = FLYSWARM_POLICY) {
  const souls = new Map(); // soulId -> {soulId, runnerPub, tier, status, sinceTick, retiredTick}
  const pubs = new Map(); // runnerPub -> Set<soulId>

  const get = (soulId) => souls.get(soulId) || null;
  const byPub = (pub) => [...(pubs.get(pub) || [])].map(get).filter(Boolean);

  function register({ soulId, runnerPub, tier = "guest", tick = 0 }) {
    identifier(soulId, "soulId");
    isRunner(runnerPub, "runnerPub");
    requireValue(
      policy.tiers.includes(tier),
      "ROSTER_TIER",
      `tier 必须是 ${policy.tiers.join("/")}`,
    );
    requireValue(
      !souls.has(soulId),
      "ROSTER_DUPLICATE",
      `灵魂 ${soulId} 已在册`,
    );
    integer(tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    // 一公钥一灵魂只对 bonded 强制执行：有成本身份才有资格守唯一性。
    if (tier === "bonded") {
      requireValue(
        !pubs.has(runnerPub),
        "ROSTER_PUB",
        `运行器 ${runnerPub} 已持有 bonded 灵魂`,
      );
    }
    const entry = {
      soulId,
      runnerPub,
      tier,
      status: "active",
      sinceTick: tick,
      retiredTick: null,
    };
    souls.set(soulId, entry);
    if (!pubs.has(runnerPub)) pubs.set(runnerPub, new Set());
    pubs.get(runnerPub).add(soulId);
    return entry;
  }

  function setTier(soulId, tier) {
    const entry = get(soulId);
    requireValue(entry, "ROSTER_UNKNOWN", `灵魂 ${soulId} 不在册`);
    requireValue(policy.tiers.includes(tier), "ROSTER_TIER");
    if (tier === "bonded" && entry.tier !== "bonded") {
      requireValue(
        !pubs.has(entry.runnerPub) ||
          byPub(entry.runnerPub).every((e) => e.soulId === soulId),
        "ROSTER_PUB",
      );
    }
    entry.tier = tier;
    return entry;
  }

  /** 退役不删除：灵魂条目仍在，只追加状态（V8：灵魂不焚）。 */
  function retire(soulId, tick) {
    const entry = get(soulId);
    requireValue(entry, "ROSTER_UNKNOWN", `灵魂 ${soulId} 不在册`);
    integer(tick, entry.sinceTick, Number.MAX_SAFE_INTEGER, "tick");
    requireValue(entry.status === "active", "ROSTER_RETIRED");
    entry.status = "retired";
    entry.retiredTick = tick;
    return entry;
  }

  /** 复活：唤醒保藏的灵魂（新账本由 colony 层另发）。 */
  function reinstate(soulId, tick) {
    const entry = get(soulId);
    requireValue(entry, "ROSTER_UNKNOWN", `灵魂 ${soulId} 不在册`);
    integer(
      tick,
      entry.retiredTick || entry.sinceTick,
      Number.MAX_SAFE_INTEGER,
      "tick",
    );
    entry.status = "active";
    entry.retiredTick = null;
    return entry;
  }

  function snapshot() {
    return [...souls.values()].map((e) => ({ ...e }));
  }

  function active() {
    return snapshot().filter((e) => e.status === "active");
  }

  return {
    policy,
    register,
    get,
    byPub,
    setTier,
    retire,
    reinstate,
    snapshot,
    active,
  };
}

/**
 * 一条 utterance 的票权：guest 默认 0（旁听），bonded 按封顶。
 * v1 话语用产品层 confidence；v2 话语用原生行为强度（left+right）。
 * 纯函数：同一输入任何机器得到同一权重。
 */
export function utteranceWeight(roster, utterance, policy = FLYSWARM_POLICY) {
  const entry = roster.get(utterance.soulId);
  if (!entry || entry.status !== "active") return 0;
  const raw =
    utterance.schema === "iff.utterance/1"
      ? utterance.confidence
      : (utterance.ethology?.left || 0) + (utterance.ethology?.right || 0);
  const capped = Math.min(raw, policy.voteCapPerUtterance);
  if (entry.tier === "bonded") return capped;
  if (policy.guestTreasuryBps > 0) {
    return Math.trunc((capped * policy.guestTreasuryBps) / 10000);
  }
  return 0;
}
