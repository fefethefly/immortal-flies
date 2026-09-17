import { requireValue, integer, identifier, hash, hashBytes, canonical } from "./codec.mjs";
import { step, validateState, createState } from "./runtime.mjs";

/**
 * Task v1: deterministic virtual foraging world (iff.task/1).
 *
 * Discipline (SWARM-INTELLIGENCE-PROTOCOL §4 ①, §9):
 * 1. Pure function: (envId, seed) -> world; same inputs replay bit-identically.
 * 2. The sensory adapter (distance -> signal) is FIXED and versioned here.
 *    It never reads the evaluator's global truth beyond what the fly's body
 *    position supports; no leakage of optimal actions.
 * 3. Rewards are environmental events (reaching a source), not trade PnL.
 * 4. No Date.now(); all time is the episode tick counter.
 * 5. This measures task performance of the CURRENT kernel; it does not claim
 *    learning, intelligence, or any biological fidelity.
 */

export const TASK_ID = "forage-v1";
export const WORLD_SIZE = 10000;
const PICKUP_RADIUS = 400;
const SENSE_RADIUS = 2500;
const SIGNAL_AT_CONTACT = 900;

// xorshift32 over the seed; all world randomness comes from here.
function rngFrom(seed) {
  let x = integer(seed, 1, 0xffffffff, "seed") >>> 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x;
  };
}

function placeEntities(rng, count) {
  // Grid-jittered placement keeps entities off the exact walls.
  const cell = Math.floor(WORLD_SIZE / (count + 1));
  return Array.from({ length: count }, (_, i) => ({
    x: Math.min(WORLD_SIZE - 1, (i + 1) * cell + (rng() % cell)),
    y: Math.min(WORLD_SIZE - 1, (i + 1) * cell + (rng() % cell)),
    consumed: false,
  }));
}

/** (envId, seed) -> deterministic world. Identical inputs produce identical worlds. */
export async function createWorld(envId, seed, { foodCount = 3, threatCount = 2 } = {}) {
  identifier(envId, "envId");
  integer(foodCount, 1, 32, "foodCount");
  integer(threatCount, 0, 32, "threatCount");
  const rng = rngFrom(seed);
  const world = {
    schema: "iff.world/1",
    task: TASK_ID,
    envId,
    seed,
    size: WORLD_SIZE,
    pickupRadius: PICKUP_RADIUS,
    senseRadius: SENSE_RADIUS,
    food: placeEntities(rng, foodCount),
    threats: placeEntities(rng, threatCount),
  };
  world.worldHash = await hash(world);
  return world;
}

function distance2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * FIXED sensory adapter v1: the fly's body position -> three-channel signal.
 * Intensity falls linearly with distance inside SENSE_RADIUS and is 0 outside.
 * Deterministic; no access to state beyond body position and consumed flags.
 */
export function senseWorld(world, body) {
  integer(body.x, 0, WORLD_SIZE, "x");
  integer(body.y, 0, WORLD_SIZE, "y");
  const signal = { food: 0, threat: 0, light: 0 };
  let nearest = null;
  for (const source of world.food) {
    if (source.consumed) continue;
    const d2 = distance2(body.x, body.y, source.x, source.y);
    if (d2 <= PICKUP_RADIUS * PICKUP_RADIUS) return { signal: { food: SIGNAL_AT_CONTACT, threat: 0, light: 0 }, contact: source };
    if (d2 <= SENSE_RADIUS * SENSE_RADIUS) {
      const intensity = Math.trunc(SIGNAL_AT_CONTACT * (1 - Math.sqrt(d2) / SENSE_RADIUS));
      if (intensity > signal.food) signal.food = intensity;
      if (!nearest || d2 < nearest.d2) nearest = { d2, source };
    }
  }
  for (const hazard of world.threats) {
    const d2 = distance2(body.x, body.y, hazard.x, hazard.y);
    if (d2 <= SENSE_RADIUS * SENSE_RADIUS) {
      const intensity = Math.trunc(SIGNAL_AT_CONTACT * (1 - Math.sqrt(d2) / SENSE_RADIUS));
      if (intensity > signal.threat) signal.threat = intensity;
    }
  }
  return { signal, contact: null, nearest: nearest?.source || null };
}

/**
 * Run one episode: fixed tick budget, sensory adapter v1, runtime LIF kernel.
 * Returns a result record; identical (world, seed, ticks, stepsPerTick) inputs
 * replay bit-identically.
 */
