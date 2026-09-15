import test from "node:test";
import assert from "node:assert/strict";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { hash, canonical, ZERO_HASH } from "../src/brain/codec.mjs";
import {
  createSchemas,
  validateRecord,
  FLYSWARM_SCHEMAS,
} from "../src/brain/flyswarm/schemas.mjs";
import {
  buildGenesis,
  genesisIdOf,
  verifyGenesis,
  sameGenesis,
} from "../src/brain/flyswarm/genesis.mjs";
import {
  createRoster,
  utteranceWeight,
  FLYSWARM_POLICY,
} from "../src/brain/flyswarm/membership.mjs";
import { createLog, replayEntries, sameEntries } from "../src/brain/flyswarm/log.mjs";
import { createQuorums, QUORUM_CONFIDENCE_HOLD } from "../src/brain/flyswarm/quorum.mjs";
import { bindGenesis, createKernel, kernelSnapshot, settleKernelColony, tickKernel } from "../src/brain/kernel.mjs";

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
        groups: { food: [0, 1], threat: [4], light: [6], left: [4], right: [5] },
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
    "flyswarm-fixture",
  );
}

function utterance(partial) {
  return {
    schema: "iff.utterance/1",
    audit: "SIM",
    soulId: "soul-a",
    runnerPub: "paper:a",
    tick: 1,
    sequence: 1,
    dataset: CANON.dataset,
    ethology: { schema: "iff.ethology/1", action: "FORAGE", food: 1, threat: 0, light: 0, left: 1, right: 0 },
    side: "BUY",
    confidence: 25,
    prevHash: ZERO_HASH,
    ...partial,
  };
}

// ─── schema 层：语言法只增不改，未知消息大声拒绝 ───

test("schema registry validates known records and rejects unknown schemas loudly", () => {
  const schemas = createSchemas();
  assert.equal(FLYSWARM_SCHEMAS.length, 7);
  const ok = utterance();
  assert.equal(validateRecord(schemas, ok), ok);
  assert.throws(() => validateRecord(schemas, { ...ok, schema: "iff.mindread/1" }), /未登记/);
  assert.throws(() => validateRecord(schemas, { ...ok, confidence: 999 }), /超出范围/);
  assert.throws(() => validateRecord(schemas, { ...ok, audit: "MAINNET-ISH" }), /audit/);
  assert.throws(() => validateRecord(schemas, { ...ok, prevHash: "0xzz" }), /十六进制/);
});

test("schema layer freezes existing records: adding a type never rewrites old ones", () => {
  const schemas = createSchemas();
  const before = schemas.get("iff.utterance", "1");
  schemas.register({ id: "iff.utterance", version: "2", title: "v2", validate: () => {} });
  assert.equal(schemas.get("iff.utterance", "1"), before);
  assert.ok(schemas.has("iff.utterance", "2"));
});

// ─── Genesis：创世可复制的可验证一半 ───

test("genesisId is a canonical digest: same mother, same id; tamper is rejected", async () => {
  const graph = fixtureGraph();
  const overlayHash = await hash({ schema: "iff.overlay/1", food: 100, threat: 100, light: 100 });
  const genesis = await buildGenesis({ graph, overlayHash, seed: 42 });
  const id = await genesisIdOf(genesis);
  assert.match(id, /^0x[0-9a-f]{64}$/);
  await verifyGenesis(genesis, id); // 不抛 = 通过
  const copy = structuredClone(genesis);
  assert.ok(sameGenesis(genesis, copy));
  copy.graphHash = "0x" + "9".repeat(64);
  await assert.rejects(() => verifyGenesis(copy, id), /不一致/);
});

// ─── 名册：重放免费，声音付费 ───

test("roster enforces one-pub-one-soul for bonded, keeps retired souls forever", () => {
  const roster = createRoster();
  roster.register({ soulId: "s1", runnerPub: "paper:alice", tier: "bonded", tick: 0 });
  assert.throws(() => roster.register({ soulId: "s2", runnerPub: "paper:alice", tier: "bonded", tick: 0 }), /已持有 bonded/);
  roster.register({ soulId: "g1", runnerPub: "paper:bob", tier: "guest", tick: 0 });
  roster.retire("s1", 10);
  assert.equal(roster.get("s1").status, "retired");
  assert.equal(roster.snapshot().length, 2); // 灵魂不删
  roster.reinstate("s1", 20);
  assert.equal(roster.get("s1").status, "active");
  assert.throws(() => roster.retire("ghost", 5), /不在册/);
});

