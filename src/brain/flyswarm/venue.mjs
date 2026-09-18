/**
 * iff.venue/1 —— L2 只读聚合报价适配器（不是 Life Core，不是 Executor）。
 *
 * 拉 KyberSwap GET /routes，算出 changeBps 与焦点资产。
 * 禁止携带 / 产出 calldata、to、value、signature。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { integer, requireValue } from "../codec.mjs";
import { formatUsd, usdPerToken } from "../../venue-price.mjs";

export { formatUsd, usdPerToken };

export const VENUE_SCHEMA = "iff.venue/1";
export const KYBER_BASE = "https://aggregator-api.kyberswap.com/bsc/api/v1/routes";
export const DEFAULT_CLIENT_ID = "immortalflies";
export const DEFAULT_STALE_MS = 15_000;

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const WATCHLIST_PATH = join(root, "public/token/venue-watchlist.json");

const ADDR_RE = /^0x[0-9a-f]{40}$/i;
const HEX_CALLDATA_RE = /^0x[0-9a-f]*$/i;
const FORBIDDEN_KEYS = Object.freeze([
  "calldata",
  "signature",
  "privateKey",
  "encodedSwapData",
]);

function lower(addr) {
  return String(addr || "").toLowerCase();
}

function assertNoExecutionFields(obj, label = "venue") {
  if (!obj || typeof obj !== "object") return;
  for (const key of FORBIDDEN_KEYS) {
    requireValue(
      obj[key] == null || obj[key] === "",
      "VENUE_FORBIDDEN",
      `${label} must not carry ${key}`,
    );
  }
  // Kyber wraps routes in `{ data: { routeSummary } }`. Only reject hex calldata strings.
  if (typeof obj.data === "string" && HEX_CALLDATA_RE.test(obj.data) && obj.data.length >= 10) {
    requireValue(false, "VENUE_FORBIDDEN", `${label} must not carry calldata`);
  }
  if (typeof obj.to === "string" && ADDR_RE.test(obj.to) && obj.value != null) {
    requireValue(false, "VENUE_FORBIDDEN", `${label} must not carry executable tx fields`);
  }
}

export function loadWatchlist(path = WATCHLIST_PATH) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  requireValue(raw?.schema === "iff.venue-watchlist/1", "WATCHLIST_SCHEMA");
  requireValue(raw.chainId === 56, "WRONG_CHAIN");
  requireValue(ADDR_RE.test(raw.quote?.address || ""), "QUOTE_ADDRESS");
  requireValue(Array.isArray(raw.assets) && raw.assets.length > 0, "WATCHLIST_EMPTY");
  for (const asset of raw.assets) {
    requireValue(asset.id && ADDR_RE.test(asset.address || ""), "ASSET_ADDRESS");
  }
  return Object.freeze(structuredClone(raw));
}

export function createVenueState(watchlist = null) {
  const list = watchlist || loadWatchlist();
  return {
    schema: VENUE_SCHEMA,
    audit: "SIM",
    fill: "SIM",
    quote: "LIVE",
    chainId: list.chainId,
    adapter: list.adapter || "kyberswap",
    watchlist: list,
    quotes: Object.fromEntries(
      list.assets.map((a) => [
        a.id,
        {
          assetId: a.id,
          symbol: a.symbol,
          address: a.address,
          amountOut: null,
          amountOutUsd: null,
          mid: null,
          changeBps: 0,
          activity: 0,
          quotedAt: 0,
          ok: false,
          error: null,
        },
      ]),
    ),
    focus: null,
    lastPollAt: 0,
    lastError: null,
  };
}

/** amountOut 相对上一笔的变化，夹到 ±10000 bps。 */
export function changeBpsOf(prevOut, nextOut) {
  const a = BigInt(String(prevOut));
  const b = BigInt(String(nextOut));
  if (a <= 0n) return 0;
  const bps = (b * 10000n) / a - 10000n;
  if (bps > 10000n) return 10000;
  if (bps < -10000n) return -10000;
  return Number(bps);
}

