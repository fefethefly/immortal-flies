import test from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_POLICY,
  advanceCredit,
  awardDividends,
  rwaQuotaOf,
  createCreditLedger,
  creditOf,
  creditView,
  occupyCredit,
  releaseCredit,
  restoreCredit,
  saveCredit,
  settleCredit,
  stakeCredit,
  unstakeCredit,
} from "../src/brain/flyswarm/credit.mjs";

test("四账户与公式：usable = free + capacity − 负债 − 准备金，全部整数", () => {
  const ledger = createCreditLedger();
  const soul = "colony-0";
  // 初始：只有免费额度，无抵押/收益/订单 → capacity = 0
  const initial = creditOf(ledger, soul);
  assert.equal(initial.free, CREDIT_POLICY.freeSeed);
  assert.equal(initial.capacity, 0);
  assert.equal(initial.usable, CREDIT_POLICY.freeSeed);
  // 有结算收益但无订单与抵押：min 四项 → capacity 仍为 0（订单与抵押必须真实存在）
  settleCredit(ledger, {
    soulId: soul,
    pnl: 10_000,
    completedOrders: 0,
    tick: 1,
  });
  assert.equal(creditOf(ledger, soul, { tick: 1 }).capacity, 0);
});

test("不重复抵押：同一质押只能占用一次，释放后可重新占用", () => {
  const ledger = createCreditLedger();
  const stake = stakeCredit(ledger, {
    soulId: "colony-1",
    amount: 10_000,
    tick: 5,
  });
  occupyCredit(ledger, { stakeId: stake.id, purpose: "llm" });
  assert.throws(
    () => occupyCredit(ledger, { stakeId: stake.id, purpose: "verify" }),
    /不能重复抵押/,
  );
  releaseCredit(ledger, { stakeId: stake.id });
  occupyCredit(ledger, { stakeId: stake.id, purpose: "verify" });
  assert.equal(ledger.stakes[0].occupiedBy.purpose, "verify");
});

test("质押门槛与解锁期：低于门槛拒绝；到期前不可解锁；占用中不可解锁", () => {
  const ledger = createCreditLedger();
  assert.throws(
    () => stakeCredit(ledger, { soulId: "colony-2", amount: 999, tick: 0 }),
    /超出范围/,
  );
  const stake = stakeCredit(ledger, {
    soulId: "colony-2",
    amount: 10_000,
    tick: 0,
  });
  assert.equal(stake.unlockAt, 0 + CREDIT_POLICY.unlockTicks);
  assert.throws(
    () => unstakeCredit(ledger, { stakeId: stake.id, tick: 10 }),
    /未到解锁期/,
  );
  occupyCredit(ledger, { stakeId: stake.id });
  assert.throws(
    () => unstakeCredit(ledger, { stakeId: stake.id, tick: stake.unlockAt }),
    /先释放占用/,
  );
  releaseCredit(ledger, { stakeId: stake.id });
  const freed = unstakeCredit(ledger, {
    stakeId: stake.id,
    tick: stake.unlockAt,
  });
  assert.equal(freed.id, stake.id);
  assert.equal(ledger.stakes.length, 0);
});

test("LTV 上限：usable 的锁定部分不超过 抵押价值 × LTV", () => {
  const ledger = createCreditLedger();
  const soul = "colony-3";
  stakeCredit(ledger, { soulId: soul, amount: 50_000, tick: 0 });
  settleCredit(ledger, {
    soulId: soul,
    pnl: 1_000_000,
    completedOrders: 100,
    tick: 1,
  });
  const view = creditOf(ledger, soul, { tick: 1 });
  const expectedLocked = Math.trunc((50_000 * CREDIT_POLICY.ltvBps) / 10000);
  assert.equal(view.locked, expectedLocked);
  assert.ok(view.capacity <= expectedLocked);
  assert.ok(view.usable <= view.free + view.capacity);
});

