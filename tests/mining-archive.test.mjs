import test from "node:test";
import assert from "node:assert/strict";
import { keccak256, toUtf8Bytes, ZeroHash } from "ethers";
import { bindManifest, encodeGraph } from "../src/brain/graph.mjs";
import { createState } from "../src/brain/runtime.mjs";
import { commitmentOf, runTrajectory } from "../src/brain/flyswarm/segment.mjs";
import {
  ARCHIVE_DOMAIN,
  CHECKPOINT_DOMAIN,
  PROBE_DOMAIN,
  adjudicationRecordHash,
  archiveHash,
  checkpointPack,
  fromTrajectory,
  journalCheckpointRoot,
  probeSeed,
  uriHash,
} from "../src/life/mining-archive.mjs";

const HUB = "0x1111111111111111111111111111111111111111";
const JOURNAL = "0x2222222222222222222222222222222222222222";
const ROOT = keccak256(toUtf8Bytes("root"));
const SEG = keccak256(toUtf8Bytes("seg-1"));

test("archiveHash is domain-separated and stable", () => {
  const base = {
    chainId: 31337,
    hub: HUB,
    tokenId: 1,
    segmentId: SEG,
    steps: 10,
    checkpointEvery: 10,
    leafEvery: 10,
    startRoot: ROOT,
    finalRoot: keccak256(toUtf8Bytes("final")),
    trajectoryRoot: keccak256(toUtf8Bytes("traj")),
    checkpointPack: keccak256(toUtf8Bytes("pack")),
  };
  const a = archiveHash(base);
  assert.match(a, /^0x[0-9a-f]{64}$/);
  assert.equal(a, archiveHash(base));
  assert.notEqual(a, archiveHash({ ...base, tokenId: 2 }));
  assert.notEqual(a, archiveHash({ ...base, chainId: 56 }));
  assert.equal(ARCHIVE_DOMAIN, "ifs.segment-archive/1");
  assert.equal(CHECKPOINT_DOMAIN, "ifs.checkpoint/1");
  assert.equal(PROBE_DOMAIN, "iff.probe/1");
});

test("checkpointPack binds the ordered checkpoint roots", () => {
  const a = keccak256(toUtf8Bytes("a"));
  const b = keccak256(toUtf8Bytes("b"));
  const pack = checkpointPack([a, b]);
  assert.equal(pack, checkpointPack([a, b]));
  assert.notEqual(pack, checkpointPack([b, a]));
  assert.throws(() => checkpointPack([]), /roots/);
});

test("probeSeed matches Hub lockSeed encoding", () => {
  const source = keccak256(toUtf8Bytes("blockhash"));
  const seed = probeSeed({ sourceHash: source, segmentId: SEG });
  assert.equal(seed, probeSeed({ sourceHash: source, segmentId: SEG }));
  assert.notEqual(seed, probeSeed({ sourceHash: ROOT, segmentId: SEG }));
});

test("journalCheckpointRoot includes uri hash and previous", () => {
  const args = {
    chainId: 31337,
    journal: JOURNAL,
    tokenId: 1,
    epoch: 1,
    sequence: 1,
    previous: ZeroHash,
    throughInput: 0,
    inputRoot: ZeroHash,
    modelHash: ROOT,
    stateRoot: keccak256(toUtf8Bytes("state")),
    archiveHash: keccak256(toUtf8Bytes("archive")),
    uri: "ipfs://segment/1",
  };
  const root = journalCheckpointRoot(args);
  assert.equal(uriHash(args.uri), keccak256(toUtf8Bytes(args.uri)));
  assert.notEqual(root, journalCheckpointRoot({ ...args, uri: "ipfs://segment/2" }));
  assert.notEqual(root, journalCheckpointRoot({ ...args, previous: ROOT }));
});

test("adjudicationRecordHash is keccak of canonical bytes", () => {
  const record = { schema: "iff.adjudication/1", audit: "SIM", verdict: "A", position: 10 };
  const hash = adjudicationRecordHash(record);
  assert.equal(hash, adjudicationRecordHash({ position: 10, verdict: "A", audit: "SIM", schema: "iff.adjudication/1" }));
  assert.notEqual(hash, adjudicationRecordHash({ ...record, verdict: "B" }));
});

test("fromTrajectory maps SIM commitment onto Hub archive fields", async () => {
  const graph = bindManifest(
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
    "mining-archive-test",
  );
  const state = createState(graph, { seed: 43, soulId: "mine-43", branchId: "test" });
  const trajectory = await runTrajectory(graph, state, {
    steps: 10,
    checkpointEvery: 10,
    leafEvery: 10,
  });
  const sim = commitmentOf(trajectory);
  const packed = fromTrajectory(trajectory, {
    chainId: 31337,
    hub: HUB,
    tokenId: 1,
    segmentId: SEG,
  });
  assert.equal(packed.commitment.startRoot, sim.startRoot);
  assert.equal(packed.commitment.finalRoot, sim.finalRoot);
  assert.equal(packed.commitment.trajectoryRoot, sim.root);
  assert.equal(packed.commitment.steps, 10);
  assert.equal(packed.commitment.leafEvery, 10);
  assert.match(packed.archiveHash, /^0x[0-9a-f]{64}$/);
});
