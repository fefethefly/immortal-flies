import test from "node:test";
import assert from "node:assert/strict";
import { ZeroHash } from "ethers";
import { queryAllLogs } from "../src/life/chain.mjs";
import {
  asBytes32,
  decodeHead,
  encodeArchiveRef,
  journalView,
  mergeInputs,
  nextInputRoot,
  readStimulusFromReceipt,
  recoverFirstInput,
  snapshotJournal,
} from "../src/life/journal.mjs";

test("decodeHead and journal view stay empty until a stimulus exists", () => {
  const empty = decodeHead(null);
  assert.equal(empty.inputCount, 0);
  assert.equal(empty.inputRoot, ZeroHash);
  assert.deepEqual(journalView(empty), {
    chain: "empty",
    replay: "idle",
    pendingInputs: 0,
    sealed: false,
  });
  const head = decodeHead({
    sequence: 2n,
    inputCount: 3n,
    consumedInputs: 2n,
    inputRoot: "0x11".padEnd(66, "0"),
    checkpointRoot: "0x22".padEnd(66, "0"),
  });
  assert.equal(head.inputCount, 3);
  assert.deepEqual(journalView(head, "matched"), {
    chain: "recorded",
    replay: "matched",
    pendingInputs: 1,
    sealed: true,
  });
  assert.equal(journalView({ inputCount: 1 }, "idle", 0).replay, "eventsMiss");
  assert.equal(journalView({ inputCount: 1 }, "idle", 1).replay, "idle");
  assert.deepEqual(journalView(null, "idle", 0, true), {
    chain: "loading",
    replay: "loading",
    pendingInputs: 0,
    sealed: false,
  });
});

test("snapshotJournal recovers the first input from the head without logs", () => {
  const root = nextInputRoot({
    chainId: 56,
    journal: "0xf2457F49E6c7Ab8b0BBbd796991a139A6fE69c78",
    tokenId: 1,
    epoch: 0,
    prevRoot: ZeroHash,
    nextIndex: 1,
    kind: 0,
    intensity: 640,
  });
  const snap = snapshotJournal(
    { inputCount: 1, consumedInputs: 0, sequence: 0, inputRoot: root },
    {
      chainId: 56,
      journalAddr: "0xf2457F49E6c7Ab8b0BBbd796991a139A6fE69c78",
      tokenId: 1,
      epoch: 0,
    },
  );
  assert.equal(snap.inputs[0].kind, 0);
  assert.equal(snap.inputs[0].intensity, 640);
});

test("mergeInputs and receipt parsing recover a stimulus without getLogs", () => {
  const merged = mergeInputs(
    [{ index: 1, kind: 0, intensity: 640 }],
    [{ index: 1, txHash: "0xabc" }],
  );
  assert.deepEqual(merged, [
    { index: 1, kind: 0, intensity: 640, txHash: "0xabc" },
  ]);
  const receipt = {
    hash: "0xdead",
    blockNumber: 9,
    logs: [
      {
        topics: ["0x01"],
        data: "0x",
      },
    ],
  };
  const journal = {
    interface: {
      parseLog: () => ({
        name: "Stimulus",
        args: {
          inputIndex: 1n,
          kind: 0n,
          intensity: 640n,
          epoch: 0n,
          inputRoot: `0x${"ab".repeat(32)}`,
        },
      }),
    },
  };
  assert.deepEqual(readStimulusFromReceipt(receipt, journal), {
    index: 1,
    kind: 0,
    intensity: 640,
    epoch: 0,
    inputRoot: `0x${"ab".repeat(32)}`,
    txHash: "0xdead",
    blockNumber: 9,
  });
});

test("archive ref stays under the on-chain URI limit", () => {
  const uri = encodeArchiveRef({
    sha256: `0x${"ab".repeat(32)}`,
    stateRoot: `0x${"cd".repeat(32)}`,
    life: `0x${"11".repeat(32)}`,
    inputCount: 1,
  });
  assert.match(uri, /^data:application\/json,/);
  assert.ok(uri.length <= 512);
  assert.equal(asBytes32(`0x${"ab".repeat(32)}`), `0x${"ab".repeat(32)}`);
  assert.throws(() => asBytes32("0x1"), /32-byte/);
});

test("input root matches the Journal abi.encode domain", () => {
  const root = nextInputRoot({
    chainId: 56,
    journal: "0xf2457F49E6c7Ab8b0BBbd796991a139A6fE69c78",
    tokenId: 1,
    epoch: 0,
    prevRoot: ZeroHash,
    nextIndex: 1,
    kind: 0,
    intensity: 640,
  });
  assert.match(root, /^0x[0-9a-f]{64}$/);
  assert.notEqual(root, ZeroHash);
  const again = nextInputRoot({
    chainId: 56,
    journal: "0xf2457F49E6c7Ab8b0BBbd796991a139A6fE69c78",
    tokenId: 1,
    epoch: 0,
    prevRoot: ZeroHash,
    nextIndex: 1,
    kind: 0,
    intensity: 640,
  });
  assert.equal(root, again);
  const recovered = recoverFirstInput({
    chainId: 56,
    journalAddr: "0xf2457F49E6c7Ab8b0BBbd796991a139A6fE69c78",
    tokenId: 1,
    epoch: 0,
    inputRoot: root,
  });
  assert.deepEqual(recovered, {
    index: 1,
    kind: 0,
    intensity: 640,
    epoch: 0,
    inputRoot: root,
    recovered: true,
  });
});

test("queryAllLogs walks forward and keeps later chunks after a busy scan", async () => {
  const calls = [];
  const contract = {
    runner: { provider: { getBlockNumber: async () => 4500 } },
    queryFilter: async (_filter, from, to) => {
      calls.push([from, to]);
      if (from === 0) throw new Error("limit exceeded");
      return [{ args: { inputIndex: 1 } }];
    },
  };
  const logs = await queryAllLogs(contract, {}, 0, 2000);
  assert.deepEqual(calls[0], [0, 1999]);
  assert.equal(logs.length, 2);
  assert.deepEqual(logs[0], { args: { inputIndex: 1 } });
});