export async function runEpisode(state, graph, world, { ticks = 60, stepsPerTick = 6 } = {}) {
  requireValue(world?.schema === "iff.world/1" && world.task === TASK_ID, "WORLD_SCHEMA");
  integer(ticks, 1, 10000, "ticks");
  integer(stepsPerTick, 1, 128, "stepsPerTick");
  requireValue(state.datasetHash === graph.datasetHash, "DATASET_MISMATCH");
  validateState(state, graph);
  const { worldHash, ...worldPayload } = world;
  requireValue(await hash(worldPayload) === worldHash, "WORLD_HASH");
  let s = structuredClone(state);
  const localWorld = structuredClone(world);
  const collected = [];
  const threatTicks = [];
  const trace = [];
  let edgeVisits = 0;
  const settle = (atStep) => {
    localWorld.food.forEach((food, index) => {
      if (!food.consumed && distance2(s.body.x, s.body.y, food.x, food.y) <= PICKUP_RADIUS ** 2) {
        food.consumed = true;
        collected.push({ atStep, index, x: food.x, y: food.y });
      }
    });
  };
  settle(0);
  for (let atStep = 1; atStep <= ticks * stepsPerTick; atStep++) {
    const { signal } = senseWorld(localWorld, s.body);
    const before = { ...s.body };
    for (const pre of s.spikes) {
      if (graph.metadata.nodes[pre].sign) edgeVisits += graph.offsets[pre + 1] - graph.offsets[pre];
    }
    s.signal = signal;
    s = step(s, graph, 1);
    settle(atStep);
    if (localWorld.threats.some(h => distance2(s.body.x, s.body.y, h.x, h.y) <= PICKUP_RADIUS ** 2)) threatTicks.push(atStep);
    trace.push({ atStep, before, signal, after: { ...s.body }, action: s.lastAction });
  }
  const result = {
    schema: "iff.task-run/2",
    task: TASK_ID,
    envId: world.envId,
    seed: world.seed, // Legacy alias: this is the environment seed, not the brain RNG.
    worldSeed: world.seed,
    initialRng: state.rng,
    initialStateHash: await hash(state),
    finalStateHash: await hash(s),
    metadataHash: graph.metadataHash,
    worldHash: world.worldHash,
    graphHash: graph.datasetHash,
    model: s.model,
    budget: { ticks, stepsPerTick, neuronSteps: ticks * stepsPerTick },
    outcome: {
      collected: collected.length,
      foodTotal: world.food.length,
      success: collected.length > 0,
      threatHits: threatTicks.length,
      energyEnd: s.body.energy,
      endX: s.body.x,
      endY: s.body.y,
    },
    collected,
    threatTicks,
    trace,
  };
  result.resultHash = await hashBytes(new TextEncoder().encode(canonical(result)));
  return result;
}

/**
 * T1 cohort: N flies in the SAME world, NO communication, independent seeds.
 * Each fly's episode is exactly a solo runEpisode (same worldHash, own seed);
 * the shared world is never mutated, so cohorts are pure parallel baselines.
 * Returns iff.cohort-run/1 with per-fly result hashes for recomputation.
 */
export async function runCohort(graph, world, { flies = 10, seedBase = 7000, stepsPerFly = null, ticks = 60, stepsPerTick = 6 } = {}) {
  requireValue(world?.schema === "iff.world/1" && world.task === TASK_ID, "WORLD_SCHEMA");
  integer(flies, 1, 256, "flies");
  integer(seedBase, 1, 0xffffffff - 256, "seedBase");
  // Budget discipline (SWARM-INTELLIGENCE-PROTOCOL §9): a cohort consumes the
  // SAME total neuron-step budget as a solo T0 episode by default (ticks ×
  // stepsPerTick, split evenly). Explicit stepsPerFly overrides for ablations.
  integer(ticks, 1, 10000, "ticks");
  integer(stepsPerTick, 1, 128, "stepsPerTick");
  const total = ticks * stepsPerTick;
  requireValue(stepsPerFly == null, "EXPLICIT_BUDGET_UNSUPPORTED");
  requireValue(total % flies === 0, "BUDGET_NOT_DIVISIBLE");
  const perFly = total / flies;
  integer(perFly, 1, 10000, "perFly");
  const runs = [];
  for (let i = 0; i < flies; i++) {
    const flySeed = seedBase + i;
    const state = createState(graph, { seed: flySeed, soulId: `t1-${world.seed}-${i}`, branchId: "cohort" });
    runs.push(await runEpisode(state, graph, world, { ticks: perFly, stepsPerTick: 1 }));
  }
  const cohort = {
    schema: "iff.cohort-run/1",
    task: TASK_ID,
    envId: world.envId,
    worldSeed: world.seed,
    worldHash: world.worldHash,
    communication: "none",
    budgetModel: "equal-total-vs-T0",
    flies,
    stepsPerFly: perFly,
    budget: { flies, stepsPerFly: perFly, neuronStepsTotal: flies * perFly },
    perFlyResults: runs.map((r) => ({
      flySeed: seedBase + runs.indexOf(r),
      initialRng: r.initialRng,
      resultHash: r.resultHash,
      collected: r.outcome.collected,
      success: r.outcome.success,
      threatHits: r.outcome.threatHits,
      energyEnd: r.outcome.energyEnd,
    })),
    outcome: {
      successFlies: runs.filter((r) => r.outcome.success).length,
      totalCollected: runs.reduce((n, r) => n + r.outcome.collected, 0),
      distinctResultHashes: new Set(runs.map((r) => r.resultHash)).size,
    },
  };
  cohort.cohortHash = await hashBytes(new TextEncoder().encode(canonical(cohort)));
  return cohort;
}

