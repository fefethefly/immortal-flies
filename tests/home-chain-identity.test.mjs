import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleIdentityTransition,
  homeIdentity,
} from "../src/home-chain-identity.mjs";

test("identity transition leaves the hero and experiments fully visible", () => {
  for (const progress of [0, 0.05, 1, 2, 3, 4, 5]) {
    assert.equal(sampleIdentityTransition(progress).bodyOpacity, 1);
    assert.equal(sampleIdentityTransition(progress).particleOpacity, 0);
  }
  assert.equal(sampleIdentityTransition(0.5).bodyOpacity, 0);
  assert.equal(sampleIdentityTransition(0.5).focus, 1);
});

test("scrolling in either direction is continuous and reversible", () => {
  let previous = sampleIdentityTransition(0);
  for (let p = 0.001; p < 1; p += 0.001) {
    const current = sampleIdentityTransition(p);
    for (const key of Object.keys(current)) {
      assert.ok(current[key] >= 0 && current[key] <= 1);
      assert.ok(Math.abs(current[key] - previous[key]) < 0.02, key);
    }
    assert.deepEqual(sampleIdentityTransition(p), current);
    previous = current;
  }
});

test("identity proof links resolve to mainnet address and deployment transaction", () => {
  assert.match(
    homeIdentity.explorer,
    /^https:\/\/bscscan\.com\/address\/0x[\da-f]{40}$/i,
  );
  assert.match(
    homeIdentity.transaction,
    /^https:\/\/bscscan\.com\/tx\/0x[\da-f]{64}$/i,
  );
  assert.equal(
    new URL(homeIdentity.explorer).pathname.split("/").at(-1),
    homeIdentity.address,
  );
});
