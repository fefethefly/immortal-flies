import { useEffect, useRef, useState } from "react";
import { loadVenueQuotes } from "./venue-quotes.mjs";

/**
 * 首页 / 交易场共用：先问 /v1/venue/quotes，没有服务端就直连 Kyber。
 */
export function useVenueQuotes({ intervalMs = 4000, enabled = true } = {}) {
  const [quotes, setQuotes] = useState(null);
  const prev = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    async function pull() {
      try {
        const next = await loadVenueQuotes({ prev: prev.current });
        if (cancelled) return;
        prev.current = next;
        setQuotes(next);
      } catch {
        /* 保留上一帧，避免闪回纸面价 */
      }
    }
    pull();
    const id = setInterval(pull, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, intervalMs]);
  return quotes;
}
