/**
 * iff.credit/1 —— Agent Economy 的模拟信用账本（L3，SIM）。
 *
 * 四账户（docs/PRODUCT-LATEST.md §6.1）：
 *   free    公共世界赞助 / 试用额度（观察、低风险实验），随 tick 衰减
 *   locked  IFS 锁仓抵押 → 额度（collateralValue × LTV）
 *   earned  已结算收益 → 额度（settledProfit × profitShare）
 *   liquid  已结算、扣除负债与准备金后的可用余额
 *
 * 能力公式（§6.2，逐字实现）：
 *   capacity  = min(collateralValue×LTV, settledProfit×profitShare,
 *                   completedOrders×reliability, worldBudgetCap)
 *   usable    = max(0, free + capacity − outstandingDebt − pendingLossReserve)
 *
 * 硬规则：
 * - 同一笔 IFS 抵押只能支撑一次额度：每笔 stake 最多被占用一次（occupy），
 *   释放前不能重复占用；占用中的 stake 不能提前解锁。
 * - 浮盈、未确认成交、刷消息、自成交不增加任何账户。
 * - 连续亏损降低 reliability（额度收缩）；数据过期（抵押价格超过新鲜期）收缩；
 *   到期（unlockAt）前不可解锁。
 * - 全部整数运算，audit = SIM；本文件不签名、不转账、不持有真实资金。
 */
import { integer } from "../codec.mjs";
import { clamp } from "../../swarm.mjs";
import { FLYSWARM_POLICY } from "./membership.mjs";

export const CREDIT_SCHEMA = "iff.credit/1";

export const CREDIT_POLICY = Object.freeze({
  id: "iff-credit-1",
  version: "1",
  /** 抵押价值 → Locked 额度比例（bps） */
  ltvBps: 5000,
  /** 已结算收益 → Earned 额度比例（bps） */
  profitShareBps: 5000,
  /** 每完成一笔可验证订单的信用基数 */
  reliabilityFactor: 1000,
  /** 世界预算上限 */
  worldBudgetCap: 100_000,
  /** 每魂的免费观察额度（SIM 种子） */
  freeSeed: 1000,
  /** 免费额度每 tick 衰减 */
  freeDecayPerTick: 1,
  /** bonded 质押门槛（$IFS 原子单位） */
  bondedStakeMin: FLYSWARM_POLICY.bondedStakeMin,
  /** 解锁等待期（tick） */
  unlockTicks: FLYSWARM_POLICY.bondedUnlockTicks,
  /** 抵押价格新鲜期（tick）：过期则 collateralValue 计零 */
  stakePriceTicks: 100,
  /** 连续亏损达到该值时 reliability 归零 */
  lossStreakFloor: 20,
});

export function createCreditLedger() {
  return {
    schema: CREDIT_SCHEMA,
    policy: `${CREDIT_POLICY.id}@${CREDIT_POLICY.version}`,
    audit: "SIM",
    tick: 0,
    souls: new Map(), // soulId -> {free, lastDecay, debt, lossReserve, settledProfit, completedOrders, lossStreak}
    stakes: [], // {id, soulId, amount, lockedAt, unlockAt, priceAt, occupiedBy}
    nextStakeId: 1,
    /** 服务端镜像水位线：soulId -> {realized, trades}（不随快照语义，单独序列化） */
    _mirrored: new Map(),
  };
}

function soulOf(ledger, soulId) {
  if (!ledger.souls.has(soulId)) {
    ledger.souls.set(soulId, {
      free: CREDIT_POLICY.freeSeed,
      lastDecay: ledger.tick,
      debt: 0,
      lossReserve: 0,
      settledProfit: 0,
      completedOrders: 0,
      lossStreak: 0,
    });
  }
  return ledger.souls.get(soulId);
}

