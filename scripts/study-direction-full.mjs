#!/usr/bin/env node
// Food-only matched-cohort study. No production edits; no motor-group injection.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { verifySideFile, remapSidesByBodyId } from "./audit-direction-paths.mjs";
import { runClosedLoopArm } from "./run-direction-closed-loop.mjs";
import { createState, step } from "../src/brain/runtime.mjs";
import { observeLocal } from "../src/brain/task-local-relay.mjs";
import { encodeDirection } from "../src/brain/task-direction.mjs";
import { hash, hashBytes, integer } from "../src/brain/codec.mjs";
const ROOT = resolve(import.meta.dirname, "..");
const bodyPath = arm => arm.trace.map(({ body }) => [body.x, body.y, body.heading]);

export async function studyGraph(graph, sides, { seeds = [43, 44, 45, 46], rounds = 36 } = {}) {
  integer(rounds, 1, 128, "rounds");
  const motor = new Set([...graph.metadata.groups.left, ...graph.metadata.groups.right]);
  const sensory = new Set(graph.metadata.groups.food);
  const sources = [...sides.food.left, ...sides.food.right];
  assert.ok(sources.every(i => sensory.has(i) && !motor.has(i)), "food source overlaps motor or is foreign");
  assert.ok(sides.food.left.length && sides.food.right.length);
  assert.equal(new Set(sources).size, sources.length);
  const routes = { directional: sides, swapped: { food: { left: sides.food.right, right: sides.food.left }, threat: sides.threat }, legacy: null };
  const neural = [], closed = [];
  for (const seed of seeds) {
    integer(seed, 1, 0xffffffff, "seed");
    const start = createState(graph, { seed, soulId: "full-study", branchId: "food-only" });
    const initialStateHash = await hash(start);
    for (const [placement, dx, dy] of [["ahead",600,0],["left",0,-600],["right",0,600],["behind",-600,0]]) {
      const world = { schema: "iff.world/1", task: "forage-v1", envId: "food-study", seed,
        size: 10000, pickupRadius: 400, senseRadius: 2500,
        food: [{ x: 5000 + dx, y: 5000 + dy, consumed: false }], threats: [] };
      world.worldHash = await hash(world);
      const arms = {};
      for (const [name, routing] of Object.entries(routes)) {
        const arm = await runClosedLoopArm(graph, world, start, { rounds, sides: routing });
        assert.equal(arm.trace.length, rounds + 1);
        // Full trace replay, not a hash of input/RNG fields masquerading as behavior.
        assert.deepEqual(await runClosedLoopArm(graph, world, start, { rounds, sides: routing }), arm);
        arms[name] = { collected: arm.events.length - arm.initialCollected, events: arm.events,
          path: bodyPath(arm), finalDistance2: (arm.finalState.body.x-world.food[0].x)**2 + (arm.finalState.body.y-world.food[0].y)**2,
          sensedSteps: arm.trace.slice(1).filter(t => t.sense.valid).length,
          finalStateHash: await hash(arm.finalState) };
      }
      closed.push({ seed, placement, world, initialStateHash, arms,
        directionalVsLegacyPathDifferent: JSON.stringify(arms.directional.path) !== JSON.stringify(arms.legacy.path),
        directionalVsSwappedPathDifferent: JSON.stringify(arms.directional.path) !== JSON.stringify(arms.swapped.path) });
      if (!["left", "right"].includes(placement)) continue;
      const frame = encodeDirection(observeLocal(world, start.body).observations, start.body);
      const selected = sides.food[placement];
      const routed = { ...graph, metadata: { ...graph.metadata, groups: { ...graph.metadata.groups, food: selected, threat: [] } } };
      let state = structuredClone(start);
      const trace = [];
      for (let tick = 1; tick <= 6; tick++) {
        state.signal = { food: frame.channels.food.intensity, threat: 0, light: 0 };
        state = step(state, routed, 1);
        const downstreamSpikes = state.spikes.filter(i => !sensory.has(i));
        trace.push({ tick, voltageHash: await hash(state.voltage), spikesHash: await hash(state.spikes),
          downstreamSpikesHash: await hash(downstreamSpikes), downstreamSpikeCount: downstreamSpikes.length });
      }
      neural.push({ seed, placement, trace });
    }
  }
  return { manifest: graph.manifest, neural, closed,
    summary: { scenarios: closed.length, neuralPairs: seeds.length,
      neuralPairsDifferent: seeds.filter(seed => {
        const rows = neural.filter(r => r.seed === seed);
        return JSON.stringify(rows[0].trace) !== JSON.stringify(rows[1].trace);
      }).length,
      pathDifferentFromLegacy: closed.filter(r => r.directionalVsLegacyPathDifferent).length,
      pathDifferentFromSwapped: closed.filter(r => r.directionalVsSwappedPathDifferent).length,
      collected: Object.fromEntries(Object.keys(routes).map(name => [name, closed.reduce((n,r) => n+r.arms[name].collected,0)])) } };
}

