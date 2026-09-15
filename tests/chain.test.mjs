import assert from "node:assert/strict";
import test from "node:test";
import { createFly, train } from "../src/engine.mjs";
import {
  BSC_TESTNET,
  decodeFly,
  mintSeedFromDna,
  tokenIdFromReceipt,
} from "../src/chain.mjs";

test("decodeFly maps getFly tuples onto the local lab specimen shape", () => {
  const local = createFly(3700127, "2026-01-01T00:00:00.000Z");
  const trained = train(local, 0);
  const decoded = decodeFly(7, {
    dna: 3700127,
    bornAt: 1_767_225_600,
    bornBlock: 12,
    generation: 0,
    parent1: 0n,
    parent2: 0n,
    brain: {
      rng: trained.brain.rng,
      ticks: trained.brain.ticks,
      learning: trained.brain.learning,
      potential: trained.brain.potential,
      energy: trained.brain.energy,
      spikes: trained.brain.spikes,
      incarnation: trained.brain.incarnation,
      dormant: trained.brain.dormant,
    },
  });
  assert.equal(decoded.model, "iff-neural-16-v1");
  assert.equal(decoded.id, 7);
  assert.equal(decoded.source, "bsc-testnet");
  assert.deepEqual(decoded.brain, trained.brain);
  assert.equal(decoded.dna, trained.dna);
});

test("testnet wiring stays on BSC testnet and rejects a zero mint seed", () => {
  assert.equal(BSC_TESTNET.chainId, 97);
  assert.equal(BSC_TESTNET.hexChainId, "0x61");
  assert.equal(mintSeedFromDna(0), 3700127);
  assert.equal(mintSeedFromDna(88), 88);
});

test("tokenIdFromReceipt prefers the Born event", () => {
  const contract = {
    interface: {
      parseLog() {
        return { name: "Born", args: { tokenId: 12n } };
      },
    },
  };
  assert.equal(
    Number(
      tokenIdFromReceipt(contract, { logs: [{ topics: [], data: "0x" }] }),
    ),
    12,
  );
});
