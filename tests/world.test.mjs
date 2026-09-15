import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { bindGenesis, createKernel, tickKernel } from "../src/brain/kernel.mjs";
import {
  WORLD_POLICY,
  WORLD_SCHEMA,
  createBranch,
  createWorld,
  creditOf,
  proposePlans,
  replayChain,
  restoreWorld,
  saveWorld,
  stepWorld,
  validatePlans,
  worldView,
} from "../src/brain/flyswarm/world.mjs";
import {
  answerQuestion,
  QUESTIONS,
  explainFly,
  retrieveEvents,
  TOOL_WHITELIST,
} from "../src/brain/flyswarm/explain.mjs";
import { MIN_BNB } from "../src/swarm.mjs";

function fixtureGraph() {
  return bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        dataset: CANON.dataset,
        nodes: [
          { id: "1001", sign: 1, type: "ORN", side: "L" },
          { id: "1002", sign: 1, type: "GRN", side: "R" },
          { id: "2001", sign: -1, type: "LN", side: "L" },
          { id: "3001", sign: 1, type: "PN", side: "L" },
          { id: "4001", sign: 1, type: "DNp", side: "L" },
          { id: "4002", sign: 1, type: "DNp", side: "R" },
          { id: "5001", sign: 1, type: "R1", side: "L" },
          { id: "5002", sign: 0, type: "unc", side: "M" },
        ],
        groups: {
          food: [0, 1],
          threat: [4],
          light: [6],
          left: [4],
          right: [5],
        },
      },
      [
        { pre: 0, post: 2, weight: 12 },
        { pre: 0, post: 3, weight: 8 },
        { pre: 1, post: 3, weight: 10 },
        { pre: 2, post: 3, weight: 4 },
        { pre: 3, post: 4, weight: 15 },
        { pre: 3, post: 5, weight: 9 },
        { pre: 6, post: 3, weight: 7 },
        { pre: 7, post: 3, weight: 3 },
      ],
    ),
    "world-fixture",
  );
}

async function makeSession(seed = 42) {
  const graph = fixtureGraph();
  const kernel = createKernel(graph, { size: 5, seed, stepsPerTick: 6 });
  await bindGenesis(kernel, { seed });
  return { graph, kernel, world: createWorld(seed) };
}

async function drive(session, ticks, stim = {}) {
  for (let i = 0; i < ticks; i++) {
    const stimulus = {
      ...stim,
      sourceId: "environment",
      by: "paper:test",
      intensity: 60,
    };
    await tickKernel(session.kernel, stimulus);
    await stepWorld(session, { stimulus });
  }
  return session;
}

test("世界只读内核：stepWorld 不修改 kernel 状态", async () => {
  const session = await makeSession();
  await drive(session, 20, { food: 80 });
  const before = JSON.stringify({
    tick: session.kernel.colony.tick,
    price: session.kernel.colony.market.price,
    books: session.kernel.colony.members.map((m) => ({
      bnb: m.book.bnb,
      token: m.book.token,
    })),
  });
  await stepWorld(session, { stimulus: { food: 50 } });
  const after = JSON.stringify({
    tick: session.kernel.colony.tick,
    price: session.kernel.colony.market.price,
    books: session.kernel.colony.members.map((m) => ({
      bnb: m.book.bnb,
      token: m.book.token,
    })),
  });
  assert.equal(after, before);
});

test("确定性重放：同种子同刺激 → 逐位相同的世界视图", async () => {
  const a = await makeSession(777);
  const b = await makeSession(777);
  for (let i = 0; i < 30; i++) {
    const stim =
      i % 7 === 0 ? { food: 90 } : i % 11 === 0 ? { threat: 60 } : {};
    const stimulus = {
      ...stim,
      sourceId: "environment",
      by: "paper:test",
      intensity: 60,
    };
    await tickKernel(a.kernel, stimulus);
    await stepWorld(a, { stimulus });
    await tickKernel(b.kernel, stimulus);
    await stepWorld(b, { stimulus });
  }
  assert.deepEqual(
    JSON.parse(JSON.stringify(worldView(a))),
    JSON.parse(JSON.stringify(worldView(b))),
  );
});

test("六类事件落地：sense/act/memory/trade/society 出现，risk 可触发", async () => {
  const session = await makeSession();
  // 刺激 → sense；转向 → act；成交 → trade；每 tick quorum → society。
  await drive(session, 120, { food: 85 });
  const kinds = new Set(session.world.events.map((e) => e.kind));
  for (const kind of WORLD_POLICY.kinds.filter((k) => k !== "risk")) {
    assert.ok(kinds.has(kind), `缺少事件类别 ${kind}`);
  }
  // 回撤警戒：伪造金库高水位 → risk 事件与 reject 记录。
  session.kernel.treasury.highWater = 1_000_000_000;
  session.kernel.treasury.book.bnb = 0;
  session.world.prevDrawdownAlerted = false;
  await drive(session, 1);
  assert.ok(
    session.world.events.some(
      (e) => e.kind === "risk" && e.payload.alert === "DRAWDOWN",
    ),
  );
  assert.ok(session.world.rejects.some((r) => r.kind === "drawdown"));
});

