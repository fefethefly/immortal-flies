/**
 * iff.protocol/1 —— 协议自有资金（P4，SIM）。
 *
 * 收入层（docs/PRODUCT-LATEST.md §8.2，逐字实现）：
 *   R = 已结算业绩费 + 实际服务费 + 协议自有资产已实现收益
 *   C = 执行 / 验证 / 存储 / 团队 / 合规成本（纸面按收入比例计提）
 *   N = R − C
 *   T = min(max(N, 0), 合格准备金缺口)
 *   D = max(N − T, 0)
 *
 * D 的初始拨定（可治理，不追溯）：IFS 价值预算 35%、准备金 25%、
 * 协议自有资本 20%、已结算锁仓费用奖励 10%、生态任务 10%。
 *
 * 回购只使用已拨定的 D，且必须同时满足：没有未覆盖的退款、保证金、
 * 客户本金、借款、准备金和争议负债；路由不可执行或冲击过高 → 停机。
 *
 * 停止规则（§8.3）：连续亏损、IFS 下跌、退出压力 → 费用/奖励/回购收缩或停机。
 * 所有动作都是对内核金库的只读派生 + 本层自己的追加式哈希链回执；
 * 不修改用户资产（deposited/份额不动），不发送交易，audit = SIM。
 */
import { hash, ZERO_HASH } from "../codec.mjs";
// 直接读金库字段：本层只读派生，不依赖快照形状。

export const PROTOCOL_SCHEMA = "iff.protocol/1";

export const PROTOCOL_POLICY = Object.freeze({
  id: "iff-protocol-1",
  version: "1",
  /** 已结算业绩费（相对自有资产已实现正收益，bps） */
  perfFeeBps: 2000,
  /** 执行/验证/存储/团队/合规成本（相对毛收入 R，bps，SIM 计提） */
  costBps: 2000,
  /** 合格准备金目标（相对客户本金 + 债务，bps） */
  reserveTargetBps: 2500,
  /** D 拨定：IFS 价值预算 / 准备金 / 自有资本 / 锁仓奖励 / 生态任务 */
  ifsBudgetBps: 3500,
  reserveBps: 2500,
  ownCapitalBps: 2000,
  stakeRewardBps: 1000,
  ecosystemBps: 1000,
  /** 连续亏损停机线（次） */
  lossStreakHalt: 3,
  /** IFS 相对参考价下跌停机线（bps） */
  ifsDropHaltBps: 3000,
  /** 回购冲击上限（相对执行路由现金，bps）：路由不可执行或冲击过高即停机 */
  buybackImpactBps: 500,
  /** 回执窗口 */
  maxRecords: 96,
});

export function createProtocolFunds() {
  return {
    schema: PROTOCOL_SCHEMA,
    policy: `${PROTOCOL_POLICY.id}@${PROTOCOL_POLICY.version}`,
    audit: "SIM",
    seq: 0,
    lastHash: ZERO_HASH,
    revenue: { perfFees: 0, serviceFees: 0, realizedPnl: 0 },
    costs: 0,
    net: 0,
    reserve: 0,
    ifsBudget: 0,
    ownCapital: 0,
    stakeRewards: 0,
    ecosystem: 0,
    buyback: { budget: 0, spent: 0 },
    lossStreak: 0,
    halted: null,
    ifsReference: 0,
    records: [],
    /** 镜像水位线：feesIn / treasury realized（只入账差额） */
    _watermark: { feesIn: 0, realized: 0 },
  };
}

async function appendRecord(protocol, record) {
  protocol.seq += 1;
  record.schema = "iff.preceipt/1";
  record.id = `prc-${record.tick}-${protocol.seq}`;
  record.seq = protocol.seq;
  record.prevHash = protocol.lastHash;
  record.audit = protocol.audit;
  record.hash = await hash(record);
  protocol.lastHash = record.hash;
  protocol.records.push(record);
  if (protocol.records.length > PROTOCOL_POLICY.maxRecords) {
    protocol.records = protocol.records.slice(-PROTOCOL_POLICY.maxRecords);
  }
  return record;
}