/** 推进衰减时钟：免费额度按各自存活期衰减（SIM：观察额度不是永续）。 */
export function advanceCredit(ledger, tick) {
  integer(tick, ledger.tick, Number.MAX_SAFE_INTEGER, "tick");
  if (tick > ledger.tick) {
    for (const soul of ledger.souls.values()) {
      const elapsed = tick - soul.lastDecay;
      if (elapsed > 0) {
        soul.free = Math.max(
          0,
          soul.free - CREDIT_POLICY.freeDecayPerTick * elapsed,
        );
        soul.lastDecay = tick;
      }
    }
    ledger.tick = tick;
  }
  return ledger;
}

/** 账面上的免费额度（含到查询时刻的衰减投影，不改状态）。 */
function freeAt(soul, ledger, tick) {
  const elapsed = Math.max(0, Math.max(tick, ledger.tick) - soul.lastDecay);
  return Math.max(0, soul.free - CREDIT_POLICY.freeDecayPerTick * elapsed);
}

/** 锁仓：amount 必须达到 bonded 门槛；到期前不可解锁（SIM，不校验真实余额）。 */
export function stakeCredit(ledger, { soulId, amount, tick, priceAt = 0 }) {
  integer(
    amount,
    CREDIT_POLICY.bondedStakeMin,
    Number.MAX_SAFE_INTEGER,
    "质押额",
  );
  integer(tick, 0, Number.MAX_SAFE_INTEGER, "tick");
  integer(priceAt, 0, Number.MAX_SAFE_INTEGER, "标记价格");
  advanceCredit(ledger, tick);
  soulOf(ledger, soulId);
  const stake = {
    schema: "iff.stake/1",
    id: `stake-${ledger.nextStakeId}`,
    soulId,
    amount,
    lockedAt: tick,
    unlockAt: tick + CREDIT_POLICY.unlockTicks,
    priceAt,
    occupiedBy: null,
    audit: ledger.audit,
  };
  ledger.nextStakeId += 1;
  ledger.stakes.push(stake);
  return stake;
}

/** 占用：同一笔抵押只支撑一次额度；重复占用（同一/不同用途）一律拒绝。 */
export function occupyCredit(ledger, { stakeId, purpose = "service" }) {
  const stake = ledger.stakes.find((s) => s.id === stakeId);
  if (!stake) throw new Error(`未知质押 ${stakeId}`);
  if (stake.occupiedBy) throw new Error("这笔质押已支撑一条额度，不能重复抵押");
  stake.occupiedBy = { purpose, at: ledger.tick };
  return stake;
}

export function releaseCredit(ledger, { stakeId }) {
  const stake = ledger.stakes.find((s) => s.id === stakeId);
  if (!stake) throw new Error(`未知质押 ${stakeId}`);
  stake.occupiedBy = null;
  return stake;
}

/** 解锁：到期且未被占用才能释放。 */
export function unstakeCredit(ledger, { stakeId, tick }) {
  integer(tick, 0, Number.MAX_SAFE_INTEGER, "tick");
  const stake = ledger.stakes.find((s) => s.id === stakeId);
  if (!stake) throw new Error(`未知质押 ${stakeId}`);
  if (tick < stake.unlockAt) throw new Error("质押未到解锁期");
  if (stake.occupiedBy) throw new Error("质押正在支撑额度，先释放占用");
  ledger.stakes = ledger.stakes.filter((s) => s.id !== stakeId);
  return stake;
}

/** 结算结果入账：只有已实现正收益进 settledProfit；亏损只记 streaks（额度收缩）。 */
export function settleCredit(
  ledger,
  { soulId, pnl, completedOrders = 0, tick },
) {
  integer(pnl, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, "pnl");
  integer(completedOrders, 0, Number.MAX_SAFE_INTEGER, "订单数");
  advanceCredit(ledger, tick);
  const soul = soulOf(ledger, soulId);
  if (pnl > 0) soul.settledProfit += pnl;
  soul.completedOrders += completedOrders;
  soul.lossStreak = pnl < 0 ? soul.lossStreak + 1 : 0;
  return soul;
}

