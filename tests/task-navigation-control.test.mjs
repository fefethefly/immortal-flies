import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/brain/task.mjs";
import { hash } from "../src/brain/codec.mjs";
import { navigate, runNavigationControl } from "../src/brain/task-navigation-control.mjs";

async function world(x = 5600) {
  const w = await createWorld("navigation-test", 43, { foodCount: 1, threatCount: 0 });
  w.food = [{ x, y: 5000, consumed: false }];
  const { worldHash, ...payload } = w;
  w.worldHash = await hash(payload);
  return w;
}
const config = { flies: 2, rounds: 12, positions: [{ x: 5000, y: 5000 }, { x: 3800, y: 5000 }] };

test("navigation is transparent: approach, bounded motion, avoid, rest", () => {
  const p = { x: 5000, y: 5000 };
  assert.equal(navigate(p, []).reason, "rest");
  const approach = navigate(p, [{ channel: "food", x: 5010, y: 6000 }]);
  assert.equal(approach.dx, 10); assert.equal(approach.dy, 35);
  const avoid = navigate(p, [{ channel: "food", x: 5500, y: 5000 }, { channel: "threat", x: 5100, y: 5000 }]);
  assert.equal(avoid.reason, "avoid"); assert.equal(avoid.dx, -35);
  assert.equal(navigate(p, [{ channel: "threat", ...p }]).dx, 35);
});

test("navigation relay changes unseen-target action only after one-round delay", async () => {
  const w = await world(), before = structuredClone(w);
  const off = await runNavigationControl(w, { ...config, mode: "off" });
  const relay = await runNavigationControl(w, { ...config, mode: "relay" });
  const scrambled = await runNavigationControl(w, { ...config, mode: "scrambled" });
  for (const r of [off, relay, scrambled]) {
    assert.deepEqual(r.initialBodies, config.positions);
    assert.equal(r.budget.actionSteps, 24); assert.equal(r.budget.neuralSteps, 0);
    assert.ok(r.budget.messages <= r.budget.messageLimit);
    assert.equal(new Set(r.ledger.map(l => l.index)).size, r.outcome.collected);
    for (const t of r.traces) {
      assert.ok(Math.abs(t.after.x - t.before.x) <= 35);
      assert.ok(Math.abs(t.after.y - t.before.y) <= 35);
      if (t.round === 1) assert.equal(t.received.length, 0);
    }
    for (const receipt of r.receipts) {
      const m = r.messages.find(m => m.id === receipt.messageId);
      assert.equal(receipt.round, m.observedRound + 1);
      assert.notEqual(receipt.to, m.from);
      assert.ok((m.x - m.observer.x) ** 2 + (m.y - m.observer.y) ** 2 < 1000 ** 2);
    }
    const { resultHash, ...payload } = r;
    assert.equal(await hash(payload), resultHash);
  }
  const at = r => r.traces.find(t => t.round === 2 && t.fly === 1);
  assert.equal(at(off).action.dx, 0);
  assert.equal(at(relay).ownObservations.length, 0);
  assert.equal(at(relay).action.dx, 35);
  assert.equal(at(scrambled).action.dx, 0);
  assert.ok(relay.outcome.changedActions > 0);
  assert.deepEqual(await runNavigationControl(w, { ...config, mode: "relay" }), relay);
  assert.deepEqual(w, before);
});

test("navigation settles once, expires stale targets and has no hidden oracle", async () => {
  const w = await world(5000);
  const r = await runNavigationControl(w, { ...config, positions: [{ x: 5000, y: 5000 }, { x: 5000, y: 5000 }], mode: "relay" });
  assert.equal(r.outcome.initialCollected, 1); assert.equal(r.outcome.collected, 1);
  assert.equal(r.budget.messages, 0);
  const stale = await runNavigationControl(await world(), { ...config, mode: "relay" });
  const lastCollection = stale.ledger.at(-1).round;
  assert.ok(lastCollection > 0);
  assert.ok(stale.traces.filter(t => t.round > lastCollection + 1).every(t => t.received.length === 0 && t.action.reason === "rest"));
  const far = await runNavigationControl(await world(), { ...config, positions: [{ x: 0, y: 0 }, { x: 10000, y: 10000 }], mode: "relay" });
  assert.equal(far.budget.messages, 0);
  assert.deepEqual(far.initialBodies, far.finalBodies);
});

test("navigation rejects invalid input and tampered world", async () => {
  const w = await world();
  for (const options of [{ mode: "bad" }, { rounds: 0 }, { flies: 0 }, { positions: [] }, { positions: [{ x: -1, y: 0 }, { x: 0, y: 0 }] }]) {
    await assert.rejects(runNavigationControl(w, { ...config, ...options }));
  }
  await assert.rejects(runNavigationControl({ ...w, worldHash: "bad" }, config), { code: "WORLD_HASH" });
});
