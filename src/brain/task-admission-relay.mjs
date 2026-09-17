import { hash, canonical, integer, identifier, requireValue } from "./codec.mjs";
import { createState, validateState, step } from "./runtime.mjs";

import { receiveAdmitted, OBSERVATION_SCHEMA, ADMISSION_POLICY } from "./relay-admission.mjs";
import { observeLocal, LOCAL_RELAY } from "./task-local-relay.mjs";

// Independent version: historical runner and evidence remain unchanged.
export const ADMISSION_RELAY = Object.freeze({
  ...LOCAL_RELAY, id: "admission-relay/1", receiver: ADMISSION_POLICY,
});
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export async function runAdmissionRelay(graph, world, {
  mode = "off", flies = 10, seedBase = 7000, rounds = 36, positions = null, deliveryCopies = 1,
  sessionId = "sim:admission-1", fault = "none",
} = {}) {
  identifier(sessionId);
  requireValue(["none", "environment", "expired", "conflict", "mixed-environment"].includes(fault), "ADMISSION_FAULT");
  integer(deliveryCopies, 1, 2, "deliveryCopies");
  requireValue(["off", "relay", "scrambled"].includes(mode), "RELAY_MODE");
  integer(flies, 1, 10, "flies"); integer(rounds, 1, 1000, "rounds");
  const variantsPerMessage = ["conflict", "mixed-environment"].includes(fault) ? 2 : 1;
  requireValue((flies - 1) * 2 * deliveryCopies * variantsPerMessage <= 40, "ADMISSION_BATCH_BUDGET");
  integer(seedBase, 1, 0xffffffff - flies + 1, "seedBase");
  requireValue(world?.schema === "iff.world/1" && world.task === "forage-v1" && world.size === 10000, "WORLD_SCHEMA");
  identifier(world.envId); integer(world.seed, 1, 0xffffffff, "worldSeed");
  for (const key of ["food", "threats"]) {
    requireValue(Array.isArray(world[key]), "WORLD_ENTITIES");
    integer(world[key].length, key === "food" ? 1 : 0, 32, key);
    for (const item of world[key]) {
      requireValue(item && typeof item.consumed === "boolean", "WORLD_ENTITY");
      integer(item.x, 0, 10000, "x"); integer(item.y, 0, 10000, "y");
    }
  }
  const { worldHash, ...payload } = world;
  requireValue(await hash(payload) === worldHash, "WORLD_HASH");
  const starts = positions ?? Array.from({ length: flies }, (_, i) => ({ x: 1500 + (i % 5) * 1700, y: 3500 + Math.floor(i / 5) * 3000 }));
  requireValue(Array.isArray(starts) && starts.length === flies, "POSITIONS");
  const states = starts.map((p, i) => {
    integer(p.x, 0, 10000, "start.x"); integer(p.y, 0, 10000, "start.y");
    const s = createState(graph, { seed: seedBase + i, soulId: `local-${i}`, branchId: "local-relay" });
    s.body.x = p.x; s.body.y = p.y;
    return validateState(s, graph);
  });
  const initialStateHashes = await Promise.all(states.map(s => hash(s)));
  const members = states.map((_, i) => `sim:life-${i}`);
  const admissionStates = Array(flies).fill(undefined), decisions = [];
  const delay = fault === "expired" ? 2 : LOCAL_RELAY.delayRounds;
  const local = structuredClone(world), ledger = [], messages = [], receipts = [], traces = [];
  let pending = [], edgeVisits = 0, hazardExposure = 0, changedInputs = 0;
  let deliveryBytes = 0;
  const transmissions = [];
  let rawDeliveryBytes = 0;
  const settle = round => local.food.forEach((food, index) => {
    if (food.consumed) return;
    const taker = states.findIndex(s => distance2(s.body, food) <= LOCAL_RELAY.pickupRadius ** 2);
    if (taker >= 0) { food.consumed = true; ledger.push({ round, index, taker }); }
  });
  settle(0);
  const initialCollected = ledger.length;
  for (let round = 1; round <= rounds; round++) {
    const sensed = states.map(s => observeLocal(local, s.body));
    const outgoing = [];
    if (mode !== "off" && round + delay <= rounds) {
      sensed.forEach((view, from) => view.observations.forEach(observation => {
        const message = { schema: OBSERVATION_SCHEMA, id: `${round}:${from}:${observation.channel}`,
          task: world.task, envId: world.envId, worldHash, sessionId,
          instanceId: members[from], observedRound: round,
          observer: { x: states[from].body.x, y: states[from].body.y }, ...observation };
        messages.push(message); outgoing.push({ from, deliveryRound: round + delay, message });
      }));
    }
    const frames = states.map((s, to) => {
      const own = sensed[to].signal, wire = [];
      for (const envelope of pending) {
        if (envelope.from === to || envelope.deliveryRound !== round) continue;
        const message = envelope.message;
        // Faults are deterministic transport interventions, never observations.
        const delivered = mode === "scrambled" ? { ...message,
          x: (message.x + LOCAL_RELAY.coordinateScrambleOffset) % 10000,
          y: (message.y + LOCAL_RELAY.coordinateScrambleOffset) % 10000 } : message;
        const wrongWorld = { ...delivered, worldHash: `0x${worldHash.slice(2).split('').map(c => c === '0' ? '1' : '0').join('')}` };
        const variants = fault === "environment" ? [wrongWorld] :
          fault === "mixed-environment" ? [delivered, wrongWorld] :
          fault === "conflict" ? [delivered, { ...delivered, x: delivered.x === 10000 ? 9999 : delivered.x + 1 }] : [delivered];
        for (const variant of variants) for (let copy = 0; copy < deliveryCopies; copy++) {
          wire.push(structuredClone(variant));
          const payloadBytes = new TextEncoder().encode(canonical(variant)).byteLength;
          rawDeliveryBytes += payloadBytes;
          transmissions.push({ round, to, copy, messageId: message.id,
            message: structuredClone(variant), payloadBytes });
        }
      }
      const inbox = receiveAdmitted(wire, {
        task: world.task, envId: world.envId, worldHash, sessionId, members,
        recipient: members[to], round, body: { x: s.body.x, y: s.body.y }, own,
      }, admissionStates[to]);
      admissionStates[to] = inbox.state;
      decisions.push(...inbox.decisions);
      const applied = inbox.applied, received = inbox.accepted.map(m => m.id);
      for (const m of inbox.accepted) deliveryBytes += new TextEncoder().encode(canonical(m)).byteLength;
      receipts.push(...inbox.decisions.filter(d => d.accepted));
      const changed = applied.food !== own.food || applied.threat !== own.threat;
      if (changed) changedInputs++;
      return { round, fly: to, before: { ...s.body }, own, applied, received, changed };
    });
    for (let i = 0; i < flies; i++) {
      for (const pre of states[i].spikes) if (graph.metadata.nodes[pre].sign) edgeVisits += graph.offsets[pre + 1] - graph.offsets[pre];
      states[i].signal = frames[i].applied;
      states[i] = step(states[i], graph, 1);
      traces.push({ ...frames[i], after: { ...states[i].body }, action: states[i].lastAction });
    }
    settle(round);
    for (const s of states) if (local.threats.some(h => distance2(s.body, h) <= LOCAL_RELAY.pickupRadius ** 2)) hazardExposure++;
    pending = [...pending.filter(e => e.deliveryRound > round), ...outgoing];
  }
  requireValue(states.every(s => s.ticks === rounds), "RELAY_BUDGET");
  const result = {
    schema: "iff.admission-relay-run/1", audit: "SIM", policy: ADMISSION_RELAY,
    config: { mode, flies, seedBase, rounds, positions: structuredClone(starts), deliveryCopies, sessionId, fault },
    members, admissionStates, decisions,
    worldHash, worldSeed: world.seed, envId: world.envId,
    graphHash: graph.datasetHash, metadataHash: graph.metadataHash, model: states[0].model,
    initialStateHashes, finalStateHashes: await Promise.all(states.map(s => hash(s))),
    budget: { executedSteps: states.reduce((n,s) => n + s.ticks, 0), neuronUpdates: flies * rounds * graph.n,
      edgeVisits, messageLimit: flies * Math.max(0, rounds - 1) * 2,
      messages: messages.length, deliveries: receipts.length, deliveryPayloadBytes: deliveryBytes,
      rawDeliveries: transmissions.length, rawDeliveryPayloadBytes: rawDeliveryBytes,
      duplicateDeliveries: decisions.filter(d => d.reason === "DUPLICATE").length,
      rejectedDeliveries: decisions.filter(d => !d.accepted).length },
    outcome: { collected: ledger.length, initialCollected, foodTotal: local.food.length,
      success: ledger.length > 0, hazardExposure, changedInputs },
    ledger, messages, transmissions, receipts, traces,
    limitations: ["SIM candidate receiver integration, not T3 gain or learning evidence.",
      "SIM instance roster is not authentication. Admission state is carried per recipient for this run only.",
      "Fault scenarios perturb transport, not observation truth. Expired mode adds one round of delay.",
      "Payload byte counts exclude transport headers and CPU cost; duplicate handling still costs work.",
      "World/graph artifacts and matching code are required for replay; hashes alone are insufficient.",
      "Native state identity matches legacy local-relay for compatibility; run schema identifies the new policy."],
  };
  return { ...result, resultHash: await hash(result) };
}
