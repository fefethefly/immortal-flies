#!/usr/bin/env node
/**
 * Gate 2 CLI: verify / restore / continue / mirror a public life pack.
 * No wallet. Another machine needs the pack + a matching graph directory.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { requireLittleEndianGraph } from "../src/brain/endian.mjs";
import {
  appendLineage,
  buildRestorePack,
  continueFromRestored,
  restoredFiles,
  verifyRestorePack,
} from "../src/life/restore-life.mjs";

const root = resolve(import.meta.dirname, "..");
const DEFAULT_GRAPH = join(root, "public/data/malecns-circuit");

function usage() {
  return [
    "Usage:",
    "  node scripts/restore-life.mjs verify <pack.json> [--graph dir]",
    "  node scripts/restore-life.mjs restore <pack.json> --out dir [--graph dir]",
    "  node scripts/restore-life.mjs continue <pack.json> --out dir [--graph dir]",
    "  node scripts/restore-life.mjs mirror <pack.json> --out dir [--graph dir]",
  ].join("\n");
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--") && argv[i + 1] != null) {
      out[token.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      out._.push(token);
    }
  }
  return out;
}

async function loadPack(file) {
  return JSON.parse(await readFile(resolve(file), "utf8"));
}

async function loadGraph(dir) {
  const graphDir = resolve(dir || DEFAULT_GRAPH);
  const bin = await readFile(join(graphDir, "graph.bin"));
  requireLittleEndianGraph(bin);
  return loadGraphFromDir(graphDir);
}

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeRestored(outDir, pack, receipt, nextState) {
  const files = restoredFiles(pack, receipt, nextState);
  const lifeFile = join(outDir, `life-${pack.tokenId}.json`);
  if (existsSync(lifeFile)) {
    const lineage = JSON.parse(await readFile(lifeFile, "utf8"));
    files[`life-${pack.tokenId}.json`] = appendLineage(lineage, pack);
  }
  for (const [name, value] of Object.entries(files)) {
    await writeJson(join(outDir, name), value);
  }
  return Object.keys(files);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [command, packFile] = args._;
  if (!command || !packFile || !["verify", "restore", "continue", "mirror"].includes(command)) {
    throw new Error(usage());
  }
  const raw = await loadPack(packFile);
  const graph = await loadGraph(args.graph);
  if (command === "verify") {
    const verified = await verifyRestorePack(graph, raw);
    if (!verified.ok) {
      console.log(JSON.stringify({ ok: false, reason: verified.reason }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          yield: false,
          segmentId: verified.pack.segmentId,
          tokenId: verified.pack.tokenId,
          startRoot: verified.pack.startRoot,
          finalRoot: verified.pack.finalRoot,
          receiptHash: verified.receipt.receiptHash,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!args.out) throw new Error(usage());
  const outDir = resolve(args.out);
  await mkdir(outDir, { recursive: true });
  if (command === "mirror") {
    const verified = await verifyRestorePack(graph, raw);
    if (!verified.ok) throw new Error(verified.reason);
    await writeJson(join(outDir, `archive-${verified.pack.segmentId}.json`), verified.pack);
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "mirror",
          yield: false,
          segmentId: verified.pack.segmentId,
          receiptHash: verified.receipt.receiptHash,
          out: outDir,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === "restore") {
    const verified = await verifyRestorePack(graph, raw);
    if (!verified.ok) throw new Error(verified.reason);
    const files = await writeRestored(outDir, verified.pack, verified.receipt, verified.nextState);
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "restore",
          yield: false,
          segmentId: verified.pack.segmentId,
          tokenId: verified.pack.tokenId,
          finalRoot: verified.pack.finalRoot,
          receiptHash: verified.receipt.receiptHash,
          files,
          out: outDir,
        },
        null,
        2,
      ),
    );
    return;
  }
  const { verified, next } = await continueFromRestored(graph, raw, {
    chainId: raw.chainId,
    hub: raw.hub,
    tokenId: raw.tokenId,
    steps: Number(args.steps || raw.steps),
    checkpointEvery: raw.checkpointEvery,
    leafEvery: raw.leafEvery,
  });
  await writeRestored(outDir, verified.pack, verified.receipt, verified.nextState);
  const nextPack = buildRestorePack({
    graph,
    computed: next,
    chainId: raw.chainId,
    hub: raw.hub,
    tokenId: raw.tokenId,
    nonce: (verified.pack.nonce || 1) + 1,
    audit: verified.pack.audit,
  });
  await writeJson(join(outDir, `archive-${nextPack.segmentId}.json`), nextPack);
  await writeJson(join(outDir, `state-${nextPack.tokenId}.json`), next.nextState);
  await writeJson(join(outDir, `work-${nextPack.tokenId}.json`), {
    nonce: nextPack.nonce + 1,
    segment: null,
  });
  const lifeFile = join(outDir, `life-${nextPack.tokenId}.json`);
  const lineage = JSON.parse(await readFile(lifeFile, "utf8"));
  await writeJson(lifeFile, appendLineage(lineage, nextPack));
  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "continue",
        yield: false,
        from: verified.pack.segmentId,
        segmentId: next.segmentId,
        startRoot: next.startRoot,
        parentRoot: next.parentRoot,
        finalRoot: next.finalRoot,
        out: outDir,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
