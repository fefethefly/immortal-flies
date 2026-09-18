#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { requireLittleEndianGraph } from "../src/brain/endian.mjs";
import { readFile } from "node:fs/promises";
import { createState } from "../src/brain/runtime.mjs";
import { compareVerification } from "../src/life/verify-compare.mjs";

const root = resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--") && argv[i + 1] != null) {
      out[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    } else out._.push(argv[i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const graphDir = resolve(args.graph || join(root, "public/data/malecns-circuit"));
  const out = resolve(args.out || join(root, "reports/segment-verify-compare-v1.json"));
  const bin = await readFile(join(graphDir, "graph.bin"));
  requireLittleEndianGraph(bin);
  const graph = await loadGraphFromDir(graphDir);
  const state = createState(graph, {
    seed: 43,
    soulId: "compare-v1",
    branchId: "sim",
  });
  const report = await compareVerification(graph, state, {
    steps: Number(args.steps || 1000),
    checkpointEvery: Number(args.checkpointEvery || 100),
    leafEvery: Number(args.leafEvery || 10),
    probeCount: Number(args.probes || 3),
    inputs: [{ kind: 0, intensity: 800 }],
    audit: "SIM",
  });
  report.host = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  };
  report.onChain = {
    fullReplay: "impossible: MiningHub does not call step()",
    sampling:
      "commitPrivate + lockSeed + recordOpening + settlePrivate; testnet gas filled after the new satellite settles",
  };
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ file: out, ...report }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
