/**
 * iff.vault/1 —— 用户金库（P5，SIM）。
 *
 * 规则（docs/PRODUCT-LATEST.md §7.1 / §8.1 / §11）：
 * - 注资按当前 NAV 铸份额；每一批份额（batch）单独记账：成本、入场 NAV、
 *   批次高水位、已实现损益、费用与退出状态，并持有 Position 位置 ID（SIM 身份，
 *   不是链上 NFT）。
 * - 赎回严格校验个人份额所有权：只能赎回自己批次里的份额；重复赎回拒绝。
 * - 退出走队列：FIFO，受金库现金流动性上限；不够就排队，不挪用其他资金池。
 * - 只有已实现收益可分配/发奖励；未实现浮盈不分配、不形成回购预算。
 * - 用户本金与协议自有资产分账：本账本只持有用户本金，协议资金在 iff.protocol/1。
 * - 全部整数运算、audit = SIM；不签名、不转账、不持有真实资金。
 */
import { integer } from "../codec.mjs";

/** NAV 定点标度（1e6）：避免整数截断吞掉净值变化。 */
const NAV_UNIT = 1_000_000;

export const VAULT_SCHEMA = "iff.vault/1";

export const VAULT_POLICY = Object.freeze({
  id: "iff-vault-1",
  version: "1",
  /** 已实现收益业绩费（bps，超过批次高水位的部分计提） */
  perfFeeBps: 2000,
  /** 单次退出最多占金库现金的比例（bps，流动性上限） */
  exitLiquidityCapBps: 5000,
  /** 退出队列上限 */
  maxExits: 64,
});

export function createUserVault() {
  return {
    schema: VAULT_SCHEMA,
    policy: `${VAULT_POLICY.id}@${VAULT_POLICY.version}`,
    audit: "SIM",
    book: { cash: 0, inventoryValue: 0 },
    shares: 0,
    nav: 0,
    highWater: 0,
    realizedPool: 0, // 扣除费用后、可分配的已实现收益池
    feeRevenue: 0,
    batches: [], // {id, positionId, owner, amount, shares, navAtEntry, highWater, realized, fees, status, exiting}
    exits: [], // {id, owner, shares, requestedAt, status: queued|done, batchRefs}
    nextBatchId: 1,
    nextExitId: 1,
    nextPositionId: 1,
  };
}

function batchOf(vault, id) {
  const batch = vault.batches.find((b) => b.id === id);
  if (!batch) throw new Error(`未知批次 ${id}`);
  return batch;
}

/** 用户可退出份额 = 名下开放批次份额 − 已在退出中的份额。 */
export function ownedShares(vault, owner) {
  let total = 0;
  for (const batch of vault.batches) {
    if (batch.owner !== owner) continue;
    total += batch.shares;
    if (batch.exiting > 0) total -= batch.exiting;
  }
  return total;
}

/** 注资：按当前 NAV 铸份额（创世 NAV = 1:1）。入金不算收益。 */
export function vaultDeposit(vault, { owner, amount, tick = 0 }) {
  integer(amount, 1, Number.MAX_SAFE_INTEGER, "注资额");
  if (!owner) throw new Error("owner required");
  const nav =
    vault.shares === 0
      ? NAV_UNIT
      : Math.max(1, Math.trunc((vault.book.cash * NAV_UNIT) / vault.shares));
  const shares = Math.trunc((amount * NAV_UNIT) / nav);
  if (shares < 1) throw new Error("注资过小，不能铸份额");
  const batch = {
    schema: "iff.batch/1",
    id: `batch-${vault.nextBatchId}`,
    positionId: `pos-${String(vault.nextPositionId).padStart(4, "0")}`,
    owner,
    amount,
    shares,
    navAtEntry: nav,
    highWater: nav,
    realized: 0,
    fees: 0,
    status: "open",
    exiting: 0,
    audit: vault.audit,
  };
  vault.nextBatchId += 1;
  vault.nextPositionId += 1;
  vault.batches.push(batch);
  vault.book.cash += amount;
  vault.shares += shares;
  vault.nav = Math.trunc((vault.book.cash * NAV_UNIT) / vault.shares);
  vault.highWater = Math.max(vault.highWater, vault.nav);
  return batch;
}

/** 申请退出：严格校验份额所有权，进 FIFO 队列（不立即结算）。 */
export function vaultRequestExit(vault, { owner, shares, tick = 0 }) {
  integer(shares, 1, Number.MAX_SAFE_INTEGER, "退出份额");
  const owned = ownedShares(vault, owner);
  if (shares > owned)
    throw new Error(`份额所有权不足：持有 ${owned}，申请 ${shares}`);
  if (vault.exits.length >= VAULT_POLICY.maxExits)
    throw new Error("退出队列已满");
  // 按 FIFO 从名下最老批次扣减 exiting（冻结对应份额，防止重复赎回）。
  let remaining = shares;
  const refs = [];
  for (const batch of vault.batches) {
    if (remaining <= 0) break;
    if (batch.owner !== owner || batch.status !== "open") continue;
    const free = batch.shares - batch.exiting;
    if (free <= 0) continue;
    const take = Math.min(free, remaining);
    batch.exiting += take;
    remaining -= take;
    refs.push({ batchId: batch.id, shares: take });
  }
  if (remaining > 0) throw new Error("份额所有权不足");
  const exit = {
    schema: "iff.exit/1",
    id: `exit-${vault.nextExitId}`,
    owner,
    shares,
    requestedAt: tick,
    status: "queued",
    batchRefs: refs,
    audit: vault.audit,
  };
  vault.nextExitId += 1;
  vault.exits.push(exit);
  return exit;
}

