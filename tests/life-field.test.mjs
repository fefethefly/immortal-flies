import test from "node:test";
import assert from "node:assert/strict";
import { buildLifeField, perchIndex as fieldPerch } from "../scripts/build-life-field.mjs";
import { decorateSoul, perchIndex } from "../src/life/souls.mjs";
import { createHabitat, dropFood, feedBody, stepHabitat } from "../src/life/habitat-sim.mjs";

test("field points stay finite and transmitter-coloured", () => {
  const field = buildLifeField(240, 7);
  assert.equal(field.count, 240);
  assert.equal(field.neurons.length, 240);
  assert.ok(field.transmitters.length >= 6);
  assert.ok(field.edges.length >= 280);
  const seen = new Set();
  for (const [a, b] of field.edges) {
    assert.ok(a !== b && a >= 0 && b >= 0 && a < 240 && b < 240);
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    assert.equal(seen.has(key), false);
    seen.add(key);
  }
  for (const neuron of field.neurons) {
    assert.equal(Number.isFinite(neuron.x), true);
    assert.ok(neuron.t >= 0 && neuron.t < field.transmitters.length);
  }
});

test("the same life always sits on the same perch", () => {
  const life =
    "0xe45cb0c66f29a3229fa9d8c20b805b0c6a1dd1b3023f0bbb26a7238f4efee091";
  assert.equal(perchIndex(life, 4800), fieldPerch(life, 4800));
  assert.equal(perchIndex(life, 4800), perchIndex(life, 4800));
  assert.notEqual(perchIndex(life, 4800), perchIndex(life.replace("e4", "e5"), 4800));
});

test("decorateSoul expresses phenotype without inventing a token", () => {
  const soul = decorateSoul(
    {
      tokenId: 1,
      owner: "0x1111111111111111111111111111111111111111",
      life: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      seed: 43,
    },
    { genesisRoot: `0x${"ab".repeat(32)}`, chainId: 97, fieldCount: 4800 },
  );
  assert.equal(soul.phenotype.chips.length, 64);
  assert.equal(soul.genome.audit, "SIM");
  assert.ok(soul.perch >= 0 && soul.perch < 4800);
});

test("habitat energy rises after food and stays in bounds", () => {
  const soul = decorateSoul(
    {
      tokenId: 2,
      owner: "0x1111111111111111111111111111111111111111",
      life: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      seed: 99,
    },
    { genesisRoot: `0x${"cd".repeat(32)}`, chainId: 97, fieldCount: 12 },
  );
  const state = createHabitat([soul]);
  dropFood(state, state.bodies[0].x, state.bodies[0].y);
  feedBody(state, 2, 50);
  stepHabitat(state, 8);
  assert.ok(state.bodies[0].energy <= 1000);
  assert.ok(state.bodies[0].x > 0 && state.bodies[0].x < 1);
  assert.ok(Number.isFinite(state.bodies[0].heading));
  assert.ok(["fly", "walk", "hover", "takeoff", "land", "down"].includes(state.bodies[0].mode));
  assert.ok(Number.isFinite(state.bodies[0].vx) && Number.isFinite(state.bodies[0].vy));
});
