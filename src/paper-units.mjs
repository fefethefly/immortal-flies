import {
  START_BNB,
  bookOf,
  equityOf,
  formatBnb,
  formatPrice,
  formatToken,
} from "./swarm.mjs";
import {
  formatBpsPct,
  formatUsd,
  formatUsdSigned,
  usdFromAtoms,
} from "./venue-quotes.mjs";

/** Paper book ticker before a live Kyber mark. Not a Kyber pair. */
export const PAPER_TOKEN = "IFS";
export const PAPER_CASH = "BNB";
export const LIVE_CASH = "USDT";

export function sensedAsset(market, trade) {
  const id = trade?.assetId || market?.assetId || market?.focusAssetId || null;
  if ((market?.mark === "USD" || trade?.quote === "LIVE") && id) return id;
  return PAPER_TOKEN;
}

export function formatPaperCash(atoms, market) {
  if (market?.mark === "USD") {
    const text = formatUsd(usdFromAtoms(atoms));
    return text === "—" ? "—" : `${text} ${LIVE_CASH}`;
  }
  return `${formatBnb(atoms)} ${PAPER_CASH}`;
}

export function formatPaperInventory(tokens, market, trade) {
  return `${formatToken(tokens)} ${sensedAsset(market, trade)}`;
}

export function formatPaperFill(trade, market) {
  if (!trade) return "";
  if (trade.side === "BUY") return formatPaperCash(trade.amount, market);
  return formatPaperInventory(trade.amount, market, trade);
}

export function formatMarketPrice(market) {
  if (market?.mark === "USD") {
    const usd = usdFromAtoms(market.price);
    const symbol = market.assetId || "USD";
    return {
      text: formatUsd(usd),
      suffix: symbol,
    };
  }
  return {
    text: formatPrice(market?.price || 0),
    suffix: PAPER_CASH,
  };
}

export function formatPaperValue(atoms, market) {
  if (market?.mark === "USD") {
    const text = formatUsd(usdFromAtoms(atoms));
    return text === "—" ? "—" : `${text} ${LIVE_CASH}`;
  }
  return `${formatBnb(atoms)} ${PAPER_CASH}`;
}

export function formatPaperSigned(atoms, market) {
  const n = Number(atoms) || 0;
  if (market?.mark === "USD") {
    const text = formatUsdSigned(usdFromAtoms(n));
    return text === "—" ? "—" : `${text} ${LIVE_CASH}`;
  }
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${formatBnb(Math.abs(n))} ${PAPER_CASH}`;
}

export function hiveBook(swarm) {
  const market = swarm?.market || {};
  const hive = swarm?.hive;
  if (hive && hive.equity != null) {
    const cash = hive.cash || 0;
    const equity = hive.equity || 0;
    return {
      cash,
      token: hive.token || 0,
      inventory: equity - cash,
      equity,
      vsStart: hive.vsStart ?? 0,
    };
  }
  const living = (swarm?.flies || []).filter((row) => row.status === "alive");
  const price = market.price || 0;
  let cash = 0;
  let token = 0;
  let equity = 0;
  for (const fly of living) {
    cash += fly.bnb || 0;
    token += fly.token || 0;
    equity += equityOf(fly, price);
  }
  return {
    cash,
    token,
    inventory: equity - cash,
    equity,
    vsStart: equity - living.length * START_BNB,
  };
}

export function flyBook(fly, market) {
  const price = market?.price || 0;
  const bag = fly ? bookOf(fly, price) : { cash: 0, inventory: 0, equity: 0 };
  return {
    cash: bag.cash || 0,
    token: fly?.token || 0,
    inventory: bag.inventory || 0,
    equity: bag.equity || 0,
    vsStart: fly?.pnl?.vsStart ?? bag.equity - START_BNB,
  };
}

export function formatBook(market, book) {
  const row = book || {
    cash: 0,
    token: 0,
    inventory: 0,
    equity: 0,
    vsStart: 0,
  };
  return {
    cash: formatPaperValue(row.cash, market),
    qty: formatPaperInventory(row.token, market),
    inventory: formatPaperValue(row.inventory, market),
    equity: formatPaperValue(row.equity, market),
    pnl: formatPaperSigned(row.vsStart, market),
    down: (row.vsStart || 0) < 0,
  };
}

/**
 * Hero / pit headline. Kyber USD only replaces the big number after the
 * paper book has actually switched to that asset. Watchlist quotes can
 * still list WBNB/BTCB/ETH as sense input.
 */
export function railMarket(swarm, quotes) {
  const market = swarm?.market || {};
  const liveQuotes = (quotes?.assets || []).filter(
    (row) => row?.ok && row.usd != null && Number(row.usd) > 0,
  );
  const loopId = market.mark === "USD" ? market.assetId || "WBNB" : null;
  const quoted = loopId ? liveQuotes.find((row) => row.id === loopId) : null;

  if (market.mark === "USD") {
    const changeBps = quoted?.changeBps ?? market.lastChangeBps ?? 0;
    return {
      kind: "usd",
      labelKey: "home.crossQuote",
      value: quoted
        ? formatUsd(quoted.usd)
        : formatUsd(usdFromAtoms(market.price)),
      change: formatBpsPct(changeBps),
      down: changeBps < 0,
      symbol: quoted?.symbol || loopId,
      loopId,
      liveQuotes,
    };
  }

  const window = (swarm?.prices || []).slice(-60);
  const first = window[0] || market.price || 0;
  const changeBps =
    first > 0 && market.price
      ? Math.round(((market.price - first) * 10000) / first)
      : 0;
  return {
    kind: "paper",
    labelKey: "home.crossPrice",
    value: formatPrice(market.price || 0),
    change: formatBpsPct(changeBps),
    down: changeBps < 0,
    symbol: null,
    loopId: null,
    liveQuotes,
  };
}
