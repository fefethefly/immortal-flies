import {
  CREDIT_POLICY,
  advanceCredit,
  awardDividends,
  createCreditLedger,
  creditView,
  ensureCreditSoul,
  occupyCredit,
  releaseCredit,
  restoreCredit,
  saveCredit,
  settleCredit,
  stakeCredit,
  unstakeCredit,
} from "../../../src/brain/flyswarm/credit.mjs";
import { badRequest } from "../shared/errors.mjs";

/**
 * P3 模拟 Credit 服务：每会话一份 iff.credit/1 账本，落盘在会话目录 credit.json。
 * 全部 SIM：不校验真实余额、不签名、不转账。锁仓/占用/结算都是纸面账本动作。
 */
export function createCreditService({ sessions, store, logger }) {
  const ledgers = new Map(); // sessionId -> ledger

  async function ledgerOf(sessionId) {
    if (ledgers.has(sessionId)) return ledgers.get(sessionId);
    const saved = await store.loadCredit(sessionId);
    const ledger = restoreCredit(saved);
    ledgers.set(sessionId, ledger);
    return ledger;
  }

  /** 账本规则拒绝是正常业务错误：一律 400 CREDIT_RULE，不进 500。 */
  function ruleError(err) {
    if (err && err.name === "BrainError")
      return badRequest(err.code || "CREDIT_RULE", err.message);
    return badRequest("CREDIT_RULE", err?.message || String(err));
  }

  async function persist(sessionId, ledger) {
    try {
      await store.saveCredit(sessionId, saveCredit(ledger));
    } catch (err) {
      logger.warn("credit persist failed", {
        sessionId,
        error: err?.message || String(err),
      });
    }
  }

  /**
   * 把内核结算事实按「增量 + 水位线」镜像进账本：只入账自上次镜像以来的
   * 已实现收益差额与新增订单，避免累计值被重复计账；所有在册灵魂都有账户。
   */
  async function mirrorSession(sessionId, row) {
    const ledger = await ledgerOf(sessionId);
    const tick = row.session.kernel.colony.tick;
    advanceCredit(ledger, tick);
    const roster = row.session.kernel.flyswarm.roster.snapshot();
    for (const entry of roster) ensureCreditSoul(ledger, entry.soulId);
    // 质押分红：协议 stakeRewards 池按水位线入账（防重启重复），超额滚回准备金。
    const protocol = row.session.protocol;
    if (protocol) {
      for (const record of protocol.records) {
        if (record.tick <= ledger._dividendWatermark) continue;
        const amount = record.allocation?.stakeRewards || 0;
        const result = awardDividends(ledger, { amount, tick: record.tick });
        if (result.unAwarded > 0) protocol.reserve += result.unAwarded;
        ledger._dividendWatermark = record.tick;
      }
    }
    for (const member of row.session.kernel.colony.members) {
      const soulId = member.session?.state?.soulId;
      if (!soulId) continue;
      ensureCreditSoul(ledger, soulId);
      const realized = member.book.realized || 0;
      const trades = member.book.trades || 0;
      const watermark = ledger._mirrored.get(soulId) || {
        realized: 0,
        trades: 0,
      };
      const dPnl = realized - watermark.realized;
      const dOrders = Math.max(0, trades - watermark.trades);
      if (dPnl !== 0 || dOrders > 0) {
        settleCredit(ledger, {
          soulId,
          pnl: dPnl,
          completedOrders: dOrders,
          tick,
        });
        ledger._mirrored.set(soulId, { realized, trades });
      }
    }
    return ledger;
  }

  async function view(sessionId) {
    const row = await sessions.getRow(sessionId);
    const ledger = await mirrorSession(sessionId, row);
    return creditView(ledger, { tick: row.session.kernel.colony.tick });
  }

  async function stake(sessionId, body, req) {
    const row = await sessions.getRow(sessionId);
    sessions.assertOwner(row, req);
    const ledger = await mirrorSession(sessionId, row);
    const tick = row.session.kernel.colony.tick;
    const soulId = String(body?.soulId || "");
    const amount = Number(body?.amount);
    if (!soulId) throw badRequest("MISSING_SOUL", "soulId required");
    if (!Number.isSafeInteger(amount))
      throw badRequest("INVALID_AMOUNT", "amount must be an integer");
    if (!row.session.kernel.flyswarm.roster.get(soulId))
      throw badRequest("UNKNOWN_SOUL", `soulId ${soulId} not in roster`);
    let stakeRow;
    try {
      stakeRow = stakeCredit(ledger, {
        soulId,
        amount,
        tick,
        priceAt: row.session.kernel.colony.market.price,
      });
    } catch (err) {
      throw ruleError(err);
    }
    await persist(sessionId, ledger);
    return { schema: "iff.stake/1", ...stakeRow, audit: "SIM" };
  }

  async function unstake(sessionId, body, req) {
    const row = await sessions.getRow(sessionId);
    sessions.assertOwner(row, req);
    const ledger = await mirrorSession(sessionId, row);
    const stakeId = String(body?.stakeId || "");
    if (!stakeId) throw badRequest("MISSING_STAKE", "stakeId required");
    let freed;
    try {
      freed = unstakeCredit(ledger, {
        stakeId,
        tick: row.session.kernel.colony.tick,
      });
    } catch (err) {
      throw ruleError(err);
    }
    await persist(sessionId, ledger);
    return { schema: "iff.stake/1", ...freed, audit: "SIM", released: true };
  }

  async function occupy(sessionId, body, req) {
    const row = await sessions.getRow(sessionId);
    sessions.assertOwner(row, req);
    const ledger = await mirrorSession(sessionId, row);
    const stakeId = String(body?.stakeId || "");
    const purpose = String(body?.purpose || "service").slice(0, 64);
    if (!stakeId) throw badRequest("MISSING_STAKE", "stakeId required");
    let stakeRow;
    try {
      stakeRow = occupyCredit(ledger, { stakeId, purpose });
    } catch (err) {
      throw ruleError(err);
    }
    await persist(sessionId, ledger);
    return { schema: "iff.stake/1", ...stakeRow, audit: "SIM" };
  }

  async function release(sessionId, body, req) {
    const row = await sessions.getRow(sessionId);
    sessions.assertOwner(row, req);
    const ledger = await mirrorSession(sessionId, row);
    const stakeId = String(body?.stakeId || "");
    if (!stakeId) throw badRequest("MISSING_STAKE", "stakeId required");
    let stakeRow;
    try {
      stakeRow = releaseCredit(ledger, { stakeId });
    } catch (err) {
      throw ruleError(err);
    }
    await persist(sessionId, ledger);
    return { schema: "iff.stake/1", ...stakeRow, audit: "SIM" };
  }

  function policy() {
    return {
      schema: "iff.credit-policy/1",
      id: CREDIT_POLICY.id,
      version: CREDIT_POLICY.version,
      ltvBps: CREDIT_POLICY.ltvBps,
      profitShareBps: CREDIT_POLICY.profitShareBps,
      reliabilityFactor: CREDIT_POLICY.reliabilityFactor,
      worldBudgetCap: CREDIT_POLICY.worldBudgetCap,
      freeSeed: CREDIT_POLICY.freeSeed,
      freeDecayPerTick: CREDIT_POLICY.freeDecayPerTick,
      bondedStakeMin: CREDIT_POLICY.bondedStakeMin,
      unlockTicks: CREDIT_POLICY.unlockTicks,
      stakePriceTicks: CREDIT_POLICY.stakePriceTicks,
      lossStreakFloor: CREDIT_POLICY.lossStreakFloor,
      audit: "SIM",
    };
  }

  return { view, stake, unstake, occupy, release, policy, ledgerOf };
}
