import test from "node:test";
import assert from "node:assert/strict";
import { flyHeading, flyPhase } from "../src/life/fly-sprite.mjs";

test("flap phase is four frames and heading follows shift", () => {
  assert.equal(flyPhase(0, 0), 0);
  assert.equal(flyPhase(1 / 18, 0), 1);
  assert.ok((flyPhase(0.4, 7) & 3) === flyPhase(0.4, 7));
  assert.equal(flyHeading({ lastSide: "HOLD" }, { x: 1, y: 0 }), 0);
  assert.ok(
    Math.abs(flyHeading({ lastSide: "HOLD" }, { x: 0, y: 1 }) - Math.PI / 2) <
      1e-9,
  );
  assert.ok(flyHeading({ lastSide: "SELL" }, { x: 0, y: 0 }) > 0);
  assert.ok(flyHeading({ lastSide: "BUY" }, { x: 0, y: 0 }) < 0);
});
