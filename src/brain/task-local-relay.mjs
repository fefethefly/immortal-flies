import { hash, canonical, integer, identifier, requireValue } from "./codec.mjs";
import { createState, validateState, step } from "./runtime.mjs";

// Separate experimental version: does not change forage-v1 or previous reports.
export const LOCAL_RELAY = Object.freeze({
  id: "local-observation-relay/1", localRadius: 1000, relayRadius: 2500,
  pickupRadius: 400, relayGainPercent: 50, delayRounds: 1,
  maxMessagesPerFlyPerRound: 2, coordinateScrambleOffset: 5000,
});
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const intensity = (d2, radius) => Math.max(0, Math.floor(900 * (radius ** 2 - d2) / radius ** 2));

/** Only the observer accesses world objects. Receiver consumes message payloads,
 * never the current world or its consumed flags. Stale reports expire after one round.
 */
export function observeLocal(world, body) {
  const signal = { food: 0, threat: 0, light: 0 }, observations = [];
  for (const [channel, key] of [["food", "food"], ["threat", "threats"]]) {
    let nearest = null, best = Infinity;
    for (const entity of world[key]) {
      if (channel === "food" && entity.consumed) continue;
      const d2 = distance2(body, entity);
      if (d2 < LOCAL_RELAY.localRadius ** 2 && d2 < best) { best = d2; nearest = entity; }
    }
    if (nearest) {
      signal[channel] = intensity(best, LOCAL_RELAY.localRadius);
      observations.push({ channel, x: nearest.x, y: nearest.y });
    }
  }
  return { signal, observations };
}

export async function runLocalRelay(graph, world, {
  mode = "off", flies = 10, seedBase = 7000, rounds = 36, positions = null,
} = {}) {
  requireValue(["off", "relay", "scrambled"].includes(mode), "RELAY_MODE");
  integer(flies, 1, 10, "flies"); integer(rounds, 1, 1000, "rounds");
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
  const local = structuredClone(world), ledger = [], messages = [], receipts = [], traces = [];
  let pending = [], edgeVisits = 0, hazardExposure = 0, changedInputs = 0;
  let deliveryBytes = 0;
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
    if (mode !== "off" && round < rounds) {
      sensed.forEach((view, from) => view.observations.forEach(observation => {
        const message = { id: `${round}:${from}:${observation.channel}`, from, observedRound: round,
          deliveryRound: round + 1, observer: { x: states[from].body.x, y: states[from].body.y }, ...observation };
        messages.push(message); outgoing.push(message);
      }));
    }
    const frames = states.map((s, to) => {
      const own = sensed[to].signal, applied = { ...own };
      const received = [];
      for (const message of pending) {
        if (message.from === to || message.deliveryRound !== round) continue;
        // Scrambling is an explicit misinformation intervention, not an observation.
        const delivered = mode === "scrambled" ? { ...message,
          x: (message.x + LOCAL_RELAY.coordinateScrambleOffset) % 10000,
          y: (message.y + LOCAL_RELAY.coordinateScrambleOffset) % 10000 } : message;
        const value = Math.floor(intensity(distance2(s.body, delivered), LOCAL_RELAY.relayRadius) * LOCAL_RELAY.relayGainPercent / 100);
        applied[message.channel] = Math.max(applied[message.channel], value);
        deliveryBytes += new TextEncoder().encode(canonical(delivered)).byteLength;
        receipts.push({ round, to, messageId: message.id, deliveredX: delivered.x, deliveredY: delivered.y, value });
        received.push(message.id);
      }
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
    pending = outgoing;
  }
  requireValue(states.every(s => s.ticks === rounds), "RELAY_BUDGET");
  const result = {
    schema: "iff.local-relay-run/1", audit: "SIM", policy: LOCAL_RELAY,
    config: { mode, flies, seedBase, rounds, positions: starts },
    worldHash, worldSeed: world.seed, envId: world.envId,
    graphHash: graph.datasetHash, metadataHash: graph.metadataHash, model: states[0].model,
    initialStateHashes, finalStateHashes: await Promise.all(states.map(s => hash(s))),
    budget: { executedSteps: states.reduce((n,s) => n + s.ticks, 0), neuronUpdates: flies * rounds * graph.n,
      edgeVisits, messageLimit: flies * Math.max(0, rounds - 1) * 2,
      messages: messages.length, deliveries: receipts.length, deliveryPayloadBytes: deliveryBytes },
    outcome: { collected: ledger.length, initialCollected, foodTotal: local.food.length,
      success: ledger.length > 0, hazardExposure, changedInputs },
    ledger, messages, receipts, traces,
  };
  return { ...result, resultHash: await hash(result) };
}
