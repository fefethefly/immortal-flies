import { createServer } from "node:http";
import { mkdir, readFile, writeFile, rename, unlink, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, ZeroHash, getAddress } from "ethers";
import { loadGraphFromDir } from "../shared/graph-fs.mjs";
import { requireLittleEndianGraph } from "../../../src/brain/endian.mjs";
import { createState } from "../../../src/brain/runtime.mjs";
import { selectProbes, openProbe } from "../../../src/brain/flyswarm/segment.mjs";
import {
  DEFAULT_CHECKPOINT_EVERY,
  DEFAULT_LEAF_EVERY,
  DEFAULT_STEPS,
  runPrivateSegment,
  shouldRun,
} from "../../../src/life/private-runner.mjs";
import {
  appendLineage,
  buildRestorePack,
} from "../../../src/life/restore-life.mjs";
import { openingRecordHash } from "../../../src/life/mining-archive.mjs";
import { assertRunnerEnv, DEFAULT_ARCHIVE_RETAIN_MS } from "./guard.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function loadDotEnv() {
  const home = process.env.HOME || "";
  const files = [home && join(home, ".env"), join(root, ".env"), join(root, ".env.local")].filter(
    Boolean,
  );
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  }
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function readKey() {
  let key = (process.env.IFF_DEPLOY_KEY || process.env.IFF_RUNNER_KEY || "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("缺少 IFF_DEPLOY_KEY 或 IFF_RUNNER_KEY");
  }
  return key;
}

async function writeAtomic(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

async function waitUntil(provider, predicate, { intervalMs = 2000, tries = 90 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("timeout waiting for chain");
}

loadDotEnv();

const CHAIN_ID = Number(process.env.IFF_CHAIN_ID || 97);
const DEFAULT_TESTNET_DATA = join(root, "server/data/runner");
const listingRel =
  process.env.IFF_HUB_LISTING ||
  (CHAIN_ID === 56
    ? "public/contract/life/MiningHub.deployment.json"
    : "public/contract/life/MiningHub.testnet.json");
const hubListing = readJson(listingRel);
const dataDir = resolve(process.env.IFF_DATA_DIR || DEFAULT_TESTNET_DATA);
const mirrorDir = process.env.IFF_MIRROR_DIR
  ? resolve(process.env.IFF_MIRROR_DIR)
  : null;
const retainMs = Number(process.env.IFF_ARCHIVE_RETAIN_MS || DEFAULT_ARCHIVE_RETAIN_MS);
const env = assertRunnerEnv({
  chainId: CHAIN_ID,
  mainnetFlag: process.env.IFF_MAINNET_RUNNER || "",
  dataDir,
  defaultTestnetDir: DEFAULT_TESTNET_DATA,
  listing: hubListing,
});
const soulAbi = readJson("public/contract/life/ImmortalSoul.json").abi;
const journalAbi = readJson("public/contract/life/LifeJournal.json").abi;
const hubAbi = readJson("public/contract/life/MiningHub.json").abi;
const tokenIds = String(process.env.IFF_RUNNER_TOKENS || "1")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);
const steps = Number(process.env.IFF_RUNNER_STEPS || DEFAULT_STEPS);
const checkpointEvery = Number(
  process.env.IFF_RUNNER_CHECKPOINT_EVERY || DEFAULT_CHECKPOINT_EVERY,
);
const leafEvery = Number(process.env.IFF_RUNNER_LEAF_EVERY || DEFAULT_LEAF_EVERY);
const pollMs = Number(process.env.IFF_RUNNER_POLL_MS || 30_000);
const graphDir = resolve(
  process.env.IFF_GRAPH_DIR ||
    (existsSync(join(root, "public/data/malecns-full/graph.bin"))
      ? join(root, "public/data/malecns-full")
      : join(root, "public/data/malecns-circuit")),
);
const publicBase = (process.env.IFF_PUBLIC_BASE || "").replace(/\/$/, "");

const status = {
  service: "iff-private-runner",
  audit: env.audit,
  yield: false,
  chainId: CHAIN_ID,
  hub: hubListing.address,
  soul: hubListing.soul,
  journal: hubListing.journal,
  graphDir,
  dataset: null,
  ready: false,
  runner: null,
  lastTick: null,
  lastError: null,
  lastSegment: null,
  mirror: Boolean(mirrorDir),
  retainMs,
  note:
    env.audit === "MAINNET"
      ? "Private-track journal hosting. Public /archive is a restore pack. Service fee in live IFS, not mining yield."
      : "Private-track journal hosting. Public /archive is a restore pack. Not mining yield. Testnet mock IFS, not live IFS.",
};

async function publishArchive(segmentId, pack) {
  const id = String(segmentId).toLowerCase();
  const body = `${JSON.stringify(pack)}\n`;
  await writeAtomic(join(dataDir, `archive-${id}.json`), body);
  if (mirrorDir) await writeAtomic(join(mirrorDir, `archive-${id}.json`), body);
}

async function compactTrajectory(segmentId) {
  const file = join(dataDir, `trajectory-${String(segmentId).toLowerCase()}.json`);
  if (existsSync(file)) await unlink(file);
}

async function sweepExpiredArchives() {
  if (!retainMs || retainMs <= 0) return;
  const now = Date.now();
  const dirs = [dataDir, mirrorDir].filter(Boolean);
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const names = await readdir(dir);
    for (const name of names) {
      if (!name.startsWith("archive-") || !name.endsWith(".json")) continue;
      const file = join(dir, name);
      const info = await stat(file);
      if (now - info.mtimeMs > retainMs) await unlink(file);
    }
  }
}