/** amountOutUsd 相对变化 → 0..1000 activity。 */
export function activityOf(prevUsd, nextUsd) {
  const a = Number(prevUsd);
  const b = Number(nextUsd);
  if (!(a > 0) || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const rel = Math.abs((b - a) / a);
  return Math.min(1000, Math.max(0, Math.trunc(rel * 1000)));
}

/**
 * 从 Kyber routeSummary 抽出只读字段。拒绝执行字段。
 * mid = amountOut / amountIn（按 1e18 定点缩放成整数 mid*1e6 便于展示）。
 */
export function parseRouteSummary(summary, { amountIn, assetId }) {
  requireValue(summary && typeof summary === "object", "ROUTE_SUMMARY");
  assertNoExecutionFields(summary, "routeSummary");
  assertNoExecutionFields(summary.extraFee, "extraFee");
  const amountOut = String(summary.amountOut ?? "");
  requireValue(/^\d+$/.test(amountOut) && BigInt(amountOut) > 0n, "AMOUNTOut");
  const amountOutUsd = summary.amountOutUsd != null ? String(summary.amountOutUsd) : null;
  const inAmt = BigInt(String(amountIn));
  const outAmt = BigInt(amountOut);
  // mid in micro-units of asset per 1 quote token (amountOut / amountIn * 1e6)
  const mid = Number((outAmt * 1_000_000n) / inAmt);
  return {
    assetId,
    amountOut,
    amountOutUsd,
    mid,
    routerAddress: summary.routerAddress || null,
  };
}

export function selectFocus(quotes, { now = Date.now(), staleMs = DEFAULT_STALE_MS } = {}) {
  let best = null;
  for (const q of Object.values(quotes || {})) {
    if (!q?.ok || !q.quotedAt) continue;
    if (now - q.quotedAt > staleMs) continue;
    const score = Math.abs(q.changeBps || 0);
    if (!best || score > Math.abs(best.changeBps || 0)) best = q;
  }
  return best
    ? {
        assetId: best.assetId,
        symbol: best.symbol,
        changeBps: best.changeBps,
        activity: best.activity,
        mid: best.mid,
        usd: best.usd ?? null,
        quotedAt: best.quotedAt,
        address: best.address,
      }
    : null;
}

/**
 * 把一次 Kyber JSON 响应写进 venue state 的某资产槽。
 * @returns 更新后的 quote 槽
 */
export function applyQuote(state, assetId, routeJson, { now = Date.now() } = {}) {
  requireValue(state?.schema === VENUE_SCHEMA, "VENUE_STATE");
  assertNoExecutionFields(routeJson, "kyberResponse");
  assertNoExecutionFields(routeJson?.data, "kyberData");
  const asset = state.watchlist.assets.find((a) => a.id === assetId);
  requireValue(asset, "UNKNOWN_ASSET");
  const prev = state.quotes[assetId];
  const summary = routeJson?.data?.routeSummary;
  const parsed = parseRouteSummary(summary, {
    amountIn: state.watchlist.quote.amountIn,
    assetId,
  });
  const changeBps =
    prev?.amountOut != null ? changeBpsOf(prev.amountOut, parsed.amountOut) : 0;
  const activity =
    prev?.amountOutUsd != null && parsed.amountOutUsd != null
      ? activityOf(prev.amountOutUsd, parsed.amountOutUsd)
      : integer(Math.min(1000, Math.abs(changeBps)), 0, 1000, "activity");
  const usd = usdPerToken(parsed.amountOut, {
    amountIn: state.watchlist.quote.amountIn,
    assetDecimals: asset.decimals ?? 18,
    quoteDecimals: state.watchlist.quote.decimals ?? 18,
  });
  const next = {
    assetId,
    symbol: asset.symbol,
    address: asset.address,
    amountOut: parsed.amountOut,
    amountOutUsd: parsed.amountOutUsd,
    mid: parsed.mid,
    usd,
    changeBps,
    activity,
    quotedAt: now,
    ok: true,
    error: null,
  };
  state.quotes[assetId] = next;
  state.focus = selectFocus(state.quotes, { now });
  state.lastPollAt = now;
  state.lastError = null;
  return next;
}

export function markQuoteError(state, assetId, error, { now = Date.now() } = {}) {
  const slot = state.quotes[assetId];
  if (slot) {
    slot.ok = false;
    slot.error = String(error?.message || error || "quote failed");
  }
  state.lastError = String(error?.message || error || "quote failed");
  state.lastPollAt = now;
  state.focus = selectFocus(state.quotes, { now });
}

/**
 * 从焦点资产产出 iff.market-offer 形状（给 offerObservation）。
 * 无焦点时返回 null（调用方回落纸面游走）。
 */
export function observationFromFocus(state, { now = Date.now(), staleMs = DEFAULT_STALE_MS } = {}) {
  requireValue(state?.schema === VENUE_SCHEMA, "VENUE_STATE");
  const focus = selectFocus(state.quotes, { now, staleMs });
  state.focus = focus;
  if (!focus) return null;
  const quote = state.watchlist.quote;
  return {
    payload: {
      changeBps: focus.changeBps,
      activity: focus.activity,
      assetId: focus.assetId,
      mid: focus.mid,
    },
    provenance: {
      kind: "aggregator-quote",
      chainId: 56,
      adapter: "kyberswap",
      src: quote.address,
      dst: focus.address,
      assetId: focus.assetId,
      quotedAt: focus.quotedAt,
      quote: "LIVE",
      fill: "SIM",
    },
  };
}

export function venueView(state, { now = Date.now(), staleMs = DEFAULT_STALE_MS } = {}) {
  if (!state || state.schema !== VENUE_SCHEMA) {
    return {
      schema: VENUE_SCHEMA,
      enabled: false,
      quote: null,
      fill: "SIM",
      assets: [],
      focus: null,
      note: "Venue poller not attached.",
    };
  }
  const focus = selectFocus(state.quotes, { now, staleMs });
  return {
    schema: VENUE_SCHEMA,
    enabled: true,
    audit: "SIM",
    quote: "LIVE",
    fill: "SIM",
    chainId: state.chainId,
    adapter: state.adapter,
    quoteToken: {
      symbol: state.watchlist.quote.symbol,
      address: state.watchlist.quote.address,
      decimals: state.watchlist.quote.decimals,
    },
    focus,
    lastPollAt: state.lastPollAt,
    lastError: state.lastError,
    staleMs,
    assets: state.watchlist.assets.map((a) => {
      const q = state.quotes[a.id] || {};
      const age = q.quotedAt ? now - q.quotedAt : null;
      return {
        id: a.id,
        symbol: a.symbol,
        address: a.address,
        mid: q.mid,
        usd: q.usd ?? null,
        changeBps: q.changeBps ?? 0,
        activity: q.activity ?? 0,
        amountOut: q.amountOut,
        amountOutUsd: q.amountOutUsd,
        quotedAt: q.quotedAt || 0,
        ageMs: age,
        stale: age == null || age > staleMs,
        ok: Boolean(q.ok),
        error: q.error,
      };
    }),
    note: "Quotes from KyberSwap GET /routes. Fills remain paper SIM.",
  };
}

/**
 * 拉一只资产的 Kyber 路由（只读）。
 * fetchImpl 可注入，便于测试。
 */
export async function fetchKyberRoute(
  { tokenIn, tokenOut, amountIn, clientId = DEFAULT_CLIENT_ID, fetchImpl = fetch } = {},
) {
  requireValue(ADDR_RE.test(tokenIn || ""), "tokenIn");
  requireValue(ADDR_RE.test(tokenOut || ""), "tokenOut");
  requireValue(/^\d+$/.test(String(amountIn || "")), "amountIn");
  const url = new URL(KYBER_BASE);
  url.searchParams.set("tokenIn", tokenIn);
  url.searchParams.set("tokenOut", tokenOut);
  url.searchParams.set("amountIn", String(amountIn));
  url.searchParams.set("gasInclude", "true");
  const res = await fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Client-Id": clientId,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Kyber ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  assertNoExecutionFields(json, "kyberJson");
  assertNoExecutionFields(json?.data, "kyberData");
  // route/build fields must never appear on the read path
  if (typeof json?.data?.data === "string") {
    requireValue(false, "VENUE_FORBIDDEN", "quote must not include calldata");
  }
  requireValue(json?.data?.encodedSwapData == null, "VENUE_FORBIDDEN", "quote must not include calldata");
  return json;
}

/** 轮询白名单全部资产；失败单只标记错误，不抛垮整轮。 */
export async function pollVenue(state, {
  clientId = DEFAULT_CLIENT_ID,
  fetchImpl = fetch,
  now = Date.now(),
  staleMs = DEFAULT_STALE_MS,
} = {}) {
  requireValue(state?.schema === VENUE_SCHEMA, "VENUE_STATE");
  const quote = state.watchlist.quote;
  for (const asset of state.watchlist.assets) {
    try {
      const json = await fetchKyberRoute({
        tokenIn: quote.address,
        tokenOut: asset.address,
        amountIn: quote.amountIn,
        clientId,
        fetchImpl,
      });
      applyQuote(state, asset.id, json, { now });
    } catch (err) {
      markQuoteError(state, asset.id, err, { now });
    }
  }
  state.focus = selectFocus(state.quotes, { now, staleMs });
  state.lastPollAt = now;
  return observationFromFocus(state, { now, staleMs });
}

export function assertAddress(addr, label = "address") {
  requireValue(ADDR_RE.test(addr || ""), label);
  return lower(addr);
}
