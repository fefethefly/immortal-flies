import test from "node:test";
import assert from "node:assert/strict";
import { bindManifest, encodeGraph } from "../src/brain/graph.mjs";
import { createState, step } from "../src/brain/runtime.mjs";
import { hash } from "../src/brain/codec.mjs";
import {
  createSchemas,
  validateRecord,
} from "../src/brain/flyswarm/schemas.mjs";
import {
  SEGMENT_POLICY,
  PROOF_SCHEMAS,
  adjudicate,
  bisectTrees,
  buildMerkle,
  checkOpening,
  commitmentOf,
  firstDivergence,
  leafOf,
  merkleProof,
  openProbe,
  runTrajectory,
  selectProbes,
  stateAt,
  validateCommitment,
  verifyMerkleProof,
} from "../src/brain/flyswarm/segment.mjs";
import {
  LEDGER_SCHEMAS,
  SEGMENT_LEDGER_POLICY as LP,
  acceptTask,
  beginExit,
  bindRunner,
  closeChallenge,
  closeTask,
  commitSegment,
  createSegmentLedger,
  drainOwnerFuel,
  fundBudget,
  invariants,
  lockSeat,
  beginUnlockSeat,
  unlockSeat,
  openSegment,
  openTask,
  operatorView,
  recordProbe,
  refuel,
  registerOperator,
  releaseDeferred,
  resolveDispute,
  restoreSegmentLedger,
  saveSegmentLedger,
  seatDiscountBps,
  segmentLedgerView,
  settlePrivate,
  tankView,
  transferLife,
  voidSegment,
  withdrawBond,
  withdrawEarnings,
} from "../src/brain/flyswarm/segment-ledger.mjs";

// 内核不改：只用现有 encodeGraph / createState / step。小图足以测协议；全量图性能在 RUNTIME-TIERS 里量。
function fixture() {
  return bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        nodes: [
          { id: "a", sign: 1 },
          { id: "b", sign: 1 },
          { id: "c", sign: -1 },
          { id: "d", sign: 1 },
        ],
        groups: {
          food: [0, 1],
          threat: [0],
          light: [1],
          left: [2],
          right: [3],
        },
      },
      [
        { pre: 0, post: 1, weight: 10 },
        { pre: 1, post: 0, weight: 10 },
        { pre: 1, post: 2, weight: 5 },
        { pre: 2, post: 3, weight: 7 },
        { pre: 3, post: 0, weight: 3 },
      ],
    ),
    "segment-test",
  );
}
const SEED = "0x" + "ab".repeat(32);
const HEX = /^0x[0-9a-f]{64}$/;
const initial = (graph, seed = 43) =>
  createState(graph, { seed, soulId: `seg-${seed}`, branchId: "test" });

/** 伪造者：位置 ≤ honestUpTo 照跑，之后的叶与检查点随机编造并重建树 —— 这是「只跑前缀」的具体形态。 */
async function forge(honestTrajectory, honestUpTo) {
  const L = honestTrajectory.leafEvery;
  const leaves = honestTrajectory.leaves.slice();
  for (let i = 0; i < leaves.length; i += 1) {
    if ((i + 1) * L > honestUpTo)
      leaves[i] = await hash({ forged: i, salt: honestTrajectory.root });
  }
  const tree = await buildMerkle(leaves);
  const checkpointRoots = honestTrajectory.checkpointRoots.map((r, i) =>
    i * honestTrajectory.checkpointEvery <= honestUpTo
      ? r
      : `0x${"ff".repeat(31)}${i.toString(16).padStart(2, "0")}`,
  );
  return {
    ...honestTrajectory,
    leaves,
    tree,
    root: tree.root,
    checkpointRoots,
    finalRoot: `0x${"ee".repeat(32)}`,
  };
}

// ───────────────────────── 证明引擎 ─────────────────────────

test("段：逐 tick 轨迹与批量 step 逐位一致；同输入同根；承诺形状合法", async () => {
  const graph = fixture();
  const s0 = initial(graph);
  const a = await runTrajectory(graph, s0, { steps: 300, checkpointEvery: 50 });
  const b = await runTrajectory(graph, s0, { steps: 300, checkpointEvery: 50 });
  assert.equal(a.root, b.root, "同输入同根");
  assert.equal(a.finalRoot, b.finalRoot);
  assert.equal(a.leaves.length, 300);
  assert.equal(a.checkpointRoots.length, 6, "位置 0,50,…,250");
  // 内核批量推进（≤128/次）与逐步推进得到同一终态 → 叶哈希不依赖调用粒度
  const batched = step(
    step(step(structuredClone(s0), graph, 128), graph, 128),
    graph,
    44,
  );
  assert.equal(await hash(batched), a.finalRoot);
  assert.equal(
    await hash(stateAt(graph, a, 300)),
    a.finalRoot,
    "stateAt 从最近检查点重放到终点",
  );
  assert.equal(await hash(stateAt(graph, a, 0)), a.startRoot);
  const c = commitmentOf(a);
  validateCommitment(c);
  assert.ok(HEX.test(c.root) && HEX.test(c.startRoot) && HEX.test(c.finalRoot));
  assert.equal(c.checkpointRoots[0], c.startRoot);
  assert.throws(
    () =>
      validateCommitment({ ...c, checkpointRoots: c.checkpointRoots.slice(1) }),
    /检查点数量/,
  );
  assert.throws(() => validateCommitment({ ...c, audit: "LIVE" }), /audit/);
  // 叶绑定位置：同一状态摘要在不同位置是不同的叶
  assert.notEqual(
    await leafOf({ position: 1, stateRoot: a.finalRoot }),
    await leafOf({ position: 2, stateRoot: a.finalRoot }),
  );
});

