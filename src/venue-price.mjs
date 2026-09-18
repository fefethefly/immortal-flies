/**
 * USDT 标价换算。给 venue 适配器与浏览器共用，不碰 node:fs。
 */

export function usdPerToken(
  amountOut,
  {
    amountIn = "1000000000000000000",
    assetDecimals = 18,
    quoteDecimals = 18,
  } = {},
) {
  try {
    const out = BigInt(String(amountOut));
    const inn = BigInt(String(amountIn));
    if (out <= 0n || inn <= 0n) return null;
    const scale = 1_000_000n;
    const num = inn * 10n ** BigInt(assetDecimals) * scale;
    const den = out * 10n ** BigInt(quoteDecimals);
    return Number(num / den) / 1e6;
  } catch {
    return null;
  }
}

/** Watchlist marks are $1–$1M / token. Reject wei / amountOut mistaken as dollars. */
export const USD_MARK_MIN = 1;
export const USD_MARK_MAX = 1_000_000;
/** UI never prints a paper book or quote past $1B. */
export const USD_PRINT_MAX = 1_000_000_000;

export function formatUsd(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) {
    return "—";
  }
  const n = Number(value);
  if (n > USD_PRINT_MAX) return "—";
  const digits = n >= 1 ? 2 : 4;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: n >= 1 ? 2 : 0,
    maximumFractionDigits: digits,
  })}`;
}

export function formatBpsPct(bps) {
  const n = Number(bps);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${(n / 100).toFixed(2)}%`;
}

/** $1 = 1e6 atoms，与 START_BNB=1e9（$1000）对齐。 */
export const USD_ATOM = 1_000_000;

export function saneUsdAtoms(value) {
  const n = Math.round(Number(value));
  if (!Number.isSafeInteger(n)) return null;
  if (n < USD_MARK_MIN * USD_ATOM) return null;
  if (n > USD_MARK_MAX * USD_ATOM) return null;
  return n;
}

export function priceAtomsFromUsd(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return saneUsdAtoms(Math.round(n * USD_ATOM));
}

export function usdFromAtoms(atoms) {
  const n = Number(atoms);
  if (!Number.isFinite(n)) return null;
  return n / USD_ATOM;
}

export function formatUsdSigned(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const abs = formatUsd(Math.abs(n));
  if (abs === "—") return n === 0 ? "$0.00" : "—";
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}
