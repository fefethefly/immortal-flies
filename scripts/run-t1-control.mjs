#!/usr/bin/env node
/**
 * T1 control: N flies per environment, NO communication, SAME total neuron-step
 * budget as one T0 episode (SWARM-INTELLIGENCE-PROTOCOL S2).
 * Usage: node scripts/run-t1-control.mjs [envSeeds] [flies] [outdir]
 * Purpose: prove the environment has no moisture (paired per-seed vs T0) and
 * provide the equal-budget anchor for T3. Not a claim of intelligence.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { createWorld, runCohort } from "../src/brain/task.mjs";
import { hashBytes } from "../src/brain/codec.mjs";

const root = resolve(import.meta.dirname, "..");
const DATA = join(root, "public/data/malecns-circuit");
const ENV_SEEDS = Number(process.argv[2] || 100);
const FLIES = Number(process.argv[3] || 10);
const OUT = resolve(process.argv[4] || join(root, "reports"));
// Same budget knobs as the T0 script: 60 ticks × 6 steps = 360 neuron-steps/env.
const TICKS = 60;
const STEPS_PER_TICK = 6;

const graph = await loadGraphFromDir(DATA);
console.error(`graph loaded: ${graph.n} nodes, ${graph.e} edges (sha256 verified)`);

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const cohorts = [];
const started = performance.now();

for (let i = 0; i < ENV_SEEDS; i++) {
  const envSeed = 1000 + i; // paired with T0 env seeds
  const world = await createWorld("t0", envSeed);
  const cohort = await runCohort(graph, world, { flies: FLIES, seedBase: 7000, ticks: TICKS, stepsPerTick: STEPS_PER_TICK });
  cohorts.push(cohort);
}

// Paired comparison vs the T0 report if present.
let paired = null;
try {
  const t0 = JSON.parse(await readFile(join(OUT, "t0-baseline-100seeds.json"), "utf8"));
  const t0BySeed = new Map(t0.perSeed.map((p) => [p.seed, p]));
  const pairs = cohorts
    .map((c) => ({ seed: c.worldSeed, t0: t0BySeed.get(c.worldSeed), t1: c }))
    .filter((p) => p.t0);
  const diffs = pairs.map((p) => (p.t1.outcome.totalCollected > p.t0.collected ? 1 : p.t1.outcome.totalCollected < p.t0.collected ? -1 : 0));
  paired = {
    method: "paired env seeds, T1 cohort totalCollected vs T0 collected",
    pairs: pairs.length,
    t1Better: diffs.filter((d) => d > 0).length,
    t0Better: diffs.filter((d) => d < 0).length,
    ties: diffs.filter((d) => d === 0).length,
    meanCollectedDelta: +mean(pairs.map((p) => p.t1.outcome.totalCollected - p.t0.collected)).toFixed(3),
  };
} catch {
  paired = { note: "T0 report not found; run scripts/run-t0-baseline.mjs first for paired stats" };
}

const report = {
  schema: "iff.report/1",
  task: "forage-v1",
  tier: "T1",
  graphId: graph.manifest.id,
  graphHash: graph.datasetHash,
  graphNodes: graph.n,
  graphEdges: graph.e,
  config: {
    envSeeds: ENV_SEEDS,
    seedStart: 1000,
    fliesPerEnv: FLIES,
    flySeedBase: 7000,
    ticksPerSoloEquivalents: TICKS,
    soloStepsPerTick: STEPS_PER_TICK,
    budgetModel: "equal-total-vs-T0",
    stepsPerFly: Math.floor((TICKS * STEPS_PER_TICK) / FLIES),
    communication: "none",
    model: "lif-integer/1",
  },
  summary: {
    meanSuccessFlies: +mean(cohorts.map((c) => c.outcome.successFlies / c.flies)).toFixed(4),
    meanTotalCollected: +mean(cohorts.map((c) => c.outcome.totalCollected)).toFixed(3),
    meanThreatHitsPerFly: +mean(cohorts.flatMap((c) => c.perFlyResults.map((f) => f.threatHits))).toFixed(3),
  },
  pairedVsT0: paired,
  perEnv: cohorts.map((c) => ({
    envSeed: c.worldSeed,
    worldHash: c.worldHash,
    cohortHash: c.cohortHash,
    successFlies: c.outcome.successFlies,
    totalCollected: c.outcome.totalCollected,
    perFly: c.perFlyResults,
  })),
  provenance: {
    dataset: graph.manifest.dataset,
    note: "T1 control: independent world copies, no communication, total neuron-step budget equal to one T0 episode. Higher totals than T0 would reflect parallel independent search, NOT coordination.",
    measuredAt: new Date().toISOString(),
  },
};
report.reportHash = await hashBytes(new TextEncoder().encode(JSON.stringify(report.perEnv) + JSON.stringify(report.summary) + JSON.stringify(report.config)));

await mkdir(OUT, { recursive: true });
const file = join(OUT, `t1-control-${ENV_SEEDS}envs-${FLIES}flies.json`);
await writeFile(file, JSON.stringify(report, null, 2));
console.error(`cohorts done in ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log(JSON.stringify({ file, reportHash: report.reportHash, summary: report.summary, pairedVsT0: report.pairedVsT0 }, null, 2));
