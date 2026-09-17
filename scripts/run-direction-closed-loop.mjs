#!/usr/bin/env node
// Diagnostic only. No changes to production encoders, runtime, graph or tasks.
// Closed-loop direction experiment: three arms share the world, start state,
// observation layer and the UNMODIFIED production kernel; only stimulus
// routing differs:
//   directional: side-route/1 plan (officially annotated sides)
//   swapped:     same plan with left/right groups exchanged (control)
//   legacy:      scalar intensity into the full sensory group (baseline)
// Movement comes only from the kernel's own motor decode; heading is never
// written and no current enters left/right motor groups.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { createState, step } from "../src/brain/runtime.mjs";
import { createWorld } from "../src/brain/task.mjs";
import { observeLocal } from "../src/brain/task-local-relay.mjs";
import { encodeDirection } from "../src/brain/task-direction.mjs";
import { planSideStimulation } from "../src/brain/task-direction-mapping.mjs";
import { hash, hashBytes, integer } from "../src/brain/codec.mjs";

const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const viewGraph = (graph, food, threat) => ({ ...graph,
  metadata: { ...graph.metadata, groups: { ...graph.metadata.groups, food, threat } } });
const swapSides = ({ food, threat }) =>
  ({ food: { left: food.right, right: food.left }, threat: { left: threat.right, right: threat.left } });
const signedTurn = (startHeading, endHeading) =>
  ((endHeading - startHeading + 180) % 360 + 360) % 360 - 180;

export async function runClosedLoopArm(graph, world, start, { rounds, sides = null }) {
  integer(rounds, 1, 1000, "rounds");
  if (sides) planSideStimulation(encodeDirection([], start.body), sides);
  let s = structuredClone(start);
  const local = structuredClone(world);
  const events = [], trace = [];
  const settle = (round) => local.food.forEach((food, index) => {
    if (!food.consumed && distance2(s.body, food) <= local.pickupRadius ** 2) {
      food.consumed = true;
      events.push({ round, index, x: food.x, y: food.y });
    }
  });
  settle(0);
  const initialCollected = events.length;
  // Round-0 trace entry so metrics and replay checks are defined even when
  // every later round is out of sensor range.
  const frame0 = encodeDirection(observeLocal(local, s.body).observations, s.body);
  const unconsumed0 = local.food.filter((food) => !food.consumed).map((food) => distance2(s.body, food));
  trace.push({ round: 0, body: { ...s.body }, signal: { food: 0, threat: 0, light: 0 },
    nearestFood2: unconsumed0.length ? Math.min(...unconsumed0) : null,
    sense: { forward: frame0.channels.food.forward, right: frame0.channels.food.right,
      valid: frame0.channels.food.directionValid }, action: s.lastAction });
  for (let round = 1; round <= rounds; round++) {
    const view = observeLocal(local, s.body);
    const frame = encodeDirection(view.observations, s.body);
    let routed = null, signal = { food: view.signal.food, threat: view.signal.threat, light: 0 };
    if (sides) {
      const plan = planSideStimulation(frame, sides).plan;
      // side-route/1 semantics: the plan drive REPLACES the channel scalar;
      // unstimulated channels feed 0 (forward-only food drives nothing).
      signal = { food: plan.food.drive, threat: plan.threat.drive, light: 0 };
      routed = viewGraph(graph,
        plan.food.stimulated ? plan.food[plan.food.side] : [],
        plan.threat.stimulated ? plan.threat[plan.threat.side] : []);
    }
    s.signal = signal;
    s = step(s, routed ?? graph, 1);
    settle(round);
    const unconsumed = local.food.filter((food) => !food.consumed)
      .map((food) => distance2(s.body, food));
    trace.push({ round, body: { ...s.body }, signal: { ...s.signal },
      nearestFood2: unconsumed.length ? Math.min(...unconsumed) : null,
      sense: { forward: frame.channels.food.forward, right: frame.channels.food.right,
        valid: frame.channels.food.directionValid }, action: s.lastAction });
  }
  return { events, initialCollected, finalState: s, trace };
}

/** Behavioral metrics read from the arm's own trace (its own consumption state). */
const metrics = (world, arm) => {
  const distances = arm.trace.map((entry) => entry.nearestFood2 ?? 0);
  const approachTicks = distances.slice(1).filter((d, i) => d < distances[i]).length;
  const totalTurn = arm.trace.slice(1).reduce((sum, entry, i) =>
    sum + signedTurn(arm.trace[i].body.heading, entry.body.heading), 0);
  return { collected: arm.events.length - arm.initialCollected,
    threatExposure: arm.trace.filter((entry) =>
      world.threats.some((hazard) => distance2(entry.body, hazard) <= world.pickupRadius ** 2)).length,
    nearestFinal: distances[distances.length - 1],
    approachTicks, totalTurn, energyEnd: arm.finalState.body.energy,
    endBody: { ...arm.finalState.body } };
};