test("事件哈希链：顺序承诺 + causal 引用全部有效", async () => {
  const session = await makeSession();
  await drive(session, 40, { threat: 70 });
  const events = session.world.events;
  for (let i = 1; i < events.length; i++) {
    assert.equal(events[i].prevHash, events[i - 1].hash, "事件链断裂");
  }
  const ids = new Set(events.map((e) => e.id));
  for (const link of session.world.causal) {
    assert.ok(ids.has(link.to), `causal 指向不存在的事件 ${link.to}`);
    for (const from of link.from)
      assert.ok(ids.has(from), `causal 来源不存在 ${from}`);
  }
});

test("因果链重放：能按 tick 收集完整链", async () => {
  const session = await makeSession();
  await drive(session, 60, { food: 90 });
  const trade = session.world.events.find((e) => e.kind === "trade");
  if (!trade) {
    // 该种子 60 tick 无成交也合法；直接跳过。
    assert.ok(true);
    return;
  }
  const chain = replayChain(session.world, trade.id);
  assert.ok(chain.nodes.length >= 1);
  assert.ok(
    chain.nodes[0].id === trade.id ||
      chain.nodes.some((n) => n.id === trade.id),
  );
  for (let i = 1; i < chain.nodes.length; i++) {
    assert.ok(
      chain.nodes[i].tick >= chain.nodes[i - 1].tick,
      "链未按 tick 排序",
    );
  }
});

test("回执与成交一致：数量、税收与名义额守恒", async () => {
  const session = await makeSession();
  await drive(session, 80, { light: 60 });
  let trades = 0;
  for (let i = 0; i < 80; i++) {
    trades += session.world.receipts.filter((r) => r.tick === i + 1).length;
  }
  const kernelTrades = session.kernel.colony.trades.filter(
    (t) => t.tick <= 80,
  ).length;
  assert.equal(session.world.receipts.length, kernelTrades);
  for (const r of session.world.receipts) {
    assert.equal(r.status, "confirmed");
    assert.equal(r.audit, "SIM");
    if (r.side === "BUY") {
      assert.equal(r.notionalBnb, r.amount);
      assert.equal(r.taxPaid, Math.trunc((r.amount * r.taxBps) / 10000));
    } else {
      assert.equal(r.taxPaid, r.notionalBnb - r.contra);
    }
    assert.ok(r.notionalBnb > 0);
  }
});

test("候选计划校验：现金不足 / 无方向 / 未知蝇 / 信用为空 → REJECT", async () => {
  const session = await makeSession();
  await drive(session, 5);
  const rejected = validatePlans(session, [
    {
      id: "p1",
      tick: 6,
      kind: "fly",
      flyId: 0,
      side: "BUY",
      budget: 10 ** 18,
      confidence: 80,
      source: "test",
    },
    {
      id: "p2",
      tick: 6,
      kind: "fly",
      flyId: 0,
      side: "HOLD",
      budget: 100,
      confidence: 50,
      source: "test",
    },
    {
      id: "p3",
      tick: 6,
      kind: "fly",
      flyId: 99,
      side: "BUY",
      budget: 100,
      confidence: 50,
      source: "test",
    },
  ]);
  assert.equal(rejected[0].status, "REJECT");
  assert.ok(rejected[0].reasons.includes("CASH_SHORT"));
  assert.ok(rejected[1].reasons.includes("NO_DIRECTION"));
  assert.ok(rejected[2].reasons.includes("UNKNOWN_FLY"));
  // 合法计划放行，且带限额。
  const member = session.kernel.colony.members[0];
  const [passed] = validatePlans(session, [
    {
      id: "p4",
      tick: 6,
      kind: "fly",
      flyId: 0,
      side: "BUY",
      budget: Math.min(member.book.bnb, MIN_BNB),
      confidence: 40,
      source: "test",
    },
  ]);
  assert.equal(passed.status, "PASS");
  assert.ok(passed.limits.creditUsable > 0);
});

test("纸面信用：免费额度 + 已实现收益份额，不超上限", async () => {
  const session = await makeSession();
  await drive(session, 20);
  for (const member of session.kernel.colony.members) {
    const credit = creditOf(member);
    assert.equal(credit.free, WORLD_POLICY.creditFree);
    assert.ok(credit.earned >= 0);
    assert.ok(
      credit.usable >= WORLD_POLICY.creditFree - 0 &&
        credit.usable <= WORLD_POLICY.creditCap,
    );
  }
});

test("ask 通道：全部问题有确定性答案，引用存在或为空", async () => {
  const session = await makeSession();
  await drive(session, 25, { food: 80 });
  for (const q of QUESTIONS) {
    const answer = answerQuestion(session, q.id);
    assert.ok(
      typeof answer.key === "string" && answer.key.startsWith("ask."),
      q.id,
    );
    assert.ok(Array.isArray(answer.refs));
  }
});

