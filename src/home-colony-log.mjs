import { formatPaperFill } from "./paper-units.mjs";

export const COLONY_LOG_LIMIT = 8;

/**
 * Homepage colony log. Only paper fills the swarm actually wrote.
 * Units follow the book: BNB/IFS while paper, USDT/WBNB (etc.) after Kyber mark.
 */
export function colonyLog(swarm, tx) {
  const tick = swarm?.tick ?? 0;
  const market = swarm?.market;
  const rows = [];
  for (const trade of swarm?.trades || []) {
    if (trade?.side !== "BUY" && trade?.side !== "SELL") continue;
    const buy = trade.side === "BUY";
    rows.push({
      key: `t${trade.tick}-${trade.flyId}-${trade.side}-${trade.amount}`,
      kind: "ACT",
      tone: buy ? "gold" : "red",
      tick: trade.tick,
      fresh: trade.tick === tick,
      text: buy
        ? tx("public.evBuy", {
            id: trade.flyId,
            amt: formatPaperFill(trade, market),
          })
        : tx("public.evSell", {
            id: trade.flyId,
            amt: formatPaperFill(trade, market),
          }),
    });
    if (rows.length >= COLONY_LOG_LIMIT) break;
  }
  return rows;
}
