/**
 * 服务端 Kyber 报价轮询。只读；失败不拖垮 Session。
 */
import {
  createVenueState,
  loadWatchlist,
  observationFromFocus,
  pollVenue,
  venueView,
  DEFAULT_CLIENT_ID,
  DEFAULT_STALE_MS,
} from "../../../src/brain/flyswarm/venue.mjs";

export function createVenueService({ config, logger, fetchImpl = fetch } = {}) {
  const enabled = Boolean(config?.venue?.enabled);
  const pollMs = config?.venue?.pollMs ?? 3000;
  const clientId = config?.venue?.clientId || DEFAULT_CLIENT_ID;
  const staleMs = config?.venue?.staleMs ?? DEFAULT_STALE_MS;
  const watchlistPath = config?.venue?.watchlistPath;

  let state = null;
  let timer = null;
  let inflight = null;

  function ensureState() {
    if (!state) {
      const list = watchlistPath ? loadWatchlist(watchlistPath) : loadWatchlist();
      state = createVenueState(list);
    }
    return state;
  }

  async function refresh() {
    if (!enabled) return null;
    if (inflight) return inflight;
    const venue = ensureState();
    inflight = (async () => {
      try {
        const obs = await pollVenue(venue, {
          clientId,
          fetchImpl,
          now: Date.now(),
          staleMs,
        });
        logger?.info?.("venue polled", {
          focus: venue.focus?.assetId || null,
          ok: Object.values(venue.quotes).filter((q) => q.ok).length,
          error: venue.lastError,
        });
        return obs;
      } catch (err) {
        venue.lastError = err?.message || String(err);
        logger?.warn?.("venue poll failed", { error: venue.lastError });
        return observationFromFocus(venue, { now: Date.now(), staleMs });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  function start() {
    if (!enabled || timer) return;
    ensureState();
    refresh().catch(() => {});
    timer = setInterval(() => {
      refresh().catch(() => {});
    }, pollMs);
    if (typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** tick 前：若有新鲜焦点，返回 offerObservation 形状；否则 null。 */
  async function observationForTick() {
    if (!enabled) return null;
    const venue = ensureState();
    const age = venue.lastPollAt ? Date.now() - venue.lastPollAt : Infinity;
    if (age > pollMs) await refresh();
    return observationFromFocus(venue, { now: Date.now(), staleMs });
  }

  function getQuotes() {
    if (!enabled) {
      return {
        schema: "iff.venue/1",
        enabled: false,
        quote: null,
        fill: "SIM",
        assets: [],
        focus: null,
        note: "Set IFF_VENUE_ENABLED=1 to poll KyberSwap.",
      };
    }
    return venueView(ensureState(), { now: Date.now(), staleMs });
  }

  function getState() {
    return enabled ? ensureState() : null;
  }

  return {
    enabled,
    start,
    stop,
    refresh,
    observationForTick,
    getQuotes,
    getState,
  };
}
