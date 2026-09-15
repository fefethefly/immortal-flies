/**
 * iff.market-feed/1 —— 交易世界的只读行情缝（L2，不是 Life Core）。
 *
 * 默认纸面随机游走（与旧坑同一公式）。可选注入 chain-observation
 * （形状对齐 captureMarket），只影响下一 tick 的 changeBps，不能签名或成交。
 */
import { integer, requireValue } from "../codec.mjs";
import { clamp, random32, START_PRICE } from "../../swarm.mjs";

export const MARKET_SCHEMA = "iff.market-feed/1";
export const MARKET_POLICY = Object.freeze({
  id: "paper-market-1",
  version: "1",
  minPrice: 1_200,
  maxPrice: 220_000,
  staleTicks: 3,
});

export function walkPaperPrice(rng, price) {
  const shock = (rng % 161) - 80;
  const revert = Math.trunc(((START_PRICE - price) * 3) / 100);
  return clamp(
    price + Math.trunc((price * shock) / 10_000) + revert,
    MARKET_POLICY.minPrice,
    MARKET_POLICY.maxPrice,
  );
}

export function createMarketFeed() {
  return {
    schema: MARKET_SCHEMA,
    audit: "SIM",
    policy: `${MARKET_POLICY.id}@${MARKET_POLICY.version}`,
    pending: null,
    last: null,
    history: [],
  };
}

export function saveMarket(feed) {
  return feed ? structuredClone(feed) : createMarketFeed();
}

export function restoreMarket(saved) {
  if (!saved || saved.schema !== MARKET_SCHEMA) return createMarketFeed();
  return structuredClone(saved);
}

/**
 * 排队一条只读观测。拒绝任意 calldata / 签名字段。
 * @returns 规范化后的 pending
 */
export function offerObservation(feed, raw = {}) {
  requireValue(feed && feed.schema === MARKET_SCHEMA, "MARKET_FEED");
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : raw;
  const provenance = raw.provenance && typeof raw.provenance === "object" ? raw.provenance : { kind: "simulation" };
  requireValue(["simulation", "chain-observation"].includes(provenance.kind), "MARKET_PROVENANCE");
  requireValue(!raw.calldata && !raw.signature && !raw.privateKey, "MARKET_FORBIDDEN", "只读行情不得携带签名或 calldata");
  const changeBps = integer(payload.changeBps, -10000, 10000, "changeBps");
  const activity = integer(payload.activity ?? 0, 0, 1000, "activity");
  if (provenance.kind === "chain-observation") {
    requireValue(provenance.chainId === 56, "WRONG_CHAIN", "观测必须来自 BSC 主网");
    integer(provenance.blockNumber, 1, Number.MAX_SAFE_INTEGER, "blockNumber");
    requireValue(/^0x[0-9a-f]{40}$/i.test(provenance.pair || ""), "PAIR_ADDRESS");
    requireValue(/^0x[0-9a-f]{64}$/i.test(provenance.blockHash || ""), "BLOCK_HASH");
  }
  feed.pending = {
    schema: "iff.market-offer/1",
    payload: { changeBps, activity },
    provenance: structuredClone(provenance),
    offeredAt: Date.now(),
    staleTicks: MARKET_POLICY.staleTicks,
  };
  return feed.pending;
}

/** 消耗 pending 或走纸面游走，返回 changeBps（由 colony 应用到价格）。 */
export function stepMarketFeed(feed, { rng, price, tick }) {
  const next = feed && feed.schema === MARKET_SCHEMA ? feed : createMarketFeed();
  let source = "paper-walk";
  let changeBps;
  let provenance = { kind: "simulation", adapter: "paper-walk" };
  let nextRng = rng;

  if (next.pending) {
    changeBps = next.pending.payload.changeBps;
    provenance = structuredClone(next.pending.provenance);
    source = provenance.kind === "chain-observation" ? "observation" : "offered-sim";
    next.last = { ...next.pending, consumedTick: tick, source };
    next.pending = null;
  } else {
    nextRng = random32(rng);
    const walked = walkPaperPrice(nextRng, price);
    changeBps = price ? Math.trunc(((walked - price) * 10_000) / price) : 0;
    provenance = { kind: "simulation", adapter: "paper-walk" };
  }

  next.history = [...next.history, { tick, changeBps, source, price }].slice(-96);
  return { feed: next, rng: nextRng, changeBps, source, provenance };
}

export function marketView(feed, { kernel, aux } = {}) {
  const price = kernel?.colony?.market?.price ?? aux?.prices?.[aux.prices.length - 1] ?? START_PRICE;
  const prev = aux?.prices?.[aux.prices.length - 2] ?? price;
  return {
    schema: MARKET_SCHEMA,
    audit: "SIM",
    policy: feed?.policy || `${MARKET_POLICY.id}@${MARKET_POLICY.version}`,
    price,
    prev,
    delta: price - prev,
    pending: Boolean(feed?.pending),
    last: feed?.last
      ? {
          source: feed.last.source,
          changeBps: feed.last.payload?.changeBps,
          kind: feed.last.provenance?.kind,
          consumedTick: feed.last.consumedTick,
        }
      : null,
    history: (feed?.history || []).slice(-24),
    freshness: {
      staleTicks: MARKET_POLICY.staleTicks,
      note: "Observation applies to the next tick only; missing offer falls back to paper walk.",
    },
  };
}