test("vote weight: guest listens for free, bonded pays with capped confidence", () => {
  const roster = createRoster();
  roster.register({ soulId: "g", runnerPub: "paper:g", tier: "guest", tick: 0 });
  roster.register({ soulId: "b", runnerPub: "paper:b", tier: "bonded", tick: 0 });
  assert.equal(utteranceWeight(roster, utterance({ soulId: "g", confidence: 100 })), 0);
  assert.equal(utteranceWeight(roster, utterance({ soulId: "b", confidence: 100 })), FLYSWARM_POLICY.voteCapPerUtterance);
  assert.equal(utteranceWeight(roster, utterance({ soulId: "b", confidence: 60 })), 25); // 封顶
});

// ─── 日志：era 分片全序账本 ───

test("log rejects out-of-order ticks and duplicate sequences within a tick", () => {
  const log = createLog({ eraTicks: 10 });
  log.append(utterance({ tick: 5, sequence: 1 }));
  log.append(utterance({ tick: 5, sequence: 2 }));
  assert.throws(() => log.append(utterance({ tick: 4, sequence: 3 })), /乱序/);
  assert.throws(() => log.append(utterance({ tick: 5, sequence: 2 })), /递增/);
  assert.throws(() => log.append({ tick: 5 }), /递增/);
});

test("era sealing chains roots: history is a hash chain, shards archive independently", async () => {
  const log = createLog({ eraTicks: 10 });
  for (let tick = 0; tick <= 10; tick++) log.append(utterance({ tick, sequence: tick + 1 }));
  const first = await log.sealEra();
  assert.equal(first.count, 11);
  assert.equal(first.prevRoot, ZERO_HASH);
  log.append(utterance({ tick: 11, sequence: 1 }));
  log.append(utterance({ tick: 12, sequence: 2 }));
  const second = await log.sealEra();
  assert.equal(second.prevRoot, first.root);
  assert.notEqual(second.root, first.root);
  assert.equal(log.snapshot().sealed.length, 2);
});

test("log importArchive restores sealed + current entries and can continue", async () => {
  const log = createLog({ eraTicks: 10 });
  for (let tick = 0; tick <= 10; tick++) log.append(utterance({ tick, sequence: tick + 1 }));
  await log.sealEra();
  log.append(utterance({ tick: 11, sequence: 1 }));
  const snap = log.snapshot();
  const all = log.allEntries();
  const replayed = createLog({ eraTicks: 10 });
  replayed.importArchive({ entries: all, sealed: snap.sealed });
  assert.ok(sameEntries(replayed.allEntries(), all));
  assert.equal(replayed.snapshot().sealed.length, 1);
  assert.equal(replayed.snapshot().currentCount, 1);
  replayed.append(utterance({ tick: 12, sequence: 2 }));
  assert.equal(replayed.allEntries().length, all.length + 1);
});

test("replay is a pure function: same entries, same reduce, bit-identical result", () => {
  const entries = [1, 2, 3, 4].map((n) => ({ n }));
  const reduce = (acc, e) => acc + e.n;
  assert.equal(replayEntries(entries, reduce, 0), 10);
  assert.ok(sameEntries(entries, structuredClone(entries)));
});

// ─── quorum：三个验收向量 ───

test("vector 1 — split gate: buy and sell both over 35% force HOLD and record dissents", () => {
  const roster = createRoster();
  const q = createQuorums().require("confidence-hold", "1");
  const souls = ["a", "b", "c", "d"];
  souls.forEach((s, i) => roster.register({ soulId: s, runnerPub: `paper:${s}`, tier: "bonded", tick: 0 }));
  const votes = [
    utterance({ soulId: "a", runnerPub: "paper:a", side: "BUY", confidence: 25, sequence: 1 }),
    utterance({ soulId: "b", runnerPub: "paper:b", side: "BUY", confidence: 25, sequence: 2 }),
    utterance({ soulId: "c", runnerPub: "paper:c", side: "SELL", confidence: 25, sequence: 3 }),
    utterance({ soulId: "d", runnerPub: "paper:d", side: "SELL", confidence: 25, sequence: 4 }),
  ];
  const result = q.run({ roster, utterances: votes, tick: 1 });
  assert.equal(result.side, "HOLD");
  assert.equal(result.split, true);
  assert.equal(result.buyWeight, 50);
  assert.equal(result.sellWeight, 50);
  assert.equal(result.dissents.length, 4); // 分裂时全部记入反对票
});

