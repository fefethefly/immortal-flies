import test from "node:test";
import assert from "node:assert/strict";
import { calculateEconomy, FEE_SPLIT, teamVested } from "../src/economy.mjs";
test("fee routing conserves receipts and excludes marketplace sellers principal", () => {
  const r = calculateEconomy({ players: 10000 });
  assert.equal(r.revenue, 40000);
  assert.equal(r.marketFees, 2500);
  assert.equal(r.traded, 100000);
  assert.equal(
    FEE_SPLIT.reduce((s, x) => s + r[x.key], 0),
    r.revenue,
  );
  assert.equal(r.profit, 3000);
  assert.equal(r.genesisSample, 7.5);
  assert.equal(r.breakEven, 8000);
});
test("zero revenue has zero new payouts; poor contribution cannot scale to profitability", () => {
  const r = calculateEconomy({ payerRate: 0, marketVolume: 0 });
  assert.equal(r.revenue, 0);
  assert.equal(r.genesisPool, 0);
  assert.equal(r.burnTokens, 0);
  assert.equal(r.profit, -15000);
  assert.equal(r.breakEven, null);
  const stress = calculateEconomy({ payerRate: 5, spend: 10, marketVolume: 3 });
  assert.equal(stress.revenue, 5750);
  assert.equal(stress.profit, -12412.5);
});
test("token price affects assumed token burn count, not fiat revenue or profit", () => {
  const a = calculateEconomy(),
    b = calculateEconomy({ tokenPrice: 0.0004 });
  assert.equal(a.revenue, b.revenue);
  assert.equal(a.profit, b.profit);
  assert.equal(b.burnTokens, a.burnTokens * 5);
  assert.throws(() => calculateEconomy({ tokenPrice: 0 }));
  assert.throws(() => calculateEconomy({ genesis: 0 }));
  assert.throws(() => calculateEconomy({ payerRate: 101 }));
});
test("team cliff releases nothing for 12 months and linearly vests over the next 36", () => {
  assert.equal(teamVested(0), 0);
  assert.equal(teamVested(12), 0);
  assert.equal(teamVested(30), 75000000);
  assert.equal(teamVested(48), 150000000);
  assert.equal(teamVested(60), 150000000);
});