test("Merkle：奇数叶、路径长度、篡改叶 / 索引 / 伸缩证明全部拒绝", async () => {
  for (const n of [1, 2, 3, 5, 8, 13, 100]) {
    const leaves = [];
    for (let i = 0; i < n; i += 1) leaves.push(await hash({ i, n }));
    const tree = await buildMerkle(leaves);
    for (let i = 0; i < n; i += 1) {
      const proof = merkleProof(tree, i);
      assert.equal(
        await verifyMerkleProof(tree.root, leaves[i], i, proof, n),
        true,
        `n=${n} i=${i}`,
      );
      // 错叶、错位、错 leafCount 都不能过
      assert.equal(
        await verifyMerkleProof(
          tree.root,
          await hash({ i, n, x: 1 }),
          i,
          proof,
          n,
        ),
        false,
      );
      if (n > 1)
        assert.equal(
          await verifyMerkleProof(tree.root, leaves[i], (i + 1) % n, proof, n),
          false,
        );
      // 复算者永远拿承诺里的 steps 当 leafCount；层数不同的形状必拒
      assert.equal(
        await verifyMerkleProof(tree.root, leaves[i], i, proof, 2 * n + 1),
        false,
        "形状不符",
      );
      if (proof.length > 0)
        assert.equal(
          await verifyMerkleProof(
            tree.root,
            leaves[i],
            i,
            proof.slice(0, -1),
            n,
          ),
          false,
          "截短证明",
        );
    }
  }
  await assert.rejects(buildMerkle([]), /至少一个叶/);
});

test("抽检：承诺后的种子决定位置；分层覆盖每 1/k 段；确定性", async () => {
  const p1 = await selectProbes({
    seed: SEED,
    segmentId: "seg-1",
    steps: 900,
    count: 3,
  });
  const p2 = await selectProbes({
    seed: SEED,
    segmentId: "seg-1",
    steps: 900,
    count: 3,
  });
  assert.deepEqual(p1, p2);
  assert.equal(p1.length, 3);
  assert.ok(p1[0] >= 1 && p1[0] <= 300);
  assert.ok(p1[1] >= 301 && p1[1] <= 600);
  assert.ok(p1[2] >= 601 && p1[2] <= 900);
  const other = await selectProbes({
    seed: SEED,
    segmentId: "seg-2",
    steps: 900,
    count: 3,
  });
  assert.notDeepEqual(p1, other, "不同段不同位置");
  // 段长不整除层数：最后一层收缩不越界
  const odd = await selectProbes({
    seed: SEED,
    segmentId: "seg-3",
    steps: 10,
    count: 3,
  });
  assert.ok(odd.every((p) => p >= 1 && p <= 10));
});

test("开叶 → 复算：诚实开口全部通过；重放步数 ≤ 2c；位置 / 检查点 / 叶 / 路径任一篡改都不匹配", async () => {
  const graph = fixture();
  const traj = await runTrajectory(graph, initial(graph), {
    steps: 200,
    checkpointEvery: 25,
  });
  const c = commitmentOf(traj);
  const probes = await selectProbes({
    seed: SEED,
    segmentId: "seg-open",
    steps: 200,
  });
  for (const p of [...probes, 1, 25, 26, 50, 200]) {
    const op = openProbe(traj, p);
    const r = await checkOpening(graph, op, c);
    assert.equal(r.ok, true, `position ${p}: ${r.reason}`);
    assert.ok(r.replayed <= 2 * 25 && r.replayed >= 1, `重放 ${r.replayed} 步`);
    assert.ok(op.from.position <= p, "开口带的是前置检查点");
  }
  const op = openProbe(traj, 77);
  const tamper = async (patch, reason) => {
    const r = await checkOpening(graph, { ...op, ...patch }, c);
    assert.equal(r.ok, false);
    assert.equal(r.reason, reason);
  };
  await tamper({ leaf: traj.leaves[76 === 0 ? 1 : 75] }, "LEAF_MISMATCH");
  await tamper({ position: 78 }, "LEAF_MISMATCH");
  await tamper(
    { from: { ...op.from, index: op.from.index + 1 } },
    "OPENING_FROM",
  );
  const badState = structuredClone(op.from.state);
  badState.rng = (badState.rng + 1) >>> 0;
  await tamper({ from: { ...op.from, state: badState } }, "CHECKPOINT_ROOT");
  await tamper({ proof: op.proof.slice(0, -1) }, "MERKLE_PROOF");
  // 检查点衔接：开口的前置检查点对，但承诺里锚检查点被换 → 衔接不上
  const linked = {
    ...c,
    checkpointRoots: c.checkpointRoots.map((r, i) =>
      i === op.anchor.index ? c.checkpointRoots[0] : r,
    ),
  };
  const r = await checkOpening(graph, op, linked);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "CHECKPOINT_LINK");
});