test("vector 2 — same inputs replay bit-identically on any machine", () => {
  const buildRoster = () => {
    const roster = createRoster();
    ["a", "b", "c"].forEach((s) => roster.register({ soulId: s, runnerPub: `paper:${s}`, tier: "bonded", tick: 0 }));
    return roster;
  };
  const votes = [
    utterance({ soulId: "a", runnerPub: "paper:a", side: "BUY", confidence: 40, sequence: 1 }),
    utterance({ soulId: "b", runnerPub: "paper:b", side: "SELL", confidence: 12, sequence: 2 }),
    utterance({ soulId: "c", runnerPub: "paper:c", side: "BUY", confidence: 8, sequence: 3 }),
  ];
  const q = createQuorums().require("confidence-hold", "1");
  const one = q.run({ roster: buildRoster(), utterances: votes, tick: 1 });
  const two = q.run({ roster: buildRoster(), utterances: structuredClone(votes), tick: 1 });
  assert.equal(canonical(one), canonical(two));
  assert.equal(one.side, "BUY");
  assert.equal(one.buyWeight, 33); // 25（封顶）+ 8
  assert.equal(one.dissents.length, 1);
});

test("vector 3 — guest brains cannot move the hive or write official body ids", () => {
  const roster = createRoster();
  roster.register({ soulId: "b", runnerPub: "paper:b", tier: "bonded", tick: 0 });
  roster.register({ soulId: "g", runnerPub: "paper:g", tier: "guest", tick: 0 });
  const q = createQuorums().require("confidence-hold", "1");
  // 客脑带非官方 dataset：根本不算票
  const foreign = utterance({ soulId: "g", dataset: "other-brain:v9", side: "SELL", confidence: 100, sequence: 1 });
  // 客脑带官方 dataset：算在册旁听，权重 0
  const listening = utterance({ soulId: "g", side: "SELL", confidence: 100, sequence: 2 });
  const member = utterance({ soulId: "b", side: "BUY", confidence: 20, sequence: 3 });
  const result = q.run({ roster, utterances: [foreign, listening, member], tick: 1 });
  assert.equal(result.side, "BUY");
  assert.equal(result.sellWeight, 0);
  assert.equal(result.totalWeight, 20);
  // 客脑话语依然进日志（可重放），但不能冒充官方 body
  const schemas = createSchemas();
  assert.throws(() => validateRecord(schemas, { ...member, dataset: "other-brain:v9" }), /UTTERANCE_DATASET/);
});

test("quorum: no votes or zero-confidence abstentions hold without weight", () => {
  const roster = createRoster();
  roster.register({ soulId: "a", runnerPub: "paper:a", tier: "bonded", tick: 0 });
  const q = createQuorums().require("confidence-hold", "1");
  const quiet = q.run({ roster, utterances: [utterance({ soulId: "a", side: "HOLD", confidence: 0 })], tick: 1 });
  assert.equal(quiet.side, "HOLD");
  assert.equal(quiet.totalWeight, 0);
});

// ─── 内核集成：话语 → 记忆 → 聚合 → 蜂巢，逐位可重放 ───

test("two kernels with the same genesis and stimuli replay the flyswarm log bit-identically", async () => {
  const mk = () => createKernel(fixtureGraph(), { size: 3, seed: 21, stepsPerTick: 4 });
  const a = mk();
  const b = mk();
  const { genesisId } = await bindGenesis(a, { seed: 21 });
  await bindGenesis(b, { seed: 21 });
  assert.ok(a.flyswarm.genesisId === b.flyswarm.genesisId && a.flyswarm.genesisId === genesisId);
  const stimuli = [
    { food: 700, threat: 60, light: 200, changeBps: 40 },
    { food: 40, threat: 640, light: 40, changeBps: -90 },
    { food: 300, threat: 200, light: 100, changeBps: 10 },
  ];
  for (const s of stimuli) {
    await tickKernel(a, s);
    await tickKernel(b, s);
  }
  const sa = kernelSnapshot(a).flyswarm;
  const sb = kernelSnapshot(b).flyswarm;
  assert.equal(canonical(sa.lastQuorum), canonical(sb.lastQuorum));
  assert.equal(canonical(a.flyswarm.log.windowEntries(1)), canonical(b.flyswarm.log.windowEntries(1)));
  assert.equal(sa.lastQuorum.schema, "iff.quorum/1");
  assert.equal(sa.roster.length, 3);
  // 感觉注入进日志且带来源
  const senses = a.flyswarm.log.windowEntries(1).filter((e) => e.schema === "iff.sense/1");
  assert.equal(senses.length, 3);
  assert.equal(senses[0].sourceId, "environment");
});

