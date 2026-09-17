import { AbiCoder, keccak256, ZeroHash } from "ethers";
import { loadGraph } from "../brain/graph.mjs";
import { queryAllLogs, queryLatestLog } from "./chain.mjs";
import { buildLifeArchive } from "./replay.mjs";

export const REPLAY_GRAPH_URL = "/data/malecns-circuit/manifest.json";
export const REPLAY_GRAPH_ID = "malecns-circuit";
export const ARCHIVE_REF_SCHEMA = "ifs.life-archive-ref/1";

const coder = AbiCoder.defaultAbiCoder();
let graphWait = null;

export function decodeHead(raw) {
  if (!raw) {
    return {
      sequence: 0,
      inputCount: 0,
      consumedInputs: 0,
      inputRoot: ZeroHash,
      checkpointRoot: ZeroHash,
    };
  }
  return {
    sequence: Number(raw.sequence ?? raw[0] ?? 0),
    inputCount: Number(raw.inputCount ?? raw[1] ?? 0),
    consumedInputs: Number(raw.consumedInputs ?? raw[2] ?? 0),
    inputRoot: String(raw.inputRoot ?? raw[3] ?? ZeroHash),
    checkpointRoot: String(raw.checkpointRoot ?? raw[4] ?? ZeroHash),
  };
}

export function journalView(
  head,
  replayStatus = "idle",
  knownInputs = 0,
  loading = false,
) {
  if (loading && !head) {
    return {
      chain: "loading",
      replay: "loading",
      pendingInputs: 0,
      sealed: false,
    };
  }
  const inputs = Number(head?.inputCount) || 0;
  const consumed = Number(head?.consumedInputs) || 0;
  let replay = replayStatus;
  if (inputs > 0 && knownInputs === 0 && (replay === "idle" || !replay)) {
    replay = "eventsMiss";
  }
  return {
    chain: inputs > 0 ? "recorded" : "empty",
    replay,
    pendingInputs: Math.max(0, inputs - consumed),
    sealed: (Number(head?.sequence) || 0) > 0,
  };
}

export function snapshotJournal(
  head,
  { cached = [], chainId, journalAddr, tokenId, epoch } = {},
) {
  let inputs = mergeInputs(cached);
  if (head.inputCount === 1 && !inputs.length && chainId && journalAddr) {
    const recovered = recoverFirstInput({
      chainId,
      journalAddr,
      tokenId,
      epoch,
      inputRoot: head.inputRoot,
    });
    if (recovered) inputs = [recovered];
  }
  return {
    head,
    inputs,
    checkpoint: null,
    logsUnread: head.inputCount > inputs.length,
  };
}

export function mergeInputs(...lists) {
  const byIndex = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      const index = Number(item?.index);
      if (!Number.isInteger(index) || index < 1) continue;
      byIndex.set(index, { ...byIndex.get(index), ...item, index });
    }
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

function inputCacheKey(scope, tokenId) {
  return `iff.journal.inputs:${scope}:${tokenId}`;
}

export function recallInputs(scope, tokenId) {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = JSON.parse(
      sessionStorage.getItem(inputCacheKey(scope, tokenId)) || "[]",
    );
    return Array.isArray(raw) ? mergeInputs(raw) : [];
  } catch {
    return [];
  }
}

