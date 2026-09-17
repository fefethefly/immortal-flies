import test from "node:test";
import assert from "node:assert/strict";
import { createHabitat, stepHabitat, feedBody } from "../src/life/habitat-sim.mjs";
import {
  habitatStorageKey,
  restoreHabitat,
  saveHabitat,
  loadHabitat,
  encodeHabitat,
} from "../src/life/habitat-storage.mjs";

const SOULS = (owner) => [
  { tokenId: 1, life: `0x${"aa".repeat(32)}`, owner, seed: 11 },
  { tokenId: 2, life: `0x${"bb".repeat(32)}`, owner, seed: 22 },
];
const OWNER = `0x${"11".repeat(20)}`;

function memory() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
}

test("care state survives refresh via local archive, scoped to deployment", () => {
  const world = createHabitat(SOULS(OWNER));
  const a = world.bodies[0];
  feedBody(world, 1, 200);
  stepHabitat(world, 30);
  const seen = new Map([[`0x${"aa".repeat(32)}`, 4]]);
  const raw = encodeHabitat(world, SOULS(OWNER), seen);
  const fresh = createHabitat(SOULS(OWNER));
  const back = restoreHabitat(raw, SOULS(OWNER));
  assert.equal(back.status, "restored");
  assert.ok(Math.abs(back.world.tick - world.tick) < 1e-9);
  assert.equal(back.world.bodies[0].energy, world.bodies[0].energy);
  assert.ok(Math.abs(back.world.bodies[0].x - world.bodies[0].x) < 1e-12);
  assert.equal(back.world.bodies[0].mode, world.bodies[0].mode);
  assert.equal(back.world.bodies[0].dragged, false);
  assert.equal(back.seen.get(`0x${"aa".repeat(32)}`), 4);
  assert.ok(back.world.tick > fresh.tick);
  assert.equal(habitatStorageKey({ address: `0x${"cd".repeat(20)}`, chainId: 56 }), `ifs.habitat-local/1:56:0x${"cd".repeat(20)}`);
  const storage = memory();
  assert.equal(saveHabitat(storage, "k", world, SOULS(OWNER), seen), true);
  assert.equal(loadHabitat(storage, "k", SOULS(OWNER)).status, "restored");
});

test("corrupt or foreign archives start fresh and never adopt chain authority", () => {
  assert.equal(restoreHabitat(null, SOULS(OWNER)).status, "new");
  for (const bad of ["{oops", '{"schema":"other"}', JSON.stringify({ schema: "ifs.habitat-local/1", tick: -5, bodies: [], seen: [] }), "x".repeat(5 * 1024 * 1024)]) {
    assert.equal(restoreHabitat(bad, SOULS(OWNER)).status, "invalid");
  }
  const { world, seen, status } = restoreHabitat(JSON.stringify({ schema: "ifs.habitat-local/1", tick: 10, bodies: [{ life: `0x${"aa".repeat(32)}`, seed: 999, energy: 900, x: 0.5, y: 0.5, mode: "fly" }], seen: [[`0x${"zz".repeat(32)}`, 2]] }), SOULS(OWNER));
  assert.equal(status, "restored");
  assert.ok(world.bodies[0].energy > 300);
  assert.equal(seen.size, 0);
  assert.equal(world.bodies[0].owner, OWNER);
  assert.notEqual(world.bodies[0].x, 0.5);
});

test("missing storage never breaks habitat boot", () => {
  const bomb = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(loadHabitat(bomb, "k", SOULS(OWNER)).status, "unavailable");
  assert.equal(saveHabitat(bomb, "k", createHabitat([]), [], new Map()), false);
});
