import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_TRADE,
  BNB_UNIT,
  START_BNB,
  START_PRICE,
  bookOf,
  createSwarm,
  decodeTrade,
  equityOf,
  formatPrice,
  reflexOf,
  runSwarm,
  settleBooks,
  stimulate,
  summarize,
  tickSwarm,
} from "../src/swarm.mjs";
import { proposeTrade } from "../src/brain/policy.mjs";

test("same seed and the same stimuli replay the book exactly", () => {
  const start = createSwarm({ seed: 3700127, size: 5, cullEvery: 40, cooldownTicks: 0 });
  const walk = (origin) => {
    let swarm = stimulate(origin, "food", 0.6);
    swarm = runSwarm(swarm, 12);
    swarm = stimulate(swarm, "threat", 0.8);
    return runSwarm(swarm, 36);
  };
  const a = walk(start);
  const b = walk(structuredClone(start));
  assert.equal(a.tick, 48);
  assert.deepEqual(a.market, b.market);
  assert.deepEqual(
    a.flies.map((fly) => [fly.id, fly.seed, fly.bnb, fly.token, fly.status, fly.gen]),
    b.flies.map((fly) => [fly.id, fly.seed, fly.bnb, fly.token, fly.status, fly.gen]),
  );
  assert.deepEqual(a.trades, b.trades);
});

test("food tilts the swarm toward buys, threat toward sells", () => {
  const seed = 88_512_019;
  const drive = (kind) => {
    let swarm = createSwarm({ seed, size: 5, cullEvery: 10_000, cooldownTicks: 0 });
    for (let i = 0; i < 48; i++) {
      swarm = stimulate(swarm, kind, 1);
      swarm = tickSwarm(swarm);
    }
    const buys = swarm.trades.filter((row) => row.side === "BUY").length;
    const sells = swarm.trades.filter((row) => row.side === "SELL").length;
    return { buys, sells, total: swarm.trades.length };
  };
  const fed = drive("food");
  const hunted = drive("threat");
  assert.ok(fed.total > 0 && hunted.total > 0);
  assert.ok(fed.buys / fed.total > hunted.buys / hunted.total);
  assert.ok(hunted.sells / hunted.total > fed.sells / fed.total);
});

test("settlement culls the weakest book and the champion reproduces", () => {
  let swarm = createSwarm({ seed: 99, size: 5, cullEvery: 8 });
  swarm = runSwarm(swarm, 8);
  const before = summarize(swarm);
  assert.equal(before.alive, 5);
  assert.equal(before.total, 6);
  const child = swarm.flies.find((fly) => fly.gen > 0);
  const tomb = swarm.flies.find((fly) => fly.status === "culled");
  assert.ok(child);
  assert.ok(tomb);
  assert.equal(child.parent, swarm.lineage[0].parent);
  assert.equal(child.bnb + child.costBnb, START_BNB);
  assert.ok(child.token > 0);
  const again = settleBooks(swarm);
  assert.equal(summarize(again).alive, 5);
  assert.equal(again.flies.length, swarm.flies.length + 1);
});

test("a round trip never prints money after tax and slippage", () => {
  let swarm = createSwarm({ seed: 3, size: 1, cullEvery: 10_000, cooldownTicks: 0 });
  for (let i = 0; i < 80; i++) {
    swarm = stimulate(swarm, i % 2 ? "threat" : "food", 1);
    swarm = tickSwarm(swarm);
  }
  const fly = swarm.flies[0];
  const marked = equityOf(fly, swarm.market.price);
  assert.ok(fly.bnb >= 0 && fly.token >= 0);
  assert.ok(marked <= START_BNB);
});

test("stimulus cooldown rejects a second pulse", () => {
  const swarm = createSwarm({ seed: 1, cooldownTicks: 30 });
  const once = stimulate(swarm, "light", 0.45);
  assert.equal(once.stimulus.light, 45);
  assert.throws(() => stimulate(once, "dark", 0.5), /冷却/);
});

test("formatPrice writes a plain decimal, not scientific notation", () => {
  assert.equal(formatPrice(START_PRICE), "0.00001117");
  assert.equal(formatPrice(0), "0");
  assert.equal(formatPrice(BNB_UNIT), "1");
  assert.equal(formatPrice(1_117), "0.000001117");
  assert.equal(formatPrice(Number.NaN), "—");
  assert.equal(/[eE]/.test(formatPrice(START_PRICE)), false);
  assert.equal(/[eE]/.test(formatPrice(1)), false);
});

test("approach and retreat decode into the first financial act", () => {
  assert.equal(decodeTrade("FORAGE"), "BUY");
  assert.equal(decodeTrade("AVOID"), "SELL");
  assert.equal(decodeTrade("REST"), "HOLD");
  assert.equal(ACTION_TRADE.EXPLORE, "HOLD");
});

test("trade intents stay simulated and never carry execution fields", async () => {
  const now = 1_700_000_000_000;
  const hash = `0x${"ab".repeat(32)}`;
  const buy = await proposeTrade(
    { lastAction: "FORAGE", lastObservedAt: now, soulId: "genesis-001", branchId: "local" },
    { checkpointHash: hash, now },
  );
  assert.equal(buy.action, "TRADE_BUY");
  assert.equal(buy.mode, "simulation");
  assert.equal(buy.side, "BUY");
  assert.equal("to" in buy, false);
  assert.equal("sendTransaction" in buy, false);
  const idle = await proposeTrade(
    { lastAction: "REST", lastObservedAt: 0, soulId: "genesis-001", branchId: "local" },
    { checkpointHash: hash, now },
  );
  assert.equal(idle.action, "NO_ACTION");
  await assert.rejects(
    () =>
      proposeTrade(
        { lastAction: "FORAGE", lastObservedAt: now, soulId: "genesis-001", branchId: "local" },
        { checkpointHash: hash, chainId: 56, now },
      ),
    (error) => error.code === "EXECUTION_DISABLED",
  );
  const opened = createSwarm({ seed: 2, size: 3 });
  assert.equal(
    opened.flies.reduce((sum, fly) => sum + equityOf(fly, opened.market.price), 0),
    3 * BNB_UNIT,
  );
  const bag = bookOf(opened.flies[0], opened.market.price);
  assert.equal(bag.cash + bag.inventory, bag.equity);
  assert.equal(reflexOf(opened.flies[0]).side, "HOLD");
});