export async function runClosedLoop(graph, sideGroups, { seedCount = 20, seedBase = 43, rounds, worldSeedBase = 60000 } = {}) {
  integer(seedCount, 1, 64, "seedCount"); integer(seedBase, 1, 0xffffffff - seedCount, "seedBase");
  if (sideGroups) planSideStimulation(encodeDirection([], { x: 5000, y: 5000, heading: 0 }), sideGroups);
  const results = [];
  for (let seed = seedBase; seed < seedBase + seedCount; seed++) {
    const world = await createWorld("direction-closed-loop", worldSeedBase + seed);
    const start = createState(graph, { seed, soulId: "direction-closed-loop", branchId: "closed-loop" });
    const arms = {
      directional: await runClosedLoopArm(graph, world, start, { rounds, sides: sideGroups }),
      swapped: await runClosedLoopArm(graph, world, start, { rounds, sides: swapSides(sideGroups) }),
      legacy: await runClosedLoopArm(graph, world, start, { rounds }),
    };
    const replay = await runClosedLoopArm(graph, world, start, { rounds, sides: sideGroups });
    results.push({ seed, worldHash: world.worldHash,
      initialObservations: arms.directional.trace[0].sense,
      finalStateHashes: Object.fromEntries(await Promise.all(Object.entries(arms)
        .map(async ([name, arm]) => [name, await hash(arm.finalState)]))),
      replayMatchesDirectional: (await hash(replay.finalState)) === (await hash(arms.directional.finalState)),
      metrics: Object.fromEntries(Object.entries(arms)
        .map(([name, arm]) => [name, metrics(world, arm)])) });
  }
  return results;
}

const sum = (values) => values.reduce((a, b) => a + b, 0);
const mean = (values) => sum(values) / values.length;

function summarize(results) {
  const perArm = {};
  for (const name of ["directional", "swapped", "legacy"]) {
    const metricsList = results.map((entry) => entry.metrics[name]);
    const collectedList = metricsList.map((m) => m.collected);
    perArm[name] = {
      collectedTotal: sum(collectedList),
      fliesCollecting: collectedList.filter((c) => c > 0).length,
      approachTicksMean: mean(metricsList.map((m) => m.approachTicks)),
      threatExposure: sum(metricsList.map((m) => m.threatExposure)),
      nearestFinalMean2: mean(metricsList.map((m) => m.nearestFinal)),
      totalTurnMean: mean(metricsList.map((m) => Math.abs(m.totalTurn))),
      divergesFromLegacy: results.filter((r) =>
        r.finalStateHashes[name] !== r.finalStateHashes.legacy).length,
      divergesFromSwapped: results.filter((r) =>
        r.finalStateHashes[name] !== r.finalStateHashes.swapped).length,
    };
  }
  return { seeds: results.length, replaysMatched: results.filter((r) => r.replayMatchesDirectional).length,
    perArm, note: "Counts are outcome statistics, not significance claims; no learning." };
}

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const out = resolve(process.argv[2] ?? join(root, "reports"));
  const graph = await loadGraphFromDir(join(root, "public/data/malecns-circuit"));
  const sideGroupsFile = JSON.parse(await readFile(join(root, "reports/side-groups.json"), "utf8"));
  const { reportHash: sideGroupsHash, ...sideGroupsPayload } = sideGroupsFile;
  assert.equal(await hash(sideGroupsPayload), sideGroupsHash, "side-groups.json hash");
  const results = await runClosedLoop(graph, sideGroupsFile.sideGroups, { seedCount: 20, rounds: 36 });
  assert.deepEqual(await runClosedLoop(graph, sideGroupsFile.sideGroups, { seedCount: 20, rounds: 36 }), results);
  const paths = ["scripts/run-direction-closed-loop.mjs", "src/brain/task-direction.mjs",
    "src/brain/task-direction-mapping.mjs", "src/brain/task-local-relay.mjs",
    "src/brain/task.mjs", "src/brain/runtime.mjs", "src/brain/codec.mjs",
    "server/src/shared/graph-fs.mjs"];
  const sources = {};
  for (const p of paths) sources[p] = await hashBytes(await readFile(join(root, p)));
  const payload = { schema: "iff.direction-closed-loop/1", audit: "SIM",
    graph: graph.manifest, sideGroupsHash, config: { seedCount: 20, seedBase: 43, rounds: 36, worldSeedBase: 60000 },
    sources, summary: summarize(results), results, limitations: [
      "Three arms share world/start/observation/kernel; only stimulus routing differs.",
      "side-route/1 replaces the channel scalar; forward-only targets drive 0 (documented mapping limit).",
      "Total injected current scales with stimulated side size; per-neuron drive is uniform.",
      "Movement comes only from the kernel motor decode; no directional motor injection, no heading writes.",
      "Open-loop-free: sensing recomputed every round from the moved body.",
      "No learning, no significance claims; outcome statistics only.",
    ] };
  await mkdir(out, { recursive: true });
  const file = join(out, "direction-closed-loop-v1.json");
  await writeFile(file, JSON.stringify({ ...payload, reportHash: await hash(payload) }));
  const { reportHash, ...saved } = JSON.parse(await readFile(file, "utf8"));
  assert.equal(await hash(saved), reportHash);
  console.log(JSON.stringify({ file, reportHash, summary: payload.summary }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
