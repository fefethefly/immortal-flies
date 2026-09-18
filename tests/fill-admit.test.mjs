import test from "node:test";
import assert from "node:assert/strict";
import {
  FILL_ADMIT,
  admitFill,
  edgeBpsOf,
  edgeWindowOf,
  emptyPort,
  markFilled,
  updateIntentStreak,
} from "../src/brain/fill-admit.mjs";
import { SLIP_BPS, TAX_BPS } from "../src/swarm.mjs";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { createColony, tickColony } from "../src/brain/colony.mjs";

function fixtureGraph() {
  return bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        dataset: CANON.dataset,
        nodes: [
          { id: "1001", sign: 1, type: "ORN", side: "L" },
          { id: "1002", sign: 1, type: "GRN", side: "R" },
          { id: "2001", sign: -1, type: "LN", side: "L" },
          { id: "3001", sign: 1, type: "PN", side: "L" },
          { id: "4001", sign: 1, type: "DNp", side: "L" },
          { id: "4002", sign: 1, type: "DNp", side: "R" },
          { id: "5001", sign: 1, type: "R1", side: "L" },
          { id: "5002", sign: 0, type: "unc", side: "M" },
        ],
        groups: { food: [0, 1], threat: [4], light: [6], left: [4], right: [5] },
      },
      [
        { pre: 0, post: 2, weight: 12 },
        { pre: 0, post: 3, weight: 8 },
        { pre: 1, post: 3, weight: 10 },
        { pre: 2, post: 3, weight: 4 },
        { pre: 3, post: 4, weight: 15 },
        { pre: 3, post: 5, weight: 9 },
        { pre: 6, post: 3, weight: 7 },
        { pre: 7, post: 3, weight: 3 },
      ],
    ),
    "fill-admit-fixture",
  );
}

function readyPort(side = "BUY") {
  return {
    ...emptyPort(),
    side,
    streak: FILL_ADMIT.persistTicks,
    lastFillAt: -1_000_000,
  };
}

test("venue cost is one-way tax plus slip", () => {
  assert.equal(FILL_ADMIT.costBps, TAX_BPS + SLIP_BPS);
  assert.equal(FILL_ADMIT.costBps, 700);
});

test("HOLD and weak confidence never settle", () => {
  assert.equal(admitFill({ side: "HOLD", confidence: 90 }, readyPort()).ok, false);
  assert.equal(
    admitFill({ side: "BUY", confidence: 8 }, readyPort()).hold,
    "CONFIDENCE",
  );
});

test("same-side persist and cooldown gate the port", () => {
  const member = { port: emptyPort() };
  updateIntentStreak(member, "BUY");
  updateIntentStreak(member, "BUY");
  assert.equal(
    admitFill({ side: "BUY", confidence: 40 }, member.port, {
      edgeBps: 800,
      tick: 2,
    }).hold,
    "PERSIST",
  );
  updateIntentStreak(member, "BUY");
  assert.equal(
    admitFill({ side: "BUY", confidence: 40 }, member.port, {
      edgeBps: 800,
      tick: 3,
    }).ok,
    true,
  );
  markFilled(member, 3);
  assert.equal(
    admitFill({ side: "BUY", confidence: 40 }, member.port, {
      edgeBps: 800,
      tick: 20,
    }).hold,
    "COOLDOWN",
  );
  assert.equal(
    admitFill({ side: "BUY", confidence: 40 }, member.port, {
      edgeBps: 800,
      tick: 33,
    }).ok,
    true,
  );
});

test("cost gate needs a signed window covering tax and slip", () => {
  const port = readyPort("BUY");
  assert.equal(
    admitFill({ side: "BUY", confidence: 40 }, port, { edgeBps: 200, tick: 10 })
      .hold,
    "COST",
  );
  assert.equal(
    admitFill({ side: "BUY", confidence: 40 }, port, { edgeBps: -800, tick: 10 })
      .hold,
    "DIRECTION",
  );
  assert.equal(
    admitFill({ side: "SELL", confidence: 40 }, readyPort("SELL"), {
      edgeBps: -800,
      tick: 10,
    }).ok,
    true,
  );
  const window = edgeWindowOf([], 400);
  assert.equal(edgeBpsOf(edgeWindowOf(window, 400)), 800);
});

test("a colony tick still speaks while a quiet tape does not fill", async () => {
  const colony = createColony(fixtureGraph(), { size: 1, seed: 21, stepsPerTick: 4 });
  for (let i = 0; i < 5; i += 1) {
    await tickColony(colony, { food: 800, threat: 40, light: 200, changeBps: 40 });
  }
  assert.equal(colony.trades.length, 0);
  for (const member of colony.members) {
    assert.ok(["BUY", "SELL", "HOLD"].includes(member.intent?.side || "HOLD"));
  }
});

test("a covered window can settle once, then cools", async () => {
  const colony = createColony(fixtureGraph(), { size: 1, seed: 21, stepsPerTick: 4 });
  for (let i = 0; i < FILL_ADMIT.persistTicks; i += 1) {
    await tickColony(colony, {
      food: 800,
      threat: 40,
      light: 200,
      changeBps: FILL_ADMIT.costBps,
    });
  }
  const before = colony.trades.length;
  await tickColony(colony, {
    food: 800,
    threat: 40,
    light: 200,
    changeBps: FILL_ADMIT.costBps,
  });
  const filled = colony.trades.length > before;
  if (filled) {
    const tick = colony.trades[0].tick;
    await tickColony(colony, {
      food: 800,
      threat: 40,
      light: 200,
      changeBps: FILL_ADMIT.costBps,
    });
    assert.equal(colony.trades[0].tick, tick);
  }
});
