import { clone, identifier, integer, requireValue } from "./codec.mjs";
import { modulate } from "./learn.mjs";

// Opt-in engineering learner. Not synaptic plasticity and not an iff.overlay/1 replacement.
export const ASSOCIATION_LEARNER = "context-association/1";
export const ASSOCIATION_SCHEMA = "iff.association-state/1";
const LIMIT = 256;
const CLOCK_MAX = 1_000_000_000;
const CHANNELS = ["food", "threat", "light"];

export function createAssociation({ rateBps = 2500, traceTicks = 8, forgetPerTick = 1 } = {}) {
  const state = {
    schema: ASSOCIATION_SCHEMA, learner: ASSOCIATION_LEARNER,
    tick: 0, sequence: 0, frozen: false,
    policy: { rateBps, traceTicks, forgetPerTick },
    entries: [], trace: null, updates: 0,
  };
  return validateAssociation(state);
}

/** Also used at the checkpoint boundary: JSON restore never silently resets learning. */
export function validateAssociation(s) {
  requireValue(s?.schema === ASSOCIATION_SCHEMA && s.learner === ASSOCIATION_LEARNER, "ASSOCIATION_SCHEMA");
  integer(s.tick, 0, CLOCK_MAX, "tick");
  integer(s.sequence, 0, CLOCK_MAX, "sequence");
  integer(s.updates, 0, s.sequence, "updates");
  requireValue(typeof s.frozen === "boolean", "ASSOCIATION_FROZEN");
  requireValue(s.policy && typeof s.policy === "object", "ASSOCIATION_POLICY");
  integer(s.policy.rateBps, 1, 10000, "rateBps");
  integer(s.policy.traceTicks, 1, 10000, "traceTicks");
  integer(s.policy.forgetPerTick, 0, 1000, "forgetPerTick");
  requireValue(Array.isArray(s.entries) && s.entries.length <= LIMIT, "ASSOCIATION_CAPACITY");
  const keys = new Set();
  for (const e of s.entries) {
    identifier(e.context, "context"); identifier(e.cue, "cue");
    const key = JSON.stringify([e.context, e.cue]);
    requireValue(!keys.has(key), "ASSOCIATION_DUPLICATE"); keys.add(key);
    integer(e.value, -1000, 1000, "value");
  }
  if (s.trace !== null) {
    const t = s.trace;
    requireValue(t && typeof t === "object", "ASSOCIATION_TRACE");
    identifier(t.context); identifier(t.cue);
    integer(t.tick, 0, s.tick, "trace.tick");
    integer(t.sequence, 1, s.sequence, "trace.sequence");
    requireValue(s.tick - t.tick < s.policy.traceTicks, "ASSOCIATION_TRACE_EXPIRED");
  }
  return s;
}

/**
 * Caller supplies a task-scoped clock and authoritative settlement events.
 * Observing a cue creates ONE eligibility trace; a new observation replaces it.
 * A settled ingestion/damage consumes that trace, including when learning is frozen.
 * This module cannot authenticate a remote sender: never feed raw messages as outcomes.
 */
export function reduceAssociation(state, event) {
  validateAssociation(state);
  requireValue(event && ["observe", "outcome", "advance", "freeze"].includes(event.type), "ASSOCIATION_EVENT");
  integer(event.tick, state.tick, CLOCK_MAX, "event.tick");
  integer(event.sequence, state.sequence + 1, state.sequence + 1, "event.sequence");
  const s = clone(state);
  const elapsed = event.tick - s.tick;
  if (!s.frozen) {
    for (const e of s.entries) {
      e.value = Math.sign(e.value) * Math.max(0, Math.abs(e.value) - elapsed * s.policy.forgetPerTick);
    }
  }
  s.tick = event.tick; s.sequence = event.sequence;
  if (s.trace && s.tick - s.trace.tick >= s.policy.traceTicks) s.trace = null;
  if (event.type === "observe") {
    identifier(event.context, "context"); identifier(event.cue, "cue");
    s.trace = { context: event.context, cue: event.cue, tick: s.tick, sequence: s.sequence };
  } else if (event.type === "freeze") {
    requireValue(typeof event.enabled === "boolean", "ASSOCIATION_FROZEN");
    s.frozen = event.enabled;
    // Do not carry a training trace across the train/evaluation boundary.
    s.trace = null;
  } else if (event.type === "outcome") {
    requireValue(["ingestion", "damage"].includes(event.kind), "ASSOCIATION_SETTLEMENT");
    integer(event.magnitude, 1, 1000, "magnitude");
    requireValue(s.trace && event.observationSequence === s.trace.sequence, "ASSOCIATION_CREDIT");
    const t = s.trace;
    if (!s.frozen) {
      let entry = s.entries.find(e => e.context === t.context && e.cue === t.cue);
      if (!entry) {
        requireValue(s.entries.length < LIMIT, "ASSOCIATION_CAPACITY");
        entry = { context: t.context, cue: t.cue, value: 0 };
        s.entries.push(entry);
      }
      const reward = event.kind === "ingestion" ? event.magnitude : -event.magnitude;
      const remaining = s.policy.traceTicks - (s.tick - t.tick);
      const delta = Math.trunc((reward - entry.value) * s.policy.rateBps * remaining / (10000 * s.policy.traceTicks));
      entry.value += delta;
      if (delta !== 0) s.updates += 1; // bookkeeping, never an intelligence score
    }
    s.trace = null;
  }
  return validateAssociation(s);
}

/** A versioned adapter projection, NOT a saved legacy overlay or a motor policy. */
export function associationInput(state, signal, { context, cue }) {
  validateAssociation(state); identifier(context); identifier(cue);
  for (const channel of CHANNELS) integer(signal?.[channel], 0, 1000, channel);
  const value = state.entries.find(e => e.context === context && e.cue === cue)?.value || 0;
  const shift = Math.trunc(value / 20);
  return modulate(signal, { food: 100 + shift, threat: 100 - shift, light: 100 });
}
