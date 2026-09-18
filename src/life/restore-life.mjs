/**
 * Gate 2: restore a private-track life from a public pack.
 * No wallet, no RPC. Another machine needs the pack + a matching graph.
 */
import { getAddress } from "ethers";
import { clone, hash } from "../brain/codec.mjs";
import { validateState } from "../brain/runtime.mjs";
import { commitmentOf, runTrajectory, stateDigest } from "../brain/flyswarm/segment.mjs";
import { applyJournalInputs, runPrivateSegment } from "./private-runner.mjs";
import { archiveHash } from "./mining-archive.mjs";

export const RESTORE_SCHEMA = "iff.life-restore/1";
export const RECEIPT_SCHEMA = "iff.restore-receipt/1";
export const LINEAGE_SCHEMA = "iff.life-lineage/1";
export const SEGMENT_ARCHIVE_SCHEMA = "iff.segment-archive/1";

const isHash = (v) => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v);

function fail(reason) {
  return { ok: false, reason, receipt: null, nextState: null };
}

/** Portable pack: enough to replay and continue. No Merkle tree required. */
export function buildRestorePack({
  graph,
  computed,
  chainId,
  hub,
  tokenId,
  nonce = 1,
  audit = "SIM",
}) {
  const trajectory = computed.trajectory;
  if (!trajectory?.checkpoints?.[0]?.state || !trajectory.finalState) {
    throw new Error("RESTORE_TRAJECTORY");
  }
  const startState = clone(trajectory.checkpoints[0].state);
  return {
    schema: RESTORE_SCHEMA,
    version: "1",
    audit,
    yield: false,
    chainId,
    hub: getAddress(hub),
    tokenId,
    nonce,
    segmentId: computed.segmentId,
    datasetHash: graph.datasetHash,
    metadataHash: graph.metadataHash,
    soulId: startState.soulId,
    branchId: startState.branchId,
    model: startState.model,
    steps: trajectory.steps,
    checkpointEvery: trajectory.checkpointEvery,
    leafEvery: trajectory.leafEvery,
    inputs: (computed.inputs || []).slice(),
    preState: computed.preState ? clone(computed.preState) : null,
    startState,
    finalState: clone(trajectory.finalState),
    startRoot: computed.startRoot,
    parentRoot: computed.parentRoot || null,
    finalRoot: computed.finalRoot,
    commitment: clone(computed.commitment),
    archiveHash: computed.archiveHash,
    sim: computed.sim,
    checkpointRoots: trajectory.checkpointRoots.slice(),
    leaves: trajectory.leaves.slice(),
    probes: [],
    openings: [],
  };
}

/** Accept a restore pack or a runner segment-archive that still carries a trajectory. */
export function fromPublicArchive(archive) {
  if (!archive || typeof archive !== "object") throw new Error("RESTORE_PACK");
  if (archive.yield) throw new Error("RESTORE_YIELD");
  if (archive.schema === RESTORE_SCHEMA) return clone(archive);
  if (archive.schema === SEGMENT_ARCHIVE_SCHEMA && archive.trajectory) {
    const t = archive.trajectory;
    return {
      schema: RESTORE_SCHEMA,
      version: "1",
      audit: archive.audit || t.audit || "SIM",
      yield: false,
      chainId: archive.chainId ?? null,
      hub: archive.hub ? getAddress(archive.hub) : null,
      tokenId: archive.tokenId,
      nonce: archive.nonce || 1,
      segmentId: archive.segmentId,
      datasetHash: archive.datasetHash || t.finalState?.datasetHash || null,
      metadataHash: t.finalState?.metadataHash || null,
      soulId: t.checkpoints[0].state.soulId,
      branchId: t.checkpoints[0].state.branchId,
      model: t.checkpoints[0].state.model,
      steps: t.steps,
      checkpointEvery: t.checkpointEvery,
      leafEvery: t.leafEvery,
      inputs: (archive.inputs || []).slice(),
      preState: null,
      startState: clone(t.checkpoints[0].state),
      finalState: clone(t.finalState),
      startRoot: archive.startRoot || t.startRoot,
      finalRoot: archive.finalRoot || t.finalRoot,
      commitment: clone(archive.commitment),
      archiveHash: archive.archiveHash,
      sim: archive.sim || commitmentOf(t),
      checkpointRoots: t.checkpointRoots.slice(),
      leaves: t.leaves.slice(),
      probes: archive.probes || [],
      openings: archive.openings || [],
    };
  }
  throw new Error("RESTORE_PACK");
}

export function lineageOf(pack) {
  return {
    schema: LINEAGE_SCHEMA,
    audit: pack.audit,
    yield: false,
    tokenId: pack.tokenId,
    soulId: pack.soulId,
    branchId: pack.branchId,
    hub: pack.hub || null,
    segments: [
      {
        segmentId: pack.segmentId,
        nonce: pack.nonce,
        startRoot: pack.startRoot,
        parentRoot: pack.parentRoot || pack.startRoot,
        finalRoot: pack.finalRoot,
        archiveHash: pack.archiveHash,
      },
    ],
  };
}