/**
 * T1-shared: N flies in ONE shared world, no communication, equal budgets.
 * Lockstep protocol (fixed, versioned, replayable):
 *  R1 validated immutable world/graph inputs; N independently seeded states.
 *  R2 one cloned food ledger; per-fly counters and traces.
 *  R3 initial contact settles once at round 0, reported separately.
 *  R4 each of exactly stepsPerFly rounds observes the same pre-action world.
 *  R5 every fly senses, then executes exactly one existing LIF step.
 *  R6 after ALL actions settle: food contacts + per-fly hazard exposure.
 *  R7 each unconsumed food awards one unit; lowest fly index breaks ties.
 *  R8 consumed food disappears for every fly; no messages, no learning.
 *  R9 executed steps sum to N × stepsPerFly (asserted via state.ticks deltas).
 *  R10 deterministic; input objects and graph are never mutated.
 * Returns iff.cohort-shared/1.
 */
export async function runSharedCohort(graph, world, { flies = 10, seedBase = 7000, stepsPerFly = 36, senseEvery = 1 } = {}) {
  requireValue(world?.schema === "iff.world/1" && world.task === TASK_ID, "WORLD_SCHEMA");
  integer(flies, 1, 256, "flies");
  integer(seedBase, 1, 0xffffffff - flies + 1, "seedBase");
  integer(stepsPerFly, 1, 10000, "stepsPerFly");
  requireValue(senseEvery === 1, "SENSE_INTERVAL_UNSUPPORTED");
  identifier(world.envId, "envId");
  integer(world.seed, 1, 0xffffffff, "worldSeed");
  requireValue(world.size === WORLD_SIZE && world.pickupRadius === PICKUP_RADIUS && world.senseRadius === SENSE_RADIUS, "WORLD_RULES");
  for (const key of ["food", "threats"]) {
    requireValue(Array.isArray(world[key]), "WORLD_ENTITIES");
    integer(world[key].length, key === "food" ? 1 : 0, 32, key);
    for (const item of world[key]) {
      requireValue(item && typeof item.consumed === "boolean", "WORLD_ENTITY");
      integer(item.x, 0, WORLD_SIZE, "entity.x");
      integer(item.y, 0, WORLD_SIZE, "entity.y");
    }
  }
  const { worldHash, ...worldPayload } = world;
  requireValue(await hash(worldPayload) === worldHash, "WORLD_HASH");
  const localWorld = structuredClone(world);
  const states = [];
  for (let i = 0; i < flies; i++) {
    states.push(createState(graph, { seed: seedBase + i, soulId: `t1s-${world.seed}-${i}`, branchId: "t1-shared" }));
  }
  states.forEach(s => validateState(s, graph));
  const initialStateHashes = await Promise.all(states.map(s => hash(s)));
  const initialTicks = states.map((s) => s.ticks);
  let edgeVisits = 0;
  const ledger = [];
  const threatSteps = [];
  const traces = states.map(() => []);
  const settle = (round) => {
    localWorld.food.forEach((food, index) => {
      if (food.consumed) return;
      const taker = states.findIndex((s) => distance2(s.body.x, s.body.y, food.x, food.y) <= PICKUP_RADIUS ** 2);
      if (taker >= 0) {
        food.consumed = true;
        ledger.push({ round, index, taker, x: food.x, y: food.y });
      }
    });
  };
  // R3: use the same settlement rule for initial and post-action contact.
  settle(0);
  const initialCollected = ledger.length;
  for (let round = 1; round <= stepsPerFly; round++) {
    // R4: every fly senses the same pre-action world snapshot this round.
    const signals = states.map((s) => senseWorld(localWorld, s.body).signal);
    // R5: then every fly executes exactly one LIF step.
    for (let i = 0; i < flies; i++) {
      const before = states[i];
      for (const pre of before.spikes) {
        if (graph.metadata.nodes[pre].sign) edgeVisits += graph.offsets[pre + 1] - graph.offsets[pre];
      }
      before.signal = signals[i];
      const after = step(before, graph, 1);
      states[i] = after;
      traces[i].push({ round, x: after.body.x, y: after.body.y, signal: signals[i], action: after.lastAction });
    }
    // R6: settlement is atomic with respect to sensing/acting this round.
    settle(round);
    for (let i = 0; i < flies; i++) {
      if (localWorld.threats.some(h => distance2(states[i].body.x, states[i].body.y, h.x, h.y) <= PICKUP_RADIUS ** 2)) {
        threatSteps.push({ round, fly: i });
      }
    }
  }
  const executed = states.map((s, i) => s.ticks - initialTicks[i]);
  requireValue(executed.every(n => n === stepsPerFly), "SHARED_BUDGET");
  const finalStateHashes = await Promise.all(states.map(s => hash(s)));
  const record = {
    schema: "iff.cohort-shared/1",
    task: TASK_ID,
    envId: world.envId,
    worldSeed: world.seed,
    worldHash: world.worldHash,
    graphHash: graph.datasetHash,
    communication: "none",
    worldModel: "shared-ledger",
    budgetModel: "explicit-total-state-steps",
    metadataHash: graph.metadataHash,
    seedBase,
    model: states[0].model,
    schedule: "sense-all-step-all-settle/1",
    flies,
    stepsPerFly,
    budget: {
      flies,
      stepsPerFly,
      neuronStepsTotal: flies * stepsPerFly,
      neuronUpdates: flies * stepsPerFly * graph.n,
      edgeVisits,
      executedSteps: executed.reduce((a, b) => a + b, 0),
    },
    perFly: states.map((s, i) => ({
      initialStateHash: initialStateHashes[i],
      finalStateHash: finalStateHashes[i],
      flySeed: seedBase + i,
      executedSteps: executed[i],
      collected: ledger.filter((l) => l.taker === i).length,
      body: s.body,
    })),
    outcome: {
      totalCollected: ledger.length,
      initialCollected,
      foodTotal: localWorld.food.length,
      threatExposureSteps: threatSteps.length,
      perFlyCollected: states.map((_, i) => ledger.filter((l) => l.taker === i).length),
    },
    ledger,
    threats: threatSteps,
    traces,
  };
  record.cohortHash = await hashBytes(new TextEncoder().encode(canonical(record)));
  return record;
}

