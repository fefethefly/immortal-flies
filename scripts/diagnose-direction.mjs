#!/usr/bin/env node
// Diagnostic only. No changes to production encoders, model or graph.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { createState, step } from "../src/brain/runtime.mjs";
import { decodeEthology } from "../src/brain/ethology.mjs";
import { createWorld, senseWorld } from "../src/brain/task.mjs";
import { observeLocal } from "../src/brain/task-local-relay.mjs";
import { hash, hashBytes, canonical, integer } from "../src/brain/codec.mjs";

export async function diagnoseDirection(graph, { seed = 43, steps = 8, distance = 600 } = {}) {
  integer(steps, 1, 128, "steps"); integer(distance, 401, 999, "distance");
  const start = createState(graph, { seed, soulId: "direction-probe", branchId: "diagnostic" });
  // Runtime heading 0 points +x; increasing headings turn towards +y.
  const placements = [ ["ahead", distance, 0], ["left", 0, -distance],
    ["right", 0, distance], ["behind", -distance, 0] ];
  const rows = [];
  for (const [name, dx, dy] of placements) {
    const world = await createWorld("direction-probe", 43, { foodCount: 1, threatCount: 0 });
    world.food = [{ x: start.body.x + dx, y: start.body.y + dy, consumed: false }];
    const { worldHash, ...payload } = world;
    world.worldHash = await hash(payload);
    const local = observeLocal(world, start.body);
    const legacy = senseWorld(world, start.body).signal;
    let open = structuredClone(start), closed = structuredClone(start);
    const openTrace = [], closedTrace = [];
    for (let i = 0; i < steps; i++) {
      // Open-loop: hold initial sensory signal, do not recompute at moved body.
      open.signal = { ...local.signal };
      open = step(open, graph, 1);
      openTrace.push({ tick: open.ticks, stateHash: await hash(open),
        spikesHash: await hash(open.spikes), voltageHash: await hash(open.voltage),
        motor: decodeEthology(open, graph), body: { ...open.body } });
      // Closed-loop: real distance feedback; deliberately a distinct experiment.
      const input = observeLocal(world, closed.body).signal;
      closed.signal = input;
      closed = step(closed, graph, 1);
      closedTrace.push({ input, stateHash: await hash(closed), body: { ...closed.body } });
    }
    rows.push({ name, world, observations: local.observations, localSignal: local.signal,
      legacySignal: legacy, openTrace, closedTrace });
  }
  const equal = field => rows.every(r => canonical(r[field]) === canonical(rows[0][field]));
  return { schema: "iff.direction-probe/1", seed, steps, distance, initialStateHash: await hash(start), rows,
    checks: { distinctCoordinateObservations: new Set(rows.map(r => canonical(r.observations))).size,
      sameLocalSignal: equal("localSignal"), sameLegacySignal: equal("legacySignal"),
      sameOpenLoopStatesAndMotor: equal("openTrace"), sameClosedLoopTrace: equal("closedTrace"),
      anyMovement: rows.some(r => r.openTrace.some(t => t.body.x !== start.body.x || t.body.y !== start.body.y)) } };
}

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const out = resolve(process.argv[2] ?? join(root, "reports"));
  const graph = await loadGraphFromDir(join(root, "public/data/malecns-circuit"));
  const paths = ["scripts/diagnose-direction.mjs", "src/brain/task.mjs", "src/brain/task-local-relay.mjs",
    "src/brain/runtime.mjs", "src/brain/ethology.mjs", "src/brain/codec.mjs", "src/brain/adapters.mjs",
    "src/brain/registry.mjs", "src/brain/graph.mjs", "server/src/shared/graph-fs.mjs"];
  const sources = {};
  for (const p of paths) sources[p] = await hashBytes(await readFile(join(root, p)));
  const probes = [];
  for (let seed = 43; seed < 63; seed++) {
    const probe = await diagnoseDirection(graph, { seed });
    assert.deepEqual(await diagnoseDirection(graph, { seed }), probe);
    probes.push(probe);
  }
  const summary = { probes: probes.length,
    identicalStaticInputs: probes.filter(p => p.checks.sameLocalSignal && p.checks.sameLegacySignal).length,
    identicalOpenLoopStates: probes.filter(p => p.checks.sameOpenLoopStatesAndMotor).length,
    divergentClosedLoopTraces: probes.filter(p => !p.checks.sameClosedLoopTrace).length,
    movingProbes: probes.filter(p => p.checks.anyMovement).length };
  const payload = { schema: "iff.direction-diagnostic/2", audit: "SIM", graph: graph.manifest, sources, summary, probes,
    limitations: ["Fixed heading 0 (+x), screen coordinates +y downward; left=-y, right=+y.",
      "Static equal-distance observations differ in coordinates; only scalar signals enter the tested runtime.",
      "Open-loop identity tests immediate encoding ambiguity, NOT impossibility of navigation using motion and temporal gradients.",
      "Closed-loop target distances change as the body moves; divergence is not proof of directional encoding.",
      "Spikes and voltages hashed separately; body is not a proxy for spikes. Source files and input worlds permit recomputation.",
      "20 paired initial seeds, one radius and heading, 1400-node subgraph; no learning, no intervention, no biological capability claim."] };
  for (const [p, expected] of Object.entries(sources)) assert.equal(await hashBytes(await readFile(join(root, p))), expected);
  await mkdir(out, { recursive: true });
  const file = join(out, "direction-diagnostic-v2.json");
  await writeFile(file, JSON.stringify({ ...payload, reportHash: await hash(payload) }));
  const { reportHash, ...saved } = JSON.parse(await readFile(file, "utf8"));
  assert.equal(await hash(saved), reportHash);
  console.log(JSON.stringify({ file, reportHash, summary }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
