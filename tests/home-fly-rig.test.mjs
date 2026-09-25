import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  solveFlyLeg,
  flyFootTarget,
  sampleFlyGesture,
} from "../src/home-fly-kinematics.mjs";
import { createArticulatedFly } from "../src/home-articulated-fly.mjs";
import { createEmbeddedActivity } from "../src/home-fly-neural-light.mjs";
import { sampleFlyMotion, FLY_FOOT_Y } from "../src/home-flight-motion.mjs";
import { encodeGraph } from "../src/brain/graph.mjs";

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("every leg can reach its planted, folded and grooming targets without stretching", () => {
  for (let time = 0; time < 26; time += 0.07) {
    const motion = sampleFlyMotion(time);
    const gesture = sampleFlyGesture(time, motion);
    const torso = new THREE.Matrix4().compose(
      new THREE.Vector3(0, gesture.bob, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, gesture.pitch)),
      new THREE.Vector3(1, 1, 1),
    );
    for (const side of [-1, 1])
      for (let leg = 0; leg < 3; leg++) {
        const hip = new THREE.Vector3(
          [0.105, -0.065, -0.225][leg],
          [-0.065, -0.105, -0.075][leg],
          side * 0.117,
        )
          .applyMatrix4(torso)
          .toArray();
        const target = flyFootTarget(time, leg, side, motion);
        const solved = solveFlyLeg(hip, target, [
          [0.5, 0, -0.7][leg],
          0.28,
          side,
        ]);
        near(distance(hip, solved.knee), 0.31);
        near(distance(solved.knee, solved.foot), 0.34);
        near(distance(solved.foot, target), 0);
        if (!motion.flight && !motion.walk && !(leg === 0 && motion.groom))
          near(solved.foot[1], FLY_FOOT_Y);
      }
  }
});

test("degenerate IK targets remain finite and preserve bone lengths", () => {
  for (const target of [
    [0, 0, 0],
    [0, 100, 0],
    [0, 0.001, 0],
  ]) {
    const result = solveFlyLeg([0, 0, 0], target, [0, 1, 0]);
    assert.ok([...result.knee, ...result.foot].every(Number.isFinite));
    near(Math.hypot(...result.knee), 0.31);
    near(distance(result.knee, result.foot), 0.34);
  }
});

test("the body and dissolution are volumetric geometry with independent head movement", () => {
  const rig = createArticulatedFly();
  rig.update({ time: 0, reduced: true });
  const body = rig.root.getObjectByName("head-cuticle");
  assert.equal(body.geometry.type, "SphereGeometry");
  assert.equal(body.material.uniforms.map, undefined);
  const head = rig.root.getObjectByName("head-pivot");
  rig.update({ time: 2, turn: 0.25 });
  assert.ok(head.rotation.y > 0.2);
  const surface = rig.sampleSurface();
  assert.ok(surface.length > 2000);
  assert.ok(surface.every(Number.isFinite));
  let minimum = Infinity,
    maximum = -Infinity;
  for (let i = 2; i < surface.length; i += 3) {
    minimum = Math.min(minimum, surface[i]);
    maximum = Math.max(maximum, surface[i]);
  }
  assert.ok(maximum - minimum > 0.3);
});

test("embedded activity lights only recorded valid neuron indices and clears on REST", () => {
  const graph = encodeGraph(
    {
      schema: "iff.connectome/1",
      nodes: Array.from({ length: 8 }, (_, i) => ({ id: String(i), sign: 1 })),
      groups: { food: [0], threat: [1], light: [2], left: [3], right: [4] },
    },
    Array.from({ length: 8 }, (_, i) => ({
      pre: i,
      post: (i + 1) % 8,
      weight: 1,
    })),
  );
  const neural = createEmbeddedActivity(graph);
  neural.update({ spikes: [1, 5, -1, 8, 1.5] }, 1, 1);
  const activity = neural.group.children[0].geometry.attributes.activity.array;
  assert.deepEqual([...activity], [0, 1, 0, 0, 0, 1, 0, 0]);
  neural.update({ spikes: [] }, 1, 1);
  assert.ok(activity.every((value) => value === 0));
});

test("reduced-motion articulation does not change with scene time", () => {
  assert.deepEqual(
    sampleFlyGesture(0, { reduced: true }),
    sampleFlyGesture(99, { reduced: true }),
  );
  const rig = createArticulatedFly();
  rig.update({ time: 0, reduced: true });
  const before = rig.sampleSurface().slice();
  rig.update({ time: 23, reduced: true });
  assert.deepEqual(rig.sampleSurface(), before);
});