test("memories are written every policy interval and carry replayable roots", async () => {
  const kernel = createKernel(fixtureGraph(), { size: 2, seed: 7, stepsPerTick: 2 });
  await bindGenesis(kernel, { seed: 7 });
  const every = kernel.flyswarm.policy.memoryEveryTicks;
  for (let i = 0; i < every; i++) await tickKernel(kernel, { food: 100 + (i % 7) * 50, threat: 30, light: 80, changeBps: (i % 5) * 6 - 12 });
  const memories = kernel.flyswarm.log.windowEntries(every).filter((e) => e.schema === "iff.experience/1");
  assert.equal(memories.length, 2);
  for (const m of memories) {
    assert.match(m.checkpointHash, /^0x[0-9a-f]{64}$/);
    assert.equal(m.eventRoot, kernel.colony.members.find((x) => x.session.state.soulId === m.soulId).session.state.historyRoot);
  }
});

test("hive book trades on the quorum side, never on an individual's whim", async () => {
  const kernel = createKernel(fixtureGraph(), { size: 3, seed: 21, stepsPerTick: 4 });
  await bindGenesis(kernel, { seed: 21 });
  for (let i = 0; i < 5; i++) await tickKernel(kernel, { food: 800, threat: 20, light: 150, changeBps: 60 });
  const hive = kernel.colony.trades.find((t) => t.flyId === "hive");
  const q = kernel.flyswarm.lastQuorum;
  if (hive) {
    assert.equal(hive.quorumSide, q.side);
    assert.ok(["BUY", "SELL", "HOLD"].includes(hive.side));
  }
  assert.equal(q.schema, "iff.quorum/1");
  assert.ok(q.totalWeight >= 0);
});

test("settlement retires the weakest soul without deleting it, and spawns from the champion checkpoint", async () => {
  const kernel = createKernel(fixtureGraph(), { size: 3, seed: 9, stepsPerTick: 3 });
  await bindGenesis(kernel, { seed: 9 });
  for (let i = 0; i < 4; i++) await tickKernel(kernel, { food: 500, threat: 100, light: 60, changeBps: 20 });
  const aliveBefore = kernel.colony.members.filter((m) => m.status === "alive").length;
  const result = await settleKernelColony(kernel);
  assert.ok(result);
  // 一退一增，活口数不变；退役是状态不是删除
  assert.equal(kernel.colony.members.filter((m) => m.status === "alive").length, aliveBefore);
  assert.equal(result.worst.status, "retired");
  assert.equal(kernel.flyswarm.roster.get(result.worst.session.state.soulId).status, "retired");
  assert.equal(kernel.flyswarm.roster.get(result.worst.session.state.soulId).retiredTick, kernel.colony.tick);
  // 子代：亲本检查点分叉，世代 +1，overlay 向中性回拉一半，账本全新
  assert.equal(result.child.gen, result.champ.gen + 1);
  assert.equal(result.child.parent, result.champ.id);
  assert.equal(result.child.overlay.food, Math.round((result.champ.overlay.food + 100) / 2));
  assert.equal(result.child.overlay.threat, Math.round((result.champ.overlay.threat + 100) / 2));
  assert.equal(result.child.book.realized, 0);
  // 繁殖是协议事件：血统 + iff.spawn/1 进日志，名册同步
  assert.equal(kernel.colony.lineage[0].child, result.child.id);
  const spawns = kernel.flyswarm.log.windowEntries(kernel.colony.tick).filter((e) => e.schema === "iff.spawn/1");
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].childSoul, result.child.session.state.soulId);
  assert.equal(kernel.flyswarm.roster.get(result.child.session.state.soulId).tier, "bonded");
});
