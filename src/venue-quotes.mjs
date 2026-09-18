/**
 * 浏览器侧只读报价：先问本机 /v1/venue/quotes，没有服务端就直连 Kyber GET /routes。
 * 不 import venue.mjs（那里有 node:fs）。不成交、无 calldata。
 */
import {
  usdPerToken,
  formatUsd,
  formatBpsPct,
  priceAtomsFromUsd,
  formatUsdSigned,
  usdFromAtoms,
  saneUsdAtoms,
} from "./venue-price.mjs";

export {
  usdPerToken,
  formatUsd,
  formatBpsPct,
  priceAtomsFromUsd,
  formatUsdSigned,
  usdFromAtoms,
  saneUsdAtoms,
};
export const WATCHLIST_PATH = "/token/venue-watchlist.json";
export const KYBER_ROUTES =
  "https://aggregator-api.kyberswap.com/bsc/api/v1/routes";
export const DEFAULT_CLIENT_ID = "immortalflies";

function liveAssets(quotes) {
  return (quotes?.assets || []).filter((a) => a?.ok && a.amountOut);
}

export function headlineAsset(quotes) {
  const live = liveAssets(quotes).filter(
    (a) => a.usd != null && Number(a.usd) > 0,
  );
  return (
    live.find((a) => a.id === "WBNB") ||
    live.find((a) => a.id === quotes?.focus?.assetId) ||
    live[0] ||
    null
  );
}

export function decorateQuotes(raw, source = "server") {
  if (!raw || typeof raw !== "object") return null;
  const quote = raw.quoteToken || {};
  const assets = (raw.assets || []).map((a) => {
    const usd =
      a.usd != null && Number.isFinite(Number(a.usd)) && Number(a.usd) > 0
        ? Number(a.usd)
        : usdPerToken(a.amountOut, {
            amountIn: quote.amountIn || "1000000000000000000",
            assetDecimals: a.decimals ?? 18,
            quoteDecimals: quote.decimals ?? 18,
          });
    return { ...a, usd };
  });
  const picked =
    raw.focus && assets.find((a) => a.id === raw.focus.assetId)
      ? {
          ...raw.focus,
          usd:
            raw.focus.usd ??
            assets.find((a) => a.id === raw.focus.assetId)?.usd ??
            null,
        }
      : assets
          .filter((a) => a.ok && !a.stale)
          .sort(
            (a, b) => Math.abs(b.changeBps || 0) - Math.abs(a.changeBps || 0),
          )[0] || null;
  const live = assets.filter((a) => a.ok && a.usd != null);
  const focus = picked
    ? {
        ...picked,
        assetId: picked.assetId || picked.id,
        usd: picked.usd ?? null,
      }
    : raw.focus || null;
  return {
    ...raw,
    source,
    enabled: live.length > 0,
    quote: live.length > 0 ? "LIVE" : raw.quote || null,
    fill: "SIM",
    assets,
    focus: focus ? { ...focus, usd: focus.usd ?? null } : raw.focus || null,
  };
}

async function fetchWatchlist(fetchImpl) {
  const res = await fetchImpl(WATCHLIST_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error("WATCHLIST_FETCH");
  const list = await res.json();
  if (list?.schema !== "iff.venue-watchlist/1")
    throw new Error("WATCHLIST_SCHEMA");
  return list;
}

async function fetchKyberAmount(list, asset, fetchImpl) {
  const url = new URL(KYBER_ROUTES);
  url.searchParams.set("tokenIn", list.quote.address);
  url.searchParams.set("tokenOut", asset.address);
  url.searchParams.set("amountIn", String(list.quote.amountIn));
  url.searchParams.set("gasInclude", "true");
  // 不带自定义头：预检会挡住静态站直连 Kyber。
  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`Kyber ${res.status}`);
  const json = await res.json();
  const summary = json?.data?.routeSummary;
  const amountOut = String(summary?.amountOut || "");
  if (!/^\d+$/.test(amountOut) || BigInt(amountOut) <= 0n) {
    throw new Error("AMOUNTOut");
  }
  if (typeof json?.data?.data === "string" && json.data.data.startsWith("0x")) {
    throw new Error("VENUE_FORBIDDEN");
  }
  return {
    amountOut,
    amountOutUsd:
      summary.amountOutUsd != null ? String(summary.amountOutUsd) : null,
  };
}