/**
 * 推进协议收入层一步（每 tick 调用）：对内核金库只读，差额入账。
 * @param protocol iff.protocol/1 状态
 * @param treasury kernel.treasury
 * @param tick 当前 tick
 * @param ifsPrice 当前 IFS 纸面价（用于下跌停机线；0 = 未接入）
 * @param exits 用户退出队列长度（压力停机线输入）
 */
export async function stepProtocol(
  protocol,
  treasury,
  { tick, ifsPrice = 0, exits = 0 },
) {
  const feesIn = treasury?.feesIn || 0;
  const realized = treasury?.book?.realized || 0;
  const deposited = treasury?.deposited || 0;
  const feesDelta = Math.max(0, feesIn - protocol._watermark.feesIn);
  const pnlDelta = realized - protocol._watermark.realized;
  protocol._watermark = { feesIn, realized };

  // R：业绩费（只从正收益计提）+ 服务费 + 自有资产已实现收益。
  const perfFees =
    pnlDelta > 0
      ? Math.trunc((pnlDelta * PROTOCOL_POLICY.perfFeeBps) / 10000)
      : 0;
  const serviceFees = feesDelta;
  const realizedPnl = pnlDelta;
  const revenue = perfFees + serviceFees + realizedPnl;
  protocol.revenue.perfFees += perfFees;
  protocol.revenue.serviceFees += serviceFees;
  protocol.revenue.realizedPnl += realizedPnl;

  // C：执行/验证/存储/团队/合规（SIM 按毛收入计提，含负收入时计零）。
  const costs = Math.trunc(
    (Math.max(0, revenue) * PROTOCOL_POLICY.costBps) / 10000,
  );
  protocol.costs += costs;

  // N / T / D。
  const net = revenue - costs;
  protocol.net += net;
  const liabilities = deposited; // SIM：用户本金（债务/退款等未接入为 0）
  const targetReserve = Math.trunc(
    (liabilities * PROTOCOL_POLICY.reserveTargetBps) / 10000,
  );
  const reserveGap = Math.max(0, targetReserve - protocol.reserve);
  const toReserve = Math.min(Math.max(net, 0), reserveGap);
  const distributable = Math.max(net - toReserve, 0);
  protocol.reserve += toReserve;

  // 亏损追踪：业绩费与 D 归零路径由 stop 规则决定。
  if (pnlDelta < 0) protocol.lossStreak += 1;
  else if (pnlDelta > 0) protocol.lossStreak = 0;

  // 停机规则（§8.3）：每 tick 重新计算 —— 连亏回正、价格新高、退出清零后自动解除。
  const reasons = [];
  if (protocol.lossStreak >= PROTOCOL_POLICY.lossStreakHalt)
    reasons.push("LOSS_STREAK");
  if (ifsPrice > 0) {
    if (protocol.ifsReference === 0) protocol.ifsReference = ifsPrice;
    const dropBps = Math.trunc(
      ((protocol.ifsReference - ifsPrice) * 10000) /
        Math.max(1, protocol.ifsReference),
    );
    if (dropBps >= PROTOCOL_POLICY.ifsDropHaltBps) {
      reasons.push("IFS_DROP");
    } else if (protocol.ifsReference > 0) {
      protocol.ifsReference = Math.max(protocol.ifsReference, ifsPrice); // 高水位参考
    }
  }
  if (exits > 0) reasons.push("EXIT_PRESSURE");
  const halted = reasons.length > 0;
  const haltReason = reasons.join("+") || null;

  // D 拨定：停机时 D 冻结为 0（费用/奖励/回购收缩），正常按 35/25/20/10/10。
  let allocation = null;
  if (!halted && distributable > 0) {
    allocation = {
      ifsBudget: Math.trunc(
        (distributable * PROTOCOL_POLICY.ifsBudgetBps) / 10000,
      ),
      reserve: Math.trunc((distributable * PROTOCOL_POLICY.reserveBps) / 10000),
      ownCapital: Math.trunc(
        (distributable * PROTOCOL_POLICY.ownCapitalBps) / 10000,
      ),
      stakeRewards: Math.trunc(
        (distributable * PROTOCOL_POLICY.stakeRewardBps) / 10000,
      ),
      ecosystem: Math.trunc(
        (distributable * PROTOCOL_POLICY.ecosystemBps) / 10000,
      ),
    };
    protocol.ifsBudget += allocation.ifsBudget;
    protocol.reserve += allocation.reserve;
    protocol.ownCapital += allocation.ownCapital;
    protocol.stakeRewards += allocation.stakeRewards;
    protocol.ecosystem += allocation.ecosystem;
  }

  // 回购资格：有拨定的 D、无未覆盖负债（客户本金为 0）、未停机、执行路由有现金且冲击不超标。
  const routeCash = treasury?.book?.bnb || 0;
  const buybackBudget = allocation ? allocation.ifsBudget : 0;
  const buybackEligible =
    buybackBudget > 0 &&
    liabilities === 0 &&
    !halted &&
    routeCash > 0 &&
    buybackBudget <=
      Math.trunc((routeCash * PROTOCOL_POLICY.buybackImpactBps) / 10000);
  if (buybackEligible) {
    protocol.buyback.budget += buybackBudget;
  }
  protocol.halted = halted;
  protocol.haltedReason = haltReason;

  await appendRecord(protocol, {
    tick,
    revenue: { perfFees, serviceFees, realizedPnl, total: revenue },
    costs,
    net,
    toReserve,
    distributable,
    allocation,
    buybackEligible,
    halted,
    haltReason,
  });
  return protocol;
}

