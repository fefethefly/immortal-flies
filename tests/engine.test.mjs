import test from "node:test";
import assert from "node:assert/strict";
import {
  createFly,
  tick,
  train,
  sleep,
  wake,
  rebirth,
  checkpoint,
  restoreCheckpoint,
  proveContinuity,
  runMaze,
  validateFly,
  MAZE,
} from "../src/engine.mjs";
test("a fresh machine resumes the exact same trajectory after a JSON checkpoint", async () => {
  let continuous = train(createFly(), 0);
  const file = JSON.stringify(await checkpoint(continuous));
  let restored = await restoreCheckpoint(JSON.parse(file));
  for (let i = 0; i < 256; i++) {
    continuous = tick(continuous, i % 4);
    restored = tick(restored, i % 4);
  }
  assert.deepEqual(restored, continuous);
  assert.equal((await proveContinuity(restored)).equal, true);
});
test("tampering and malformed archives are rejected", async () => {
  const data = await checkpoint(createFly());
  data.state.brain.learning[0] += 1;
  await assert.rejects(restoreCheckpoint(data), /校验失败/);
  const fly = createFly();
  fly.brain.potential = [];
  assert.throws(() => validateFly(fly), /神经状态/);
  fly.brain.potential = Array(16).fill(0);
  fly.brain.energy = -1;
  assert.throws(() => validateFly(fly), /状态无效/);
});
test("sleep freezes time; rebirth keeps identity, neural state and learning", () => {
  const trained = train(createFly(), 2),
    sleeping = sleep(trained);
  assert.deepEqual(tick(sleeping), sleeping);
  assert.equal(wake(sleeping).brain.dormant, false);
  const reborn = rebirth(sleeping);
  assert.equal(reborn.dna, trained.dna);
  assert.equal(reborn.bornAt, trained.bornAt);
  assert.deepEqual(reborn.brain.learning, trained.brain.learning);
  assert.deepEqual(reborn.brain.potential, trained.brain.potential);
  assert.equal(reborn.brain.incarnation, 2);
  assert.equal(reborn.brain.energy, 1000);
});
test("training affects the neural trajectory and respects energy limits", () => {
  assert.notDeepEqual(
    train(createFly(), 0).brain.potential,
    train(createFly(), 1).brain.potential,
  );
  let fly = createFly();
  for (let i = 0; i < 1001; i++) fly = tick(fly);
  assert.equal(fly.brain.energy, 0);
  assert.equal(fly.brain.dormant, true);
  assert.equal(fly.brain.ticks, 1000);
  assert.throws(() => train(fly, 0));
});
test("maze runs are deterministic, walk only legal adjacent cells and yield an earned badge", () => {
  const fly = createFly(),
    a = runMaze(fly),
    b = runMaze(fly);
  assert.deepEqual(a, b);
  assert.equal(a.success, true);
  for (let i = 1; i < a.path.length; i++) {
    const [x, y] = a.path[i],
      [px, py] = a.path[i - 1];
    assert.equal(MAZE[y][x], "0");
    assert.equal(Math.abs(x - px) + Math.abs(y - py), 1);
  }
  assert.ok(a.state.achievements.includes("FIRST_FORAGER"));
  assert.equal(
    runMaze(a.state).state.achievements.filter((x) => x === "FIRST_FORAGER")
      .length,
    1,
  );
});

test("checkpoint metadata rejects malformed dates and invalid hashes before rendering", async () => {
  const data = await checkpoint(createFly());
  for (const savedAt of [{ toString: null }, null, "not-a-date", 123]) {
    await assert.rejects(restoreCheckpoint({ ...data, savedAt }), /有效/);
  }
  for (const sha256 of ["", "zz".repeat(32), data.sha256 + "00"]) {
    await assert.rejects(restoreCheckpoint({ ...data, sha256 }), /有效/);
  }
});
