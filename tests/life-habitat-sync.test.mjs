import test from "node:test";
import assert from "node:assert/strict";
import { createHabitat, syncHabitat } from "../src/life/habitat-sim.mjs";

const soul = {
  tokenId: 1,
  life: `0x${"ab".repeat(32)}`,
  owner: `0x${"11".repeat(20)}`,
};
const recipient = `0x${"22".repeat(20)}`;

test("habitat transfer refreshes owner and releases drag without resetting care", () => {
  const world = createHabitat([soul]);
  const body = world.bodies[0];
  body.energy = 123;
  body.x = 0.42;
  body.dragged = true;
  syncHabitat(world, [{ ...soul, owner: recipient }]);
  assert.equal(world.bodies[0], body);
  assert.equal(body.owner, recipient);
  assert.equal(body.dragged, false);
  assert.equal(body.energy, 123);
  assert.equal(body.x, 0.42);
});

test("unchanged owner roster refresh does not interrupt an active drag", () => {
  const world = createHabitat([soul]);
  world.bodies[0].dragged = true;
  syncHabitat(world, [{ ...soul, owner: soul.owner.toUpperCase() }]);
  assert.equal(world.bodies[0].dragged, true);
});