test("亏损收缩：亏损不增加 settledProfit，连续亏损降低 reliability 与额度", () => {
  const ledger = createCreditLedger();
  const soul = "colony-4";
  settleCredit(ledger, {
    soulId: soul,
    pnl: 20_000,
    completedOrders: 10,
    tick: 0,
  });
  const healthy = creditOf(ledger, soul, { tick: 0 });
  for (let i = 0; i < CREDIT_POLICY.lossStreakFloor; i++) {
    settleCredit(ledger, {
      soulId: soul,
      pnl: -1000,
      completedOrders: 1,
      tick: i + 1,
    });
  }
  const strained = creditOf(ledger, soul, {
    tick: CREDIT_POLICY.lossStreakFloor,
  });
  assert.equal(strained.settledProfit, 20_000, "亏损不得进已结算收益");
  assert.equal(strained.lossStreak, CREDIT_POLICY.lossStreakFloor);
  assert.equal(strained.reliability, 0);
  assert.ok(strained.orders < healthy.orders, "连续亏损后订单价值收缩");
});

test("免费额度随 tick 衰减至零", () => {
  const ledger = createCreditLedger();
  const soul = "colony-5";
  creditOf(ledger, soul); // 先出生，衰减从其出生时刻计
  advanceCredit(ledger, CREDIT_POLICY.freeSeed + 5);
  const view = creditOf(ledger, soul, { tick: ledger.tick });
  assert.equal(view.free, 0);
  // 新生灵魂不追扣：出生即获得全额种子额度
  const newborn = creditOf(ledger, "colony-5b", { tick: ledger.tick });
  assert.equal(newborn.free, CREDIT_POLICY.freeSeed);
});

test("到期收缩：超过价格新鲜期的质押不计抵押价值", () => {
  const ledger = createCreditLedger();
  const soul = "colony-6";
  stakeCredit(ledger, { soulId: soul, amount: 30_000, tick: 0, priceAt: 100 });
  const fresh = creditOf(ledger, soul, { tick: CREDIT_POLICY.stakePriceTicks });
  assert.equal(fresh.collateralValue, 30_000);
  const stale = creditOf(ledger, soul, {
    tick: CREDIT_POLICY.stakePriceTicks + 1,
  });
  assert.equal(stale.collateralValue, 0, "过期抵押价值归零");
  assert.equal(stale.locked, 0);
});

test("快照往返：saveCredit/restoreCredit 逐位一致", () => {
  const ledger = createCreditLedger();
  stakeCredit(ledger, { soulId: "colony-7", amount: 12_000, tick: 3 });
  settleCredit(ledger, {
    soulId: "colony-7",
    pnl: 500,
    completedOrders: 2,
    tick: 4,
  });
  occupyCredit(ledger, { stakeId: "stake-1", purpose: "llm" });
  advanceCredit(ledger, 9);
  const saved = saveCredit(ledger);
  const restored = restoreCredit(saved);
  assert.deepEqual(saveCredit(restored), saved);
  const view = creditView(restored);
  assert.equal(view.audit, "SIM");
  assert.equal(view.policy, `${CREDIT_POLICY.id}@${CREDIT_POLICY.version}`);
  assert.ok(view.souls.length >= 1);
  assert.equal(view.stakes.length, 1);
});

