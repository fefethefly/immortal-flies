#!/usr/bin/env node
/**
 * T0 baseline: single fly, frozen kernel, forage-v1 task.
 * Produces a downloadable, recomputable JSON report (SWARM-INTELLIGENCE-PROTOCOL S1).
 * Usage: node scripts/run-t0-baseline.mjs [seeds] [outdir]
 * No network, no cloud, no claims of learning — measurement of the current kernel only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { createState } from "../src/brain/runtime.mjs";
import { createWorld, runEpisode } from "../src/brain/task.mjs";
import { hashBytes } from "../src/brain/codec.mjs";

const root = resolve(import.meta.dirname, "..");
const DATA = join(root, "public/data/malecns-circuit");
const SEEDS = Number(process.argv[2] || 100);
const OUT = resolve(process.argv[3] || join(root, "reports"));

const graph = await loadGraphFromDir(DATA);
console.error(`graph loaded: ${graph.n} nodes, ${graph.e} edges (sha256 verified)`);

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const results = [];
const started = performance.now();

for (let i = 0; i < SEEDS; i++) {
  const seed = 1000 + i;
  const world = await createWorld("t0", seed);
  const state = createState(graph, { seed, soulId: `t0-${seed}`, branchId: "baseline" });
  const run = await runEpisode(state, graph, world, { ticks: 60, stepsPerTick: 6 });
  results.push(run);
}

const successes = results.filter((r) => r.outcome.success);
const report = {
  schema: "iff.report/1",
  task: "forage-v1",
  tier: "T0",
  graphId: graph.manifest.id,
  graphHash: graph.datasetHash,
  graphNodes: graph.n,
  graphEdges: graph.e,
  config: { seeds: SEEDS, seedStart: 1000, ticksPerEpisode: 60, stepsPerTick: 6, model: "lif-integer/1" },
  summary: {
    successRate: +(mean(results.map((r) => (r.outcome.success ? 1 : 0)))).toFixed(4),
    meanCollected: +mean(results.map((r) => r.outcome.collected)).toFixed(3),
    meanThreatHits: +mean(results.map((r) => r.outcome.threatHits)).toFixed(3),
    meanEnergyEnd: +mean(results.map((r) => r.outcome.energyEnd)).toFixed(1),
  },
  perSeed: results.map((r) => ({
    seed: r.seed,
    worldHash: r.worldHash,
    resultHash: r.resultHash,
    collected: r.outcome.collected,
    success: r.outcome.success,
    threatHits: r.outcome.threatHits,
    energyEnd: r.outcome.energyEnd,
  })),
  provenance: {
    dataset: graph.manifest.dataset,
    note: "T0 single-fly baseline with frozen lif-integer/1. No learning, no communication. Not a claim of intelligence.",
    measuredAt: new Date().toISOString(),
  },
};
report.summary.successSeeds = successes.length;
report.reportHash = await hashBytes(new TextEncoder().encode(JSON.stringify(report.perSeed) + JSON.stringify(report.summary) + JSON.stringify(report.config)));

await mkdir(OUT, { recursive: true });
const file = join(OUT, `t0-baseline-${SEEDS}seeds.json`);
await writeFile(file, JSON.stringify(report, null, 2));
console.error(`episodes done in ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log(JSON.stringify({ file, reportHash: report.reportHash, summary: report.summary }, null, 2));
