import test from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_POLICY,
  PROTOCOL_SCHEMA,
  createProtocolFunds,
  protocolView,
  restoreProtocol,
  saveProtocol,
  stepProtocol,
} from "../src/brain/flyswarm/protocol.mjs";
import { createTreasury } from "../src/brain/treasury.mjs";
import { createPorts, decodePort } from "../src/brain/ports.mjs";

function treasuryWithFees(feesIn, realized) {
  const treasury = createTreasury();
  treasury.feesIn = feesIn;
  treasury.book.realized = realized;
  return treasury;
}

test("R/C/N/T/D 数学：收入归集、成本计提、净额与可分配", async () => {
  const protocol = createProtocolFunds();
  // 先让金库产生 1_000 服务费与 2_000 已实现收益
  const treasury = treasuryWithFees(1_000, 2_000);
  await stepProtocol(protocol, treasury, { tick: 1 });
  const perfFees = Math.trunc((2_000 * PROTOCOL_POLICY.perfFeeBps) / 10000);
  const revenue = perfFees + 1_000 + 2_000;
  const costs = Math.trunc((revenue * PROTOCOL_POLICY.costBps) / 10000);
  const net = revenue - costs;
  assert.equal(protocol.revenue.perfFees, perfFees);
  assert.equal(protocol.revenue.serviceFees, 1_000);
  assert.equal(protocol.revenue.realizedPnl, 2_000);
  assert.equal(protocol.costs, costs);
  assert.equal(protocol.net, net);
  const view = protocolView(protocol);
  assert.equal(view.last.revenue.total, revenue);
  assert.equal(view.last.net, net);
  // 无用户本金 → 准备金缺口 0 → T = 0，D = N
  assert.equal(view.last.toReserve, 0);
  assert.equal(view.last.distributable, net);
});

test("D 拨定：35/25/20/10/10 且总和等于可分配", async () => {
  const protocol = createProtocolFunds();
  const treasury = treasuryWithFees(0, 100_000);
  await stepProtocol(protocol, treasury, { tick: 1 });
  const view = protocolView(protocol);
  const a = view.last.allocation;
  assert.ok(a, "正收益且未停机必须有拨定");
  const sum =
    a.ifsBudget + a.reserve + a.ownCapital + a.stakeRewards + a.ecosystem;
  assert.equal(sum, view.last.distributable);
  assert.equal(a.ifsBudget, Math.trunc((view.last.distributable * 35) / 100));
  assert.equal(a.reserve, Math.trunc((view.last.distributable * 25) / 100));
  assert.equal(a.ownCapital, Math.trunc((view.last.distributable * 20) / 100));
});

test("负收益：不产生 D、不拨定、连亏触发停机", async () => {
  const protocol = createProtocolFunds();
  let treasury = treasuryWithFees(0, -5_000);
  await stepProtocol(protocol, treasury, { tick: 1 });
  assert.equal(protocolView(protocol).last.distributable, 0);
  for (let i = 2; i <= 1 + PROTOCOL_POLICY.lossStreakHalt; i++) {
    treasury = treasuryWithFees(0, -5_000 * i);
    await stepProtocol(protocol, treasury, { tick: i });
  }
  const view = protocolView(protocol);
  assert.equal(view.halted, true);
  assert.equal(view.haltedReason, "LOSS_STREAK");
  assert.equal(view.last.allocation, null, "停机后 D 冻结");
});

test("回购资格：无负债且未停机才可回购；有客户本金则被负债阻断", async () => {
  const protocol = createProtocolFunds();
  const funded = treasuryWithFees(0, 10_000);
  funded.book.bnb = 1_000_000; // 执行路由有现金
  await stepProtocol(protocol, funded, { tick: 1 });
  assert.equal(protocolView(protocol).buyback.eligible, true);
  assert.ok(protocol.buyback.budget > 0, "可回购时预算来自 IFS 价值预算");
  // 有客户本金（未覆盖负债）→ 回购资格取消
  const protocol2 = createProtocolFunds();
  const t2 = treasuryWithFees(0, 10_000);
  t2.book.bnb = 1_000_000;
  t2.deposited = 50_000;
  await stepProtocol(protocol2, t2, { tick: 1 });
  assert.equal(protocolView(protocol2).buyback.eligible, false);
  // 且要先把准备金缺口补上
  assert.ok(protocolView(protocol2).last.toReserve > 0);
});

test("IFS 下跌停机：相对高水位跌超阈值 → 停机；回到新高 → 解除", async () => {
  const protocol = createProtocolFunds();
  await stepProtocol(protocol, treasuryWithFees(0, 1_000), {
    tick: 1,
    ifsPrice: 10_000,
  });
  await stepProtocol(protocol, treasuryWithFees(0, 0), {
    tick: 2,
    ifsPrice: 6_900,
  });
  assert.equal(protocolView(protocol).halted, true);
  assert.equal(protocolView(protocol).haltedReason, "IFS_DROP");
  await stepProtocol(protocol, treasuryWithFees(0, 0), {
    tick: 3,
    ifsPrice: 12_000,
  });
  assert.equal(protocolView(protocol).halted, false, "价格新高后解除");
});

test("退出压力：存在退出请求 → 停机", async () => {
  const protocol = createProtocolFunds();
  await stepProtocol(protocol, treasuryWithFees(0, 1_000), {
    tick: 1,
    exits: 3,
  });
  assert.equal(protocolView(protocol).halted, true);
  assert.equal(protocolView(protocol).haltedReason, "EXIT_PRESSURE");
});

test("用户资产不动：deposited / 份额不因协议层变化", async () => {
  const treasury = treasuryWithFees(0, 10_000);
  treasury.deposited = 40_000;
  treasury.shares = 40_000;
  const before = JSON.stringify({
    deposited: treasury.deposited,
    shares: treasury.shares,
  });
  const protocol = createProtocolFunds();
  await stepProtocol(protocol, treasury, { tick: 1 });
  await stepProtocol(protocol, treasury, { tick: 2 });
  const after = JSON.stringify({
    deposited: treasury.deposited,
    shares: treasury.shares,
  });
  assert.equal(after, before);
});

test("确定性重放与回执哈希链：同输入逐位一致，链不中断", async () => {
  const run = async () => {
    const protocol = createProtocolFunds();
    let fees = 100;
    for (let i = 1; i <= 12; i++) {
      await stepProtocol(protocol, treasuryWithFees(fees, 500 * i - 3000), {
        tick: i,
        ifsPrice: 9_000 + i * 100,
      });
      fees += 100;
    }
    return protocol;
  };
  const a = await run();
  const b = await run();
  assert.deepEqual(saveProtocol(a), saveProtocol(b));
  for (let i = 1; i < a.records.length; i++) {
    assert.equal(a.records[i].prevHash, a.records[i - 1].hash, "回执链断裂");
  }
  const restored = restoreProtocol(saveProtocol(a));
  assert.deepEqual(saveProtocol(restored), saveProtocol(a));
  assert.equal(protocolView(a).schema, PROTOCOL_SCHEMA);
  assert.equal(protocolView(a).audit, "SIM");
});
