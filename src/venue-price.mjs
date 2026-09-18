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

export function formatUsd(value) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) <= 0) {
    return "—";
  }
  const n = Number(value);
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
