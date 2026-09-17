#!/usr/bin/env node
// Diagnostic only. No changes to production encoders, runtime, graph or tasks.
// Verifies whether side-route/1 drives carry direction information into the
// UNMODIFIED production LIF kernel: paired initial states, equal-distance
// targets in four body-relative directions, open-loop drive, voltage/spike
// hashes compared across directions. Legacy scalar path is the contrast.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { createState, step } from "../src/brain/runtime.mjs";
import { decodeEthology } from "../src/brain/ethology.mjs";
import { createWorld } from "../src/brain/task.mjs";
import { observeLocal } from "../src/brain/task-local-relay.mjs";
import { encodeDirection } from "../src/brain/task-direction.mjs";
import { planSideStimulation } from "../src/brain/task-direction-mapping.mjs";
import { hash, hashBytes, integer } from "../src/brain/codec.mjs";

const tracesDiffer = (a, b) =>
  a.some((t, i) => t.voltageHash !== b[i].voltageHash || t.spikesHash !== b[i].spikesHash);
const neuralStates = (trace) => JSON.stringify(trace.map((t) => [t.voltageHash, t.spikesHash]));
const neuralStatesIdentical = (a, b) => neuralStates(a) === neuralStates(b);

/**
 * Open-loop probe: one equal-distance food target per direction, drive held
 * fixed from the initial observation. A view graph reroutes the sensory
 * food/threat groups to the planned side; the kernel itself is untouched.
 * forward/light are never routed by side-route/1, so ahead/behind must stay
 * indistinguishable — that is a documented mapping limit, not a bug.
 */
export async function diagnoseDirectionNeural(graph, {
  seed = 43, steps = 10, distance = 600, sideGroups,
} = {}) {
  integer(steps, 1, 128, "steps"); integer(distance, 401, 999, "distance");
  integer(seed, 1, 0xffffffff, "seed");
  const start = createState(graph, { seed, soulId: "direction-neural-probe", branchId: "diagnostic" });
  // Fail fast on miswired routing groups even if no direction ever drives.
  planSideStimulation(encodeDirection([], start.body), sideGroups);
  const placements = [["ahead", distance, 0], ["left", 0, -distance],
    ["right", 0, distance], ["behind", -distance, 0], ["empty", null, null]];
  const rows = {};
  for (const [name, dx, dy] of placements) {
    const world = await createWorld("direction-neural-probe", 43, { foodCount: 1, threatCount: 0 });
    if (name === "empty") world.food = [];
    else world.food = [{ x: start.body.x + dx, y: start.body.y + dy, consumed: false }];
    const { worldHash, ...payload } = world;
    world.worldHash = await hash(payload);
    const view = observeLocal(world, start.body);
    const frame = encodeDirection(view.observations, start.body);
    const plan = planSideStimulation(frame, sideGroups);
    const routed = {
      ...graph,
      metadata: {
        ...graph.metadata,
        groups: {
          ...graph.metadata.groups,
          food: plan.plan.food.stimulated ? plan.plan.food[plan.plan.food.side] : [],
          threat: plan.plan.threat.stimulated ? plan.plan.threat[plan.plan.threat.side] : [],
        },
      },
    };
    const drive = {
      food: plan.plan.food.stimulated ? plan.plan.food.drive : 0,
      threat: plan.plan.threat.stimulated ? plan.plan.threat.drive : 0,
    };
    const run = async (useRouted) => {
      let s = structuredClone(start);
      const trace = [];
      for (let i = 0; i < steps; i++) {
        s.signal = useRouted ? { ...drive, light: 0 }
          : { food: view.signal.food, threat: view.signal.threat, light: 0 };
        s = step(s, useRouted ? routed : graph, 1);
        trace.push({ tick: s.ticks, signal: { ...s.signal },
          voltageHash: await hash(s.voltage), spikesHash: await hash(s.spikes),
          spikes: [...s.spikes], motor: (({ action, turn, left, right }) =>
            ({ action, turn, left, right }))(decodeEthology(s, useRouted ? routed : graph)) });
      }
      return trace;
    };
    rows[name] = { world, observations: view.observations, frame, plan: plan.plan,
      trace: await run(true), legacyTrace: await run(false) };
  }
  return { schema: "iff.direction-neural-probe/1", seed, steps, distance,
    initialStateHash: await hash(start), rows,
    checks: {
      leftRightDivergent: tracesDiffer(rows.left.trace, rows.right.trace),
      aheadBehindIdentical: neuralStatesIdentical(rows.ahead.trace, rows.behind.trace),
      aheadEqualsEmpty: neuralStatesIdentical(rows.ahead.trace, rows.empty.trace),
      legacyIdentical: [rows.ahead, rows.left, rows.right, rows.behind]
        .every((row) => neuralStatesIdentical(row.legacyTrace, rows.ahead.legacyTrace)),
    } };
}

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const out = resolve(process.argv[2] ?? join(root, "reports"));
  const graph = await loadGraphFromDir(join(root, "public/data/malecns-circuit"));
  const sideGroupsFile = JSON.parse(await readFile(join(root, "reports/side-groups.json"), "utf8"));
  const { reportHash: sideGroupsHash, ...sideGroupsPayload } = sideGroupsFile;
  assert.equal(await hash(sideGroupsPayload), sideGroupsHash, "side-groups.json hash");
  const paths = ["scripts/diagnose-direction-neural.mjs", "src/brain/task-direction.mjs",
    "src/brain/task-direction-mapping.mjs", "src/brain/task-local-relay.mjs",
    "src/brain/runtime.mjs", "src/brain/ethology.mjs", "src/brain/codec.mjs",
    "server/src/shared/graph-fs.mjs"];
  const sources = {};
  for (const p of paths) sources[p] = await hashBytes(await readFile(join(root, p)));
  const probes = [];
  for (let seed = 43; seed < 63; seed++) {
    const options = { seed, sideGroups: sideGroupsFile.sideGroups };
    const probe = await diagnoseDirectionNeural(graph, options);
    assert.deepEqual(await diagnoseDirectionNeural(graph, options), probe);
    probes.push(probe);
  }
  const summary = { probes: probes.length,
    leftRightDivergent: probes.filter((p) => p.checks.leftRightDivergent).length,
    forwardUnrepresented: probes.filter((p) => p.checks.aheadBehindIdentical && p.checks.aheadEqualsEmpty).length,
    legacyIdentical: probes.filter((p) => p.checks.legacyIdentical).length };
  const payload = { schema: "iff.direction-neural-diagnostic/1", audit: "SIM",
    graph: graph.manifest, sideGroupsHash, sources, summary,
    probes, limitations: [
      "Open-loop: drive from the initial observation is held fixed; no re-sensing.",
      "Total injected current scales with stimulated side size (food L23/R57); per-neuron drive is uniform by side-route/1.",
      "RNG consumption depends on stimulated group sizes; traces are compared per direction, not across group sizes.",
      "ahead/behind identity follows from side-route/1 never routing the forward component; it is a mapping limit, not a kernel result.",
      "Motor-group activity is recorded read-only via ethology; no directional current enters left/right groups.",
      "No learning, no behavior or foraging claim; neural-state differentiation only.",
    ] };
  await mkdir(out, { recursive: true });
  const file = join(out, "direction-neural-probe-v1.json");
  await writeFile(file, JSON.stringify({ ...payload, reportHash: await hash(payload) }));
  const { reportHash, ...saved } = JSON.parse(await readFile(file, "utf8"));
  assert.equal(await hash(saved), reportHash);
  console.log(JSON.stringify({ file, reportHash, summary }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
