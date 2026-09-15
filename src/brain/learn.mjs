import { integer } from "./codec.mjs";

/**
 * Product-layer plasticity. Scales sensory drive. Never rewrites MaleCNS weights.
 * Knowledge here means attributed gain change, not that the fly understands a book.
 */
export const LEARNER = "outcome-gain/1";

export function createOverlay() {
  return { schema: "iff.overlay/1", learner: LEARNER, food: 100, threat: 100, light: 100, updates: 0 };
}

export function clampGain(n) {
  return Math.max(50, Math.min(200, n));
}

export function modulate(signal, overlay) {
  const gain = overlay || createOverlay();
  return {
    food: Math.min(1000, Math.trunc((Number(signal.food) || 0) * gain.food / 100)),
    threat: Math.min(1000, Math.trunc((Number(signal.threat) || 0) * gain.threat / 100)),
    light: Math.min(1000, Math.trunc((Number(signal.light) || 0) * gain.light / 100)),
  };
}

/** pnl is -1, 0, or 1. Only realized outcomes teach. */
export function applyOutcome(overlay, { action, pnl }) {
  const next = { ...(overlay || createOverlay()) };
  const sign = integer(pnl, -1, 1, "pnl");
  if (!sign) return next;
  if (action === "FORAGE" && sign > 0) next.food = clampGain(next.food + 1);
  if (action === "FORAGE" && sign < 0) next.threat = clampGain(next.threat + 1);
  if (action === "AVOID" && sign > 0) next.threat = clampGain(next.threat + 1);
  if (action === "AVOID" && sign < 0) next.food = clampGain(next.food + 1);
  next.updates += 1;
  next.learner = LEARNER;
  next.schema = "iff.overlay/1";
  return next;
}

export function outcomeOf(trade, realizedBefore, realizedAfter) {
  if (!trade || trade.side !== "SELL") return 0;
  const delta = (realizedAfter || 0) - (realizedBefore || 0);
  return Math.sign(delta);
}