/** 协议资金视图（UI / API 共用）。 */
export function protocolView(protocol) {
  const last = protocol.records[protocol.records.length - 1] || null;
  return {
    schema: protocol.schema,
    audit: protocol.audit,
    policy: protocol.policy,
    revenue: { ...protocol.revenue },
    costs: protocol.costs,
    net: protocol.net,
    reserve: protocol.reserve,
    allocation: {
      ifsBudget: protocol.ifsBudget,
      reserveAlloc: protocol.reserve,
      ownCapital: protocol.ownCapital,
      stakeRewards: protocol.stakeRewards,
      ecosystem: protocol.ecosystem,
    },
    buyback: {
      budget: protocol.buyback.budget,
      spent: protocol.buyback.spent,
      eligible: last?.buybackEligible || false,
    },
    halted: protocol.halted,
    haltedReason: protocol.haltedReason || null,
    lossStreak: protocol.lossStreak,
    last: last,
    records: protocol.records.slice(-12).reverse(),
  };
}

/** 状态级快照（随 pit session 持久化）。 */
export function saveProtocol(protocol) {
  return {
    schema: protocol.schema,
    policy: protocol.policy,
    audit: protocol.audit,
    seq: protocol.seq,
    lastHash: protocol.lastHash,
    revenue: { ...protocol.revenue },
    costs: protocol.costs,
    net: protocol.net,
    reserve: protocol.reserve,
    ifsBudget: protocol.ifsBudget,
    ownCapital: protocol.ownCapital,
    stakeRewards: protocol.stakeRewards,
    ecosystem: protocol.ecosystem,
    buyback: { ...protocol.buyback },
    lossStreak: protocol.lossStreak,
    halted: protocol.halted,
    haltedReason: protocol.haltedReason || null,
    ifsReference: protocol.ifsReference,
    records: protocol.records.map((r) => ({ ...r })),
    _watermark: { ...protocol._watermark },
  };
}

export function restoreProtocol(saved) {
  if (!saved || saved.schema !== PROTOCOL_SCHEMA) return createProtocolFunds();
  const protocol = createProtocolFunds();
  Object.assign(protocol, {
    seq: saved.seq,
    lastHash: saved.lastHash,
    revenue: { ...saved.revenue },
    costs: saved.costs,
    net: saved.net,
    reserve: saved.reserve,
    ifsBudget: saved.ifsBudget,
    ownCapital: saved.ownCapital,
    stakeRewards: saved.stakeRewards,
    ecosystem: saved.ecosystem,
    buyback: { ...saved.buyback },
    lossStreak: saved.lossStreak,
    halted: saved.halted,
    haltedReason: saved.haltedReason || null,
    ifsReference: saved.ifsReference,
    records: saved.records.map((r) => ({ ...r })),
    _watermark: { ...saved._watermark },
  });
  return protocol;
}
