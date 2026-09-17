import test from "node:test";
import assert from "node:assert/strict";
import * as relay from "../src/brain/relay-inbox.mjs";

test("relay receiver processes duplicate message IDs only once per recipient and round", () => {
  const message = { id: "1:0:food", from: 0, observedRound: 1,
    deliveryRound: 2, observer: { x: 5000, y: 5000 }, channel: "food", x: 5600, y: 5000 };
  const other = { ...message, id: "1:0:threat", channel: "threat" };
  const pending = [message, { ...message }, other];
  const before = structuredClone(pending);
  assert.equal(typeof relay.selectRelayInbox, "function", "receiver needs a deduplicating inbox");
  assert.deepEqual(relay.selectRelayInbox(pending, 1, 2), [message, other]);
  // De-duplication is per recipient, not a global flag that drops other deliveries.
  assert.deepEqual(relay.selectRelayInbox(pending, 2, 2), [message, other]);
  assert.deepEqual(relay.selectRelayInbox(pending, 0, 2), []);
  assert.deepEqual(relay.selectRelayInbox(pending, 1, 1), []);
  assert.deepEqual(relay.selectRelayInbox(pending, 1, 3), []);
  assert.deepEqual(pending, before);
});