test("末叶必须绑定 finalRoot：只改终态摘要时任何开口都失败", async () => {
  const graph = fixture();
  const traj = await runTrajectory(graph, initial(graph), {
    steps: 40,
    checkpointEvery: 20,
    leafEvery: 10,
  });
  const c = commitmentOf(traj);
  const forgedRoot = `0x${"aa".repeat(32)}`;
  const patched = { ...c, finalRoot: forgedRoot };
  const early = await checkOpening(graph, openProbe(traj, 10), patched);
  assert.equal(early.ok, false);
  assert.equal(early.reason, "FINAL_LEAF");
  const fakeLeaf = await leafOf({ position: 40, stateRoot: forgedRoot });
  const patchedLeaf = { ...c, finalRoot: forgedRoot, finalLeaf: fakeLeaf };
  const proofFail = await checkOpening(
    graph,
    openProbe(traj, 10),
    patchedLeaf,
  );
  assert.equal(proofFail.ok, false);
  assert.equal(proofFail.reason, "FINAL_PROOF");
});

test("伪造端到端：只跑前缀 → 抽检抓到；二分定位首个分歧 tick；step() 一次判负", async () => {
  const graph = fixture();
  const honest = await runTrajectory(graph, initial(graph), {
    steps: 240,
    checkpointEvery: 30,
  });
  const forged = await forge(honest, 150);
  const forgedCommitment = commitmentOf(forged);
  validateCommitment(forgedCommitment);
  // 承诺后抽种；落在伪造区的位置复算必失败，且失败原因是具体谓词不是「治理判断」
  const probes = await selectProbes({
    seed: SEED,
    segmentId: "seg-forge",
    steps: 240,
  });
  const results = [];
  for (const p of probes) {
    const op = openProbe(forged, p);
    results.push(await checkOpening(graph, op, forgedCommitment));
  }
  assert.ok(
    results.some((r) => !r.ok),
    "分层抽样至少一层落在伪造区",
  );
  for (const r of results.filter((r) => !r.ok)) {
    assert.ok(
      [
        "LEAF_MISMATCH",
        "CHECKPOINT_ROOT",
        "CHECKPOINT_LINK",
            "FINAL_ROOT",
            "FINAL_LEAF",
            "FINAL_PROOF",
          ].includes(r.reason),
      r.reason,
    );
  }
  // 二分：两棵树 log2(n) 轮定位到首个分歧
  const where = bisectTrees(honest.tree, forged.tree);
  assert.equal(where.index, firstDivergence(honest.leaves, forged.leaves));
  assert.equal(where.position, 151);
  assert.ok(
    where.rounds.length <= Math.ceil(Math.log2(240)),
    `二分 ${where.rounds.length} 轮`,
  );
  assert.throws(() => bisectTrees(honest.tree, honest.tree), /无争议/);
  // 判定：双方都认可 t−1 状态（分歧前双方叶相同），任何人 step 一次
  const preState = stateAt(graph, honest, where.position - 1);
  const verdict = await adjudicate(graph, {
    preState,
    position: where.position,
    leafA: honest.leaves[where.index],
    leafB: forged.leaves[where.index],
  });
  assert.equal(verdict.verdict, "A", "诚实方胜");
  assert.equal(verdict.expectedLeaf, honest.leaves[where.index]);
  const swapped = await adjudicate(graph, {
    preState,
    position: where.position,
    leafA: forged.leaves[where.index],
    leafB: honest.leaves[where.index],
  });
  assert.equal(swapped.verdict, "B");
  const neither = await adjudicate(graph, {
    preState,
    position: where.position,
    leafA: forged.leaves[where.index],
    leafB: await hash("x"),
  });
  assert.equal(neither.verdict, "NEITHER");
});

test("叶步幅 L=10：叶数 = n/L；抽检落在叶上；开叶复算；二分到分歧叶；判定重放 L 步", async () => {
  const graph = fixture();
  const honest = await runTrajectory(graph, initial(graph, 9), {
    steps: 400,
    checkpointEvery: 100,
    leafEvery: 10,
  });
  assert.equal(honest.leaves.length, 40);
  assert.equal(honest.checkpointRoots.length, 4);
  // 与 L=1 的同段：终态相同（叶步幅不改变动力学）
  const fine = await runTrajectory(graph, initial(graph, 9), {
    steps: 400,
    checkpointEvery: 100,
    leafEvery: 1,
  });
  assert.equal(honest.finalRoot, fine.finalRoot);
  assert.notEqual(
    honest.root,
    fine.root,
    "叶不同，根不同：L 是承诺形状的一部分",
  );
  const c = commitmentOf(honest);
  validateCommitment(c);
  assert.equal(c.leafEvery, 10);
  assert.throws(() => validateCommitment({ ...c, steps: 395 }), /整数倍/);
  assert.throws(
    () => validateCommitment({ ...c, checkpointEvery: 95 }),
    /整数倍/,
  );
  const probes = await selectProbes({
    seed: SEED,
    segmentId: "seg-L",
    steps: 400,
    leafEvery: 10,
  });
  assert.equal(probes.length, 3);
  for (const p of probes) {
    assert.equal(p % 10, 0);
    const r = await checkOpening(graph, openProbe(honest, p), c);
    assert.equal(r.ok, true, `position ${p}: ${r.reason}`);
    assert.ok(r.replayed <= 200);
  }
  assert.throws(() => openProbe(honest, 205), /不在叶上/);
  assert.equal(
    (await checkOpening(graph, { ...openProbe(honest, 200), position: 205 }, c))
      .reason,
    "OPENING_POSITION",
  );
  // 伪造尾部：二分到首个分歧叶，判定从前一叶重放 L 步
  const forged = await forge(honest, 250);
  const where = bisectTrees(honest.tree, forged.tree, { leafEvery: 10 });
  assert.equal(where.position, 260);
  assert.equal(where.index, 25);
  const verdict = await adjudicate(graph, {
    preState: stateAt(graph, honest, 250),
    position: 260,
    leafEvery: 10,
    leafA: honest.leaves[25],
    leafB: forged.leaves[25],
  });
  assert.equal(verdict.verdict, "A");
  assert.equal(verdict.leafEvery, 10);
  await assert.rejects(
    adjudicate(graph, {
      preState: stateAt(graph, honest, 250),
      position: 255,
      leafEvery: 10,
      leafA: honest.leaves[25],
      leafB: forged.leaves[25],
    }),
    /不在叶上/,
  );
});

