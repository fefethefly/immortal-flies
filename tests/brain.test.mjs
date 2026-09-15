import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Interface } from "ethers";
import { prepareGraph } from "../src/brain/graph.mjs";
import { BrainError } from "../src/brain/codec.mjs";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { createState, step, reduceEvent, PROFILES } from "../src/brain/runtime.mjs";
import { BrainSession } from "../src/brain/session.mjs";
import { createAdapters, makeInput, validateInput } from "../src/brain/adapters.mjs";
import { proposeAction } from "../src/brain/policy.mjs";
import { createVaultPreview, inspectIntent } from "../src/brain/vault.mjs";
import { captureMarket } from "../src/brain/chain.mjs";
import { summarizeSignals } from "../src/brain/signals.mjs";

function circuit() {
  const nodes = [
    { id: "1001", sign: 1, type: "ORN", side: "L", position: [-0.4, 0.1, 0] },
    { id: "1002", sign: 1, type: "GRN", side: "R", position: [-0.3, 0.2, 0] },
    { id: "2001", sign: -1, type: "LN", side: "L", position: [0, 0, 0] },
    { id: "3001", sign: 1, type: "PN", side: "L", position: [0.1, 0.1, 0] },
    { id: "4001", sign: 1, type: "DNp", side: "L", position: [0.4, -0.2, 0] },
    { id: "4002", sign: 1, type: "DNp", side: "R", position: [0.5, -0.2, 0] },
    { id: "5001", sign: 1, type: "R1", side: "L", position: [-0.2, -0.4, 0] },
    { id: "5002", sign: 0, type: "unknown", side: "M", position: [0, -0.5, 0] },
  ];
  const graph = bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        nodes,
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
    "test-circuit",
  );
  return graph;
}

const now = 1_700_000_000_000;
const code = (err) => {
  assert.equal(err instanceof BrainError, true);
  return err.code;
};

test("same version, same inputs and the same starting state replay exactly", async () => {
  const graph = circuit();
  const live = new BrainSession(graph);
  await live.dispatch({ type: "input", frame: makeInput(live.state, "environment", { food: 800, threat: 120, light: 200 }, { now }), acceptedAt: now });
  await live.dispatch({ type: "step", count: 24 });
  await live.dispatch({ type: "input", frame: makeInput(live.state, "market", { changeBps: -400, activity: 220 }, { now: now + 10 }), acceptedAt: now + 10 });
  await live.dispatch({ type: "step", count: 16 });
  const proof = await live.prove();
  assert.equal(proof.equal, true);
  assert.equal(proof.events, 4);
  const clone = new BrainSession(graph);
  for (const event of live.events) await clone.dispatch(event);
  assert.deepEqual(clone.state, live.state);
});

test("a checkpoint mid-run resumes to the same result as an uninterrupted session", async () => {
  const graph = circuit();
  const continuous = new BrainSession(graph);
  const interrupted = new BrainSession(graph);
  const start = { type: "input", frame: makeInput(continuous.state, "environment", { food: 640, threat: 80, light: 310 }, { now }), acceptedAt: now };
  await continuous.dispatch(start);
  await interrupted.dispatch(start);
  await continuous.dispatch({ type: "step", count: 16 });
  await interrupted.dispatch({ type: "step", count: 16 });
  const archive = await interrupted.checkpoint();
  await continuous.dispatch({ type: "step", count: 32 });
  const restored = await BrainSession.restore(archive, graph);
  await restored.dispatch({ type: "step", count: 32 });
  assert.deepEqual(restored.state, continuous.state);
  assert.equal(restored.state.ticks, 48);
});

test("duplicate, expired, reordered and disabled inputs are rejected", async () => {
  const graph = circuit();
  const session = new BrainSession(graph);
  const frame = makeInput(session.state, "environment", { food: 10, threat: 10, light: 10 }, { now });
  await session.dispatch({ type: "input", frame, acceptedAt: now });
  await assert.rejects(() => session.dispatch({ type: "input", frame, acceptedAt: now }), (e) => code(e) === "INPUT_SEQUENCE");
  const late = makeInput(session.state, "environment", { food: 11, threat: 10, light: 10 }, { now: now + 10 });
  late.expiresAt = now + 11;
  await assert.rejects(() => session.dispatch({ type: "input", frame: late, acceptedAt: now + 20 }), (e) => code(e) === "INPUT_EXPIRED");
  const past = makeInput(session.state, "environment", { food: 12, threat: 10, light: 10 }, { now: now - 5 });
  await assert.rejects(() => session.dispatch({ type: "input", frame: past, acceptedAt: now + 30 }), (e) => code(e) === "INPUT_ORDER");
  await session.dispatch({ type: "source", sourceId: "market", enabled: false });
  assert.deepEqual(session.state.signal, { food: 0, threat: 0, light: 0 });
  const market = makeInput(session.state, "market", { changeBps: 100, activity: 10 }, { now: now + 40 });
  await assert.rejects(() => session.dispatch({ type: "input", frame: market, acceptedAt: now + 40 }), (e) => code(e) === "SOURCE_DISABLED");
  const env = makeInput(session.state, "environment", { food: 90, threat: 0, light: 0 }, { now: now + 40 });
  await session.dispatch({ type: "input", frame: env, acceptedAt: now + 40 });
  assert.equal(session.state.signal.food, 90);
});

