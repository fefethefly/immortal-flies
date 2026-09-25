import test from "node:test";
import assert from "node:assert/strict";
import {
  habitatRoster,
  habitatSelection,
  habitatVitals,
} from "../src/life/habitat-observation.mjs";
import { HABITAT_COPY, habitatText } from "../src/life/habitat-copy.mjs";
import {
  createHabitat,
  dropFood,
  feedBody,
  stepHabitat,
  thoughtOf,
} from "../src/life/habitat-sim.mjs";

const alice = `0x${"11".repeat(20)}`;
const bob = `0x${"22".repeat(20)}`;
const souls = [
  { tokenId: 1, life: `0x${"ab".repeat(32)}`, owner: alice },
  { tokenId: 2, life: `0x${"cd".repeat(32)}`, owner: bob },
  { tokenId: 3, life: `0x${"ef".repeat(32)}`, owner: alice },
];

test("guest observation shows public souls, while mine never falls back to everyone", () => {
  assert.deepEqual(habitatRoster(souls, false, ""), souls);
  assert.deepEqual(habitatRoster(souls, true, ""), []);
  assert.deepEqual(habitatRoster(souls, true, alice.toUpperCase()), [
    souls[0],
    souls[2],
  ]);
});

test("scope changes, wallet switches and transfers keep selection inside the visible roster", () => {
  assert.equal(habitatSelection(souls, souls[1]), souls[1]);
  assert.equal(
    habitatSelection(habitatRoster(souls, true, alice), souls[1]),
    souls[0],
  );
  assert.equal(
    habitatSelection(habitatRoster(souls, true, bob), souls[0]),
    souls[1],
  );
  const transferred = souls.map((soul) => ({ ...soul, owner: bob }));
  assert.equal(
    habitatSelection(habitatRoster(transferred, true, alice), souls[0]),
    null,
  );
  assert.equal(habitatSelection(transferred, souls[0]), transferred[0]);
});

test("ground food does not grant energy at a distance; direct feeding is a separate action", () => {
  const world = createHabitat(souls);
  const body = world.bodies[0];
  const before = body.energy;
  dropFood(world, 0.9, 0.85);
  assert.equal(body.energy, before);
  feedBody(world, body.tokenId);
  assert.equal(body.energy, before + 220);
  assert.equal(habitatVitals(body).energy, Math.round(before + 220));
});

test("a consumed crumb produces one actual event and cannot feed a second fly", () => {
  const world = createHabitat(souls.slice(0, 2));
  for (const body of world.bodies)
    Object.assign(body, { x: 0.5, y: 0.5, energy: 250, mode: "walk", alt: 0 });
  dropFood(world, 0.5, 0.5);
  const events = [];
  stepHabitat(world, 1, (event) => events.push(event));
  assert.deepEqual(events, [{ kind: "ate", tokenId: 1, amount: 90 }]);
  assert.ok(world.bodies[0].energy >= 340);
  assert.ok(world.bodies[1].energy < 251);
  stepHabitat(world, 1, (event) => events.push(event));
  assert.equal(events.length, 1);
});

test("observation exposes actual local energy and resting state", () => {
  assert.equal(habitatVitals(null), null);
  assert.deepEqual(habitatVitals({ tokenId: 7, energy: 125, mode: "walk" }), {
    tokenId: 7,
    energy: 125,
    percent: 13,
    hunger: "faint",
    activity: "rest",
  });
  assert.equal(
    habitatVitals({ tokenId: 7, energy: 500, mode: "fly", dragged: true })
      .activity,
    "held",
  );
});

test("all observation copy exists in both languages and interpolates real event values", () => {
  assert.deepEqual(
    Object.keys(HABITAT_COPY.en).sort(),
    Object.keys(HABITAT_COPY.zh).sort(),
  );
  assert.equal(
    habitatText("zh", "observe.event.ate", { id: 2, amount: 90 }),
    "#2 找到食物 · 体力 +90",
  );
  assert.doesNotMatch(
    thoughtOf(
      { phenotype: { hue: { zh: "青灰" }, eye: { zh: "朱砂眼" } } },
      "zh",
    ),
    /眼眼/,
  );
});
