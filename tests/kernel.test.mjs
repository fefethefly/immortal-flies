import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { createAdapters } from "../src/brain/adapters.mjs";
import { createOverlay, applyOutcome, modulate } from "../src/brain/learn.mjs";
import { createPorts } from "../src/brain/ports.mjs";
import { createRegistry } from "../src/brain/registry.mjs";
import {
  collectVenueFee,
  createTreasury,
  injectCapital,
  realizeSurplus,
  surplusOf,
  TREASURY_POLICY,
} from "../src/brain/treasury.mjs";
import {
  admitCapital,
  createKernel,
  harvestSurplus,
  kernelSnapshot,
  recordVenue,
  tickKernel,
} from "../src/brain/kernel.mjs";

function fixture() {
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
    "kernel-fixture",
  );
}

test("a new port or adapter registers without forking MaleCNS", () => {
  const ports = createPorts([
    {
      id: "options",
      version: "1",
      title: "期权",
      status: "later",
      decode: () => ({ schema: "iff.port/1", port: "options", action: "HOLD", reason: "示范扩展" }),
    },
  ]);
  assert.equal(ports.has("trade", "1"), true);
  assert.equal(ports.has("options", "1"), true);
  const adapters = createAdapters();
  assert.ok(adapters.has("interoception@1"));
  const graph = fixture();
  const kernel = createKernel(graph, { ports, size: 2 });
  assert.equal(kernel.canon, CANON.dataset);
  assert.equal(kernel.colony.graph.metadata.dataset, CANON.dataset);
  assert.ok(kernel.ports.has("options", "1"));
});

test("registry rejects a silent duplicate instead of swapping the organism", () => {
  const registry = createRegistry("port", [{ id: "trade", version: "1", title: "交易" }]);
  assert.throws(() => registry.register({ id: "trade", version: "1", title: "另一套" }), /已登记/);
});

test("learning changes overlay gain and leaves connectome weights untouched", () => {
  const graph = fixture();
  const before = graph.weights[0];
  const taught = applyOutcome(createOverlay(), { action: "FORAGE", pnl: 1 });
  assert.equal(taught.food, 101);
  assert.equal(taught.threat, 100);
  const driven = modulate({ food: 100, threat: 100, light: 100 }, taught);
  assert.equal(driven.food, 101);
  assert.equal(graph.weights[0], before);
  const lost = applyOutcome(taught, { action: "FORAGE", pnl: -1 });
  assert.equal(lost.threat, 101);
  assert.equal(lost.updates, 2);
});

test("venue tax splits 80/20 and conserves the fee", () => {
  const treasury = createTreasury();
  const cut = collectVenueFee(treasury, 1_000_000);
  assert.equal(cut.tax, 50_000);
  assert.equal(cut.toVault, 40_000);
  assert.equal(cut.toReserve, 10_000);
  assert.equal(cut.toVault + cut.toReserve, cut.tax);
  assert.equal(treasury.book.bnb, 40_000);
  assert.equal(treasury.reserve, 10_000);
  assert.equal(TREASURY_POLICY.vaultBps, 8000);
});

test("user deposits are capital, never surplus, and mint shares", () => {
  const treasury = createTreasury();
  const row = injectCapital(treasury, 2_000_000, "lp-alice", 11170);
  assert.equal(row.kind, "deposit");
  assert.equal(row.shares, 2_000_000);
  assert.equal(surplusOf(treasury, 11170), 0);
  treasury.book.bnb += 700_000;
  assert.ok(surplusOf(treasury, 11170) > 0);
});

test("buyback spends only NAV above high-water", () => {
  const treasury = createTreasury();
  collectVenueFee(treasury, 10_000_000);
  const high = treasury.highWater;
  treasury.book.bnb += 1_000_000;
  const harvest = realizeSurplus(treasury, 11170);
  assert.equal(harvest.surplus, 1_000_000);
  assert.equal(harvest.buyback + harvest.compound, harvest.surplus);
  assert.equal(harvest.buyback, 300_000);
  assert.equal(treasury.buybackBudget, 300_000);
  assert.ok(treasury.highWater >= high);
  const again = realizeSurplus(treasury, 11170);
  assert.equal(again.surplus, 0);
  assert.equal(again.buyback, 0);
});

test("kernel tick keeps one organism and can admit capital into the hive", async () => {
  const kernel = createKernel(fixture(), { size: 3, seed: 21, stepsPerTick: 4 });
  recordVenue(kernel, 5_000_000);
  const admission = admitCapital(kernel, 1_000_000, "lp-alice");
  assert.equal(admission.schema, "iff.capital/1");
  await tickKernel(kernel, { food: 820, threat: 40, light: 180, changeBps: 80 });
  const snap = kernelSnapshot(kernel);
  assert.equal(snap.canon, CANON.dataset);
  assert.ok(snap.ports.includes("trade@1"));
  assert.ok(snap.adapters.includes("interoception@1"));
  assert.ok(snap.learners.includes("outcome-gain@1"));
  assert.equal(snap.colony.members.length, 3);
  assert.ok(snap.treasury.feesIn > 0);
  assert.ok(snap.treasury.deposited >= 1_000_000);
  harvestSurplus(kernel);
  assert.ok(kernel.treasury.buybackBudget >= 0);
});