async function loadArchive(segmentId) {
  const id = String(segmentId).toLowerCase();
  const primary = join(dataDir, `archive-${id}.json`);
  if (existsSync(primary)) return JSON.parse(await readFile(primary, "utf8"));
  if (mirrorDir) {
    const mirrored = join(mirrorDir, `archive-${id}.json`);
    if (existsSync(mirrored)) return JSON.parse(await readFile(mirrored, "utf8"));
  }
  return null;
}

async function loadTrajectory(segmentId) {
  const id = String(segmentId).toLowerCase();
  const file = join(dataDir, `trajectory-${id}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const archive = await loadArchive(id);
  return archive?.trajectory || null;
}

async function saveLineage(tokenId, pack) {
  const file = join(dataDir, `life-${tokenId}.json`);
  const previous = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : null;
  await writeAtomic(file, `${JSON.stringify(appendLineage(previous, pack), null, 2)}\n`);
}

async function loadWork(tokenId) {
  const file = join(dataDir, `work-${tokenId}.json`);
  if (!existsSync(file)) return { nonce: 1, segment: null };
  return JSON.parse(await readFile(file, "utf8"));
}

async function fetchPendingInputs(journal, tokenId) {
  const head = await journal.heads(tokenId);
  const consumed = Number(head.consumedInputs);
  const count = Number(head.inputCount);
  if (count <= consumed) return [];
  const logs = await journal.queryFilter(journal.filters.Stimulus(tokenId));
  return logs
    .map((log) => ({
      index: Number(log.args.inputIndex),
      kind: Number(log.args.kind),
      intensity: Number(log.args.intensity),
    }))
    .filter((item) => item.index > consumed && item.index <= count)
    .sort((a, b) => a.index - b.index);
}

async function saveWork(tokenId, work) {
  await writeAtomic(join(dataDir, `work-${tokenId}.json`), `${JSON.stringify(work, null, 2)}\n`);
}

async function loadState(tokenId, graph, soul) {
  const file = join(dataDir, `state-${tokenId}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  const genome = await soul.getGenome(tokenId);
  const life = await soul.lifeId(tokenId);
  return createState(graph, {
    seed: Number(genome.seed),
    soulId: life,
    branchId: "testnet",
  });
}

async function saveState(tokenId, state) {
  await writeAtomic(join(dataDir, `state-${tokenId}.json`), `${JSON.stringify(state)}\n`);
}

async function send(tx) {
  const sent = await tx;
  const receipt = await sent.wait();
  if (receipt.status !== 1) throw new Error("tx failed");
  return receipt;
}

function archiveUri(segmentId) {
  if (publicBase) return `${publicBase}/archive/${segmentId}`;
  return `iff://testnet-runner/${segmentId}`;
}

async function commitOpened({ soul, journal, hub, tokenId, work }) {
  const epoch = await soul.controlEpoch(tokenId);
  const head = await journal.heads(tokenId);
  await send(
    journal.checkpoint(
      tokenId,
      epoch,
      head.checkpointRoot,
      head.inputCount,
      work.segment.commitment.finalRoot,
      work.segment.archiveHash,
      work.segment.uri,
    ),
  );
  await send(
    hub.commitPrivate(
      work.segment.id,
      work.segment.commitment,
      epoch,
      head.checkpointRoot,
      work.segment.uri,
    ),
  );
}

async function settleCommitted({ provider, hub, work, graph }) {
  const id = work.segment.id;
  const seg = await hub.segments(id);
  const commitBlock = Number(seg.commitBlock);
  await waitUntil(provider, async () => (await provider.getBlockNumber()) >= commitBlock + 3);
  const latest = await hub.segments(id);
  if (latest.seed === ZeroHash) await send(hub.lockSeed(id));
  const locked = await hub.segments(id);
  const orderLeaf = Number(work.segment.commitment?.leafEvery || leafEvery);
  const stepCount = Number(work.segment.commitment?.steps || steps);
  const probeCount = Math.min(3, Math.max(1, Math.floor(stepCount / orderLeaf) || 1));
  const probes = await selectProbes({
    seed: locked.seed,
    segmentId: id,
    steps: stepCount,
    leafEvery: orderLeaf,
    count: probeCount,
  });
  let openings = [];
  const packedArchive = await loadArchive(id);
  const trajectory = work.segment.trajectory || (await loadTrajectory(id));
  if (!trajectory) throw new Error(`missing local trajectory for ${id}`);
  openings = probes.map((position) => openProbe(trajectory, position));
  const openingHash = openingRecordHash({
    seed: locked.seed,
    segmentId: id,
    positions: probes,
    openings,
  });
  if (locked.openingHash === ZeroHash) await send(hub.recordOpening(id, openingHash));
  if (packedArchive) {
    delete packedArchive.trajectory;
    packedArchive.probes = probes;
    packedArchive.openings = openings.map((o) => ({
      position: o.position,
      leaf: o.leaf,
      proof: o.proof,
      from: o.from,
      anchor: o.anchor,
    }));
    packedArchive.openingHash = openingHash;
    await publishArchive(id, packedArchive);
  }
  const now = (await provider.getBlock("latest")).timestamp;
  if (now <= Number(locked.challengeUntil)) {
    return { action: "awaiting-window", segmentId: id, challengeUntil: Number(locked.challengeUntil) };
  }
  if (Number((await hub.segments(id)).status) === 2) await send(hub.settlePrivate(id));
  await compactTrajectory(id);
  return { action: "settled", segmentId: id };
}

async function finishSettled(tokenId, work, { persist = true } = {}) {
  if (persist && work.segment?.nextState) await saveState(tokenId, work.segment.nextState);
  work.segment = null;
  work.nonce = Number(work.nonce || 1) + 1;
  await saveWork(tokenId, work);
}

async function resumeOrRun({ provider, soul, journal, hub, runner, graph, tokenId }) {
  const tank = await hub.tanks(tokenId);
  const operator = await hub.operators(runner);
  const authorized = await soul.authorizedRunner(tokenId);
  const paused = await hub.paused();
  const gate = shouldRun({ paused, tank, operator, runner, authorized });
  const work = await loadWork(tokenId);
  if (work.segment?.id) {
    const onchain = await hub.segments(work.segment.id);
    const st = Number(onchain.status);
    const segmentId = work.segment.id;
    if (st === 1) {
      await commitOpened({ soul, journal, hub, tokenId, work });
      const settled = await settleCommitted({ provider, hub, work, graph });
      if (settled.action === "awaiting-window") return settled;
      await finishSettled(tokenId, work, { persist: true });
      return { action: "resumed-settled", segmentId };
    }
    if (st === 2) {
      const settled = await settleCommitted({ provider, hub, work, graph });
      if (settled.action === "awaiting-window") return settled;
      await finishSettled(tokenId, work, { persist: true });
      return { action: "resumed-settled", segmentId };
    }
    if (st === 4) await finishSettled(tokenId, work, { persist: true });
    if (st === 5 || st === 6) await finishSettled(tokenId, work, { persist: false });
  }
  if (!gate.ok) return { action: "idle", reason: gate.reason };
  const orderSteps = Number(tank.steps || 0) || steps;
  const state = await loadState(tokenId, graph, soul);
  const inputs = await fetchPendingInputs(journal, tokenId);
  const computed = await runPrivateSegment(graph, state, {
    chainId: CHAIN_ID,
    hub: await hub.getAddress(),
    tokenId,
    nonce: work.nonce || 1,
    steps: orderSteps,
    checkpointEvery,
    leafEvery,
    inputs,
  });
  work.segment = {
    id: computed.segmentId,
    tokenId,
    uri: archiveUri(computed.segmentId),
    commitment: computed.commitment,
    archiveHash: computed.archiveHash,
    nextState: computed.nextState,
    inputs,
  };
  await saveWork(tokenId, work);
  const pack = buildRestorePack({
    graph,
    computed,
    chainId: CHAIN_ID,
    hub: await hub.getAddress(),
    tokenId,
    nonce: work.nonce || 1,
    audit: env.audit,
  });
  await writeAtomic(
    join(dataDir, `trajectory-${computed.segmentId}.json`),
    `${JSON.stringify(computed.trajectory)}\n`,
  );
  await publishArchive(computed.segmentId, pack);
  await saveLineage(tokenId, pack);
  await send(
    hub.openSegment(computed.segmentId, tokenId, computed.commitment.steps, computed.parentRoot),
  );
  await commitOpened({ soul, journal, hub, tokenId, work });
  const settled = await settleCommitted({ provider, hub, work, graph });
  if (settled.action === "awaiting-window") return { ...settled, startRoot: computed.startRoot };
  await finishSettled(tokenId, work, { persist: true });
  return {
    action: "settled",
    segmentId: computed.segmentId,
    startRoot: computed.startRoot,
    finalRoot: computed.finalRoot,
    inputs: inputs.length,
  };
}

async function main() {
  const port = Number(process.env.PORT || 8788);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("access-control-allow-origin", "*");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (url.pathname === "/health") {
      res.statusCode = status.ready ? 200 : 503;
      res.end(
        JSON.stringify({
          ok: status.ready,
          audit: status.audit,
          yield: false,
          chainId: status.chainId,
          mirror: status.mirror,
          retainMs: status.retainMs,
        }),
      );
      return;
    }
    if (url.pathname === "/status") {
      res.statusCode = 200;
      res.end(JSON.stringify(status, null, 2));
      return;
    }
    const arch = /^\/archive\/(0x[0-9a-fA-F]{64})$/.exec(url.pathname);
    if (arch) {
      const body = await loadArchive(arch[1]);
      if (!body) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      delete body.trajectory;
      res.end(`${JSON.stringify(body)}\n`);
      return;
    }
    const life = /^\/life\/(\d+)$/.exec(url.pathname);
    if (life) {
      const file = join(dataDir, `life-${life[1]}.json`);
      if (!existsSync(file)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.end(await readFile(file, "utf8"));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolveListen) => server.listen(port, "0.0.0.0", resolveListen));
  console.log(`runner http :${port}`);

  const bin = await readFile(join(graphDir, "graph.bin"));
  requireLittleEndianGraph(bin);
  const graph = await loadGraphFromDir(graphDir);
  status.dataset = graph.manifest?.id || graphDir;
  const rpc =
    process.env.BSC_RPC ||
    (CHAIN_ID === 56
      ? process.env.BSC_MAINNET_RPC || "https://bsc-dataseed.bnbchain.org"
      : process.env.BSC_TESTNET_RPC || "https://bsc-testnet.publicnode.com");
  const provider = new JsonRpcProvider(rpc, CHAIN_ID, { staticNetwork: true });
  const wallet = new Wallet(readKey(), provider);
  status.runner = wallet.address;
  const soul = new Contract(hubListing.soul, soulAbi, wallet);
  const journal = new Contract(hubListing.journal, journalAbi, wallet);
  const hub = new Contract(hubListing.address, hubAbi, wallet);
  if (getAddress(await hub.soul()) !== getAddress(hubListing.soul)) {
    throw new Error("hub soul mismatch");
  }
  status.ready = true;
  console.log(
    JSON.stringify({
      runner: wallet.address,
      hub: hubListing.address,
      dataset: status.dataset,
      tokens: tokenIds,
      steps,
      yield: false,
    }),
  );

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    status.lastTick = new Date().toISOString();
    try {
      await sweepExpiredArchives();
      for (const tokenId of tokenIds) {
        try {
          const result = await resumeOrRun({
            provider,
            soul,
            journal,
            hub,
            runner: wallet.address,
            graph,
            tokenId,
          });
          status.lastSegment = { tokenId, ...result, at: status.lastTick };
          status.lastError = null;
          console.log(JSON.stringify(status.lastSegment));
        } catch (err) {
          status.lastError = String(err.message || err);
          console.error(`token ${tokenId}`, err);
        }
      }
    } finally {
      busy = false;
    }
  };

  setTimeout(() => {
    tick().catch((err) => {
      status.lastError = String(err.message || err);
      console.error(err);
    });
  }, 1000);
  setInterval(() => {
    tick().catch((err) => {
      status.lastError = String(err.message || err);
      console.error(err);
    });
  }, pollMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