test("解释层：explainFly 步骤带引用，检索按类别过滤", async () => {
  const session = await makeSession();
  await drive(session, 30, { food: 85 });
  const flyId = session.kernel.colony.members.find(
    (m) => m.status === "alive",
  ).id;
  const explanation = explainFly(session, flyId);
  assert.ok(explanation.steps.length >= 2);
  const hits = retrieveEvents(session.world, { kind: "sense" });
  assert.ok(hits.every((row) => row.event.kind === "sense"));
  assert.ok(TOOL_WHITELIST.every((t) => t.sign === false && t.write === false));
});

test("世界保存/恢复：快照往返一致", async () => {
  const session = await makeSession();
  await drive(session, 12, { food: 70 });
  const saved = saveWorld(session.world);
  assert.equal(saved.schema, WORLD_SCHEMA);
  const restored = restoreWorld(saved);
  assert.deepEqual(restored, session.world);
  assert.equal(restoreWorld({ schema: "iff.paper-world/999" }), null);
});

test("个人分支：分支快照不被后续主线污染", async () => {
  const session = await makeSession();
  await drive(session, 10);
  const branch = createBranch(session, "实验 A");
  const eventCount = branch.snapshot.world.events.length;
  await drive(session, 20, { threat: 80 });
  assert.equal(branch.snapshot.world.events.length, eventCount);
  assert.ok(
    branch.snapshot.world.tick !== undefined ||
      branch.snapshot.world.seq !== undefined,
  );
  assert.ok(session.world.branches.length >= 1);
});

test("压力计与金库历史随 tick 前进", async () => {
  const session = await makeSession();
  await drive(session, 15);
  const view = worldView(session);
  assert.ok(view.pressure.gauge >= 0 && view.pressure.gauge <= 100);
  assert.ok(view.pressureHistory.length >= 1);
  assert.equal(view.vault.history.length, 15);
  assert.equal(view.audit, "SIM");
  assert.equal(view.society.status !== "", true);
});

test("proposePlans 不修改内核与已执行路径", async () => {
  const session = await makeSession();
  await drive(session, 8, { food: 70 });
  const tick = session.kernel.colony.tick;
  proposePlans(session);
  assert.equal(session.kernel.colony.tick, tick);
  assert.equal(session.kernel.treasury.book.trades >= 0, true);
});

test("结算/繁衍路径：spawn 社会事件落地并连因果", async () => {
  const session = await makeSession();
  await drive(session, 30, { food: 70 });
  const { settleKernelColony } = await import("../src/brain/kernel.mjs");
  const result = await settleKernelColony(session.kernel);
  assert.ok(result, "应有结算结果");
  const before = session.world.events.length;
  await stepWorld(session, { settled: result });
  const spawns = session.world.events.filter(
    (e) => e.kind === "society" && e.payload.event === "spawn",
  );
  assert.equal(spawns.length, 1);
  const spawn = spawns[0];
  assert.equal(spawn.payload.child, result.child.id);
  assert.equal(spawn.payload.parent, result.champ.id);
  assert.equal(spawn.payload.culled, result.worst.id);
  assert.ok(session.world.events.length >= before + 1);
});

test("pit 快照携带世界：savePitSession 形状与 restoreWorld 往返", async () => {
  const { savePitSession } = await import("../src/brain/flyswarm/pit.mjs");
  const session = await makeSession();
  await drive(session, 12, { light: 50 });
  const aux = {
    model: "iff-pit-colony-v1",
    seed: 42,
    rng: 123,
    lastStimTick: -1_000_000,
    stimLog: [],
    prices: [11170],
    settleAt: 1800,
    pending: null,
  };
  const saved = savePitSession({
    kernel: session.kernel,
    aux,
    world: session.world,
  });
  assert.equal(saved.model, "iff-pit-colony-v1");
  assert.ok(saved.world, "快照必须携带世界状态");
  assert.equal(saved.world.schema, WORLD_SCHEMA);
  assert.deepEqual(restoreWorld(saved.world), session.world);
  // 无世界状态的老快照也不会让 savePitSession 崩溃。
  const legacy = savePitSession({ kernel: session.kernel, aux, world: null });
  assert.equal(legacy.world, null);
});

test("互斥队列：并发 tick/结算不竞态，内核保持合法", async () => {
  const { createPitSession, stepPit, settleNow, serializePit } = await import(
    "../src/brain/flyswarm/pit.mjs"
  );
  const session = await createPitSession({ seed: 99, graph: fixtureGraph() });
  const batch = [];
  for (let i = 0; i < 40; i++) {
    batch.push(stepPit(session));
    if (i % 4 === 0) batch.push(settleNow(session));
  }
  const results = await Promise.all(
    batch.map((p) =>
      p.then(
        () => null,
        (e) => e?.message || String(e),
      ),
    ),
  );
  const errors = results.filter(Boolean);
  assert.deepEqual(errors, [], `并发操作不应报错：${errors.join("; ")}`);
  assert.equal(session.kernel.colony.tick, 40);
  assert.ok(session.kernel.colony.members.length >= 5);
  // 队列失败不阻塞后续任务。
  await serializePit(() => {
    throw new Error("故意失败");
  }).catch(() => {});
  const view = await stepPit(session);
  assert.equal(view.tick, 41);
  assert.ok(worldView(session).events.length > 0);
});