test("蒙特卡洛：只跑 50% 必被抓；只跑 90% 被抓率 ≥ 20%；全诚实零误报", async () => {
  const steps = 999;
  const trials = 400;
  const caught = async (honestFraction) => {
    const forgedFrom = Math.floor(steps * honestFraction); // 位置 > forgedFrom 是伪造
    let hits = 0;
    for (let t = 0; t < trials; t += 1) {
      const seed = await hash({ trial: t, honestFraction });
      const probes = await selectProbes({ seed, segmentId: "mc", steps });
      if (probes.some((p) => p > forgedFrom)) hits += 1;
    }
    return hits / trials;
  };
  assert.equal(await caught(0.5), 1, "分层抽样：整层伪造必被抓");
  const p90 = await caught(0.9);
  assert.ok(p90 >= 0.2 && p90 <= 0.4, `只跑 90% 被抓率 ${p90}（理论约 30%）`);
  assert.equal(await caught(1), 0, "诚实者零误报");
});

// ───────────────────────── 四本账 ─────────────────────────

const check = (ledger) => {
  const inv = invariants(ledger);
  assert.ok(inv.ok, JSON.stringify(inv));
  return inv;
};
const ROOT = "0x" + "11".repeat(32);

async function committed(
  graph,
  ledger,
  { segmentId, lifeId, tick, steps = 60 },
) {
  const traj = await runTrajectory(graph, initial(graph), {
    steps,
    checkpointEvery: 20,
  });
  const seg = openSegment(ledger, {
    segmentId,
    track: "PRIVATE",
    lifeId,
    steps,
    startRoot: traj.startRoot,
    tick,
  });
  commitSegment(ledger, { segmentId, commitment: commitmentOf(traj), tick });
  return { traj, seg };
}

test("私有轨全流程：加油 → 绑定 → 领段 → 承诺 → 抽检 → 窗后记账 → 挑战窗关；守恒每步成立", async () => {
  const graph = fixture();
  const ledger = createSegmentLedger();
  registerOperator(ledger, { operatorId: "op-a", bond: LP.minBond, tick: 0 });
  refuel(ledger, { lifeId: "life-1", amount: 30_000, kind: "OWNER", tick: 1 });
  refuel(ledger, { lifeId: "life-1", amount: 5_000, kind: "GIFT", tick: 1 });
  bindRunner(ledger, {
    lifeId: "life-1",
    operatorId: "op-a",
    feePerSegment: 10_000,
    tick: 2,
  });
  assert.equal(tankView(ledger, "life-1").segmentsLeft, 3);
  check(ledger);

  const { traj, seg } = await committed(graph, ledger, {
    segmentId: "s1",
    lifeId: "life-1",
    tick: 3,
  });
  assert.equal(seg.fee, 10_000);
  assert.deepEqual(
    seg.fuel,
    { fromOwner: 10_000, fromGift: 0 },
    "先烧主人的油",
  );
  assert.equal(operatorView(ledger, "op-a").exposure, 10_000 * LP.bondMultiple);
  assert.equal(tankView(ledger, "life-1").reserved, 10_000);
  check(ledger);

  // 结算前必须抽检通过
  assert.throws(
    () => settlePrivate(ledger, { segmentId: "s1", tick: 4 }),
    /抽检/,
  );
  const c = commitmentOf(traj);
  const positions = await selectProbes({
    seed: SEED,
    segmentId: "s1",
    steps: 60,
  });
  const results = [];
  for (const p of positions)
    results.push(await checkOpening(graph, openProbe(traj, p), c));
  recordProbe(ledger, {
    segmentId: "s1",
    seed: SEED,
    positions,
    results,
    tick: 4,
  });
  const until = ledger.segments.get("s1").challengeUntil;
  assert.equal(until, 3 + LP.challengeWindowTicks);
  assert.throws(
    () => settlePrivate(ledger, { segmentId: "s1", tick: until }),
    /挑战窗/,
  );
  const receipt = settlePrivate(ledger, {
    segmentId: "s1",
    tick: until + 1,
  });
  assert.equal(receipt.schema, "iff.segment-receipt/1");
  assert.equal(receipt.paidNow, 10_000);
  assert.equal(operatorView(ledger, "op-a").earnings, 10_000);
  assert.equal(tankView(ledger, "life-1").reserved, 0);
  assert.equal(tankView(ledger, "life-1").available, 25_000);
  assert.equal(operatorView(ledger, "op-a").exposure, 0);
  check(ledger);

  closeChallenge(ledger, { segmentId: "s1", tick: until + 1 });
  assert.equal(operatorView(ledger, "op-a").exposure, 0);
  assert.equal(withdrawEarnings(ledger, { operatorId: "op-a" }), 10_000);
  check(ledger);
  // 重复结算拒绝
  assert.throws(() => settlePrivate(ledger, { segmentId: "s1" }), /COMMITTED/);
  assert.throws(
    () =>
      openSegment(ledger, {
        segmentId: "s1-again",
        track: "PRIVATE",
        lifeId: "life-1",
        steps: 60,
        startRoot: traj.startRoot,
      }),
    /终态继续/,
  );
  openSegment(ledger, {
    segmentId: "s2",
    track: "PRIVATE",
    lifeId: "life-1",
    steps: 60,
    startRoot: traj.finalRoot,
  });
  assert.throws(
    () =>
      openSegment(ledger, {
        segmentId: "s3",
        track: "PRIVATE",
        lifeId: "life-1",
        steps: 60,
        startRoot: traj.finalRoot,
      }),
    /当前执行租约/,
  );
  voidSegment(ledger, { segmentId: "s2" });
});

