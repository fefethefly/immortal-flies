#!/usr/bin/env node
// Three paired arms. No training, cloud or chain access.
// Usage: node scripts/run-local-relay.mjs [environments=100] [outputDir]
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { createWorld } from "../src/brain/task.mjs";
import { runLocalRelay, LOCAL_RELAY } from "../src/brain/task-local-relay.mjs";
import { hash, hashBytes, canonical, integer } from "../src/brain/codec.mjs";

const root = resolve(import.meta.dirname, "..");
const count = integer(Number(process.argv[2] ?? 100), 1, 1000, "environments");
const out = resolve(process.argv[3] ?? join(root, "reports"));
const graph = await loadGraphFromDir(join(root, "public/data/malecns-circuit"));
const config = { environments: count, seedStart: 1000, envId: "local-relay", flies: 10, rounds: 36, seedBase: 7000 };
const modes = ["off", "relay", "scrambled"];
const sources = {};
for (const path of ["src/brain/task-local-relay.mjs", "src/brain/task.mjs", "src/brain/runtime.mjs", "src/brain/codec.mjs", "src/brain/ethology.mjs", "src/brain/adapters.mjs", "src/brain/registry.mjs", "src/brain/graph.mjs", "server/src/shared/graph-fs.mjs", "scripts/run-local-relay.mjs"]) {
  sources[path] = await hashBytes(await readFile(join(root, path)));
}
const rows = [], elapsedMs = { off: 0, relay: 0, scrambled: 0 };
for (let i = 0; i < count; i++) {
  const world = await createWorld(config.envId, config.seedStart + i);
  const original = canonical(world), runs = {};
  for (const mode of modes) {
    const started = performance.now();
    const r = await runLocalRelay(graph, world, { ...config, mode });
    elapsedMs[mode] += performance.now() - started;
    assert.equal(r.budget.executedSteps, 360);
    assert.equal(r.traces.length, 360);
    assert.ok(r.budget.messages <= r.budget.messageLimit);
    assert.equal(new Set(r.ledger.map(l => l.index)).size, r.outcome.collected);
    assert.ok(r.outcome.collected <= world.food.length);
    const { resultHash, ...payload } = r;
    assert.equal(await hash(payload), resultHash);
    // Replay every arm on every seed; comparisons are internal, not independent replication.
    assert.equal((await runLocalRelay(graph, world, { ...config, mode })).resultHash, resultHash);
    assert.equal(canonical(world), original);
    runs[mode] = r;
  }
  assert.deepEqual(runs.off.initialStateHashes, runs.relay.initialStateHashes);
  assert.deepEqual(runs.off.initialStateHashes, runs.scrambled.initialStateHashes);
  rows.push({ world, runs });
  if ((i + 1) % 20 === 0) console.error(`verified ${i + 1}/${count} environments, all three arms`);
}
const mean = a => a.reduce((n, v) => n + v, 0) / a.length;
const summary = Object.fromEntries(modes.map(mode => [mode, {
  successRate: mean(rows.map(r => Number(r.runs[mode].outcome.success))),
  meanCollected: mean(rows.map(r => r.runs[mode].outcome.collected)),
  meanInitialCollected: mean(rows.map(r => r.runs[mode].outcome.initialCollected)),
  meanHazardExposure: mean(rows.map(r => r.runs[mode].outcome.hazardExposure)),
  meanChangedInputs: mean(rows.map(r => r.runs[mode].outcome.changedInputs)),
  totalMessages: rows.reduce((n, r) => n + r.runs[mode].budget.messages, 0),
  totalDeliveries: rows.reduce((n, r) => n + r.runs[mode].budget.deliveries, 0),
  totalDeliveryPayloadBytes: rows.reduce((n, r) => n + r.runs[mode].budget.deliveryPayloadBytes, 0),
  totalEdgeVisits: rows.reduce((n, r) => n + r.runs[mode].budget.edgeVisits, 0),
} ]));
const paired = {};
for (const baseline of ["off", "scrambled"]) {
  const d = rows.map(r => r.runs.relay.outcome.collected - r.runs[baseline].outcome.collected);
  const average = mean(d), variance = d.length > 1 ? d.reduce((n, x) => n + (x - average) ** 2, 0) / (d.length - 1) : null;
  const margin = variance === null ? null : 1.96 * Math.sqrt(variance / d.length);
  paired[baseline] = { meanCollectedDelta: average,
    approximate95PercentInterval: margin === null ? null : [average - margin, average + margin],
    wins: d.filter(x => x > 0).length, losses: d.filter(x => x < 0).length, ties: d.filter(x => x === 0).length,
    changedTrajectoryEnvironments: rows.filter(r => canonical(r.runs.relay.traces.map(t => t.after)) !== canonical(r.runs[baseline].traces.map(t => t.after))).length };
}
const payload = { schema: "iff.local-relay-report/1", audit: "SIM", policy: LOCAL_RELAY, config,
  graph: graph.manifest, sources, summary, paired, perEnvironment: rows, replayVerified: count * 3,
  limitations: ["New local-observation experiment, not directly comparable with prior T1/T2 scores.",
    "Same starts, local sensing and state-step budget across arms; CPU, edge activity and message volume need not match.",
    "Messages are engineered coordinate observations; they do not prove the neural circuit generated language. Receiver alters scalar input, not navigation.",
    "Scrambled coordinates are misinformation, not a count-matched semantic shuffle; later trajectories can change message counts.",
    "Shared depletion provides environmental coupling. No learning, independent replication or full-graph run.",
    "Exploratory 100-seed pilot; intervals are normal approximations without multiplicity correction, not a promotion gate.",
    "Initial pickups included; hazard exposure is measured but not penalized; native energy is not a fitness metric."] };
const report = { ...payload, reportHash: await hash(payload), measurement: { node: process.version, platform: process.platform, elapsedMs } };
await mkdir(out, { recursive: true });
const file = join(out, `local-relay-${count}envs.json`);
await writeFile(file, JSON.stringify(report));
const { reportHash, measurement, ...saved } = JSON.parse(await readFile(file, "utf8"));
assert.equal(await hash(saved), reportHash);
console.log(JSON.stringify({ file, reportHash, summary, paired, replayVerified: count * 3 }, null, 2));
