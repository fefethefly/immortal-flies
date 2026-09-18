import test from "node:test";
import assert from "node:assert/strict";
import {
  WORLD,
  applyFlyDrive,
  createLiveSim,
  dropLiveFood,
  enterMap,
  fruitScore,
  setLiveAct,
  setLivePaused,
  setLiveView,
  stepLiveSim,
  surfaceAt,
} from "../src/fly-live/sim.mjs";

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

test("orchard is a large world with many fruits", () => {
  const live = createLiveSim(3);
  assert.equal(WORLD.width, 5600);
  assert.equal(WORLD.height, 4000);
  assert.ok(live.fruits.length >= 40);
  assert.ok(live.food.length >= 40);
  assert.ok(live.props.length >= 80);
  assert.ok(live.lights.length >= 4);
});

test("live sim advances while running and freezes when paused", () => {
  const live = createLiveSim(3);
  const start = live.tick;
  const x = live.fly.x;
  stepLiveSim(live, 4);
  assert.ok(live.tick > start);
  setLivePaused(live, true);
  const frozenTick = live.tick;
  const frozenX = live.fly.x;
  stepLiveSim(live, 4);
  assert.equal(live.tick, frozenTick);
  assert.equal(live.fly.x, frozenX);
  assert.notEqual(live.fly.x, x);
});

test("forced forage closes on the nearest food", () => {
  const live = createLiveSim(11);
  live.food = [{ x: 900, y: 400, life: 1 }];
  live.fly.x = 240;
  live.fly.y = 400;
  setLiveAct(live, "FORAGE");
  const before = distance(live.fly.x, live.fly.y, 900, 400);
  for (let i = 0; i < 80; i += 1) stepLiveSim(live, 1);
  const after = distance(live.fly.x, live.fly.y, 900, 400);
  assert.ok(after < before);
});

test("forced avoid retreats from the nearest threat", () => {
  const live = createLiveSim(19);
  live.threats = [{ x: 800, y: 800, r: 70 }];
  live.fly.x = 820;
  live.fly.y = 800;
  setLiveAct(live, "AVOID");
  const before = distance(live.fly.x, live.fly.y, 800, 800);
  for (let i = 0; i < 40; i += 1) stepLiveSim(live, 1);
  const after = distance(live.fly.x, live.fly.y, 800, 800);
  assert.ok(after > before);
});

test("rest from the air lands and then stays grounded", () => {
  const live = createLiveSim(5);
  live.fly.z = 70;
  live.fly.airborne = true;
  setLiveAct(live, "REST");
  assert.equal(live.fly.motor, "LAND");
  for (let i = 0; i < 90; i += 1) stepLiveSim(live, 1);
  assert.equal(live.fly.airborne, false);
  assert.ok(live.fly.z < 28);
  assert.ok(["WALK", "SETTLE", "GROOM", "REST", "FEED", "DRINK", "SEARCH"].includes(live.fly.motor));
});

test("walk stays on or beside a fruit surface", () => {
  const live = createLiveSim(9);
  const home = live.fruits[0];
  live.fly.x = home.x;
  live.fly.y = home.y;
  live.fly.airborne = false;
  setLiveAct(live, "REST");
  for (let i = 0; i < 40; i += 1) stepLiveSim(live, 1);
  assert.equal(live.fly.airborne, false);
  const ground = surfaceAt(live.fly.x, live.fly.y, live.fruits);
  assert.ok(live.fly.z <= ground.z + 8);
  assert.ok(fruitScore(live.fly.x, live.fly.y, home) < 1.35);
});

test("landing settles into grooming instead of taking off", () => {
  const live = createLiveSim(5);
  live.fly.z = 64;
  live.fly.airborne = true;
  setLiveAct(live, "REST");
  const motors = new Set();
  for (let i = 0; i < 140; i += 1) {
    stepLiveSim(live, 1);
    motors.add(live.fly.motor);
  }
  assert.equal(live.fly.airborne, false);
  assert.ok(motors.has("SETTLE") || motors.has("GROOM") || motors.has("REST"));
  assert.equal(motors.has("AVOID"), false);
});

test("pilot view is a stored camera mode", () => {
  const live = createLiveSim(1);
  setLiveView(live, "pilot");
  assert.equal(live.view, "pilot");
});

test("dropping food stays inside the orchard", () => {
  const live = createLiveSim(2);
  dropLiveFood(live, -40, 99999);
  const crumb = live.food.at(-1);
  assert.ok(crumb.x >= WORLD.margin && crumb.x <= WORLD.width - WORLD.margin);
  assert.ok(crumb.y >= WORLD.margin && crumb.y <= WORLD.height - WORLD.margin);
});

test("maps swap like the next game level", () => {
  const live = createLiveSim(7);
  assert.equal(live.mapId, "kitchen");
  assert.ok(live.portals.length >= 1);
  enterMap(live, "garden", { x: 2800, y: 3000, heading: 0 });
  assert.equal(live.mapId, "garden");
  assert.ok(live.fruits.length >= 20);
  assert.ok(live.portals.some((gate) => gate.to === "kitchen"));
  assert.ok(live.portals.some((gate) => gate.to === "market"));
});

test("flying into a portal leaves the room", () => {
  const live = createLiveSim(7);
  const gate = live.portals[0];
  live.fly.x = gate.x;
  live.fly.y = gate.y;
  live.fly.z = 40;
  live.fly.airborne = true;
  live.fly.motor = "FLY";
  live.gateLock = 0;
  stepLiveSim(live, 1);
  assert.equal(live.mapId, "garden");
});

test("neural drive can override the current act", () => {
  const live = createLiveSim(8);
  applyFlyDrive(live, { act: "AVOID" });
  assert.equal(live.fly.act, "AVOID");
});
