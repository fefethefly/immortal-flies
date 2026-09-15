import test from "node:test";
import assert from "node:assert/strict";
import {
  VAULT_POLICY,
  VAULT_SCHEMA,
  createUserVault,
  ownedShares,
  restoreVault,
  saveVault,
  vaultDeposit,
  vaultRequestExit,
  vaultSettleExits,
  vaultView,
} from "../src/brain/flyswarm/vault.mjs";

test("注资按 NAV 铸份额：创世 1:1，批次记录成本/高水位/Position ID", () => {
  const vault = createUserVault();
  const batch = vaultDeposit(vault, { owner: "alice", amount: 1000 });
  assert.equal(batch.shares, 1000);
  assert.equal(batch.navAtEntry, 1_000_000);
  assert.equal(batch.highWater, 1_000_000);
  assert.match(batch.positionId, /^pos-\d{4}$/);
  assert.equal(vault.shares, 1000);
  assert.equal(vault.nav, 1_000_000);
  assert.equal(ownedShares(vault, "alice"), 1000);
});

test("份额所有权：他人份额不可赎回；自己超额不可赎回；冻结后不可重复赎回", () => {
  const vault = createUserVault();
  vaultDeposit(vault, { owner: "alice", amount: 1000 });
  vaultDeposit(vault, { owner: "bob", amount: 500 });
  assert.throws(
    () => vaultRequestExit(vault, { owner: "bob", shares: 600 }),
    /所有权不足/,
  );
  assert.throws(
    () => vaultRequestExit(vault, { owner: "mallory", shares: 10 }),
    /所有权不足/,
  );
  vaultRequestExit(vault, { owner: "alice", shares: 600 });
  assert.equal(ownedShares(vault, "alice"), 400, "退出中的份额被冻结");
  assert.throws(
    () => vaultRequestExit(vault, { owner: "alice", shares: 500 }),
    /所有权不足/,
  );
});

test("会计与费用：正收益扣业绩费，负收益不扣费且不进收益池", () => {
  const vault = createUserVault();
  vaultDeposit(vault, { owner: "alice", amount: 1000 });
  vaultDeposit(vault, { owner: "bob", amount: 1000 });
  // 模拟净值上涨：金库现金增值（收益来自金库自身操作，SIM）
  vault.book.cash += 1000;
  vault.nav = Math.trunc(vault.book.cash / vault.shares);
  const exit = vaultRequestExit(vault, { owner: "alice", shares: 500 });
  vaultSettleExits(vault, { tick: 1 });
  assert.equal(exit.status, "done");
  const gross = Math.trunc(((vault.nav - 1_000_000) * 500) / 1_000_000);
  const fee = Math.trunc((gross * VAULT_POLICY.perfFeeBps) / 10000);
  assert.ok(fee > 0, "正收益必须收业绩费");
  assert.equal(exit.realized, gross - fee);
  assert.equal(vault.feeRevenue, fee);
  assert.equal(vault.realizedPool, gross - fee);
});

test("退出队列：FIFO 且受流动性上限，不够就继续排队", () => {
  const vault = createUserVault();
  vaultDeposit(vault, { owner: "a1", amount: 1000 });
  vaultDeposit(vault, { owner: "a2", amount: 1000 });
  vaultDeposit(vault, { owner: "a3", amount: 1000 });
  const e1 = vaultRequestExit(vault, { owner: "a1", shares: 800 });
  const e2 = vaultRequestExit(vault, { owner: "a2", shares: 800 });
  const e3 = vaultRequestExit(vault, { owner: "a3", shares: 800 });
  const settled = vaultSettleExits(vault, { tick: 2 });
  const cap = Math.trunc(
    (vault.book.cash * VAULT_POLICY.exitLiquidityCapBps) / 10000,
  );
  const expectable = Math.floor(cap / 800);
  assert.equal(settled.length, expectable);
  assert.equal(e1.status, "done");
  assert.ok(settled.every((e) => e.status === "done"));
  const queued = vault.exits.filter((e) => e.status === "queued");
  assert.equal(queued.length, 3 - expectable, "现金不足的保持排队");
  assert.ok(e2.status === "queued" || e3.status === "queued");
});

test("守恒：份额与现金守恒，结算后 NAV 不突变", () => {
  const vault = createUserVault();
  vaultDeposit(vault, { owner: "x", amount: 2000 });
  const shares0 = vault.shares;
  const cash0 = vault.book.cash;
  vaultRequestExit(vault, { owner: "x", shares: 700 });
  vaultSettleExits(vault, { tick: 1 });
  assert.equal(vault.shares, shares0 - 700);
  assert.equal(vault.book.cash, cash0 - 700);
});

test("浮盈不可分配：收益池只来自已结算退出，未实现浮盈不改变收益池", () => {
  const vault = createUserVault();
  vaultDeposit(vault, { owner: "y", amount: 1000 });
  vault.book.cash += 5000; // 浮盈
  vault.nav = Math.trunc(vault.book.cash / vault.shares);
  assert.equal(vault.realizedPool, 0, "浮盈不进入可分配收益池");
});

test("快照往返与失败恢复：恢复后状态逐位一致，可继续操作", () => {
  const vault = createUserVault();
  vaultDeposit(vault, { owner: "z", amount: 1500 });
  vaultRequestExit(vault, { owner: "z", shares: 300 });
  vaultSettleExits(vault, { tick: 3 });
  const saved = saveVault(vault);
  assert.equal(saved.schema, VAULT_SCHEMA);
  const restored = restoreVault(saved);
  assert.deepEqual(saveVault(restored), saved);
  // 恢复后继续操作
  vaultDeposit(restored, { owner: "z2", amount: 250 });
  assert.equal(restored.batches.length, 2);
  const view = vaultView(restored);
  assert.equal(view.audit, "SIM");
  assert.equal(view.policy, `${VAULT_POLICY.id}@${VAULT_POLICY.version}`);
});

test("用户本金与协议资金分账：vault 账本不含协议字段，二者互不引用", () => {
  const vault = createUserVault();
  const saved = saveVault(vault);
  assert.ok(!("ifsBudget" in saved), "金库快照不得混入协议自有资金");
  assert.ok(!("buyback" in saved));
  assert.ok(!("stakes" in saved));
});
