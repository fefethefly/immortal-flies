import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { bindManifest, encodeGraph } from "../src/brain/graph.mjs";
import { hashBytes } from "../src/brain/codec.mjs";
import { createState } from "../src/brain/runtime.mjs";
import { DEFAULT_LEAF_EVERY, runPrivateSegment } from "../src/life/private-runner.mjs";
import { publicArchive } from "../src/life/mining-archive.mjs";
import {
  RESTORE_SCHEMA,
  appendLineage,
  buildRestorePack,
  continueFromRestored,
  restoredFiles,
  verifyRestorePack,
} from "../src/life/restore-life.mjs";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";

const HUB = "0x2222222222222222222222222222222222222222";
const ROOT = join(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "scripts/restore-life.mjs");

function fixture(id = "restore-life") {
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
        groups: { food: [0, 1], threat: [0], light: [1], left: [2], right: [3] },
      },
      [
        { pre: 0, post: 1, weight: 10 },
        { pre: 1, post: 0, weight: 10 },
        { pre: 1, post: 2, weight: 5 },
        { pre: 2, post: 3, weight: 7 },
        { pre: 3, post: 0, weight: 3 },
      ],
    ),
    id,
  );
}

const runArgs = {
  chainId: 97,
  hub: HUB,
  tokenId: 7,
  nonce: 1,
  steps: 10,
  checkpointEvery: 10,
  leafEvery: DEFAULT_LEAF_EVERY,
};