/** 可靠性：连续亏损压低订单价值。 */
function reliabilityOf(soul) {
  const clamped = clamp(soul.lossStreak, 0, CREDIT_POLICY.lossStreakFloor);
  return 1 - clamped / CREDIT_POLICY.lossStreakFloor;
}

/** 抵押价值：新鲜期内的质押全额计入；过期（价格失效）计零 —— 到期收缩。 */
function collateralValueOf(ledger, soulId, tick) {
  let value = 0;
  for (const stake of ledger.stakes) {
    if (stake.soulId !== soulId) continue;
    if (tick - stake.lockedAt > CREDIT_POLICY.stakePriceTicks) continue;
    value += stake.amount;
  }
  return value;
}

/** §6.2 公式：capacity = min(四项)，usable = free + capacity − 负债 − 准备金。 */
export function creditOf(
  ledger,
  soulId,
  { price = 0, tick = ledger.tick } = {},
) {
  const soul = soulOf(ledger, soulId);
  const free = freeAt(soul, ledger, tick);
  const collateral = collateralValueOf(ledger, soulId, tick);
  const locked = Math.trunc((collateral * CREDIT_POLICY.ltvBps) / 10000);
  const earned = Math.trunc(
    (soul.settledProfit * CREDIT_POLICY.profitShareBps) / 10000,
  );
  const orders = Math.trunc(
    soul.completedOrders *
      CREDIT_POLICY.reliabilityFactor *
      reliabilityOf(soul),
  );
  const capacity = Math.min(
    locked,
    earned,
    orders,
    CREDIT_POLICY.worldBudgetCap,
  );
  const usable = Math.max(0, free + capacity - soul.debt - soul.lossReserve);
  return {
    soulId,
    free,
    locked,
    earned,
    orders,
    capacity,
    debt: soul.debt,
    lossReserve: soul.lossReserve,
    usable,
    settledProfit: soul.settledProfit,
    completedOrders: soul.completedOrders,
    lossStreak: soul.lossStreak,
    reliability: Number(reliabilityOf(soul).toFixed(4)),
    collateralValue: collateral,
  };
}

/** 账本视图（JSON 安全）。 */
export function creditView(ledger, { price = 0, tick = ledger.tick } = {}) {
  const souls = [...ledger.souls.keys()].map((soulId) =>
    creditOf(ledger, soulId, { price, tick }),
  );
  return {
    schema: ledger.schema,
    audit: ledger.audit,
    policy: ledger.policy,
    tick: ledger.tick,
    souls,
    stakes: ledger.stakes.map((s) => ({ ...s })),
  };
}

/** 确保灵魂有信用账户（无交易活动也要出现在账本视图）。 */
export function ensureCreditSoul(ledger, soulId) {
  return soulOf(ledger, soulId);
}

/** 账本快照（持久化 / 恢复）。Map 需转回普通结构。 */
export function saveCredit(ledger) {
  return {
    schema: ledger.schema,
    policy: ledger.policy,
    audit: ledger.audit,
    tick: ledger.tick,
    souls: [...ledger.souls.entries()].map(([soulId, soul]) => ({
      soulId,
      ...soul,
    })),
    stakes: ledger.stakes.map((s) => ({ ...s })),
    nextStakeId: ledger.nextStakeId,
    mirrored: [...(ledger._mirrored?.entries() || [])].map(
      ([soulId, watermark]) => ({
        soulId,
        ...watermark,
      }),
    ),
  };
}

export function restoreCredit(saved) {
  if (!saved || saved.schema !== CREDIT_SCHEMA) return createCreditLedger();
  const ledger = createCreditLedger();
  ledger.tick = saved.tick;
  ledger.nextStakeId = saved.nextStakeId;
  for (const { soulId, ...soul } of saved.souls)
    ledger.souls.set(soulId, { ...soul });
  ledger.stakes = saved.stakes.map((s) => ({ ...s }));
  ledger._mirrored = new Map(
    (saved.mirrored || []).map(({ soulId, ...watermark }) => [
      soulId,
      watermark,
    ]),
  );
  return ledger;
}