async function main() {
  const paths = ["scripts/study-direction-full.mjs", "scripts/audit-direction-paths.mjs", "scripts/run-direction-closed-loop.mjs",
    "src/brain/task-direction.mjs", "src/brain/task-direction-mapping.mjs", "src/brain/task-local-relay.mjs",
    "src/brain/runtime.mjs", "src/brain/ethology.mjs", "src/brain/codec.mjs", "src/brain/graph.mjs",
    "server/src/shared/graph-fs.mjs", "reports/side-groups.json"];
  const fingerprints = async () => Object.fromEntries(await Promise.all(paths.map(async p => [p, await hashBytes(await readFile(join(ROOT,p)))])));
  const sources = await fingerprints();
  const circuit = await loadGraphFromDir(join(ROOT,"public/data/malecns-circuit"));
  const full = await loadGraphFromDir(join(ROOT,"public/data/malecns-full"));
  const sideFile = JSON.parse(await readFile(join(ROOT,"reports/side-groups.json"),"utf8"));
  const sides = await verifySideFile(sideFile, circuit);
  const fullSides = remapSidesByBodyId(circuit, full, sides);
  for (const group of ["food","threat","light","left","right"]) {
    const ids = g => g.metadata.groups[group].map(i => g.metadata.nodes[i].id).sort();
    assert.deepEqual(ids(circuit), ids(full), `matched cohort ${group}`);
  }
  const config = { seeds: [43,44,45,46], rounds: 36 };
  const results = {};
  for (const [name, graph, routing] of [["circuit",circuit,sides],["full",full,fullSides]]) {
    console.log(`Running ${name}: ${graph.n} nodes`);
    results[name] = await studyGraph(graph, routing, config);
    console.log(name, JSON.stringify(results[name].summary));
  }
  assert.deepEqual(await fingerprints(), sources, "source changed during run");
  const payload = { schema: "iff.direction-full-study/1", audit: "SIM", config, sources, results,
    limitations: ["Four seeds x four placements, not independent random environments or a statistical superiority test.",
      "Food only, distance 600, no hazards; food routes explicitly exclude motor readouts. Earlier threat-overlap experiments are not pure sensory evidence.",
      "Per-neuron drive and RNG consumption differ with side size L23/R57. Swapping is not an equal-current intervention.",
      "Body paths use x/y/heading only; full-state hash differences alone are not behavior differences.",
      "Graph thresholds differ (circuit 8, full 10); size is not the sole intervention. Full is a filtered annotated graph, not all biological synapses.",
      "Zero ahead/behind drive is retained; no navigation policy, kernel, graph or weights were changed."] };
  const file = join(ROOT,"reports/direction-full-study-v1.json");
  await writeFile(file, JSON.stringify({ ...payload, reportHash: await hash(payload) })+"\n");
  const { reportHash, ...saved } = JSON.parse(await readFile(file,"utf8"));
  assert.equal(await hash(saved), reportHash);
  console.log(file, reportHash);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