test("罐：罐空不开段；油按原路退；转移退 ownerFuel 留 giftFuel 清绑定；主人提不走打赏", async () => {
  const graph = fixture();
  const ledger = createSegmentLedger();
  registerOperator(ledger, { operatorId: "op-a", bond: LP.minBond, tick: 0 });
  refuel(ledger, { lifeId: "life-2", amount: 4_000, kind: "OWNER" });
  refuel(ledger, { lifeId: "life-2", amount: 9_000, kind: "GIFT" });
  bindRunner(ledger, {
    lifeId: "life-2",
    operatorId: "op-a",
    feePerSegment: 10_000,
  });
  // 4000 主人 + 6000 打赏 → 预留；放弃后原路退回
  const seg = openSegment(ledger, {
    segmentId: "s2",
    track: "PRIVATE",
    lifeId: "life-2",
    steps: 10,
    startRoot: ROOT,
  });
  assert.deepEqual(seg.fuel, { fromOwner: 4_000, fromGift: 6_000 });
  voidSegment(ledger, { segmentId: "s2" });
  assert.deepEqual(
    (({ ownerFuel, giftFuel, reserved }) => ({
      ownerFuel,
      giftFuel,
      reserved,
    }))(tankView(ledger, "life-2")),
    { ownerFuel: 4_000, giftFuel: 9_000, reserved: 0 },
  );
  check(ledger);
  // 主人只能提自己的
  assert.throws(
    () => drainOwnerFuel(ledger, { lifeId: "life-2", amount: 4_001 }),
    /不足/,
  );
  // 罐不够一段 → 不开，生命休眠
  bindRunner(ledger, {
    lifeId: "life-2",
    operatorId: "op-a",
    feePerSegment: 20_000,
  });
  assert.throws(
    () =>
      openSegment(ledger, {
        segmentId: "s3",
        track: "PRIVATE",
        lifeId: "life-2",
        steps: 10,
        startRoot: ROOT,
      }),
    /罐空/,
  );
  // 转移：ownerFuel 退卖家，giftFuel 留下，绑定清空
  const out = transferLife(ledger, { lifeId: "life-2" });
  assert.equal(out.refund, 4_000);
  assert.equal(tankView(ledger, "life-2").giftFuel, 9_000);
  assert.equal(tankView(ledger, "life-2").binding, null);
  assert.throws(
    () =>
      openSegment(ledger, {
        segmentId: "s4",
        track: "PRIVATE",
        lifeId: "life-2",
        steps: 10,
        startRoot: ROOT,
      }),
    /未绑定/,
  );
  check(ledger);
  // 非绑定 Runner 不能领这只的段
  registerOperator(ledger, { operatorId: "op-b", bond: LP.minBond });
  bindRunner(ledger, {
    lifeId: "life-2",
    operatorId: "op-a",
    feePerSegment: 1_000,
  });
  assert.throws(
    () =>
      openSegment(ledger, {
        segmentId: "s5",
        track: "PRIVATE",
        lifeId: "life-2",
        operatorId: "op-b",
        steps: 10,
        startRoot: ROOT,
      }),
    /绑定的 Runner/,
  );
  // 工价硬顶
  assert.throws(
    () =>
      bindRunner(ledger, {
        lifeId: "life-2",
        operatorId: "op-a",
        feePerSegment: LP.maxFeePerSegment + 1,
      }),
    /超出范围/,
  );
  void graph;
});

