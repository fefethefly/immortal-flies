import test from "node:test";
import assert from "node:assert/strict";
import { decorateSoul } from "../src/life/souls.mjs";
import {
  HABITAT_ENERGY,
  createHabitat,
  hungerOf,
  stepHabitat,
} from "../src/life/habitat-sim.mjs";

const LIFE =
  "0xe45cb0c66f29a3229fa9d8c20b805b0c6a1dd1b3023f0bbb26a7238f4efee091";

function fly() {
  return decorateSoul(
    {
      tokenId: 3,
      owner: "0x1111111111111111111111111111111111111111",
      life: LIFE,
      seed: 11,
    },
    { genesisRoot: `0x${"cd".repeat(32)}`, chainId: 97, fieldCount: 12 },
  );
}

function ticks(state, n) {
  for (let i = 0; i < n; i += 1) stepHabitat(state, 1);
}

test("airborne drain is slow enough that a dish visit is not a collapse", () => {
  const state = createHabitat([fly()]);
  const body = state.bodies[0];
  body.energy = 500;
  body.mode = "fly";
  ticks(state, 120);
  assert.ok(body.energy > 490, `120 frames must not empty the fly (${body.energy})`);
  assert.notEqual(hungerOf(body.energy), "collapsed");
  assert.notEqual(hungerOf(body.energy), "faint");
});

test("grounded rest restores energy without food, up to a sated ceiling", () => {
  const state = createHabitat([fly()]);
  const body = state.bodies[0];
  body.energy = 150;
  body.mode = "walk";
  body.alt = 0;
  const before = body.energy;
  ticks(state, 180);
  assert.ok(body.energy > before);
  assert.ok(body.energy <= HABITAT_ENERGY.restCeiling);
  body.energy = HABITAT_ENERGY.restCeiling - 1;
  body.mode = "walk";
  body.alt = 0;
  ticks(state, 90);
  assert.ok(body.energy <= HABITAT_ENERGY.restCeiling);
});

test("a collapsed fly naps then stands without being fed", () => {
  const state = createHabitat([fly()]);
  const body = state.bodies[0];
  body.energy = 0;
  ticks(state, 8);
  assert.equal(hungerOf(body.energy), "collapsed");
  assert.equal(body.mode, "down");
  ticks(state, 6200);
  assert.ok(body.energy >= HABITAT_ENERGY.wake);
  assert.notEqual(hungerOf(body.energy), "collapsed");
  assert.notEqual(body.mode, "down");
});
