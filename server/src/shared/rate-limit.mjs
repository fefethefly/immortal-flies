import { tooMany } from "./errors.mjs";

/** 滑动窗口限流。max<=0 表示关闭。 */
export function createRateLimiter() {
  const buckets = new Map();

  function allow(key, { max, windowMs }) {
    if (!max || max <= 0) return { ok: true };
    const now = Date.now();
    const kept = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (kept.length >= max) {
      buckets.set(key, kept);
      const retryAfterMs = Math.max(0, windowMs - (now - kept[0]));
      return { ok: false, retryAfterMs };
    }
    kept.push(now);
    buckets.set(key, kept);
    if (buckets.size > 4000) {
      const first = buckets.keys().next().value;
      buckets.delete(first);
    }
    return { ok: true };
  }

  function reject(result) {
    const seconds = Math.max(1, Math.ceil((result.retryAfterMs || 1000) / 1000));
    return tooMany("Rate limit exceeded", { retry_after: seconds });
  }

  return { allow, reject };
}

export function rateKey(req, pathname) {
  const session = pathname.match(/^\/v1\/sessions\/([^/]+)/);
  if (session) return session[1];
  return req.socket?.remoteAddress || "local";
}