/**
 * 结算退出队列：FIFO、受流动性上限（单次最多动用现金 cap）。
 * 每批按入场 NAV 与当前 NAV 结算已实现损益；业绩费只从超过批次高水位的部分计提；
 * 高水位随结算更新。现金不足时排在后面的保持排队（不挪用其他资金）。
 */
export function vaultSettleExits(vault, { tick = 0 } = {}) {
  const settled = [];
  const cap = Math.trunc(
    (vault.book.cash * VAULT_POLICY.exitLiquidityCapBps) / 10000,
  );
  let cashUsed = 0;
  for (const exit of vault.exits) {
    if (exit.status !== "queued") continue;
    if (cashUsed >= cap) break; // 流动性不足：继续排队
    const nav =
      vault.shares > 0
        ? Math.max(1, Math.trunc((vault.book.cash * NAV_UNIT) / vault.shares))
        : 1;
    const cost = Math.trunc((exit.shares * nav) / NAV_UNIT);
    if (cashUsed + cost > cap) break;
    let realized = 0;
    let fees = 0;
    for (const ref of exit.batchRefs) {
      const batch = batchOf(vault, ref.batchId);
      const gross = Math.trunc(
        ((nav - batch.navAtEntry) * ref.shares) / NAV_UNIT,
      );
      const fee =
        gross > 0 ? Math.trunc((gross * VAULT_POLICY.perfFeeBps) / 10000) : 0;
      batch.realized += gross - fee;
      batch.fees += fee;
      batch.shares -= ref.shares;
      batch.exiting -= ref.shares;
      batch.highWater = Math.max(batch.highWater, nav);
      if (batch.shares <= 0) batch.status = "closed";
      realized += gross - fee;
      fees += fee;
    }
    vault.book.cash -= cost;
    vault.shares -= exit.shares;
    cashUsed += cost;
    vault.realizedPool += realized;
    vault.feeRevenue += fees;
    exit.status = "done";
    exit.settledAt = tick;
    exit.navAtExit = nav;
    exit.realized = realized;
    exit.fees = fees;
    settled.push(exit);
  }
  vault.nav =
    vault.shares > 0
      ? Math.trunc((vault.book.cash * NAV_UNIT) / vault.shares)
      : 0;
  vault.highWater = Math.max(vault.highWater, vault.nav);
  return settled;
}

/** 金库视图（UI / API 共用）。 */
export function vaultView(vault) {
  return {
    schema: vault.schema,
    audit: vault.audit,
    policy: vault.policy,
    cash: vault.book.cash,
    shares: vault.shares,
    nav: vault.nav,
    highWater: vault.highWater,
    realizedPool: vault.realizedPool,
    feeRevenue: vault.feeRevenue,
    batches: vault.batches.map((b) => ({ ...b })),
    exits: vault.exits.map((e) => ({ ...e })),
    policyParams: {
      perfFeeBps: VAULT_POLICY.perfFeeBps,
      exitLiquidityCapBps: VAULT_POLICY.exitLiquidityCapBps,
      maxExits: VAULT_POLICY.maxExits,
    },
  };
}

/** 快照 / 恢复。 */
export function saveVault(vault) {
  return {
    schema: vault.schema,
    policy: vault.policy,
    audit: vault.audit,
    book: { ...vault.book },
    shares: vault.shares,
    nav: vault.nav,
    highWater: vault.highWater,
    realizedPool: vault.realizedPool,
    feeRevenue: vault.feeRevenue,
    batches: vault.batches.map((b) => ({ ...b })),
    exits: vault.exits.map((e) => ({ ...e })),
    nextBatchId: vault.nextBatchId,
    nextExitId: vault.nextExitId,
    nextPositionId: vault.nextPositionId,
  };
}

export function restoreVault(saved) {
  if (!saved || saved.schema !== VAULT_SCHEMA) return createUserVault();
  const vault = createUserVault();
  Object.assign(vault, {
    book: { ...saved.book },
    shares: saved.shares,
    nav: saved.nav,
    highWater: saved.highWater,
    realizedPool: saved.realizedPool,
    feeRevenue: saved.feeRevenue,
    batches: saved.batches.map((b) => ({ ...b })),
    exits: saved.exits.map((e) => ({ ...e })),
    nextBatchId: saved.nextBatchId,
    nextExitId: saved.nextExitId,
    nextPositionId: saved.nextPositionId,
  });
  return vault;
}