test("a new adapter can be registered without changing soul identity", async () => {
  const graph = circuit();
  const adapters = createAdapters([
    { id: "wind", version: "1", title: "气流", normalize: (p) => ({ food: 0, threat: p.force, light: 0 }) },
  ]);
  const session = new BrainSession(graph, createState(graph), adapters);
  const soul = session.state.soulId;
  await session.dispatch({ type: "source", sourceId: "wind", enabled: true });
  await session.dispatch({
    type: "input",
    frame: makeInput(session.state, "wind", { force: 440 }, { now: now + 1 }),
    acceptedAt: now + 1,
  });
  assert.equal(session.state.soulId, soul);
  assert.equal(session.state.signal.threat, 440);
  assert.equal(session.state.branchId, "local");
});

test("model migration is journaled and remains replayable", async () => {
  const graph = circuit();
  const session = new BrainSession(graph);
  await session.dispatch({ type: "step", count: 8 });
  await session.dispatch({ type: "migration", from: "lif-integer/1", to: "lif-integer/2" });
  assert.equal(session.state.model, "lif-integer/2");
  assert.equal(session.state.migrationCount, 1);
  const proof = await session.prove();
  assert.equal(proof.equal, true);
  assert.ok(PROFILES["lif-integer/2"]);
});

test("tampered archives and dataset swaps are rejected", async () => {
  const graph = circuit();
  const session = new BrainSession(graph);
  await session.dispatch({ type: "step", count: 8 });
  const archive = await session.checkpoint();
  const broken = structuredClone(archive);
  broken.payload.state.ticks += 1;
  await assert.rejects(() => BrainSession.restore(broken, graph), (e) => code(e) === "ARCHIVE_HASH");
  const other = bindManifest(encodeGraph({
    schema: "iff.connectome/1",
    nodes: circuit().metadata.nodes,
    groups: circuit().metadata.groups,
  }, [{ pre: 0, post: 1, weight: 2 }]), "other");
  other.manifest.id = "other";
  await assert.rejects(() => BrainSession.restore(archive, other), (e) => code(e) === "ARCHIVE_DATASET");
});

test("Flap preview never executes and the same credential can be consumed once", async () => {
  const graph = circuit();
  const resting = createState(graph);
  await assert.rejects(() => proposeAction(resting, { checkpointHash: `0x${"ab".repeat(32)}`, chainId: 56 }), (e) => code(e) === "EXECUTION_DISABLED");
  const idle = await proposeAction(resting, { checkpointHash: `0x${"ab".repeat(32)}`, budgetWei: "100", perActionWei: "10", now });
  assert.equal(idle.action, "NO_ACTION");
  assert.equal(idle.mode, "simulation");
  assert.equal(idle.amountWei, "0");
  inspectIntent(idle);
  assert.equal("sendTransaction" in idle, false);
  const active = createState(graph);
  active.lastAction = "FORAGE";
  active.lastObservedAt = now;
  const funded = await proposeAction(active, {
    checkpointHash: `0x${"cd".repeat(32)}`,
    budgetWei: "100000000000000000",
    perActionWei: "1000000000000000",
    now,
    nonce: 3,
  });
  assert.equal(funded.action, "FUND_COMPUTE");
  const vault = createVaultPreview({ now: () => now + 10 });
  const first = vault.consume(funded);
  assert.equal(first.spent, true);
  assert.throws(() => vault.consume(funded), (e) => code(e) === "INTENT_REPLAY");
  const expired = { ...funded, expiresAt: now - 1, commitment: `0x${"ee".repeat(32)}` };
  assert.throws(() => vault.consume(expired, now), (e) => code(e) === "INTENT_EXPIRED");
  assert.throws(() => inspectIntent({ ...funded, to: "0x1", commitment: funded.commitment }), (e) => code(e) === "INTENT_SURFACE");
  assert.equal(vault.size, 1);
});

