import test from "node:test";
import assert from "node:assert/strict";
import { kinOf } from "../src/life/kin.mjs";

const rootA = { tokenId: 1, life: "0x11", parentA: 0, parentB: 0, generation: 0 };
const rootB = { tokenId: 2, life: "0x22", parentA: 0, parentB: 0, generation: 0 };
const child = { tokenId: 3, life: "0x33", parentA: 1, parentB: 2, generation: 1 };

test("kinOf walks grandparents, parents and children from on-chain descent", () => {
  const tree = kinOf([rootA, rootB, child], 3);
  assert.equal(tree.generation, 1);
  assert.deepEqual(tree.parents.map((row) => row.tokenId).sort(), [1, 2]);
  assert.equal(tree.children.length, 0);
  const parent = kinOf([rootA, rootB, child], 1);
  assert.equal(parent.generation, 0);
  assert.deepEqual(parent.children.map((row) => row.tokenId), [3]);
  assert.equal(kinOf([rootA], 9), null);
});
