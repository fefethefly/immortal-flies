import assert from "node:assert/strict";
import { encodeGraph } from "../src/brain/graph.mjs";
import { hash, hashBytes, canonical } from "../src/brain/codec.mjs";
import { runProtocolRelay } from "../src/brain/task-protocol-relay.mjs";

// Deliberately fixed synthetic smoke scenario, not a benchmark or MaleCNS graph.
export function scenario() {
  return {
    graph: { id: "protocol-smoke-two-node/1", metadata: { schema: "iff.connectome/1",
      nodes: [{ id: "a", sign: 1 }, { id: "b", sign: 1 }],
      groups: { food: [0, 1], threat: [0], light: [1], left: [0], right: [1] } },
      edges: [{ pre: 0, post: 1, weight: 10 }, { pre: 1, post: 0, weight: 10 }] },
    world: { schema: "iff.world/1", task: "forage-v1", size: 10000, envId: "protocol-smoke",
      seed: 43, food: [{ x: 5600, y: 5000, consumed: false }], threats: [] },
    config: { flies: 2, seedBase: 43, rounds: 32,
      positions: [{ x: 5000, y: 5000 }, { x: 3800, y: 5000 }] },
    arms: { off: { mode: "off", deliveryCopies: 1 }, relay: { mode: "relay", deliveryCopies: 1 },
      duplicate: { mode: "relay", deliveryCopies: 2 }, scrambled: { mode: "scrambled", deliveryCopies: 1 } },
  };
}
export async function materialize(plan) {
  assert.deepEqual(plan, scenario(), "unsupported smoke scenario");
  const graph = encodeGraph(structuredClone(plan.graph.metadata), plan.graph.edges);
  graph.datasetHash = await hashBytes(new Uint8Array(graph.offsets.buffer));
  graph.metadataHash = await hashBytes(new TextEncoder().encode(canonical(graph.metadata)));
  const world = { ...structuredClone(plan.world), worldHash: await hash(plan.world) };
  return { graph, world };
}
export function summarize(runs) {
  return Object.fromEntries(Object.entries(runs).map(([arm, r]) => [arm, {
    collected: r.outcome.collected, changedInputs: r.outcome.changedInputs,
    executedSteps: r.budget.executedSteps, rawDeliveries: r.budget.rawDeliveries,
    acceptedDeliveries: r.budget.deliveries, rawPayloadBytes: r.budget.rawDeliveryPayloadBytes,
    acceptedPayloadBytes: r.budget.deliveryPayloadBytes,
    finalBodies: r.traces.slice(-r.config.flies).map(t => t.after),
  }]));
}
export function checkRelations(runs) {
  for (const r of Object.values(runs)) {
    assert.equal(r.budget.executedSteps, 64);
    assert.deepEqual(r.initialStateHashes, runs.off.initialStateHashes);
  }
  for (const key of ["messages", "receipts", "traces", "ledger", "outcome", "finalStateHashes"]) {
    assert.deepEqual(runs.relay[key], runs.duplicate[key], key);
  }
  assert.ok(runs.relay.budget.rawDeliveries > 0);
  assert.equal(runs.duplicate.budget.rawDeliveries, 2 * runs.relay.budget.rawDeliveries);
  assert.equal(runs.duplicate.budget.rawDeliveryPayloadBytes, 2 * runs.relay.budget.rawDeliveryPayloadBytes);
  assert.equal(runs.off.budget.rawDeliveries, 0);
  assert.notDeepEqual(runs.relay.traces, runs.off.traces);
}
export async function buildBundle(sources) {
  const plan = scenario(), { graph, world } = await materialize(plan), runs = {};
  for (const [arm, options] of Object.entries(plan.arms)) {
    runs[arm] = await runProtocolRelay(graph, world, { ...plan.config, ...options });
  }
  checkRelations(runs);
  const payload = { schema: "iff.protocol-replay-bundle/1", audit: "SIM", plan,
    planHash: await hash(plan), graphHash: graph.datasetHash, metadataHash: graph.metadataHash,
    world, sources, runs, summary: summarize(runs),
    limitations: ["Synthetic two-node smoke fixture, not biological or T3 performance evidence.",
      "Data and logs are embedded; matching repository code and Node are required for replay.",
      "Source hashes establish integrity, not independent replication or authorship."] };
  return { ...payload, bundleHash: await hash(payload) };
}
export async function verifyBundle(bundle, sources) {
  const { bundleHash, ...payload } = bundle;
  assert.equal(payload.schema, "iff.protocol-replay-bundle/1");
  assert.equal(await hash(payload), bundleHash, "bundle hash");
  assert.deepEqual(payload.sources, sources, "source fingerprints");
  // Reconstruct every input, execute all arms, and compare every recorded field.
  assert.deepEqual(bundle, await buildBundle(sources), "full replay mismatch");
  return { verified: true, replayedArms: 4, stateSteps: 256, bundleHash };
}