function bpsFromPrev(prevOut, nextOut) {
  if (!prevOut) return 0;
  const a = BigInt(String(prevOut));
  const b = BigInt(String(nextOut));
  if (a <= 0n) return 0;
  const bps = (b * 10000n) / a - 10000n;
  if (bps > 10000n) return 10000;
  if (bps < -10000n) return -10000;
  return Number(bps);
}

/**
 * @param {{ fetchImpl?: typeof fetch, prev?: object }} [opts]
 */
export async function loadVenueQuotes({ fetchImpl = fetch, prev = null } = {}) {
  try {
    const res = await fetchImpl("/v1/venue/quotes", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const decorated = decorateQuotes(data, "server");
      if (liveAssets(decorated).length) return decorated;
    }
  } catch {
    /* 无 8787 或未轮询到：直连 Kyber */
  }

  const list = await fetchWatchlist(fetchImpl);
  const prevMap = Object.fromEntries(
    (prev?.assets || []).map((a) => [a.id, a]),
  );
  const assets = await Promise.all(
    list.assets.map(async (asset) => {
      try {
        const quoted = await fetchKyberAmount(list, asset, fetchImpl);
        const prevOut = prevMap[asset.id]?.amountOut;
        const usd = usdPerToken(quoted.amountOut, {
          amountIn: list.quote.amountIn,
          assetDecimals: asset.decimals ?? 18,
          quoteDecimals: list.quote.decimals ?? 18,
        });
        return {
          id: asset.id,
          symbol: asset.symbol,
          address: asset.address,
          decimals: asset.decimals ?? 18,
          amountOut: quoted.amountOut,
          amountOutUsd: quoted.amountOutUsd,
          usd,
          changeBps: bpsFromPrev(prevOut, quoted.amountOut),
          quotedAt: Date.now(),
          stale: false,
          ok: true,
          error: null,
        };
      } catch (err) {
        return {
          id: asset.id,
          symbol: asset.symbol,
          address: asset.address,
          usd: prevMap[asset.id]?.usd ?? null,
          amountOut: prevMap[asset.id]?.amountOut ?? null,
          changeBps: prevMap[asset.id]?.changeBps ?? 0,
          quotedAt: prevMap[asset.id]?.quotedAt || 0,
          stale: true,
          ok: false,
          error: String(err?.message || err),
        };
      }
    }),
  );

  return decorateQuotes(
    {
      schema: "iff.venue/1",
      enabled: assets.some((a) => a.ok),
      quote: "LIVE",
      fill: "SIM",
      chainId: list.chainId,
      adapter: list.adapter || "kyberswap",
      quoteToken: list.quote,
      assets,
      note: "Quotes from KyberSwap GET /routes. Fills remain paper SIM.",
    },
    "kyber",
  );
}

export function observationFromQuotes(quotes) {
  const focus = headlineAsset(quotes);
  if (!focus?.id) return null;
  const asset = (quotes.assets || []).find((a) => a.id === focus.id) || focus;
  const src = quotes.quoteToken?.address;
  const dst = asset?.address || focus.address;
  const usdAtoms = priceAtomsFromUsd(focus.usd);
  if (!src || !dst || focus.changeBps == null) return null;
  return {
    payload: {
      changeBps: focus.changeBps,
      activity: Math.min(1000, Math.abs(focus.changeBps || 0)),
      assetId: focus.id,
      mid: focus.mid ?? null,
      ...(usdAtoms ? { usd: usdAtoms } : {}),
    },
    provenance: {
      kind: "aggregator-quote",
      chainId: 56,
      adapter: "kyberswap",
      src,
      dst,
      assetId: focus.id,
      quotedAt: focus.quotedAt || Date.now(),
      quote: "LIVE",
      fill: "SIM",
    },
  };
}