test("押金：门槛、一笔押金一个身份、曝险上限、退出冷却、曝险未清不可退", async () => {
  const ledger = createSegmentLedger();
  assert.throws(
    () =>
      registerOperator(ledger, { operatorId: "op-x", bond: LP.minBond - 1 }),
    /超出范围/,
  );
  registerOperator(ledger, { operatorId: "op-x", bond: LP.minBond });
  assert.throws(
    () => registerOperator(ledger, { operatorId: "op-x", bond: LP.minBond }),
    /一笔押金一个身份/,
  );
  refuel(ledger, { lifeId: "life-3", amount: 1_000_000, kind: "OWNER" });
  refuel(ledger, { lifeId: "life-3b", amount: 1_000_000, kind: "OWNER" });
  refuel(ledger, { lifeId: "life-3c", amount: 1_000_000, kind: "OWNER" });
  for (const lifeId of ["life-3", "life-3b", "life-3c"])
    bindRunner(ledger, {
      lifeId,
      operatorId: "op-x",
      feePerSegment: LP.maxFeePerSegment,
    });
  // minBond / (5 × maxFee) = 2 段并行（不同生命）；第 3 段押金不足
  openSegment(ledger, {
    segmentId: "p1",
    track: "PRIVATE",
    lifeId: "life-3",
    steps: 10,
    startRoot: ROOT,
  });
  openSegment(ledger, {
    segmentId: "p2",
    track: "PRIVATE",
    lifeId: "life-3b",
    steps: 10,
    startRoot: ROOT,
  });
  assert.throws(
    () =>
      openSegment(ledger, {
        segmentId: "p3",
        track: "PRIVATE",
        lifeId: "life-3c",
        steps: 10,
        startRoot: ROOT,
      }),
    /押金不足/,
  );
  check(ledger);
  beginExit(ledger, { operatorId: "op-x", tick: 10 });
  assert.throws(
    () =>
      openSegment(ledger, {
        segmentId: "p4",
        track: "PRIVATE",
        lifeId: "life-3c",
        steps: 10,
        startRoot: ROOT,
      }),
    /退出中/,
  );
  assert.throws(
    () =>
      withdrawBond(ledger, {
        operatorId: "op-x",
        tick: 10 + LP.exitCooldownTicks - 1,
      }),
    /冷却/,
  );
  assert.throws(
    () =>
      withdrawBond(ledger, {
        operatorId: "op-x",
        tick: 10 + LP.exitCooldownTicks,
      }),
    /挑战窗/,
  );
  voidSegment(ledger, { segmentId: "p1" });
  voidSegment(ledger, { segmentId: "p2" });
  assert.equal(withdrawBond(ledger, { operatorId: "op-x" }), LP.minBond);
  check(ledger);
});

test("争议入账：判负罚曝险进罚没、预留原路退；挑战者输罚 challengeBond；哈希不匹配本身不罚", async () => {
  const graph = fixture();
  const ledger = createSegmentLedger();
  registerOperator(ledger, { operatorId: "runner", bond: LP.minBond, tick: 0 });
  registerOperator(ledger, {
    operatorId: "checker",
    bond: LP.minBond,
    tick: 0,
  });
  refuel(ledger, { lifeId: "life-4", amount: 2_000, kind: "OWNER" });
  refuel(ledger, { lifeId: "life-4", amount: 8_000, kind: "GIFT" });
  bindRunner(ledger, {
    lifeId: "life-4",
    operatorId: "runner",
    feePerSegment: 10_000,
  });

  const honest = await runTrajectory(graph, initial(graph), {
    steps: 120,
    checkpointEvery: 30,
  });
  const forged = await forge(honest, 70);
  openSegment(ledger, {
    segmentId: "d1",
    track: "PRIVATE",
    lifeId: "life-4",
    steps: 120,
    startRoot: honest.startRoot,
    tick: 1,
  });
  commitSegment(ledger, {
    segmentId: "d1",
    commitment: commitmentOf(forged),
    tick: 2,
  });
  // 抽检不匹配 → CHALLENGED，不罚
  const positions = [100];
  const results = [
    await checkOpening(graph, openProbe(forged, 100), commitmentOf(forged)),
  ];
  assert.equal(results[0].ok, false);
  recordProbe(ledger, {
    segmentId: "d1",
    seed: SEED,
    positions,
    results,
    tick: 3,
  });
  assert.equal(ledger.segments.get("d1").status, "CHALLENGED");
  assert.equal(ledger.totals.slashed, 0, "不匹配不罚");
  assert.throws(
    () => settlePrivate(ledger, { segmentId: "d1", tick: 3 }),
    /COMMITTED/,
  );
  check(ledger);
  // 二分 + 判定 → 入账
  const where = bisectTrees(honest.tree, forged.tree);
  const verdict = await adjudicate(graph, {
    preState: stateAt(graph, honest, where.position - 1),
    position: where.position,
    leafA: forged.leaves[where.index], // A = 段的运营方（伪造者）
    leafB: honest.leaves[where.index], // B = 挑战者
  });
  assert.equal(verdict.verdict, "B");
  assert.throws(
    () =>
      resolveDispute(ledger, {
        segmentId: "d1",
        challengerId: "runner",
        adjudication: verdict,
        tick: 4,
      }),
    /挑战自己/,
  );
  const outcome = resolveDispute(ledger, {
    segmentId: "d1",
    challengerId: "checker",
    adjudication: verdict,
    tick: 4,
  });
  assert.equal(outcome.runnerSlashed, 10_000 * LP.bondMultiple);
  assert.equal(outcome.challengerSlashed, 0);
  assert.equal(outcome.refunded, 10_000);
  assert.equal(ledger.totals.slashed, 10_000 * LP.bondMultiple);
  assert.equal(
    operatorView(ledger, "runner").bond,
    LP.minBond - 10_000 * LP.bondMultiple,
  );
  assert.equal(operatorView(ledger, "runner").exposure, 0);
  const tank = tankView(ledger, "life-4");
  assert.equal(tank.ownerFuel, 2_000, "主人的油原路退");
  assert.equal(tank.giftFuel, 8_000, "打赏原路退，主人拿不到");
  assert.equal(ledger.segments.get("d1").status, "SLASHED");
  check(ledger);
  // 无理挑战：诚实段被挑战，挑战者输
  const ledger2 = createSegmentLedger();
  registerOperator(ledger2, { operatorId: "runner", bond: LP.minBond });
  registerOperator(ledger2, { operatorId: "troll", bond: LP.minBond });
  refuel(ledger2, { lifeId: "life-5", amount: 10_000, kind: "OWNER" });
  bindRunner(ledger2, {
    lifeId: "life-5",
    operatorId: "runner",
    feePerSegment: 10_000,
  });
  openSegment(ledger2, {
    segmentId: "d2",
    track: "PRIVATE",
    lifeId: "life-5",
    steps: 120,
    startRoot: honest.startRoot,
  });
  commitSegment(ledger2, { segmentId: "d2", commitment: commitmentOf(honest) });
  const win = await adjudicate(graph, {
    preState: stateAt(graph, honest, where.position - 1),
    position: where.position,
    leafA: honest.leaves[where.index],
    leafB: forged.leaves[where.index],
  });
  const o2 = resolveDispute(ledger2, {
    segmentId: "d2",
    challengerId: "troll",
    adjudication: win,
  });
  assert.equal(o2.runnerSlashed, 0);
  assert.equal(o2.challengerSlashed, LP.challengeBond);
  assert.equal(
    ledger2.segments.get("d2").status,
    "COMMITTED",
    "诚实段可继续结算",
  );
  settlePrivate(ledger2, {
    segmentId: "d2",
    tick: LP.challengeWindowTicks + 1,
  });
  check(ledger2);
  // 挑战窗外不能再争议
  assert.throws(
    () =>
      resolveDispute(ledger2, {
        segmentId: "d2",
        challengerId: "troll",
        adjudication: win,
        tick: LP.challengeWindowTicks + 1,
      }),
    /挑战窗已关/,
  );
});

