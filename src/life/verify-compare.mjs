/**
 * Gate 3: same life, same inputs, same machine — full replay vs sampling.
 * No wallet, no RPC. Not a yield claim.
 */
import { performance } from "node:perf_hooks";
import { getAddress } from "ethers";
import {
  checkOpening,
  commitmentOf,
  leafCountOf,
  openProbe,
  runTrajectory,
  selectProbes,
} from "../brain/flyswarm/segment.mjs";
import { buildRestorePack, continueFromRestored, verifyRestorePack } from "./restore-life.mjs";
import { runPrivateSegment } from "./private-runner.mjs";

export const COMPARE_SCHEMA = "iff.verify-compare/1";
const HUB = "0x2222222222222222222222222222222222222222";

function bytesOf(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function heap() {
  return process.memoryUsage().heapUsed;
}

export async function compareVerification(
  graph,
  state,
  {
    chainId = 97,
    hub = HUB,
    tokenId = 1,
    nonce = 1,
    steps,
    checkpointEvery,
    leafEvery,
    probeCount = 3,
    inputs = [],
    audit = "SIM",
  } = {},
) {
  const producerHeap = heap();
  const producedAt = performance.now();
  const computed = await runPrivateSegment(graph, state, {
    chainId,
    hub,
    tokenId,
    nonce,
    steps,
    checkpointEvery,
    leafEvery,
    inputs,
  });
  const producedMs = performance.now() - producedAt;
  const pack = buildRestorePack({
    graph,
    computed,
    chainId,
    hub,
    tokenId,
    nonce,
    audit,
  });
  const restoreBytes = bytesOf(pack);
  const trajectoryBytes = bytesOf({
    checkpoints: computed.trajectory.checkpoints,
    tree: computed.trajectory.tree,
    leaves: computed.trajectory.leaves,
    finalState: computed.trajectory.finalState,
  });
  const producerHeapDelta = heap() - producerHeap;

  const fullAt = performance.now();
  const replayed = await runTrajectory(graph, pack.startState, {
    steps,
    checkpointEvery,
    leafEvery,
  });
  const fullReplayMs = performance.now() - fullAt;
  const fullOk =
    replayed.startRoot === pack.startRoot &&
    replayed.finalRoot === pack.finalRoot &&
    replayed.root === computed.sim.root;

  const commitment = commitmentOf(computed.trajectory);
  const leafCount = leafCountOf({ steps, leafEvery });
  const k = Math.min(probeCount, leafCount);
  const positions = await selectProbes({
    seed: pack.archiveHash,
    segmentId: "verify-compare-v1",
    steps,
    leafEvery,
    count: k,
  });
  const openings = positions.map((position) => openProbe(computed.trajectory, position));
  const sampleAt = performance.now();
  const samples = [];
  for (const opening of openings) {
    samples.push(await checkOpening(graph, opening, commitment));
  }
  const sampleMs = performance.now() - sampleAt;
  const sampleOk = samples.every((row) => row.ok);
  const sampleSteps = samples.reduce((sum, row) => sum + (row.replayed || 0), 0);
  const openingBytes = bytesOf(
    openings.map((o) => ({
      position: o.position,
      leaf: o.leaf,
      proof: o.proof,
      from: o.from,
      anchor: o.anchor,
    })),
  );

  const probed = new Set(positions);
  let finalAlways = 0;
  let hitBySample = 0;
  let missed = 0;
  for (let i = 1; i <= leafCount; i += 1) {
    const position = i * leafEvery;
    if (position === steps) {
      finalAlways += 1;
      continue;
    }
    if (probed.has(position)) hitBySample += 1;
    else missed += 1;
  }

  const restored = await verifyRestorePack(graph, pack);
  if (!restored.ok) throw new Error(restored.reason);
  const continued = await continueFromRestored(graph, pack, {
    chainId,
    hub: getAddress(hub),
    tokenId,
    steps,
    checkpointEvery,
    leafEvery,
  });

  return {
    schema: COMPARE_SCHEMA,
    audit,
    yield: false,
    graph: {
      id: graph.manifest?.id || null,
      neurons: graph.n,
      edges: graph.e,
      datasetHash: graph.datasetHash,
    },
    shape: { steps, checkpointEvery, leafEvery, probeCount: k, leafCount },
    inputs: inputs.length,
    producer: {
      ms: Math.round(producedMs),
      heapDelta: producerHeapDelta,
      segmentId: computed.segmentId,
      startRoot: computed.startRoot,
      finalRoot: computed.finalRoot,
    },
    storage: {
      restorePackBytes: restoreBytes,
      trajectoryWithTreeBytes: trajectoryBytes,
      samplingOpeningsBytes: openingBytes,
    },
    fullReplay: {
      ms: Math.round(fullReplayMs),
      ok: fullOk,
      steps,
      catchesUnprobedLeaves: true,
    },
    sampling: {
      ms: Math.round(sampleMs),
      ok: sampleOk,
      positions,
      replayedSteps: sampleSteps,
      openingsOk: samples.filter((row) => row.ok).length,
    },
    coverage: {
      leaves: leafCount,
      finalLeafAlwaysChecked: finalAlways,
      otherLeavesHitBySample: hitBySample,
      otherLeavesMissed: missed,
      stepFractionSampled: Number((sampleSteps / steps).toFixed(4)),
      note: "Sampling always binds the final leaf. Unprobed intermediate leaves can diverge without failing k openings if the published tree is built around those openings.",
    },
    recovery: {
      restoreOk: restored.ok,
      continueStartRoot: continued.next.startRoot,
      continueMatchesPriorFinal: continued.next.startRoot === pack.finalRoot,
    },
  };
}