test("market capture stays read-only and rejects the wrong chain or a reorg", async () => {
  const iface = new Interface(["function getReserves() view returns (uint112,uint112,uint32)"]);
  const reserves = (x, y) => iface.encodeFunctionResult("getReserves", [x, y, 1]);
  const blocks = {
    0xd3: { hash: `0x${"aa".repeat(32)}`, timestamp: "0x1" },
    0xf1: { hash: `0x${"bb".repeat(32)}`, timestamp: "0x2" },
  };
  const provider = {
    async request({ method, params }) {
      if (method === "eth_chainId") return "0x38";
      if (method === "eth_blockNumber") return "0x100";
      if (method === "eth_getBlockByNumber") return blocks[Number(params[0])];
      if (method === "eth_call") return reserves(1000n, 2000n);
      throw new Error(method);
    },
  };
  const observation = await captureMarket(provider, "0x00000000000000000000000000000000000000ab");
  assert.equal(observation.provenance.kind, "chain-observation");
  assert.equal(observation.provenance.chainId, 56);
  assert.equal(observation.payload.changeBps, 0);
  const graph = circuit();
  const session = new BrainSession(graph);
  const frame = makeInput(session.state, "market", observation.payload, { now, provenance: observation.provenance });
  validateInput(frame, session.state, createAdapters(), now);
  await assert.rejects(
    () => captureMarket({ request: async () => "0x1" }, "0x00000000000000000000000000000000000000ab"),
    (e) => code(e) === "WRONG_CHAIN",
  );
  let flip = 0;
  const reorg = {
    async request({ method, params }) {
      if (method === "eth_chainId") return "0x38";
      if (method === "eth_blockNumber") return "0x100";
      if (method === "eth_getBlockByNumber") {
        if (Number(params[0]) === 0xf1 && ++flip > 1) return { hash: `0x${"cc".repeat(32)}`, timestamp: "0x2" };
        return blocks[Number(params[0])];
      }
      if (method === "eth_call") return reserves(1000n, 2100n);
      throw new Error(method);
    },
  };
  await assert.rejects(() => captureMarket(reorg, "0x00000000000000000000000000000000000000ab"), (e) => code(e) === "CHAIN_REORG");
});

test("official MaleCNS circuit keeps body IDs, hashes and required groups", async (t) => {
  const root = new URL("../public/data/malecns-circuit/", import.meta.url);
  if (!existsSync(new URL("manifest.json", root))) {
    t.skip("run npm run connectome:prepare first");
    return;
  }
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  const meta = await readFile(new URL(manifest.metadata.path, root));
  const binary = await readFile(new URL(manifest.connectivity.path, root));
  assert.equal(manifest.schema, "iff.dataset/1");
  assert.equal(manifest.dataset, "male-cns:v1.0");
  assert.equal(manifest.license, "CC BY");
  const graph = prepareGraph(JSON.parse(meta.toString()), binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
  graph.datasetHash = manifest.connectivity.sha256;
  graph.metadataHash = manifest.metadata.sha256;
  graph.manifest = manifest;
  assert.equal(graph.n, manifest.neurons);
  assert.equal(graph.e, manifest.edges);
  assert.match(graph.metadata.nodes[0].id, /^\d+$/);
  for (const group of ["food", "threat", "light", "left", "right"]) {
    assert.ok(graph.metadata.groups[group].length > 0);
  }
  const session = new BrainSession(graph);
  await session.dispatch({
    type: "input",
    frame: makeInput(session.state, "environment", { food: 700, threat: 80, light: 240 }, { now }),
    acceptedAt: now,
  });
  await session.dispatch({ type: "step", count: 8 });
  assert.equal(session.state.ticks, 8);
  assert.equal((await session.prove()).equal, true);
});

test("signal summary counts official group spikes, not the sampled point cloud", () => {
  const graph = circuit();
  const state = createState(graph);
  state.spikes = [0, 4, 6];
  state.voltage[0] = 800;
  const signals = summarizeSignals(state, graph);
  assert.equal(signals.groups.food.spikes, 1);
  assert.equal(signals.groups.threat.spikes, 1);
  assert.equal(signals.groups.light.spikes, 1);
  assert.equal(signals.groups.right.spikes, 0);
  assert.equal(signals.voltageHist.length, 8);
});

test("integer stepping stays within declared bounds", () => {
  const graph = circuit();
  let state = createState(graph);
  state = reduceEvent(state, {
    type: "input",
    frame: makeInput(state, "environment", { food: 1000, threat: 1000, light: 1000 }, { now }),
    acceptedAt: now,
  }, graph);
  state = step(state, graph, 64);
  assert.ok(state.voltage.every((v) => v >= -10000 && v <= 10000));
  assert.ok(state.body.x >= 0 && state.body.x <= 10000);
  assert.ok(["REST", "FORAGE", "AVOID", "EXPLORE"].includes(state.lastAction));
});
