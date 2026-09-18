import { hash, canonical, integer, identifier, requireValue } from "./codec.mjs";
import { observeLocal, LOCAL_RELAY } from "./task-local-relay.mjs";

export const NAVIGATION_POLICY = Object.freeze({
  id: "coordinate-navigation-control/1", maxAxisStep: 35, avoidRadius: 600,
  relayRadius: LOCAL_RELAY.relayRadius, memoryRounds: 1,
  fallback: "rest", controller: "handwritten-not-neural",
});
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// Pure controller: only body and observations, never a world or ledger.
export function navigate(body, observations) {
  let food = null, threat = null;
  for (const o of observations) {
    if (o.channel === "food" && (!food || d2(body, o) < d2(body, food))) food = o;
    if (o.channel === "threat" && (!threat || d2(body, o) < d2(body, threat))) threat = o;
  }
  const avoid = threat && d2(body, threat) <= NAVIGATION_POLICY.avoidRadius ** 2;
  const target = avoid ? threat : food;
  if (!target) return { dx: 0, dy: 0, reason: "rest", target: null };
  const factor = avoid ? -1 : 1;
  let dx = factor * Math.sign(target.x - body.x) * Math.min(35, Math.abs(target.x - body.x));
  const dy = factor * Math.sign(target.y - body.y) * Math.min(35, Math.abs(target.y - body.y));
  if (avoid && dx === 0 && dy === 0) dx = 35;
  return { dx, dy, reason: avoid ? "avoid" : "approach", target: { ...target } };
}

export async function runNavigationControl(world, {
  mode = "off", flies = 10, rounds = 36, positions = null,
} = {}) {
  requireValue(["off", "relay", "scrambled"].includes(mode), "NAVIGATION_MODE");
  integer(flies, 1, 10, "flies"); integer(rounds, 1, 1000, "rounds");
  requireValue(world?.schema === "iff.world/1" && world.task === "forage-v1" && world.size === 10000, "WORLD_SCHEMA");
  identifier(world.envId); integer(world.seed, 1, 0xffffffff, "worldSeed");
  for (const key of ["food", "threats"]) {
    requireValue(Array.isArray(world[key]), "WORLD_ENTITIES");
    integer(world[key].length, key === "food" ? 1 : 0, 32, key);
    for (const entity of world[key]) {
      requireValue(entity && typeof entity.consumed === "boolean", "WORLD_ENTITY");
      integer(entity.x, 0, 10000, "entity.x"); integer(entity.y, 0, 10000, "entity.y");
    }
  }
  const { worldHash, ...payload } = world;
  requireValue(await hash(payload) === worldHash, "WORLD_HASH");
  const starts = positions ?? Array.from({ length: flies }, (_, i) => ({ x: 1500 + (i % 5) * 1700, y: 3500 + Math.floor(i / 5) * 3000 }));
  requireValue(Array.isArray(starts) && starts.length === flies, "POSITIONS");
  const bodies = starts.map(p => {
    integer(p.x, 0, 10000, "start.x"); integer(p.y, 0, 10000, "start.y");
    return { x: p.x, y: p.y };
  });
  const initialBodies = structuredClone(bodies), local = structuredClone(world);
  const ledger = [], messages = [], receipts = [], traces = [];
  let pending = [], hazardExposure = 0, changedActions = 0, deliveryBytes = 0;
  const settle = round => local.food.forEach((food, index) => {
    if (food.consumed) return;
    const taker = bodies.findIndex(body => d2(body, food) <= LOCAL_RELAY.pickupRadius ** 2);
    if (taker >= 0) { food.consumed = true; ledger.push({ round, index, taker }); }
  });
  settle(0);
  const initialCollected = ledger.length;
  for (let round = 1; round <= rounds; round++) {
    const sensed = bodies.map(body => observeLocal(local, body));
    const outgoing = [];
    if (mode !== "off" && round < rounds) sensed.forEach((view, from) => {
      view.observations.forEach(observation => {
        const message = { id: `${round}:${from}:${observation.channel}`, from,
          observedRound: round, deliveryRound: round + 1, observer: { ...bodies[from] }, ...observation };
        messages.push(message); outgoing.push(message);
      });
    });
    const frames = bodies.map((body, to) => {
      const known = sensed[to].observations.map(o => ({ ...o })), received = [];
      for (const message of pending) {
        if (message.from === to || message.deliveryRound !== round) continue;
        const delivered = mode === "scrambled" ? { ...message,
          x: (message.x + LOCAL_RELAY.coordinateScrambleOffset) % 10000,
          y: (message.y + LOCAL_RELAY.coordinateScrambleOffset) % 10000 } : message;
        const accepted = d2(body, delivered) < NAVIGATION_POLICY.relayRadius ** 2;
        if (accepted) known.push({ channel: delivered.channel, x: delivered.x, y: delivered.y });
        deliveryBytes += new TextEncoder().encode(canonical(delivered)).byteLength;
        receipts.push({ round, to, messageId: message.id, x: delivered.x, y: delivered.y, accepted });
        received.push(message.id);
      }
      const ownAction = navigate(body, sensed[to].observations), action = navigate(body, known);
      if (ownAction.dx !== action.dx || ownAction.dy !== action.dy) changedActions++;
      return { round, fly: to, before: { ...body }, ownObservations: sensed[to].observations, received, ownAction, action };
    });
    frames.forEach((frame, i) => {
      bodies[i] = { x: Math.max(0, Math.min(10000, bodies[i].x + frame.action.dx)),
        y: Math.max(0, Math.min(10000, bodies[i].y + frame.action.dy)) };
      traces.push({ ...frame, after: { ...bodies[i] } });
    });
    settle(round);
    for (const body of bodies) if (local.threats.some(h => d2(body, h) <= LOCAL_RELAY.pickupRadius ** 2)) hazardExposure++;
    pending = outgoing;
  }
  const result = { schema: "iff.navigation-control-run/1", audit: "SIM",
    policy: NAVIGATION_POLICY, observationPolicy: LOCAL_RELAY,
    config: { mode, flies, rounds, positions: initialBodies }, worldHash, worldSeed: world.seed, envId: world.envId,
    initialBodies, finalBodies: bodies,
    budget: { actionSteps: traces.length, neuralSteps: 0, messageLimit: flies * Math.max(0, rounds - 1) * 2,
      messages: messages.length, deliveries: receipts.length, deliveryPayloadBytes: deliveryBytes },
    outcome: { collected: ledger.length, initialCollected, success: ledger.length > 0, hazardExposure, changedActions },
    ledger, messages, receipts, traces };
  return { ...result, resultHash: await hash(result) };
}
