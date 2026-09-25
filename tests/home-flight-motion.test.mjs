import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleFlyMotion,
  sampleLegStep,
  FLIGHT_CYCLE,
  FLY_FOOT_Y,
} from "../src/home-flight-motion.mjs";

test("flight choreography stays bounded across repeated cycles", () => {
  const phases = new Set();
  for (let t = -FLIGHT_CYCLE; t < FLIGHT_CYCLE * 3; t += 0.017) {
    const pose = sampleFlyMotion(t);
    phases.add(pose.phase);
    for (const [key, value] of Object.entries(pose)) {
      if (key !== "phase") assert.ok(Number.isFinite(value), key);
    }
    assert.ok(pose.height >= 0 && pose.height <= 1.1);
    assert.ok(pose.flight >= 0 && pose.flight <= 1);
    assert.ok(pose.walk >= 0 && pose.walk <= 1);
    assert.ok(Math.abs(pose.x) <= 1);
  }
  for (const phase of ["walk", "takeoff", "flight", "landing", "groom", "turn"])
    assert.ok(phases.has(phase));
});

test("phase boundaries preserve position and articulation, including the loop seam", () => {
  for (const boundary of [5, 6.4, 13, 15, 17, 20, 21, 23, FLIGHT_CYCLE]) {
    const before = sampleFlyMotion(boundary - 0.0001);
    const after = sampleFlyMotion(boundary + 0.0001);
    for (const key of ["x", "height", "flight", "walk", "bank"]) {
      assert.ok(
        Math.abs(before[key] - after[key]) < 0.001,
        `${boundary}: ${key}`,
      );
    }
    assert.ok(Math.abs(Math.sin(before.yaw) - Math.sin(after.yaw)) < 0.001);
    assert.ok(Math.abs(Math.cos(before.yaw) - Math.cos(after.yaw)) < 0.001);
  }
});

test("walking alternates three planted feet and flight folds every leg above the floor", () => {
  for (const time of [0.13, 0.34, 0.78, 1.19, 2.46]) {
    let planted = 0;
    for (const side of [-1, 1])
      for (let leg = 0; leg < 3; leg++) {
        const walking = sampleLegStep(time, leg, side, 1, 0);
        assert.ok(walking.y >= FLY_FOOT_Y);
        if (walking.y === FLY_FOOT_Y) planted++;
        const flying = sampleLegStep(time, leg, side, 0, 1);
        assert.ok(flying.y > FLY_FOOT_Y + 0.2);
      }
    assert.equal(planted, 3);
  }
});

test("reduced motion remains grounded and stationary", () => {
  const rest = sampleFlyMotion(0, true);
  for (const time of [2, 8, 14, 19, 25, 53])
    assert.deepEqual(sampleFlyMotion(time, true), rest);
  assert.equal(rest.flight, 0);
  assert.equal(rest.walk, 0);
  assert.equal(rest.height, 0);
});