async function tmp(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value)}\n`);
}

test("machine B restores from the public pack after machine A is gone", async () => {
  const graph = fixture();
  const born = createState(graph, { seed: 43, soulId: "life-7", branchId: "sim" });
  const computed = await runPrivateSegment(graph, born, {
    ...runArgs,
    inputs: [{ kind: 0, intensity: 640 }],
  });
  const pack = buildRestorePack({ graph, computed, ...runArgs });
  assert.equal(pack.schema, RESTORE_SCHEMA);
  assert.equal(pack.yield, false);
  assert.equal(pack.trajectory, undefined);
  assert.ok(pack.preState);
  assert.notEqual(pack.preState.signal.food, pack.startState.signal.food);

  const dirA = await tmp("iff-restore-a-");
  const dirB = await tmp("iff-restore-b-");
  await writeJson(join(dirA, "state-7.json"), computed.nextState);
  await writeJson(join(dirA, `archive-${pack.segmentId}.json`), pack);
  await writeJson(join(dirA, "work-7.json"), { nonce: 2, segment: null, secret: "runner-local" });

  const publicCopy = JSON.parse(await readFile(join(dirA, `archive-${pack.segmentId}.json`), "utf8"));
  await writeJson(join(dirB, `archive-${pack.segmentId}.json`), publicCopy);
  assert.equal(existsSync(join(dirB, "state-7.json")), false);
  assert.equal(existsSync(join(dirB, "work-7.json")), false);

  const verified = await verifyRestorePack(graph, publicCopy);
  assert.equal(verified.ok, true);
  assert.equal(verified.receipt.yield, false);
  assert.match(verified.receipt.receiptHash, /^0x[0-9a-f]{64}$/);
  for (const [name, value] of Object.entries(
    restoredFiles(verified.pack, verified.receipt, verified.nextState),
  )) {
    await writeJson(join(dirB, name), value);
  }
  const restored = JSON.parse(await readFile(join(dirB, "state-7.json"), "utf8"));
  assert.equal(restored.ticks, pack.finalState.ticks);
  const work = JSON.parse(await readFile(join(dirB, "work-7.json"), "utf8"));
  assert.equal(work.nonce, 2);
  assert.equal(work.secret, undefined);

  const continued = await continueFromRestored(graph, publicCopy, runArgs);
  assert.equal(continued.next.parentRoot, pack.finalRoot);
  assert.equal(continued.next.startRoot, pack.finalRoot);
  assert.notEqual(continued.next.finalRoot, pack.finalRoot);

  const withInput = await continueFromRestored(graph, publicCopy, {
    ...runArgs,
    inputs: [{ kind: 1, intensity: 90 }],
  });
  assert.equal(withInput.next.parentRoot, pack.finalRoot);
  assert.notEqual(withInput.next.startRoot, pack.finalRoot);
});

test("old segment-archive plus local trajectory still restores", async () => {
  const graph = fixture("restore-legacy");
  const born = createState(graph, { seed: 43, soulId: "life-7", branchId: "sim" });
  const computed = await runPrivateSegment(graph, born, runArgs);
  const legacy = publicArchive({
    segmentId: computed.segmentId,
    tokenId: runArgs.tokenId,
    packed: computed.packed,
    sim: computed.sim,
    inputs: [],
    datasetHash: graph.datasetHash,
    startRoot: computed.startRoot,
    finalRoot: computed.finalRoot,
  });
  legacy.trajectory = computed.trajectory;
  const verified = await verifyRestorePack(graph, legacy);
  assert.equal(verified.ok, true);
  assert.equal(verified.nextState.ticks, computed.nextState.ticks);
});

test("tampered final state, yield flag and lineage gap are rejected", async () => {
  const graph = fixture("restore-tamper");
  const born = createState(graph, { seed: 43, soulId: "life-7", branchId: "sim" });
  const computed = await runPrivateSegment(graph, born, runArgs);
  const pack = buildRestorePack({ graph, computed, ...runArgs });

  const brokenState = structuredClone(pack);
  brokenState.finalState.voltage[0] = (brokenState.finalState.voltage[0] + 1) % 100;
  assert.equal((await verifyRestorePack(graph, brokenState)).reason, "FINAL_STATE");

  const brokenRoot = structuredClone(pack);
  brokenRoot.finalRoot = computed.startRoot;
  brokenRoot.commitment.finalRoot = computed.startRoot;
  assert.equal((await verifyRestorePack(graph, brokenRoot)).reason, "FINAL_STATE");

  const yielded = structuredClone(pack);
  yielded.yield = true;
  assert.equal((await verifyRestorePack(graph, yielded)).reason, "RESTORE_YIELD");

  const other = fixture("restore-other");
  other.datasetHash = `0x${"33".repeat(32)}`;
  other.metadataHash = `0x${"44".repeat(32)}`;
  assert.equal((await verifyRestorePack(other, pack)).reason, "DATASET_MISMATCH");

  const second = await runPrivateSegment(graph, computed.nextState, { ...runArgs, nonce: 2 });
  const pack2 = buildRestorePack({
    graph,
    computed: second,
    ...runArgs,
    nonce: 2,
  });
  assert.equal(pack2.startRoot, pack.finalRoot);
  const lineage = appendLineage(appendLineage(null, pack), pack2);
  assert.equal(lineage.segments.length, 2);
  assert.equal(appendLineage(lineage, pack2).segments.length, 2);
  assert.throws(() => appendLineage(appendLineage(null, pack2), pack), /LINEAGE_GAP/);
  const moved = appendLineage(lineage, { ...pack, hub: "0x1111111111111111111111111111111111111111" });
  assert.equal(moved.segments.length, 1);
  assert.equal(moved.hub, "0x1111111111111111111111111111111111111111");
  const legacy = appendLineage(
    { schema: "iff.life-lineage/1", segments: lineage.segments },
    pack,
  );
  assert.equal(legacy.segments.length, 1);
  assert.equal(legacy.hub, pack.hub);
});

test("two mirrors of the same pack share one receipt hash", async () => {
  const graph = fixture("restore-mirror");
  const born = createState(graph, { seed: 43, soulId: "life-7", branchId: "sim" });
  const computed = await runPrivateSegment(graph, born, runArgs);
  const pack = buildRestorePack({ graph, computed, ...runArgs });
  const left = await verifyRestorePack(graph, structuredClone(pack));
  const right = await verifyRestorePack(graph, structuredClone(pack));
  assert.equal(left.ok && right.ok, true);
  assert.equal(left.receipt.receiptHash, right.receipt.receiptHash);
});

async function writeTinyGraphDir(dir) {
  const encoded = encodeGraph(
    {
      schema: "iff.connectome/1",
      nodes: [
        { id: "a", sign: 1 },
        { id: "b", sign: 1 },
        { id: "c", sign: -1 },
        { id: "d", sign: 1 },
      ],
      groups: { food: [0, 1], threat: [0], light: [1], left: [2], right: [3] },
    },
    [
      { pre: 0, post: 1, weight: 10 },
      { pre: 1, post: 0, weight: 10 },
      { pre: 1, post: 2, weight: 5 },
      { pre: 2, post: 3, weight: 7 },
      { pre: 3, post: 0, weight: 3 },
    ],
  );
  const meta = Buffer.from(JSON.stringify(encoded.metadata));
  const bin = Buffer.from(new Uint8Array(encoded.offsets.buffer));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "metadata.json"), meta);
  await writeFile(join(dir, "graph.bin"), bin);
  await writeFile(
    join(dir, "manifest.json"),
    `${JSON.stringify(
      {
        schema: "iff.dataset/1",
        id: "restore-cli",
        neurons: encoded.n,
        edges: encoded.e,
        metadata: { path: "metadata.json", bytes: meta.byteLength, sha256: await hashBytes(meta) },
        connectivity: { path: "graph.bin", bytes: bin.byteLength, sha256: await hashBytes(bin) },
      },
      null,
      2,
    )}\n`,
  );
}

function runCli(argv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...argv], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test("CLI restore writes state on an empty directory from the public pack", async () => {
  const graphDir = await tmp("iff-restore-graph-");
  await writeTinyGraphDir(graphDir);
  const graph = await loadGraphFromDir(graphDir);
  const born = createState(graph, { seed: 43, soulId: "life-7", branchId: "sim" });
  const computed = await runPrivateSegment(graph, born, runArgs);
  const pack = buildRestorePack({ graph, computed, ...runArgs });
  const packDir = await tmp("iff-restore-pack-");
  const outDir = await tmp("iff-restore-out-");
  const packFile = join(packDir, "pack.json");
  await writeJson(packFile, pack);

  const restored = await runCli(["restore", packFile, "--out", outDir, "--graph", graphDir]);
  assert.equal(restored.code, 0, restored.stderr);
  const report = JSON.parse(restored.stdout);
  assert.equal(report.ok, true);
  assert.equal(existsSync(join(outDir, "state-7.json")), true);
  assert.equal(existsSync(join(outDir, "work-7.json")), true);

  const continued = await runCli(["continue", packFile, "--out", outDir, "--graph", graphDir]);
  assert.equal(continued.code, 0, continued.stderr);
  const next = JSON.parse(continued.stdout);
  assert.equal(next.startRoot, pack.finalRoot);
  assert.equal(next.parentRoot, pack.finalRoot);
  assert.equal(existsSync(join(outDir, `archive-${next.segmentId}.json`)), true);
});
