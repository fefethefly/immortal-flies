/**
 * 段证明跨平台逐位向量：同输入必须得到同一 startRoot / finalRoot / trajectoryRoot。
 * 规格：docs/MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md §8.2 门 3。
 * 不是智能证据，也不是工价。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { clone, hash, hashBytes, requireValue } from "../src/brain/codec.mjs";
import { hostEndian, requireLittleEndianGraph } from "../src/brain/endian.mjs";
import { makeInput } from "../src/brain/adapters.mjs";
import { createState, reduceEvent } from "../src/brain/runtime.mjs";
import {
  commitmentOf,
  replaySteps,
  runTrajectory,
  selectProbes,
  validateCommitment,
} from "../src/brain/flyswarm/segment.mjs";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";

export const VECTOR_SCHEMA = "iff.segment-replay/1";
export const VECTOR_PROFILE = "iff.segment-replay/1";
export const DEFAULT_VECTOR_PATH = "reports/segment-replay-full-v1.json";

export const SOURCE_PATHS = Object.freeze([
  "src/brain/runtime.mjs",
  "src/brain/codec.mjs",
  "src/brain/graph.mjs",
  "src/brain/endian.mjs",
  "src/brain/adapters.mjs",
  "src/brain/ethology.mjs",
  "src/brain/flyswarm/segment.mjs",
  "scripts/segment-replay-core.mjs",
]);

export const PLAN = Object.freeze({
  seed: 43,
  soulId: "segment-replay-v1",
  branchId: "canonical",
  food: 800,
  steps: 1000,
  checkpointEvery: 100,
  leafEvery: 10,
  now: 1,
});

const DATASETS = Object.freeze([
  { id: "malecns-circuit", dir: "public/data/malecns-circuit" },
  { id: "malecns-full", dir: "public/data/malecns-full" },
]);

export async function fingerprints(root) {
  return Object.fromEntries(
    await Promise.all(
      SOURCE_PATHS.map(async (path) => [
        path,
        await hashBytes(await readFile(join(root, path))),
      ]),
    ),
  );
}

async function primedState(graph) {
  const state = createState(graph, {
    seed: PLAN.seed,
    soulId: PLAN.soulId,
    branchId: PLAN.branchId,
  });
  const frame = makeInput(
    state,
    "environment",
    { food: PLAN.food, threat: 0, light: 0 },
    {
      now: PLAN.now,
      provenance: { kind: "simulation", profile: VECTOR_PROFILE },
    },
  );
  return reduceEvent(
    state,
    { type: "input", frame, acceptedAt: PLAN.now },
    graph,
  );
}

async function runOne(graph) {
  requireValue(
    hostEndian() === "little",
    "HOST_ENDIAN",
    "官方向量只在小端主机上跑",
  );
  const initial = await primedState(graph);
  const startRoot = await hash(initial);
  const batched = replaySteps(clone(initial), graph, PLAN.steps);
  const batchedRoot = await hash(batched);
  const traj = await runTrajectory(graph, initial, {
    steps: PLAN.steps,
    checkpointEvery: PLAN.checkpointEvery,
    leafEvery: PLAN.leafEvery,
  });
  requireValue(traj.startRoot === startRoot, "REPLAY_START");
  requireValue(
    traj.finalRoot === batchedRoot,
    "REPLAY_BATCH",
    "逐步取叶终态必须等于批量 step",
  );
  const commitment = commitmentOf(traj);
  validateCommitment(commitment);
  const probeSeed = await hash({
    schema: VECTOR_SCHEMA,
    id: "probe",
    dataset: graph.manifest.id,
  });
  const positions = await selectProbes({
    seed: probeSeed,
    segmentId: "segment-replay-v1",
    steps: PLAN.steps,
    leafEvery: PLAN.leafEvery,
  });
  return {
    dataset: graph.manifest.dataset,
    graphId: graph.manifest.id,
    neurons: graph.n,
    edges: graph.e,
    datasetHash: graph.datasetHash,
    metadataHash: graph.metadataHash,
    startRoot,
    batchedRoot,
    commitment: {
      schema: commitment.schema,
      audit: commitment.audit,
      steps: commitment.steps,
      checkpointEvery: commitment.checkpointEvery,
      leafEvery: commitment.leafEvery,
      startRoot: commitment.startRoot,
      finalRoot: commitment.finalRoot,
      root: commitment.root,
      checkpointRoots: commitment.checkpointRoots,
    },
    probes: { seed: probeSeed, positions },
  };
}

export async function buildBundle(
  root,
  sources,
  { ids = DATASETS.map((d) => d.id) } = {},
) {
  const datasets = {};
  for (const item of DATASETS.filter((d) => ids.includes(d.id))) {
    const bin = await readFile(join(root, item.dir, "graph.bin"));
    requireLittleEndianGraph(
      bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
    );
    const graph = await loadGraphFromDir(join(root, item.dir));
    requireValue(graph.manifest.id === item.id, "GRAPH_ID");
    datasets[item.id] = await runOne(graph);
  }
  requireValue(Object.keys(datasets).length === ids.length, "VECTOR_DATASETS");
  const payload = {
    schema: VECTOR_SCHEMA,
    profile: VECTOR_PROFILE,
    plan: PLAN,
    endian: {
      host: hostEndian(),
      graphFile: "little",
      magic: "IFF1",
      magicBytes: [0x31, 0x46, 0x46, 0x49],
    },
    runtime: {
      model: "lif-integer/1",
      encoder: "sensory-groups/1",
      decoder: "motor-balance/1",
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    },
    sources,
    datasets,
  };
  return { ...payload, sha256: await hash(payload) };
}

export async function verifyBundle(bundle, root, sources, { ids } = {}) {
  requireValue(
    bundle?.schema === VECTOR_SCHEMA && bundle.profile === VECTOR_PROFILE,
    "VECTOR_SCHEMA",
  );
  const { sha256, ...payload } = bundle;
  requireValue(
    (await hash(payload)) === sha256,
    "VECTOR_HASH",
    "向量外包哈希不匹配",
  );
  requireValue(
    payload.endian?.host === "little" && payload.endian?.graphFile === "little",
    "VECTOR_ENDIAN",
  );
  requireValue(
    payload.plan?.steps === PLAN.steps &&
      payload.plan?.leafEvery === PLAN.leafEvery,
    "VECTOR_PLAN",
  );
  const target = ids || Object.keys(bundle.datasets);
  const fresh = await buildBundle(root, sources, { ids: target });
  for (const id of target) {
    const expected = bundle.datasets[id];
    const got = fresh.datasets[id];
    requireValue(expected && got, "VECTOR_DATASETS", id);
    requireValue(
      got.datasetHash === expected.datasetHash,
      "GRAPH_HASH",
      `${id} datasetHash`,
    );
    requireValue(
      got.startRoot === expected.startRoot,
      "REPLAY_START",
      `${id} startRoot`,
    );
    requireValue(
      got.batchedRoot === expected.batchedRoot,
      "REPLAY_BATCH",
      `${id} batchedRoot`,
    );
    requireValue(
      got.commitment.root === expected.commitment.root,
      "REPLAY_ROOT",
      `${id} trajectoryRoot`,
    );
    requireValue(
      got.commitment.finalRoot === expected.commitment.finalRoot,
      "REPLAY_FINAL",
      `${id} finalRoot`,
    );
    requireValue(
      JSON.stringify(got.commitment.checkpointRoots) ===
        JSON.stringify(expected.commitment.checkpointRoots),
      "REPLAY_CHECKPOINTS",
      `${id} checkpointRoots`,
    );
  }
  return {
    ok: true,
    host: { recorded: bundle.host, now: fresh.host },
    sourcesMatch: JSON.stringify(bundle.sources) === JSON.stringify(sources),
    datasets: Object.fromEntries(
      Object.entries(fresh.datasets).map(([id, row]) => [
        id,
        row.commitment.root,
      ]),
    ),
  };
}