test("公共轨：只认到账回执；A ≥ L 不破；K 个不同运营方根一致 70/30；争议后重验收；关任务退预留", async () => {
  const graph = fixture();
  const ledger = createSegmentLedger();
  for (const id of ["op-1", "op-2", "op-3", "op-4"])
    registerOperator(ledger, { operatorId: id, bond: LP.minBond });
  assert.throws(
    () => fundBudget(ledger, { amount: 100, source: "D", receipt: "x" }),
    /TAX \/ FEE/,
  );
  assert.throws(
    () => fundBudget(ledger, { amount: 100, source: "TAX", receipt: "" }),
    /到账回执/,
  );
  fundBudget(ledger, { amount: 40_000, source: "TAX", receipt: "0xtx-1" });
  // 预算不够全额预留 → 不开
  assert.throws(
    () => openTask(ledger, { taskId: "t-big", price: 20_000, replicas: 3 }),
    /A ≥ L/,
  );
  openTask(ledger, {
    taskId: "t0",
    price: 10_000,
    replicas: 3,
    checkFee: 1_000,
    storageFee: 500,
  });
  assert.equal(ledger.budget.liabilities, 31_500);
  check(ledger);

  const honest = await runTrajectory(graph, initial(graph, 7), {
    steps: 90,
    checkpointEvery: 30,
  });
  const forged = await forge(honest, 40);
  const open = (segmentId, operatorId) =>
    openSegment(ledger, {
      segmentId,
      track: "PUBLIC",
      taskId: "t0",
      operatorId,
      steps: 90,
      startRoot: honest.startRoot,
    });
  open("r1", "op-1");
  assert.throws(() => open("r1b", "op-1"), /同一运营方/);
  open("r2", "op-2");
  assert.throws(() => acceptTask(ledger, { taskId: "t0" }), /副本未满/);
  open("r3", "op-3");
  assert.throws(() => open("r4", "op-4"), /副本已满/);
  commitSegment(ledger, {
    segmentId: "r1",
    commitment: commitmentOf(honest),
    tick: 1,
  });
  commitSegment(ledger, {
    segmentId: "r2",
    commitment: commitmentOf(honest),
    tick: 1,
  });
  commitSegment(ledger, {
    segmentId: "r3",
    commitment: commitmentOf(forged),
    tick: 1,
  });
  // 根不一致 → DISPUTED，一分钱不付
  const first = acceptTask(ledger, { taskId: "t0", tick: 2 });
  assert.equal(first.accepted, false);
  assert.equal(first.roots.length, 2);
  assert.equal(ledger.budget.assets, 40_000);
  check(ledger);
  // 争议：op-1 挑战 r3，机械判定 op-3 输
  const where = bisectTrees(honest.tree, forged.tree);
  const verdict = await adjudicate(graph, {
    preState: stateAt(graph, honest, where.position - 1),
    position: where.position,
    leafA: forged.leaves[where.index],
    leafB: honest.leaves[where.index],
  });
  const o = resolveDispute(ledger, {
    segmentId: "r3",
    challengerId: "op-1",
    adjudication: verdict,
    tick: 3,
  });
  assert.equal(o.runnerSlashed, 10_000 * LP.bondMultiple);
  // 剩余 2 个一致副本 ≥ minAgreeingReplicas → 付 70%，30% 延迟
  const second = acceptTask(ledger, { taskId: "t0", tick: 4 });
  assert.equal(second.accepted, true);
  assert.equal(second.receipts.length, 2);
  assert.equal(second.receipts[0].paidNow, 7_000);
  assert.equal(second.receipts[0].deferred, 3_000);
  assert.equal(operatorView(ledger, "op-1").earnings, 7_000);
  assert.equal(ledger.budget.assets, 40_000 - 14_000);
  assert.ok(ledger.budget.assets >= ledger.budget.liabilities);
  check(ledger);
  // 尾款到期才放
  assert.equal(
    releaseDeferred(ledger, { taskId: "t0", tick: 4 + LP.deferTicks - 1 }),
    0,
  );
  assert.throws(() => closeTask(ledger, { taskId: "t0" }), /尾款/);
  assert.equal(
    releaseDeferred(ledger, { taskId: "t0", tick: 4 + LP.deferTicks }),
    6_000,
  );
  assert.equal(operatorView(ledger, "op-2").earnings, 10_000);
  // 关任务：预留 31_500 − 已付 20_000 = 11_500 回到 F（含判负副本的钱与复核 / 存储费）
  const refund = closeTask(ledger, { taskId: "t0" });
  assert.equal(refund, 11_500);
  assert.equal(ledger.budget.liabilities, 0);
  assert.equal(ledger.budget.assets, 20_000);
  check(ledger);
  // 运营方信誉随 (operatorId) 记，不随任务走
  assert.equal(operatorView(ledger, "op-3").record.lost, 1);
  assert.equal(operatorView(ledger, "op-1").record.replicated, 1);
});

