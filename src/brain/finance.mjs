/** Product layer. Biology ends at ethology. This file is allowed to talk about books. */

export const ACTION_TRADE = Object.freeze({
  FORAGE: "BUY",
  AVOID: "SELL",
  EXPLORE: "HOLD",
  REST: "HOLD",
});

export function decodeTrade(action) {
  return ACTION_TRADE[action] || "HOLD";
}

/**
 * Map approach / retreat onto a book.
 * inventoryShare is interoception we inject, not a MaleCNS organ.
 */
export function decodeFinance(ethology, book = {}) {
  const action = ethology?.action || "REST";
  let side = decodeTrade(action);
  const motor = (ethology.left || 0) + (ethology.right || 0);
  let confidence = Math.round((Math.abs((ethology.left || 0) - (ethology.right || 0)) * 100) / (motor + 1));
  const inventoryShare = Number(book.inventoryShare) || 0;
  if (inventoryShare >= 60 && side === "BUY") {
    side = "SELL";
    confidence = Math.max(confidence, 24);
  } else if (inventoryShare <= 15 && side === "SELL" && (book.cashShare || 0) > 40) {
    side = "BUY";
    confidence = Math.max(confidence, 24);
  }
  if (side !== "HOLD" && confidence < 8 && motor > 0) confidence = 8;
  if (side === "HOLD") confidence = 0;
  return {
    schema: "iff.finance/1",
    side,
    confidence,
    action,
    reason:
      side === "HOLD"
        ? "运动未分胜负，账本不动"
        : `${ethology.action} 被读成 ${side}；仓位修正属于产品层`,
  };
}
