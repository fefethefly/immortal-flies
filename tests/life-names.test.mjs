import test from "node:test";
import assert from "node:assert/strict";
import {
  matchSoul,
  normalizeGiven,
  setGivenName,
  setPendingGiven,
  takePendingGiven,
  trueNameOf,
  labelOf,
} from "../src/life/names.mjs";
import { decorateSoul } from "../src/life/souls.mjs";
import {
  applyStimulus,
  createHabitat,
  feedBody,
  fitCamera,
  focusCamera,
  hungerOf,
  projectHabitat,
  resetCamera,
  stepHabitat,
  unprojectHabitat,
} from "../src/life/habitat-sim.mjs";

const LIFE =
  "0xe45cb0c66f29a3229fa9d8c20b805b0c6a1dd1b3023f0bbb26a7238f4efee091";

test("true names are stable, locale-split and bound to lifeId", () => {
  assert.equal(trueNameOf(LIFE, "en"), trueNameOf(LIFE, "en"));
  assert.equal(trueNameOf(LIFE, "zh"), trueNameOf(LIFE, "zh"));
  assert.match(trueNameOf(LIFE, "zh"), /^[\u4e00-\u9fff]{2}$/);
  assert.match(trueNameOf(LIFE, "en"), /^[a-z]+-[a-z]+$/);
  assert.notEqual(trueNameOf(LIFE, "en"), trueNameOf(LIFE.replace("e4", "e5"), "en"));
  assert.equal(trueNameOf("nope", "zh"), "未名");
});

test("given names trim, cap at 24, and follow lifeId", () => {
  assert.equal(normalizeGiven("  阿苔   飞 "), "阿苔 飞");
  assert.equal(normalizeGiven("x".repeat(40)).length, 24);
  setGivenName(97, LIFE, "  Ember  ");
  const soul = decorateSoul(
    {
      tokenId: 1,
      owner: "0x1111111111111111111111111111111111111111",
      life: LIFE,
      seed: 9,
    },
    { genesisRoot: `0x${"ab".repeat(32)}`, chainId: 97, fieldCount: 12 },
  );
  assert.equal(soul.givenName, "Ember");
  assert.equal(labelOf(soul, "en").includes("Ember"), true);
  setPendingGiven("keeper");
  assert.equal(takePendingGiven(), "keeper");
  assert.equal(takePendingGiven(), "");
});

test("hunger collapses then food wakes the body without deleting it", () => {
  const soul = decorateSoul(
    {
      tokenId: 3,
      owner: "0x1111111111111111111111111111111111111111",
      life: LIFE,
      seed: 11,
    },
    { genesisRoot: `0x${"cd".repeat(32)}`, chainId: 97, fieldCount: 12 },
  );
  const state = createHabitat([soul]);
  state.bodies[0].energy = 0;
  stepHabitat(state, 4);
  assert.equal(hungerOf(state.bodies[0].energy), "collapsed");
  assert.equal(state.bodies[0].mode, "down");
  const x = state.bodies[0].x;
  stepHabitat(state, 8);
  assert.equal(state.bodies[0].x, x);
  feedBody(state, 3, 80);
  assert.equal(state.bodies[0].energy >= 260, true);
  assert.notEqual(hungerOf(state.bodies[0].energy), "collapsed");
  const cam = resetCamera({});
  fitCamera(cam, state.bodies);
  assert.ok(cam.zoom >= 0.62 && cam.zoom <= 1.28);
  assert.ok(Math.abs(cam.x - state.bodies[0].x) < 0.02);
  const hungry = createHabitat([soul]);
  hungry.bodies[0].energy = 200;
  applyStimulus(hungry, 3, 0, 800);
  assert.ok(hungry.food.length >= 1);
  assert.ok(hungry.bodies[0].energy > 200);
  applyStimulus(hungry, 3, 1, 800);
  assert.ok(hungry.gusts.length >= 1);
});

test("roster find matches given name, true name and token id", () => {
  const soul = decorateSoul(
    {
      tokenId: 7,
      owner: "0x1111111111111111111111111111111111111111",
      life: LIFE,
      seed: 9,
      givenName: "Wrenren",
    },
    { genesisRoot: `0x${"ab".repeat(32)}`, chainId: 97, fieldCount: 12 },
  );
  assert.equal(matchSoul([soul], "7", "en").tokenId, 7);
  assert.equal(matchSoul([soul], "wren", "en").tokenId, 7);
  assert.equal(matchSoul([soul], trueNameOf(LIFE, "zh"), "zh").tokenId, 7);
  assert.equal(matchSoul([soul], "no-such-fly", "en"), null);
});

test("habitat default view centres the dish and stays pulled back", () => {
  const cam = resetCamera({});
  const mid = projectHabitat(0.5, 0.5, cam, 1200, 800);
  assert.equal(mid.x, 600);
  assert.equal(mid.y, 400);
  const back = unprojectHabitat(600, 400, cam, 1200, 800);
  assert.ok(Math.abs(back.x - 0.5) < 1e-9);
  assert.ok(Math.abs(back.y - 0.5) < 1e-9);
  assert.ok(cam.zoom < 1);
  assert.equal(cam.zoom, 0.5);
  focusCamera(cam, { x: 0.4, y: 0.6 }, 1.08);
  assert.equal(cam.x, 0.4);
  assert.equal(cam.y, 0.6);
  const empty = fitCamera({ x: 9, y: 9, zoom: 3 }, []);
  assert.equal(empty.x, 0.5);
  assert.equal(empty.zoom, 0.5);
});

test("habitat flight flicks then coasts instead of skating", () => {
  const soul = decorateSoul(
    {
      tokenId: 4,
      owner: "0x1111111111111111111111111111111111111111",
      life: LIFE,
      seed: 11,
    },
    { genesisRoot: `0x${"cd".repeat(32)}`, chainId: 97, fieldCount: 12 },
  );
  const state = createHabitat([soul]);
  const body = state.bodies[0];
  body.energy = 800;
  const start = body.heading;
  let sawSaccade = false;
  for (let i = 0; i < 90; i += 1) {
    stepHabitat(state, 1);
    if (body.saccade > 0) sawSaccade = true;
  }
  assert.equal(sawSaccade, true);
  assert.ok(Math.abs(body.heading - start) > 0.04 || Math.hypot(body.vx, body.vy) > 0);
  assert.ok(body.x > 0.06 && body.x < 0.94);
  assert.ok(body.y > 0.1 && body.y < 0.88);
  assert.ok(body.alt >= 0);
});