test("质押分红：按锁定质押量比例分配，单魂封顶，超额滚回", () => {
  const ledger = createCreditLedger();
  stakeCredit(ledger, { soulId: "whale", amount: 90_000, tick: 0 });
  stakeCredit(ledger, { soulId: "small-a", amount: 10_000, tick: 0 });
  stakeCredit(ledger, { soulId: "small-b", amount: 10_000, tick: 0 });
  const { awarded, unAwarded } = awardDividends(ledger, {
    amount: 1000,
    tick: 1,
  });
  const whale = creditOf(ledger, "whale");
  const a = creditOf(ledger, "small-a");
  const b = creditOf(ledger, "small-b");
  const cap = Math.trunc((1000 * CREDIT_POLICY.dividendCapBps) / 10000);
  assert.equal(whale.dividends, cap, "巨鲸分红被 10% 封顶");
  assert.ok(unAwarded > 0, "超额部分必须滚回");
  assert.equal(awarded + unAwarded, 1000);
  assert.ok(a.dividends > 0 && b.dividends > 0, "小份额者都有分红");
  assert.ok(
    Math.abs(a.dividends - b.dividends) <= 2,
    "余数按序补给，两小户差距不超过 1 单位余数",
  );
  assert.equal(
    whale.dividends + a.dividends + b.dividends + unAwarded,
    1000,
    "分红守恒",
  );
  // 分红日志入账
  const view = creditView(ledger);
  assert.equal(view.dividends.log.length, 1);
  assert.equal(view.dividends.log[0].amount, 1000);
});

test("质押分红：无质押者时全额滚回；零池不分", () => {
  const ledger = createCreditLedger();
  const empty = awardDividends(ledger, { amount: 500, tick: 1 });
  assert.deepEqual(empty, { awarded: 0, unAwarded: 500 });
  const zero = awardDividends(ledger, { amount: 0, tick: 2 });
  assert.equal(zero.awarded + zero.unAwarded, 0);
});

test("RWA 配额：锁定质押 × 倍数，封顶，只做资格模拟", () => {
  const ledger = createCreditLedger();
  stakeCredit(ledger, { soulId: "alice", amount: 30_000, tick: 0 });
  const quota = rwaQuotaOf(ledger, "alice");
  assert.equal(
    quota,
    Math.trunc((30_000 * CREDIT_POLICY.rwaQuotaMultiplierBps) / 10000),
  );
  // 封顶
  stakeCredit(ledger, { soulId: "alice", amount: 2_000_000, tick: 0 });
  assert.equal(rwaQuotaOf(ledger, "alice"), CREDIT_POLICY.rwaCap);
  // 未质押者无配额
  assert.equal(rwaQuotaOf(ledger, "nobody"), 0);
});

test("分红随协议链路：stakeRewards 拨定进入账本，停机冻结", async () => {
  const { createProtocolFunds, stepProtocol } = await import(
    "../src/brain/flyswarm/protocol.mjs"
  );
  const { createTreasury } = await import("../src/brain/treasury.mjs");
  const protocol = createProtocolFunds();
  const ledger = createCreditLedger();
  stakeCredit(ledger, { soulId: "alice", amount: 20_000, tick: 0 });
  // 正常 tick：有收益 → D 拨定含 stakeRewards
  const treasury = createTreasury();
  treasury.feesIn = 1_000;
  treasury.book.realized = 2_000;
  treasury.book.bnb = 1_000_000;
  await stepProtocol(protocol, treasury, { tick: 1 });
  const record = protocol.records[protocol.records.length - 1];
  const amount = record.allocation?.stakeRewards || 0;
  assert.ok(amount > 0, "收益期必须有锁仓奖励拨定");
  const result = awardDividends(ledger, { amount, tick: 1 });
  assert.equal(result.awarded + result.unAwarded, amount);
  assert.ok(creditOf(ledger, "alice").dividends > 0);
  // 停机 tick：无拨定 → 分红自然冻结
  for (let i = 2; i <= 2 + CREDIT_POLICY.lossStreakFloor; i++) {
    const t2 = createTreasury();
    t2.feesIn = 1_000 + i;
    t2.book.realized = -500 * i;
    t2.book.bnb = 1_000_000;
    await stepProtocol(protocol, t2, { tick: i });
  }
  const haltedRecord = protocol.records[protocol.records.length - 1];
  assert.equal(haltedRecord.allocation, null, "停机后 D 冻结");
  const before = creditOf(ledger, "alice").dividends;
  awardDividends(ledger, {
    amount: haltedRecord.allocation?.stakeRewards || 0,
    tick: 5,
  });
  assert.equal(creditOf(ledger, "alice").dividends, before, "停机期不分红");
});
