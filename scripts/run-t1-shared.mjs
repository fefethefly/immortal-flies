#!/usr/bin/env node
// Local shared-world control. No network, training, messages or financial actions.
// Usage: node scripts/run-t1-shared.mjs [environments=100] [flies=10] [outputDir]
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { cpus } from "node:os";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { createWorld, runSharedCohort } from "../src/brain/task.mjs";
import { hash, hashBytes, integer, requireValue } from "../src/brain/codec.mjs";

const root = resolve(import.meta.dirname, "..");
const count = integer(Number(process.argv[2] ?? 100), 1, 1000, "environments");
const flies = integer(Number(process.argv[3] ?? 10), 1, 256, "flies");
requireValue(360 % flies === 0, "BUDGET_NOT_DIVISIBLE");
const output = resolve(process.argv[4] ?? join(root, "reports"));
const graph = await loadGraphFromDir(join(root, "public/data/malecns-circuit"));
const sourcePaths = ["src/brain/task.mjs", "src/brain/runtime.mjs", "src/brain/ethology.mjs", "src/brain/codec.mjs", "src/brain/adapters.mjs", "src/brain/registry.mjs", "src/brain/graph.mjs", "server/src/shared/graph-fs.mjs", "scripts/run-t1-shared.mjs"];
const sources = {};
for (const file of sourcePaths) sources[file] = await hashBytes(await readFile(join(root, file)));
const config = { environments: count, envId: "t0", worldSeedStart: 1000, seedBase: 7000, flies, totalStateSteps: 360, stepsPerFly: 360 / flies, foodCount: 3, threatCount: 2 };
const rows = [];
const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;
const start = performance.now();
let sharedMs = 0, soloMs = 0;
for (let i = 0; i < count; i++) {
  const world = await createWorld(config.envId, config.worldSeedStart + i);
  const t0 = performance.now();
  const shared = await runSharedCohort(graph, world, { flies, seedBase: config.seedBase, stepsPerFly: config.stepsPerFly });
  sharedMs += performance.now() - t0;
  const t1 = performance.now();
  // Fresh one-fly control using the SAME scheduler, initial RNG and total steps.
  const solo = await runSharedCohort(graph, world, { flies: 1, seedBase: config.seedBase, stepsPerFly: 360 });
  soloMs += performance.now() - t1;
  assert.equal(shared.budget.executedSteps, 360);
  assert.equal(solo.budget.executedSteps, 360);
  assert.equal(shared.outcome.totalCollected, shared.ledger.length);
  assert.ok(shared.ledger.length <= world.food.length);
  assert.equal(new Set(shared.ledger.map(row => row.index)).size, shared.ledger.length);
  // Independent executions on every environment, not merely a hash-shape check.
  assert.equal((await runSharedCohort(graph, world, { flies, seedBase: config.seedBase, stepsPerFly: config.stepsPerFly })).cohortHash, shared.cohortHash);
  assert.equal((await runSharedCohort(graph, world, { flies: 1, seedBase: config.seedBase, stepsPerFly: 360 })).cohortHash, solo.cohortHash);
  rows.push({ world, shared, solo });
  if ((i + 1) % 20 === 0) console.error(`verified ${i + 1}/${count} environments`);
}
const summary = {
  sharedSuccessRate: mean(rows.map(r => Number(r.shared.outcome.totalCollected > 0))),
  soloSuccessRate: mean(rows.map(r => Number(r.solo.outcome.totalCollected > 0))),
  sharedMeanCollected: mean(rows.map(r => r.shared.outcome.totalCollected)),
  soloMeanCollected: mean(rows.map(r => r.solo.outcome.totalCollected)),
  initialMeanCollected: mean(rows.map(r => r.shared.outcome.initialCollected)),
  sharedMeanThreatExposure: mean(rows.map(r => r.shared.outcome.threatExposureSteps)),
  soloMeanThreatExposure: mean(rows.map(r => r.solo.outcome.threatExposureSteps)),
  pairedMeanCollectedDelta: mean(rows.map(r => r.shared.outcome.totalCollected - r.solo.outcome.totalCollected)),
};
const payload = {
  schema: "iff.shared-control-report/1", audit: "SIM", task: "forage-v1", config,
  graph: graph.manifest, sources, summary, perEnvironment: rows,
  replayVerifiedEnvironments: count,
  limitations: ["Internal deterministic replay, not independent scientific replication.", "Equal state steps/neuron updates, not equal CPU, initialization cost or elapsed world time.", "No explicit communication; shared food depletion is environmental coupling.", "All flies start at (5000,5000); fixed index tie-breaking biases individual credit.", "Initial pickups count and are reported separately. Hazard exposure is not a task penalty; native energy is not a fitness score.", "Pilot uses existing forage-v1 scalar sensory mapping and diagonal-jitter placement, not full biological behavior.", "Fresh solo control uses seedBase=7000, not the previous T0 report's world-derived brain seeds. No claim of learning or cooperation."],
};
const reportHash = await hash(payload);
const report = { ...payload, reportHash, measurement: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model ?? "unknown", sharedMs, soloMs, totalMs: performance.now() - start, rssBytes: process.memoryUsage().rss } };
await mkdir(output, { recursive: true });
const file = join(output, `t1-shared-${count}envs-${flies}flies.json`);
await writeFile(file, JSON.stringify(report));
const saved = JSON.parse(await readFile(file, "utf8"));
const { reportHash: storedHash, measurement, ...storedPayload } = saved;
assert.equal(await hash(storedPayload), storedHash);
console.log(JSON.stringify({ file, reportHash, hashScope: "all fields except reportHash and measurement", summary, replayVerifiedEnvironments: count }, null, 2));
