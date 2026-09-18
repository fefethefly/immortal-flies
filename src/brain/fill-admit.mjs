/**
 * iff.fill-admit/1 — execution gate in front of paper fillBook.
 * Ethology and decodeFinance still run every tick. This module only
 * decides whether the trade port may settle.
 */
import { SLIP_BPS, TAX_BPS } from "../swarm.mjs";

export const FILL_ADMIT = Object.freeze({
  schema: "iff.fill-admit/1",
  minConfidence: 25,
  persistTicks: 3,
  cooldownTicks: 30,
  horizonTicks: 30,
  costBps: TAX_BPS + SLIP_BPS,
});

export const FILL_HOLD_KEYS = Object.freeze({
  CONFIDENCE: "pit.holdConfidence",
  PERSIST: "pit.holdPersist",
  COOLDOWN: "pit.holdCooldown",
  COST: "pit.holdCost",
  DIRECTION: "pit.holdDirection",
});

export function emptyPort() {
  return {
    schema: FILL_ADMIT.schema,
    side: "HOLD",
    streak: 0,
    lastFillAt: -1_000_000,
  };
}

export function restorePort(saved) {
  const base = emptyPort();
  if (!saved || typeof saved !== "object") return base;
  const side = saved.side === "BUY" || saved.side === "SELL" ? saved.side : "HOLD";
  const streak = Math.max(0, Math.trunc(Number(saved.streak) || 0));
  const lastFillAt = Number.isFinite(Number(saved.lastFillAt))
    ? Math.trunc(saved.lastFillAt)
    : -1_000_000;
  return { ...base, side, streak: side === "HOLD" ? 0 : streak, lastFillAt };
}

export function edgeWindowOf(prev, changeBps, horizon = FILL_ADMIT.horizonTicks) {
  const next = [...(Array.isArray(prev) ? prev : []), Math.trunc(Number(changeBps) || 0)];
  return next.length > horizon ? next.slice(-horizon) : next;
}

export function edgeBpsOf(window) {
  return (window || []).reduce((sum, n) => sum + (Math.trunc(Number(n) || 0)), 0);
}

export function updateIntentStreak(member, side) {
  const next = side || "HOLD";
  const prev = member.port || emptyPort();
  if (next === "HOLD") {
    member.port = { ...prev, schema: FILL_ADMIT.schema, side: "HOLD", streak: 0 };
    return member.port;
  }
  const streak = prev.side === next ? (prev.streak || 0) + 1 : 1;
  member.port = { ...prev, schema: FILL_ADMIT.schema, side: next, streak };
  return member.port;
}

export function markFilled(member, tick) {
  const prev = member.port || emptyPort();
  member.port = {
    ...prev,
    schema: FILL_ADMIT.schema,
    lastFillAt: Math.trunc(Number(tick) || 0),
  };
  return member.port;
}

/**
 * First blocker wins so the UI can name why the port held.
 * COST is one-way tax+slip against a signed rolling window, not a forecast.
 */
export function admitFill(intent, port, { edgeBps = 0, tick = 0 } = {}) {
  if (!intent || intent.side === "HOLD") return { ok: false, hold: null };
  if ((intent.confidence || 0) < FILL_ADMIT.minConfidence) {
    return { ok: false, hold: "CONFIDENCE" };
  }
  if ((port?.streak || 0) < FILL_ADMIT.persistTicks) {
    return { ok: false, hold: "PERSIST" };
  }
  const lastFillAt = port?.lastFillAt ?? -1_000_000;
  if (tick - lastFillAt < FILL_ADMIT.cooldownTicks) {
    return { ok: false, hold: "COOLDOWN" };
  }
  const edge = Math.trunc(Number(edgeBps) || 0);
  if (
    (intent.side === "BUY" && edge <= 0) ||
    (intent.side === "SELL" && edge >= 0)
  ) {
    return { ok: false, hold: "DIRECTION" };
  }
  if (Math.abs(edge) < FILL_ADMIT.costBps) {
    return { ok: false, hold: "COST" };
  }
  return { ok: true, hold: null };
}
