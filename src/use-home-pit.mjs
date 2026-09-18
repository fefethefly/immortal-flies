import { useEffect, useRef, useState } from "react";
import { offerObservation } from "./brain/flyswarm/market.mjs";
import {
  PIT_STORE,
  bootPitSession,
  pitAsSwarm,
  pitView,
  pulsePit,
  savePitSession,
  stepPit,
} from "./brain/flyswarm/pit.mjs";
import { observationFromQuotes } from "./venue-quotes.mjs";
import { useVenueQuotes } from "./use-venue-quotes.mjs";
import { recallFly, rememberFly } from "./site-chrome.jsx";
import {
  connectOfficialPit,
  fetchPitQuotes,
  fetchPitView,
  fetchPitWorld,
  PitRunnerDown,
  postPitStimulus,
} from "./pit-live.mjs";

const EMPTY = {
  model: "iff-pit-colony-v1",
  tick: 0,
  flies: [],
  market: { price: 0, mark: "IFS", quote: "SIM", fill: "SIM" },
  prices: [],
  trades: [],
  lineage: [],
  hive: null,
};

/**
 * 首页与交易场共用账本。
 * 有官方全量连接组时读 Railway 那一只蝇；否则回落浏览器纸面子图。
 * 真报价进感觉，成交记持仓，不上链。
 */
export function useHomePit() {
  const [swarm, setSwarm] = useState(EMPTY);
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState(null);
  const [world, setWorld] = useState(null);
  const [selectedId, setSelectedId] = useState(() => recallFly() ?? 0);
  const sessionRef = useRef(null);
  const listingRef = useRef(null);
  const touched = useRef(false);
  const venueQuotesLocal = useVenueQuotes({
    enabled: ready && !live,
    intervalMs: 4000,
  });
  const [venueQuotesLive, setVenueQuotesLive] = useState(null);
  const venueQuotes = live ? venueQuotesLive : venueQuotesLocal;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const connected = await connectOfficialPit();
        if (cancelled) return;
        if (connected.mode === "live") {
          listingRef.current = connected.listing;
          setLive(true);
          setView(connected.view);
          setSwarm(pitAsSwarm(connected.view));
          if (connected.world) setWorld(connected.world);
          if (connected.quotes) setVenueQuotesLive(connected.quotes);
          setError("");
          setReady(true);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof PitRunnerDown || err?.code === "PIT_RUNNER_DOWN") {
          console.warn("[home-pit] official pit down; not opening a private book", err);
          setLive(false);
          setError("PIT_RUNNER_DOWN");
          setReady(true);
          return;
        }
        console.warn("[home-pit] live view failed", err);
      }
      try {
        const { session } = await bootPitSession();
        if (cancelled) return;
        sessionRef.current = session;
        setLive(false);
        const next = pitView(session);
        setView(next);
        setSwarm(pitAsSwarm(next));
        setReady(true);
      } catch (err) {
        console.warn("[home-pit] boot failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || live || !venueQuotesLocal?.enabled) return;
    const obs = observationFromQuotes(venueQuotesLocal);
    const session = sessionRef.current;
    if (!obs || !session?.aux?.market) return;
    try {
      offerObservation(session.aux.market, obs);
    } catch {
      /* stale */
    }
  }, [ready, live, venueQuotesLocal]);

  useEffect(() => {
    if (!ready || !live) return undefined;
    let busy = false;
    const listing = listingRef.current;
    const id = setInterval(async () => {
      if (busy || !listing) return;
      busy = true;
      try {
        const [view, quotes, worldNext] = await Promise.all([
          fetchPitView(listing),
          fetchPitQuotes(listing),
          fetchPitWorld(listing).catch(() => null),
        ]);
        setSwarm(pitAsSwarm(view));
        if (quotes) setVenueQuotesLive(quotes);
        setView(view);
        if (worldNext) setWorld(worldNext);
      } catch (err) {
        console.warn("[home-pit] live poll failed", err);
      } finally {
        busy = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ready, live]);

  useEffect(() => {
    if (!ready || live || paused) return undefined;
    let busy = false;
    const id = setInterval(async () => {
      if (busy || document.hidden || !sessionRef.current) return;
      busy = true;
      try {
        const next = await stepPit(sessionRef.current);
        setView(next);
        setSwarm(pitAsSwarm(next));
        try {
          localStorage.setItem(
            PIT_STORE,
            JSON.stringify(savePitSession(sessionRef.current)),
          );
        } catch {
          /* private mode */
        }
      } finally {
        busy = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ready, live, paused]);

  useEffect(() => {
    const living = swarm.flies.filter((row) => row.status === "alive");
    if (living.length && !living.some((row) => row.id === selectedId)) {
      setSelectedId(living[0].id);
      rememberFly(living[0].id);
    }
  }, [swarm, selectedId]);

  function select(id) {
    touched.current = true;
    setSelectedId(id);
    rememberFly(id);
  }

  function poke(kind = "light", intensity = 0.7) {
    const listing = listingRef.current;
    if (live && listing) {
      postPitStimulus(listing, { kind, intensity }).then(
        (next) => {
          setView(next);
          setSwarm(pitAsSwarm(next));
        },
        () => {},
      );
      return;
    }
    const session = sessionRef.current;
    if (!session) return;
    try {
      pulsePit(session, kind, 0.7);
    } catch {
      /* cooldown */
    }
  }

  return {
    swarm,
    view,
    world,
    selectedId,
    select,
    poke,
    paused,
    ready,
    live,
    error,
    venueQuotes,
    togglePause: () => setPaused((value) => !value),
  };
}
