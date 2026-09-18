/**
 * Private-track runner helpers. No RPC. Chain I/O lives in server/src/runner.
 */
import { AbiCoder, getAddress, keccak256 } from "ethers";
import { clone } from "../brain/codec.mjs";
import {
  commitmentOf,
  runTrajectory,
  stateDigest,
} from "../brain/flyswarm/segment.mjs";
import { fromTrajectory } from "./mining-archive.mjs";

const abi = AbiCoder.defaultAbiCoder();
export const SEGMENT_ID_DOMAIN = "iff.segment-id/1";
export const DEFAULT_STEPS = 1000;
export const DEFAULT_CHECKPOINT_EVERY = 100;
export const DEFAULT_LEAF_EVERY = 10;
export const STIMULUS_CHANNELS = Object.freeze(["food", "threat", "light"]);

/**
 * Map frozen Journal Stimulus events onto the runtime sensory vector.
 * Apply in index order. Later events overwrite the same channel only;
 * they do not zero the other channels.
 */
export function applyJournalInputs(state, inputs = []) {
  if (!Array.isArray(inputs)) throw new Error("inputs must be an array");
  if (inputs.length === 0) return state;
  const next = clone(state);
  const signal = { ...next.signal };
  for (const item of inputs) {
    if (!Number.isInteger(item.kind) || item.kind < 0 || item.kind > 2) {
      throw new Error("invalid stimulus kind");
    }
    if (
      !Number.isInteger(item.intensity) ||
      item.intensity < 0 ||
      item.intensity > 1000
    ) {
      throw new Error("invalid stimulus intensity");
    }
    signal[STIMULUS_CHANNELS[item.kind]] = item.intensity;
  }
  next.signal = signal;
  return next;
}

export function sameAddr(a, b) {
  if (!a || !b) return false;
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

export function shouldRun({ paused, tank, operator, runner, authorized }) {
  if (paused) return { ok: false, reason: "paused" };
  if (!tank?.runner || !sameAddr(tank.runner, runner))
    return { ok: false, reason: "unbound" };
  if (!authorized || !sameAddr(authorized, runner))
    return { ok: false, reason: "not-controller" };
  const status = Number(operator?.status ?? 0);
  if (status !== 1) return { ok: false, reason: "inactive" };
  const fee = BigInt(tank.fee || 0);
  if (fee === 0n) return { ok: false, reason: "no-fee" };
  const fuel = BigInt(tank.ownerFuel || 0) + BigInt(tank.giftFuel || 0);
  if (fuel < fee) return { ok: false, reason: "empty" };
  const cap = BigInt(tank.spendCap || 0);
  if (cap > 0n && BigInt(tank.spent || 0) + fee > cap) {
    return { ok: false, reason: "cap" };
  }
  const until = Number(tank.validUntil || 0);
  if (until > 0 && Math.floor(Date.now() / 1000) > until) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, reason: null };
}

export function segmentIdOf({ hub, tokenId, nonce, startRoot }) {
  return keccak256(
    abi.encode(
      ["string", "address", "uint256", "uint256", "bytes32"],
      [SEGMENT_ID_DOMAIN, getAddress(hub), tokenId, nonce, startRoot],
    ),
  );
}

export async function runPrivateSegment(
  graph,
  state,
  { chainId, hub, tokenId, nonce, steps, checkpointEvery, leafEvery, inputs = [] },
) {
  const preState = clone(state);
  const parentRoot = await stateDigest(preState);
  const primed = applyJournalInputs(state, inputs);
  const trajectory = await runTrajectory(graph, primed, {
    steps,
    checkpointEvery,
    leafEvery,
  });
  const id = segmentIdOf({
    hub,
    tokenId,
    nonce,
    startRoot: parentRoot,
  });
  const packed = fromTrajectory(trajectory, {
    chainId,
    hub,
    tokenId,
    segmentId: id,
  });
  return {
    segmentId: id,
    packed,
    commitment: packed.commitment,
    archiveHash: packed.archiveHash,
    sim: commitmentOf(trajectory),
    nextState: trajectory.finalState,
    startRoot: trajectory.startRoot,
    parentRoot,
    finalRoot: trajectory.finalRoot,
    inputs: inputs.slice(),
    preState,
    trajectory,
  };
}
