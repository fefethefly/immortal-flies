/** EVM encoding for MiningHub private-track archives. No wallet/RPC. */
import { AbiCoder, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { canonical } from "../brain/codec.mjs";

const abi = AbiCoder.defaultAbiCoder();
export const ARCHIVE_DOMAIN = "ifs.segment-archive/1";
export const CHECKPOINT_DOMAIN = "ifs.checkpoint/1";
export const PROBE_DOMAIN = "iff.probe/1";

const COMMITMENT_TYPES = [
  "uint16",
  "uint16",
  "uint16",
  "bytes32",
  "bytes32",
  "bytes32",
  "bytes32",
];

export function checkpointPack(roots) {
  if (!Array.isArray(roots) || roots.length === 0)
    throw new Error("checkpointPack needs roots");
  return keccak256(abi.encode(["bytes32[]"], [roots]));
}

export function archiveHash({
  chainId,
  hub,
  tokenId,
  segmentId,
  steps,
  checkpointEvery,
  leafEvery,
  startRoot,
  finalRoot,
  trajectoryRoot,
  checkpointPack: pack,
}) {
  return keccak256(
    abi.encode(
      [
        "string",
        "uint256",
        "address",
        "uint256",
        "bytes32",
        ...COMMITMENT_TYPES,
      ],
      [
        ARCHIVE_DOMAIN,
        chainId,
        getAddress(hub),
        tokenId,
        segmentId,
        steps,
        checkpointEvery,
        leafEvery,
        startRoot,
        finalRoot,
        trajectoryRoot,
        pack,
      ],
    ),
  );
}

export function probeSeed({ sourceHash, segmentId }) {
  return keccak256(
    abi.encode(["string", "bytes32", "bytes32"], [PROBE_DOMAIN, sourceHash, segmentId]),
  );
}

export function uriHash(uri) {
  return keccak256(toUtf8Bytes(uri));
}

export function journalCheckpointRoot({
  chainId,
  journal,
  tokenId,
  epoch,
  sequence,
  previous,
  throughInput,
  inputRoot,
  modelHash,
  stateRoot,
  archiveHash: archive,
  uri,
}) {
  return keccak256(
    abi.encode(
      [
        "string",
        "uint256",
        "address",
        "uint256",
        "uint256",
        "uint64",
        "bytes32",
        "uint256",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
        "bytes32",
      ],
      [
        CHECKPOINT_DOMAIN,
        chainId,
        getAddress(journal),
        tokenId,
        epoch,
        sequence,
        previous,
        throughInput,
        inputRoot,
        modelHash,
        stateRoot,
        archive,
        uriHash(uri),
      ],
    ),
  );
}

export function adjudicationRecordHash(record) {
  return keccak256(toUtf8Bytes(canonical(record)));
}

export function openingRecordHash({ seed, segmentId, positions, openings }) {
  return keccak256(
    toUtf8Bytes(
      canonical({
        schema: "iff.opening-record/1",
        seed,
        segmentId,
        positions,
        leaves: (openings || []).map((o) => o.leaf),
        proofs: (openings || []).map((o) => o.proof),
      }),
    ),
  );
}

export function publicArchive({
  segmentId,
  tokenId,
  packed,
  sim,
  inputs = [],
  probes = [],
  openings = [],
  datasetHash,
  startRoot,
  finalRoot,
}) {
  return {
    schema: "iff.segment-archive/1",
    audit: "TESTNET",
    yield: false,
    segmentId,
    tokenId,
    datasetHash: datasetHash || null,
    startRoot,
    finalRoot,
    inputs,
    commitment: packed.commitment,
    archiveHash: packed.archiveHash,
    sim,
    probes,
    openings: openings.map((o) => ({
      position: o.position,
      leaf: o.leaf,
      proof: o.proof,
      from: o.from,
      anchor: o.anchor,
    })),
  };
}

/** Map a SIM trajectory onto Hub Commitment + archiveHash. */
export function fromTrajectory(
  trajectory,
  { chainId, hub, tokenId, segmentId },
) {
  const pack = checkpointPack(trajectory.checkpointRoots);
  const commitment = {
    steps: trajectory.steps,
    checkpointEvery: trajectory.checkpointEvery,
    leafEvery: trajectory.leafEvery,
    startRoot: trajectory.startRoot,
    finalRoot: trajectory.finalRoot,
    trajectoryRoot: trajectory.root,
    checkpointPack: pack,
  };
  return {
    commitment,
    archiveHash: archiveHash({
      chainId,
      hub,
      tokenId,
      segmentId,
      ...commitment,
    }),
  };
}