test("座位锁：不生息、折扣硬顶、冷却后解锁；守恒", () => {
  const ledger = createSegmentLedger();
  lockSeat(ledger, { ownerId: "alice", amount: 250_000, tick: 0 });
  assert.equal(seatDiscountBps(ledger, "alice"), 2);
  lockSeat(ledger, { ownerId: "alice", amount: 500_000_000, tick: 0 });
  assert.equal(seatDiscountBps(ledger, "alice"), LP.seatDiscountCapBps, "硬顶");
  assert.throws(
    () => unlockSeat(ledger, { ownerId: "alice", tick: 1 }),
    /beginUnlockSeat/,
  );
  beginUnlockSeat(ledger, { ownerId: "alice", tick: 1 });
  assert.equal(seatDiscountBps(ledger, "alice"), 0, "解锁中无折扣");
  assert.throws(
    () => unlockSeat(ledger, { ownerId: "alice", tick: LP.seatCooldownTicks }),
    /冷却/,
  );
  assert.equal(
    unlockSeat(ledger, { ownerId: "alice", tick: 1 + LP.seatCooldownTicks }),
    500_250_000,
    "一分不多一分不少",
  );
  check(ledger);
});

test("快照往返逐位一致；视图带不变量；M0 候选 schema 以 additional 方式挂进注册表而不改 schemas.mjs", async () => {
  const graph = fixture();
  const ledger = createSegmentLedger();
  registerOperator(ledger, { operatorId: "op-a", bond: LP.minBond, tick: 0 });
  refuel(ledger, { lifeId: "life-9", amount: 20_000, kind: "OWNER" });
  bindRunner(ledger, {
    lifeId: "life-9",
    operatorId: "op-a",
    feePerSegment: 5_000,
  });
  const { traj } = await committed(graph, ledger, {
    segmentId: "z1",
    lifeId: "life-9",
    tick: 2,
  });
  const saved = saveSegmentLedger(ledger);
  const restored = restoreSegmentLedger(saved);
  assert.deepEqual(saveSegmentLedger(restored), saved);
  const view = segmentLedgerView(restored);
  assert.equal(view.audit, "SIM");
  assert.equal(view.policy, `${LP.id}@${LP.version}`);
  assert.ok(view.invariants.ok);
  assert.equal(view.segments.length, 1);
  // 候选 schema：不进 FLYSWARM_SCHEMAS，靠 createSchemas(additional) 挂载
  const schemas = createSchemas([...PROOF_SCHEMAS, ...LEDGER_SCHEMAS]);
  assert.ok(
    schemas.has("iff.segment", "1") &&
      schemas.has("iff.trajectory-leaf", "1") &&
      schemas.has("iff.segment-receipt", "1") &&
      schemas.has("iff.segment-commitment", "1"),
  );
  validateRecord(schemas, restored.segments.get("z1"));
  validateRecord(schemas, commitmentOf(traj));
  validateRecord(schemas, {
    schema: "iff.trajectory-leaf/1",
    audit: "SIM",
    position: 1,
    stateRoot: traj.finalRoot,
  });
  assert.throws(
    () =>
      validateRecord(schemas, {
        ...restored.segments.get("z1"),
        fuel: { fromOwner: 1, fromGift: 1 },
      }),
    /预留拆分/,
  );
  assert.throws(
    () =>
      validateRecord(schemas, {
        schema: "iff.segment-receipt/1",
        audit: "SIM",
        segmentId: "z1",
        track: "PRIVATE",
        operatorId: "op-a",
        steps: 1,
        root: ROOT,
        finalRoot: ROOT,
        wage: 10,
        paidNow: 7,
        deferred: 2,
        settledAt: 0,
      }),
    /即付 \+ 延迟/,
  );
  // 现有注册表不受影响
  assert.equal(createSchemas().has("iff.segment", "1"), false);
  assert.equal(SEGMENT_POLICY.maxSteps, 1000);
});
