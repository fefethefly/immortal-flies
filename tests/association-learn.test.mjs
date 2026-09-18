import test from "node:test";
import assert from "node:assert/strict";
import { createAssociation, validateAssociation, reduceAssociation, associationInput } from "../src/brain/association-learn.mjs";
import { createOverlay, applyOutcome, modulate } from "../src/brain/learn.mjs";

const signal = { food: 400, threat: 400, light: 200 };
const query = { context: "orchard", cue: "odor-a" };
const dispatch = (s, event) => reduceAssociation(s, { tick: s.tick, ...event, sequence: s.sequence + 1 });
function teach(s, kind = "ingestion", delay = 0) {
  s = dispatch(s, { type: "observe", ...query });
  return dispatch(s, { type: "outcome", kind, magnitude: 1000, observationSequence: s.sequence, tick: s.tick + delay });
}

test("learning is context-specific, reversible and cleared by a fresh state", () => {
  const initial = createAssociation({ forgetPerTick: 0 });
  let s = initial;
  for (let i = 0; i < 12; i++) s = teach(s);
  assert.ok(associationInput(s, signal, query).food > signal.food);
  assert.ok(associationInput(s, signal, query).threat < signal.threat);
  assert.deepEqual(associationInput(s, signal, { ...query, context: "desert" }), signal);
  assert.deepEqual(associationInput(s, signal, { ...query, cue: "other" }), signal);
  for (let i = 0; i < 12; i++) s = teach(s, "damage");
  assert.ok(associationInput(s, signal, query).food < signal.food);
  assert.deepEqual(associationInput(createAssociation(), signal, query), signal);
  assert.deepEqual(initial, createAssociation({ forgetPerTick: 0 }));
});

test("credit decays with delay; missing, expired and duplicate feedback fails", () => {
  const initial = createAssociation({ forgetPerTick: 0 });
  assert.ok(teach(initial).entries[0].value > teach(initial, "ingestion", 4).entries[0].value);
  const observed = dispatch(initial, { type: "observe", ...query });
  assert.equal(observed.entries.length, 0);
  const event = { type: "outcome", kind: "ingestion", magnitude: 1000, observationSequence: observed.sequence };
  assert.throws(() => dispatch(initial, event), /ASSOCIATION_CREDIT/);
  assert.throws(() => dispatch(observed, { ...event, tick: 8 }), /ASSOCIATION_CREDIT/);
  assert.throws(() => dispatch(observed, { ...event, kind: "message" }), /ASSOCIATION_SETTLEMENT/);
  const settled = dispatch(observed, event);
  assert.throws(() => dispatch(settled, event), /ASSOCIATION_CREDIT/);
  assert.throws(() => reduceAssociation(settled, { ...event, tick: 0, sequence: settled.sequence }));
  const replaced = dispatch(observed, { type: "observe", ...query });
  assert.throws(() => dispatch(replaced, event), /ASSOCIATION_CREDIT/);
});

test("forgetting tends to neutral while freezing preserves learning", () => {
  const taught = teach(createAssociation({ forgetPerTick: 10 }));
  const faded = dispatch(taught, { type: "advance", tick: 5 });
  assert.equal(faded.entries[0].value, taught.entries[0].value - 50);
  const neutral = dispatch(faded, { type: "advance", tick: 100 });
  assert.deepEqual(associationInput(neutral, signal, query), signal);
  const frozen = dispatch(taught, { type: "freeze", enabled: true });
  assert.equal(frozen.trace, null);
  const later = dispatch(frozen, { type: "advance", tick: 1000 });
  const evaluated = teach(later, "damage");
  assert.deepEqual(evaluated.entries, frozen.entries);
  assert.equal(evaluated.updates, frozen.updates);
  const resumed = dispatch(evaluated, { type: "freeze", enabled: false });
  assert.ok(teach(resumed, "damage").entries[0].value < resumed.entries[0].value);
});

test("JSON checkpoint preserves pending credit and deterministic continuation", () => {
  const pending = dispatch(teach(createAssociation()), { type: "observe", ...query, tick: 1 });
  const restored = validateAssociation(JSON.parse(JSON.stringify(pending)));
  const event = { type: "outcome", kind: "damage", magnitude: 750, tick: 3, observationSequence: pending.sequence };
  assert.deepEqual(dispatch(restored, event), dispatch(pending, event));
  assert.throws(() => validateAssociation({ ...restored, learner: "unknown/1" }), /ASSOCIATION_SCHEMA/);
  assert.throws(() => validateAssociation({ ...restored, tick: 100 }), /ASSOCIATION_TRACE_EXPIRED/);
  assert.throws(() => createAssociation({ rateBps: NaN }));
  assert.throws(() => associationInput(restored, { ...signal, food: Infinity }, query));
});

test("legacy overlay learning remains unchanged", () => {
  const overlay = createOverlay();
  assert.equal(overlay.schema, "iff.overlay/1");
  const learned = applyOutcome(overlay, { action: "FORAGE", pnl: 1 });
  assert.equal(learned.food, 101);
  assert.equal(learned.threat, 100);
  assert.deepEqual(modulate(signal, overlay), signal);
});