/**
 * T2: shared world + simple broadcast (protocol "broadcast-positions/1").
 * Identical to runSharedCohort except one addition: after sensing each round,
 * any fly whose own food signal >= BROADCAST_THRESHOLD broadcasts the position
 * of its nearest food source; every other fly additionally receives a food
 * signal computed from ITS OWN position to that source with the same falloff,
 * maxed with its own signal. No direction, no learning, no voting; receive-all
 * is fixed protocol semantics. Deterministic and replayable.
 * Returns iff.cohort-broadcast/1.
 */
const BROADCAST_THRESHOLD = 100;

export async function runBroadcastCohort(graph, world, { flies = 10, seedBase = 7000, stepsPerFly = 36 } = {}) {
  requireValue(world?.schema === "iff.world/1" && world.task === TASK_ID, "WORLD_SCHEMA");
  integer(flies, 1, 256, "flies");
  integer(seedBase, 1, 0xffffffff - flies + 1, "seedBase");
  integer(stepsPerFly, 1, 10000, "stepsPerFly");
  identifier(world.envId, "envId");
  integer(world.seed, 1, 0xffffffff, "worldSeed");
  requireValue(world.size === WORLD_SIZE && world.pickupRadius === PICKUP_RADIUS && world.senseRadius === SENSE_RADIUS, "WORLD_RULES");
  for (const key of ["food", "threats"]) {
    requireValue(Array.isArray(world[key]), "WORLD_ENTITIES");
    integer(world[key].length, key === "food" ? 1 : 0, 32, key);
    for (const item of world[key]) {
      requireValue(item && typeof item.consumed === "boolean", "WORLD_ENTITY");
      integer(item.x, 0, WORLD_SIZE, "entity.x");
      integer(item.y, 0, WORLD_SIZE, "entity.y");
    }
  }
  const { worldHash, ...worldPayload } = world;
  requireValue(await hash(worldPayload) === worldHash, "WORLD_HASH");
  const localWorld = structuredClone(world);
  const states = [];
  for (let i = 0; i < flies; i++) {
    states.push(createState(graph, { seed: seedBase + i, soulId: `t2-${world.seed}-${i}`, branchId: "t2-broadcast" }));
  }
  states.forEach(s => validateState(s, graph));
  const initialTicks = states.map((s) => s.ticks);
  const ledger = [];
  const threatSteps = [];
  const traces = states.map(() => []);
  const broadcasts = [];
  let deliveryCount = 0;
  let payloadBytes = 0;
  let changedSignalCount = 0;
  let edgeVisits = 0;
  const initialStateHashes = await Promise.all(states.map(s => hash(s)));
  const settle = (round) => {
    localWorld.food.forEach((food, index) => {
      if (food.consumed) return;
      const taker = states.findIndex((s) => distance2(s.body.x, s.body.y, food.x, food.y) <= PICKUP_RADIUS ** 2);
      if (taker >= 0) {
        food.consumed = true;
        ledger.push({ round, index, taker, x: food.x, y: food.y });
      }
    });
  };
  settle(0);
  const initialCollected = ledger.length;
  for (let round = 1; round <= stepsPerFly; round++) {
    const senses = states.map((s) => senseWorld(localWorld, s.body));
    // Broadcast phase: sensing flies publish their nearest unconsumed source.
    const heard = [];
    for (let i = 0; i < flies; i++) {
      const { signal, nearest } = senses[i];
      if (signal.food >= BROADCAST_THRESHOLD && nearest) {
        const message = { round, from: i, x: nearest.x, y: nearest.y };
        broadcasts.push(message);
        heard.push(message);
      }
    }
    // Receive phase: everyone computes food intensity to every heard source
    // from its own position (same falloff), maxed with its own signal.
    const signals = states.map((s, i) => {
      let food = senses[i].signal.food;
      const before = food;
      for (const b of heard) {
        if (b.from === i) continue;
        const d2 = distance2(s.body.x, s.body.y, b.x, b.y);
        if (d2 <= SENSE_RADIUS ** 2) {
          const relayed = Math.trunc(SIGNAL_AT_CONTACT * (1 - Math.sqrt(d2) / SENSE_RADIUS));
          if (relayed > food) food = relayed;
        }
      }
      if (food !== before) changedSignalCount++;
      return { food, threat: senses[i].signal.threat, light: senses[i].signal.light };
    });
    deliveryCount += heard.length * (flies - 1);
    payloadBytes += heard.reduce((sum, message) => sum + new TextEncoder().encode(canonical(message)).byteLength, 0);
    for (let i = 0; i < flies; i++) {
      const before = states[i];
      for (const pre of before.spikes) {
        if (graph.metadata.nodes[pre].sign) edgeVisits += graph.offsets[pre + 1] - graph.offsets[pre];
      }
      before.signal = signals[i];
      const after = step(before, graph, 1);
      states[i] = after;
      traces[i].push({ round, x: after.body.x, y: after.body.y, signal: signals[i], action: after.lastAction });
    }
    settle(round);
    for (let i = 0; i < flies; i++) {
      if (localWorld.threats.some(h => distance2(states[i].body.x, states[i].body.y, h.x, h.y) <= PICKUP_RADIUS ** 2)) {
        threatSteps.push({ round, fly: i });
      }
    }
  }
  const executed = states.map((s, i) => s.ticks - initialTicks[i]);
  requireValue(executed.every(n => n === stepsPerFly), "SHARED_BUDGET");
  const record = {
    schema: "iff.cohort-broadcast/1",
    task: TASK_ID,
    envId: world.envId,
    worldSeed: world.seed,
    worldHash: world.worldHash,
    graphHash: graph.datasetHash,
    communication: "broadcast-positions/1",
    worldModel: "shared-ledger",
    budgetModel: "explicit-total-state-steps",
    schedule: "sense-broadcast-step-settle/1",
    broadcastThreshold: BROADCAST_THRESHOLD,
    flies,
    stepsPerFly,
    budget: { flies, stepsPerFly, neuronStepsTotal: flies * stepsPerFly, executedSteps: executed.reduce((a, b) => a + b, 0) },
    outcome: {
      totalCollected: ledger.length,
      initialCollected,
      foodTotal: localWorld.food.length,
      threatExposureSteps: threatSteps.length,
      broadcastCount: broadcasts.length,
      perFlyCollected: states.map((_, i) => ledger.filter((l) => l.taker === i).length),
    },
    ledger,
    broadcasts,
    threats: threatSteps,
    traces,
  };
  record.cohortHash = await hashBytes(new TextEncoder().encode(canonical(record)));
  return record;
}
