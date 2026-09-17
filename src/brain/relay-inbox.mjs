import { canonical, integer, requireValue } from "./codec.mjs";
import { LOCAL_RELAY } from "./task-local-relay.mjs";

// Candidate task-level receiver, not a network authentication boundary.
// Kept separate so historical local-observation-relay/1 evidence stays intact.
export function selectRelayInbox(pending, to, round) {
  requireValue(Array.isArray(pending), "RELAY_INBOX");
  integer(to, 0, 9, "recipient"); integer(round, 1, 1000, "round");
  const seen = new Map(), selected = [];
  for (const message of pending) {
    requireValue(message && typeof message.id === "string" && message.id.length > 0 && message.id.length <= 100, "RELAY_MESSAGE_ID");
    integer(message.from, 0, 9, "sender");
    integer(message.observedRound, 1, 1000, "observedRound");
    integer(message.deliveryRound, 2, 1001, "deliveryRound");
    requireValue(message.deliveryRound === message.observedRound + LOCAL_RELAY.delayRounds, "RELAY_DELAY");
    requireValue(["food", "threat"].includes(message.channel), "RELAY_CHANNEL");
    integer(message.x, 0, 10000, "x"); integer(message.y, 0, 10000, "y");
    requireValue(message.observer, "RELAY_OBSERVER");
    integer(message.observer.x, 0, 10000, "observer.x");
    integer(message.observer.y, 0, 10000, "observer.y");
    if (message.from === to || message.deliveryRound !== round) continue;
    const signature = canonical(message);
    if (seen.has(message.id)) {
      requireValue(seen.get(message.id) === signature, "RELAY_ID_CONFLICT");
      continue;
    }
    seen.set(message.id, signature); selected.push(structuredClone(message));
  }
  return selected;
}

export function receiveRelayInbox(pending, { to, round, body, own }) {
  integer(body.x, 0, 10000, "body.x"); integer(body.y, 0, 10000, "body.y");
  for (const channel of ["food", "threat", "light"]) integer(own[channel], 0, 1000, channel);
  const applied = { food: own.food, threat: own.threat, light: own.light }, receipts = [];
  let deliveryPayloadBytes = 0;
  for (const message of selectRelayInbox(pending, to, round)) {
    const d2 = (body.x - message.x) ** 2 + (body.y - message.y) ** 2;
    const radius2 = LOCAL_RELAY.relayRadius ** 2;
    const intensity = Math.max(0, Math.floor(900 * (radius2 - d2) / radius2));
    const value = Math.floor(intensity * LOCAL_RELAY.relayGainPercent / 100);
    applied[message.channel] = Math.max(applied[message.channel], value);
    deliveryPayloadBytes += new TextEncoder().encode(canonical(message)).byteLength;
    receipts.push({ round, to, messageId: message.id, deliveredX: message.x, deliveredY: message.y, value });
  }
  return { policy: "relay-inbox-dedup/1", applied, receipts, deliveryPayloadBytes };
}
