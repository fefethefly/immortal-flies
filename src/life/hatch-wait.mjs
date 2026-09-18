export const HATCH_WAIT_TICKS = 3;

export function hatchBlocksLeft(pending, blockNow) {
  if (!pending) return 0;
  const now = Number(blockNow) || 0;
  if (!now) return null;
  return Math.max(0, Number(pending.entropyBlock) - now + 1);
}

export function hatchWaitFilled(left) {
  if (left == null) return 0;
  return Math.max(0, Math.min(HATCH_WAIT_TICKS, HATCH_WAIT_TICKS - left));
}

export function hatchWaitStage({ busy, pending, phase, needRetry }) {
  if (phase === "expired" && pending) return "expired";
  if (phase === "wait" && pending) return "wait";
  if (phase === "ready" && pending) {
    if (needRetry && !busy) return "retry";
    return "sign2";
  }
  if (busy) return "sign1";
  return "";
}

export function hatchActionKey(stage) {
  if (stage === "sign1") return "hatch.signingRequestAction";
  if (stage === "wait") return "hatch.waitingAction";
  if (stage === "sign2") return "hatch.signingCompleteAction";
  return "hatch.request";
}

export function habitatShowsHatch({ used, pending, hatchStage, needRetry }) {
  return !used || Boolean(pending) || Boolean(hatchStage) || Boolean(needRetry);
}