export function appendLineage(lineage, pack) {
  if (!lineage) return lineageOf(pack);
  if (pack.hub && (!lineage.hub || getAddress(lineage.hub) !== getAddress(pack.hub))) {
    return lineageOf(pack);
  }
  const next = clone(lineage);
  const last = next.segments[next.segments.length - 1];
  if (last && last.segmentId === pack.segmentId) {
    if (last.startRoot !== pack.startRoot || last.finalRoot !== pack.finalRoot) {
      throw new Error("LINEAGE_CONFLICT");
    }
    return next;
  }
  if (last && last.finalRoot !== (pack.parentRoot || pack.startRoot)) {
    throw new Error("LINEAGE_GAP");
  }
  next.hub = pack.hub || next.hub || null;
  next.segments.push({
    segmentId: pack.segmentId,
    nonce: pack.nonce,
    startRoot: pack.startRoot,
    parentRoot: pack.parentRoot || pack.startRoot,
    finalRoot: pack.finalRoot,
    archiveHash: pack.archiveHash,
  });
  return next;
}

/** Files another machine writes after a verified pack. No original runner secrets. */
export function restoredFiles(pack, receipt, nextState) {
  const tokenId = pack.tokenId;
  return {
    [`state-${tokenId}.json`]: nextState,
    [`work-${tokenId}.json`]: { nonce: (pack.nonce || 1) + 1, segment: null },
    [`archive-${pack.segmentId}.json`]: pack,
    [`receipt-${pack.segmentId}.json`]: receipt,
    [`life-${tokenId}.json`]: lineageOf(pack),
  };
}

async function receiptOf(pack) {
  const receipt = {
    schema: RECEIPT_SCHEMA,
    audit: pack.audit,
    yield: false,
    segmentId: pack.segmentId,
    tokenId: pack.tokenId,
    datasetHash: pack.datasetHash,
    startRoot: pack.startRoot,
    finalRoot: pack.finalRoot,
    archiveHash: pack.archiveHash,
  };
  return { ...receipt, receiptHash: await hash(receipt) };
}

/**
 * Independent replay. Returns a receipt on success; never signs, never pays.
 */
export async function verifyRestorePack(graph, raw, { digest = stateDigest } = {}) {
  let pack;
  try {
    pack = fromPublicArchive(raw);
  } catch (err) {
    return fail(err.message || "RESTORE_PACK");
  }
  if (pack.datasetHash !== graph.datasetHash || pack.metadataHash !== graph.metadataHash) {
    return fail("DATASET_MISMATCH");
  }
  try {
    validateState(pack.startState, graph);
    validateState(pack.finalState, graph);
  } catch {
    return fail("STATE_SCHEMA");
  }
  if ((await digest(pack.startState)) !== pack.startRoot) return fail("START_ROOT");
  if ((await digest(pack.finalState)) !== pack.finalRoot) return fail("FINAL_STATE");
  if (pack.commitment) {
    if (pack.commitment.startRoot !== pack.startRoot) return fail("COMMIT_START");
    if (pack.commitment.finalRoot !== pack.finalRoot) return fail("COMMIT_FINAL");
  }
  if (pack.preState) {
    try {
      validateState(pack.preState, graph);
    } catch {
      return fail("PRE_STATE");
    }
    const parentRoot = await digest(pack.preState);
    if (pack.parentRoot && pack.parentRoot !== parentRoot) return fail("PARENT_ROOT");
    const primed = applyJournalInputs(pack.preState, pack.inputs || []);
    if ((await digest(primed)) !== pack.startRoot) return fail("INPUTS");
  }
  if (
    pack.chainId != null &&
    pack.hub &&
    pack.commitment &&
    isHash(pack.archiveHash) &&
    isHash(pack.segmentId)
  ) {
    const expected = archiveHash({
      chainId: pack.chainId,
      hub: pack.hub,
      tokenId: pack.tokenId,
      segmentId: pack.segmentId,
      steps: pack.commitment.steps,
      checkpointEvery: pack.commitment.checkpointEvery,
      leafEvery: pack.commitment.leafEvery,
      startRoot: pack.commitment.startRoot,
      finalRoot: pack.commitment.finalRoot,
      trajectoryRoot: pack.commitment.trajectoryRoot,
      checkpointPack: pack.commitment.checkpointPack,
    });
    if (expected !== pack.archiveHash) return fail("ARCHIVE_HASH");
  }
  const replayed = await runTrajectory(graph, pack.startState, {
    steps: pack.steps,
    checkpointEvery: pack.checkpointEvery,
    leafEvery: pack.leafEvery,
  });
  if (replayed.startRoot !== pack.startRoot) return fail("REPLAY_START");
  if (replayed.finalRoot !== pack.finalRoot) return fail("REPLAY_FINAL");
  const claimedRoot = pack.sim?.root || pack.commitment?.trajectoryRoot;
  if (claimedRoot && replayed.root !== claimedRoot) return fail("REPLAY_ROOT");
  if (
    Array.isArray(pack.leaves) &&
    pack.leaves.length > 0 &&
    pack.leaves.some((leaf, i) => leaf !== replayed.leaves[i])
  ) {
    return fail("REPLAY_LEAVES");
  }
  return {
    ok: true,
    reason: null,
    receipt: await receiptOf(pack),
    nextState: clone(pack.finalState),
    pack,
  };
}

/** After a verified pack, run the next segment on this machine. */
export async function continueFromPack(graph, raw, runArgs) {
  const verified = await verifyRestorePack(graph, raw);
  if (!verified.ok) {
    const error = new Error(verified.reason);
    error.code = verified.reason;
    throw error;
  }
  const next = await runPrivateSegment(graph, verified.nextState, {
    ...runArgs,
    nonce: (verified.pack.nonce || 1) + 1,
  });
  if (next.parentRoot !== verified.pack.finalRoot) {
    const error = new Error("CONTINUE_ROOT");
    error.code = "CONTINUE_ROOT";
    throw error;
  }
  return { verified, next };
}

export const continueFromRestored = continueFromPack;
