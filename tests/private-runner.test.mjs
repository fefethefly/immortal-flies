import test from "node:test";
import assert from "node:assert/strict";
import { ZeroAddress, ZeroHash } from "ethers";
import { bindManifest, encodeGraph } from "../src/brain/graph.mjs";
import { createState } from "../src/brain/runtime.mjs";
import {
  DEFAULT_LEAF_EVERY,
  applyJournalInputs,
  runPrivateSegment,
  segmentIdOf,
  shouldRun,
} from "../src/life/private-runner.mjs";

const RUNNER = "0x1111111111111111111111111111111111111111";
const HUB = "0x2222222222222222222222222222222222222222";

function tank(over = {}) {
  return {
    runner: RUNNER,
    fee: 10n ** 18n,
    ownerFuel: 50n * 10n ** 18n,
    giftFuel: 0n,
    ...over,
  };
}

test("shouldRun requires bind, controller, active bond and fuel", () => {
  const base = {
    paused: false,
    tank: tank(),
    operator: { status: 1n },
    runner: RUNNER,
    authorized: RUNNER,
  };
  assert.equal(shouldRun(base).ok, true);
  assert.equal(shouldRun({ ...base, paused: true }).reason, "paused");
  assert.equal(
    shouldRun({ ...base, tank: tank({ runner: ZeroAddress }) }).reason,
    "unbound",
  );
  assert.equal(shouldRun({ ...base, authorized: ZeroAddress }).reason, "not-controller");
  assert.equal(shouldRun({ ...base, operator: { status: 2n } }).reason, "inactive");
  assert.equal(shouldRun({ ...base, tank: tank({ ownerFuel: 0n }) }).reason, "empty");
});

test("runPrivateSegment is deterministic and domain-separated", async () => {
  const graph = bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        nodes: [
          { id: "a", sign: 1 },
          { id: "b", sign: 1 },
          { id: "c", sign: -1 },
          { id: "d", sign: 1 },
        ],
        groups: { food: [0, 1], threat: [0], light: [1], left: [2], right: [3] },
      },
      [
        { pre: 0, post: 1, weight: 10 },
        { pre: 1, post: 0, weight: 10 },
        { pre: 1, post: 2, weight: 5 },
        { pre: 2, post: 3, weight: 7 },
        { pre: 3, post: 0, weight: 3 },
      ],
    ),
    "private-runner-test",
  );
  const state = createState(graph, { seed: 43, soulId: "run-43", branchId: "test" });
  const args = {
    chainId: 97,
    hub: HUB,
    tokenId: 1,
    nonce: 1,
    steps: 10,
    checkpointEvery: 10,
    leafEvery: DEFAULT_LEAF_EVERY,
  };
  const a = await runPrivateSegment(graph, state, args);
  const b = await runPrivateSegment(graph, state, args);
  assert.equal(a.segmentId, b.segmentId);
  assert.equal(a.archiveHash, b.archiveHash);
  assert.equal(a.startRoot, b.startRoot);
  assert.equal(a.commitment.leafEvery, 10);
  assert.notEqual(
    a.segmentId,
    segmentIdOf({ hub: HUB, tokenId: 1, nonce: 2, startRoot: a.startRoot }),
  );
  assert.notEqual(a.startRoot, ZeroHash);
});

test("applyJournalInputs changes the sensory vector and the resulting startRoot", async () => {
  const graph = bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        nodes: [
          { id: "a", sign: 1 },
          { id: "b", sign: 1 },
          { id: "c", sign: -1 },
          { id: "d", sign: 1 },
        ],
        groups: { food: [0, 1], threat: [0], light: [1], left: [2], right: [3] },
      },
      [
        { pre: 0, post: 1, weight: 10 },
        { pre: 1, post: 0, weight: 10 },
        { pre: 1, post: 2, weight: 5 },
        { pre: 2, post: 3, weight: 7 },
        { pre: 3, post: 0, weight: 3 },
      ],
    ),
    "private-runner-input",
  );
  const state = createState(graph, { seed: 43, soulId: "run-43", branchId: "test" });
  const args = {
    chainId: 97,
    hub: HUB,
    tokenId: 1,
    nonce: 1,
    steps: 10,
    checkpointEvery: 10,
    leafEvery: DEFAULT_LEAF_EVERY,
  };
  const idle = await runPrivateSegment(graph, state, args);
  const fed = await runPrivateSegment(graph, state, {
    ...args,
    inputs: [{ kind: 0, intensity: 800 }],
  });
  const primed = applyJournalInputs(state, [{ kind: 0, intensity: 800 }]);
  assert.equal(primed.signal.food, 800);
  assert.equal(primed.signal.threat, 0);
  assert.notEqual(idle.startRoot, fed.startRoot);
  assert.notEqual(idle.finalRoot, fed.finalRoot);
  assert.equal(fed.parentRoot, idle.parentRoot);
  const mixed = applyJournalInputs(state, [
    { kind: 0, intensity: 800 },
    { kind: 1, intensity: 40 },
  ]);
  assert.equal(mixed.signal.food, 800);
  assert.equal(mixed.signal.threat, 40);
  assert.equal(mixed.signal.light, 0);
});
