import test from "node:test";
import assert from "node:assert/strict";
import { createHeroLoop } from "../src/hero-webgl.mjs";
import { createHeroParticles, localActivity } from "../src/hero-particles.mjs";

test("hero geometry is deterministic and finite; art is not extra model nodes", () => {
  const a = createHeroParticles();
  assert.equal(a.length % 6, 0);
  assert.ok(a.every(Number.isFinite));
  assert.deepEqual(a, createHeroParticles());
  assert.ok(createHeroParticles(true).length < a.length);
  assert.equal(localActivity(0xffffff), 24);
  assert.equal(localActivity(0xff000000), 0);
});

test("hero loop throttles, freezes, resumes and rejects stale callbacks", () => {
  let active = true, id = 0;
  const queue = new Map(), cancelled = [], frames = [];
  const loop = createHeroLoop({ active: () => active, schedule(fn) { queue.set(++id, fn); return id; }, cancel(id) { cancelled.push(id); queue.delete(id); }, render(dt) { frames.push(dt); } });
  const tick = now => { const [id, fn] = queue.entries().next().value; queue.delete(id); fn(now); };
  loop.sync(0);
  tick(16); assert.deepEqual(frames, [0]);
  tick(32); assert.deepEqual(frames, [0, 0.032]);
  const stale = queue.values().next().value;
  active = false; loop.sync(40);
  assert.equal(loop.running, false); assert.equal(queue.size, 0);
  stale(80); assert.equal(queue.size, 0);
  active = true; loop.sync(100); tick(132);
  assert.equal(loop.running, true); assert.equal(queue.size, 1);
  assert.equal(frames.at(-1), 0.032);
  active = false; tick(164);
  assert.equal(queue.size, 0); assert.equal(loop.running, false);
  active = true; loop.sync(200); loop.stop();
  assert.ok(cancelled.length >= 2); assert.equal(queue.size, 0);
});