export function rememberInputs(scope, tokenId, inputs) {
  if (typeof sessionStorage === "undefined") return mergeInputs(inputs);
  const next = mergeInputs(recallInputs(scope, tokenId), inputs);
  try {
    sessionStorage.setItem(inputCacheKey(scope, tokenId), JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

export function nextInputRoot({
  chainId,
  journal,
  tokenId,
  epoch,
  prevRoot,
  nextIndex,
  kind,
  intensity,
}) {
  return keccak256(
    coder.encode(
      [
        "string",
        "uint256",
        "address",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
        "uint8",
        "uint16",
      ],
      [
        "ifs.input/1",
        chainId,
        journal,
        tokenId,
        epoch,
        nextIndex,
        prevRoot,
        kind,
        intensity,
      ],
    ),
  );
}

export function encodeArchiveRef({
  sha256,
  stateRoot,
  life,
  inputCount,
  graphId = REPLAY_GRAPH_ID,
}) {
  const json = JSON.stringify({
    schema: ARCHIVE_REF_SCHEMA,
    profile: "ifs.journal-replay/1",
    life,
    inputs: inputCount,
    graphId,
    sha256,
    stateRoot,
  });
  if (json.length > 480) throw new Error("Archive URI too long");
  return `data:application/json,${encodeURIComponent(json)}`;
}

export function asBytes32(hex) {
  const value = String(hex || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new Error("Need a 32-byte hash");
  return value;
}

function mapStimulus(log) {
  return {
    index: Number(log.args.inputIndex),
    kind: Number(log.args.kind),
    intensity: Number(log.args.intensity),
    epoch: Number(log.args.epoch),
    inputRoot: String(log.args.inputRoot),
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
  };
}

function mapCheckpoint(log) {
  return {
    sequence: Number(log.args.sequence),
    epoch: Number(log.args.epoch),
    previousRoot: String(log.args.previousRoot),
    stateRoot: String(log.args.stateRoot),
    archiveHash: String(log.args.archiveHash),
    inputRoot: String(log.args.inputRoot),
    throughInput: Number(log.args.throughInput),
    archiveURI: String(log.args.archiveURI),
    checkpointRoot: String(log.args.checkpointRoot),
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
  };
}

export function readStimulusFromReceipt(receipt, journal) {
  for (const log of receipt?.logs || []) {
    try {
      const parsed = journal.interface.parseLog(log);
      if (parsed?.name === "Stimulus") {
        return mapStimulus({
          args: parsed.args,
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        });
      }
    } catch {
      /* ignore unrelated logs */
    }
  }
  return null;
}

export function recoverFirstInput({
  chainId,
  journalAddr,
  tokenId,
  epoch = 0,
  inputRoot,
  intensity = 640,
}) {
  const want = String(inputRoot || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(want) || want === ZeroHash) return null;
  for (const tryEpoch of new Set([Number(epoch) || 0, 0])) {
    for (const kind of [0, 1, 2]) {
      const root = nextInputRoot({
        chainId,
        journal: journalAddr,
        tokenId,
        epoch: tryEpoch,
        prevRoot: ZeroHash,
        nextIndex: 1,
        kind,
        intensity,
      });
      if (root.toLowerCase() === want) {
        return {
          index: 1,
          kind,
          intensity,
          epoch: tryEpoch,
          inputRoot: root,
          recovered: true,
        };
      }
    }
  }
  return null;
}

export async function readJournalRecord(
  journal,
  tokenId,
  { fromBlock = 0, cached = [], chainId, epoch } = {},
) {
  const raw = await journal.heads(tokenId);
  const head = decodeHead(raw);
  const stimFilter = journal.filters.Stimulus(tokenId);
  const [stimLogs, ckptLogs, latest] = await Promise.all([
    queryAllLogs(journal, stimFilter, fromBlock, 400),
    queryAllLogs(journal, journal.filters.Checkpoint(tokenId), fromBlock, 400),
    head.inputCount
      ? queryLatestLog(journal, stimFilter, fromBlock, 400)
      : Promise.resolve(null),
  ]);
  if (
    latest &&
    !stimLogs.some(
      (log) => Number(log.args.inputIndex) === Number(latest.args.inputIndex),
    )
  ) {
    stimLogs.push(latest);
  }
  const recovered = snapshotJournal(head, {
    cached: mergeInputs(cached, stimLogs.map(mapStimulus)),
    chainId,
    journalAddr: journal.target,
    tokenId,
    epoch,
  });
  const inputs = recovered.inputs;
  const checkpoints = ckptLogs
    .map(mapCheckpoint)
    .sort((a, b) => a.sequence - b.sequence);
  return {
    head,
    inputs,
    checkpoint: checkpoints.at(-1) || null,
    logsUnread: head.inputCount > inputs.length,
  };
}

export function loadReplayGraph() {
  if (!graphWait) {
    graphWait = loadGraph(REPLAY_GRAPH_URL).catch((err) => {
      graphWait = null;
      throw err;
    });
  }
  return graphWait;
}

export async function checkReplay(soul, inputs, graph) {
  if (!inputs?.length) return { status: "idle" };
  const live = graph || (await loadReplayGraph());
  const identity = { life: soul.life, seed: soul.seed };
  const archive = await buildLifeArchive(live, identity, inputs);
  return {
    status: "matched",
    archive,
    graphId: live.manifest?.id || REPLAY_GRAPH_ID,
    neurons: live.n,
  };
}

export function downloadArchive(soul, archive) {
  const body = {
    schema: "ifs.life-archive-file/1",
    sha256: archive.sha256,
    stateRoot: archive.stateRoot,
    payload: archive.payload,
  };
  const blob = new Blob([JSON.stringify(body, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `soul-${soul.tokenId}-archive.json`;
  link.click();
  URL.revokeObjectURL(href);
}
