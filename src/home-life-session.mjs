import { BrainSession } from "./brain/session.mjs";
import { createState } from "./brain/runtime.mjs";
import { makeInput } from "./brain/adapters.mjs";
import { clone, hash, requireValue } from "./brain/codec.mjs";

export const HOME_STEPS = 24;
export const HOME_STIMULI = Object.freeze(["light", "food", "threat"]);

export function createHomeSession(graph) {
  const state = createState(graph, {
    soulId: "observatory-preview",
    branchId: "local-demo",
    seed: 43,
  });
  state.enabledSources = ["environment"];
  return new BrainSession(graph, state);
}

function readFrame(state) {
  return {
    tick: state.ticks,
    spikes: [...state.spikes],
    body: { ...state.body },
    action: state.lastAction,
  };
}

// Advance a separate local preview. No wallet, official runner or market input.
// The caller serializes requests and displays these recorded frames at a
// deliberately slowed presentation rate, not a claimed biological timescale.
export async function recordHomeStimulus(session, kind, now = Date.now()) {
  requireValue(HOME_STIMULI.includes(kind), "HOME_STIMULUS");
  requireValue(session.events.length < 19000, "JOURNAL_LIMIT");
  const initial = clone(session.state);
  const start = session.events.length;
  const frames = [readFrame(initial)];
  for (let step = 0; step < HOME_STEPS; step++) {
    if (step === 0 || step === 6) {
      const payload = { food: 0, threat: 0, light: 0 };
      if (step === 0) payload[kind] = 800;
      const frame = makeInput(session.state, "environment", payload, { now });
      await session.dispatch({ type: "input", frame, acceptedAt: now });
    }
    await session.dispatch({ type: "step", count: 1 });
    frames.push(readFrame(session.state));
  }
  return {
    kind,
    initial,
    events: clone(session.events.slice(start)),
    frames,
    stateHash: await hash(session.state),
    historyRoot: session.state.historyRoot,
    peak: Math.max(...frames.map((frame) => frame.spikes.length)),
  };
}

// Independent replay leaves the current session untouched. Verify the final
// state as well as every displayed frame before calling a replay checked.
export async function replayHomeStimulus(graph, record) {
  const replay = new BrainSession(graph, record.initial);
  const frames = [readFrame(replay.state)];
  for (const event of record.events) {
    await replay.dispatch(event);
    if (event.type === "step") frames.push(readFrame(replay.state));
  }
  requireValue(
    (await hash(replay.state)) === record.stateHash,
    "REPLAY_MISMATCH",
  );
  requireValue(
    (await hash(frames)) === (await hash(record.frames)),
    "REPLAY_FRAMES",
  );
  return frames;
}
