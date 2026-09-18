import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { formatBnb, formatPrice } from "./swarm.mjs";
import { useVenueQuotes } from "./use-venue-quotes.mjs";
import {
  formatBpsPct,
  formatUsd,
  headlineAsset,
} from "./venue-quotes.mjs";
import { loadGraph } from "./brain/graph.mjs";
import { loadLifeDeployment, readSoulCensus } from "./life/chain.mjs";
import { birthHref } from "./life/birth-card.mjs";
import { HatchPanel } from "./life/hatch-panel.jsx";
import {
  CIRCUIT_MANIFEST,
  CROSS_MODES,
  buildHeroField,
  causalState,
  colonyReadout,
  createCrossSectionRenderer,
  crossModeOf,
  fieldFromCircuit,
  nearestCrossFly,
  perchOfFly,
  stimKindOfNeuron,
  truthLines,
  utteranceTape,
} from "./home-cross-section.mjs";
import "./home-cross-section.css";

const MODE_KEYS = {
  neural: "home.crossNeural",
  society: "home.crossSociety",
  market: "home.crossMarket",
};

const SIDE_WORDS = /\b(SELL|BUY|HOLD|SIM|T\d+|#\d+)\b/g;

// Trade sides and ledger tokens read in bright gold inside the tape lines,
// like the reference terminal: the rest of the line stays champagne.
function sideWords(text) {
  const parts = String(text).split(SIDE_WORDS);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <em className="gold-side" key={`${part}-${i}`}>
        {part}
      </em>
    ) : (
      part
    ),
  );
}

function glAvailable() {
  if (typeof window === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(
      probe.getContext("webgl") || probe.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

function fieldBudget() {
  if (typeof window === "undefined") return 720;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 760;
  const small = coarse || narrow;
  if (glAvailable()) return small ? 6000 : 24000;
  return small ? 720 : 1400;
}

function useSoulCensus() {
  const [census, setCensus] = useState({
    status: "loading",
    total: 0,
    gen0: 0,
    cap: 1024,
    live: false,
  });
  useEffect(() => {
    let gone = false;
    loadLifeDeployment()
      .then(async (deployment) => {
        if (gone) return;
        if (!deployment) {
          setCensus({
            status: "off",
            total: 0,
            gen0: 0,
            cap: 1024,
            live: false,
          });
          return;
        }
        setCensus({
          status: "live",
          unread: true,
          total: 0,
          gen0: 0,
          cap: Number(deployment.maxGen0) || 1024,
          live: Number(deployment.chainId) === 56,
          chainId: Number(deployment.chainId),
        });
        const next = await Promise.race([
          readSoulCensus(deployment),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("census-timeout")), 6000);
          }),
        ]);
        if (!gone) setCensus(next);
      })
      .catch(() => {
        if (!gone) {
          setCensus((current) =>
            current.status === "live"
              ? current
              : {
                  status: "off",
                  total: 0,
                  gen0: 0,
                  cap: 1024,
                  live: false,
                },
          );
        }
      });
    return () => {
      gone = true;
    };
  }, []);
  return [census, setCensus];
}

export function HomeCrossSection({
  swarm,
  selectedId,
  onSelect,
  onPoke,
  locale,
  paused,
  onPause,
  tx,
}) {
  const canvas = useRef(null);
  const engine = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  const hover = useRef(null);
  const pokeRef = useRef({ id: 0, kind: "light", neuron: 0 });
  const birthRef = useRef({ id: 0 });
  const [locked, setLocked] = useState(null);
  const [field, setField] = useState(null);
  const [hatchOpen, setHatchOpen] = useState(false);
  const [census, setCensus] = useSoulCensus();
  const venueQuotes = useVenueQuotes({ intervalMs: 4000 });
  const headQuote = headlineAsset(venueQuotes);
  const liveQuotes = (venueQuotes?.assets || []).filter(
    (a) => a?.ok && a.usd != null && Number(a.usd) > 0,
  );
  const mode = crossModeOf(swarm.tick, locked);
  const fly =
    swarm.flies.find((row) => row.id === selectedId) ||
    swarm.flies.find((row) => row.status === "alive") ||
    swarm.flies[0];
  const cause = causalState(swarm, fly);
  const read = useMemo(
    () => colonyReadout(swarm, fly, locale),
    [swarm, fly, locale],
  );
  const tape = useMemo(() => utteranceTape(swarm, fly), [swarm, fly]);
  const truth = useMemo(
    () => truthLines({ field, swarm, census, locale, quotes: venueQuotes }),
    [field, swarm, census, locale, venueQuotes],
  );
  const prices = swarm.prices.slice(-60);
  const first = prices[0] || swarm.market.price;
  const change = (swarm.market.price / first - 1) * 100;
  const latest = useRef({});
  latest.current = {
    field,
    swarm,
    selectedId: fly?.id,
    mode,
    paused,
    hoverId: hover.current,
    pointer: pointer.current,
    poke: pokeRef.current,
    birth: birthRef.current,
  };

  useEffect(() => {
    let gone = false;
    const keep = fieldBudget();
    loadGraph(CIRCUIT_MANIFEST)
      .then((graph) => {
        if (!gone) setField(fieldFromCircuit(graph, keep));
      })
      .catch(() => {
        if (!gone) setField(buildHeroField(keep));
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return undefined;
    const instance = createCrossSectionRenderer(node, () => latest.current);
    engine.current = instance;
    return () => {
      instance.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.schedule();
  }, [swarm, selectedId, mode, paused, field]);

  function localPoint(event) {
    const box = canvas.current.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function onMove(event) {
    const box = canvas.current.getBoundingClientRect();
    pointer.current = {
      x: (event.clientX - box.left) / box.width - 0.5,
      y: (event.clientY - box.top) / box.height - 0.5,
    };
    const at = localPoint(event);
    hover.current = nearestCrossFly(engine.current?.hits || [], at.x, at.y)?.id;
    canvas.current.style.cursor =
      hover.current != null ? "pointer" : "crosshair";
    latest.current.hoverId = hover.current;
    latest.current.pointer = pointer.current;
  }

  function onClick(event) {
    const at = localPoint(event);
    const hit = nearestCrossFly(engine.current?.hits || [], at.x, at.y);
    if (hit) {
      onSelect?.(hit.id);
      return;
    }
    if (!field?.neurons?.length) return;
    const neuron = engine.current?.neuronAt?.(at.x, at.y) ?? null;
    if (neuron == null) return;
    const kind = stimKindOfNeuron(field.neurons[neuron]);
    pokeRef.current = {
      id: pokeRef.current.id + 1,
      kind,
      neuron,
    };
    latest.current.poke = pokeRef.current;
    engine.current?.schedule();
    onPoke?.(kind);
  }

  function onBorn(soul) {
    if (!soul) return;
    const perch =
      soul.perch ??
      perchOfFly({ id: soul.tokenId, seed: soul.seed }, field?.count || 1);
    birthRef.current = {
      id: birthRef.current.id + 1,
      tokenId: soul.tokenId,
      seed: soul.seed,
      perch,
    };
    latest.current.birth = birthRef.current;
    setCensus((current) => ({
      ...current,
      status: current.status === "off" ? current.status : "live",
      total: (current.total || 0) + 1,
      gen0: (current.gen0 || 0) + (soul.generation ? 0 : 1),
    }));
    engine.current?.schedule();
    const href = birthHref(
      soul,
      typeof location !== "undefined" ? location.origin : "",
      locale,
    );
    window.location.assign(href);
  }

  return (
    <section
      className="cross-hero"
      data-mode={mode}
      data-paused={paused}
      data-hatch={hatchOpen ? "open" : undefined}
      data-field={field?.source || "loading"}
      aria-label={tx("home.crossTitle")}
    >
      <canvas
        ref={canvas}
        className="cross-canvas"
        onPointerMove={onMove}
        onClick={onClick}
        role="img"
        aria-label={tx("home.crossCanvas")}
      />
      <div className="cross-hud">
        <header className="cross-top">
          <div className="cross-lead">
            <h1>{tx("home.crossTitle")}</h1>
            <ol className="cross-truth">
              {truth.map((row) => (
                <li
                  key={row.id}
                  data-live={row.live ? "true" : undefined}
                  data-paper={row.paper ? "true" : undefined}
                >
                  {row.text}
                </li>
              ))}
            </ol>
          </div>
          <div className="cross-tools">
            <button
              type="button"
              onClick={onPause}
              aria-label={
                paused ? tx("home.crossResume") : tx("home.crossPause")
              }
              title={paused ? tx("home.crossResume") : tx("home.crossPause")}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              type="button"
              className="cross-hatch"
              aria-expanded={hatchOpen}
              onClick={() => setHatchOpen((open) => !open)}
            >
              {hatchOpen ? tx("home.crossHatchClose") : tx("home.crossHatch")}
            </button>
          </div>
        </header>
        {hatchOpen ? (
          <div className="cross-desk">
            <HatchPanel
              compact
              fieldCount={field?.count || 1400}
              onBorn={onBorn}
            />
          </div>
        ) : null}
        <ol className="cross-tape">
          <li className="cross-watch" data-kind="WATCH">
            <b>{tx("home.crossWatch", { id: read.flyId })}</b>
            <span>
              {sideWords(
                `${read.flyAct} · ${read.flySide} · ${read.flySpikes}/24`,
              )}
            </span>
            <small>{read.look || read.hue}</small>
          </li>
          {tape.map((row, i) => (
            <li
              key={`${row.kind}-${row.vars.tick ?? i}-${row.vars.id}`}
              data-kind={row.kind}
            >
              <b>
                {row.kind}
                {row.audit ? ` · ${row.audit}` : ""}
              </b>
              <span>{sideWords(tx(row.key, row.vars))}</span>
            </li>
          ))}
        </ol>
        <aside className="cross-rail" data-hot={mode === "market"}>
          <span>
            {headQuote ? tx("home.crossQuote") : tx("home.crossPrice")}
          </span>
          <strong>
            {headQuote ? formatUsd(headQuote.usd) : formatPrice(swarm.market.price)}
          </strong>
          <small
            className={
              (headQuote ? headQuote.changeBps : change) < 0 ? "sell" : "buy"
            }
          >
            {headQuote
              ? `${headQuote.symbol} ${formatBpsPct(headQuote.changeBps)}`
              : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
          </small>
          {liveQuotes.length > 0 ? (
            <ul className="cross-quotes">
              {liveQuotes.map((a) => (
                <li
                  key={a.id}
                  className={a.id === headQuote?.id ? "focus" : undefined}
                >
                  <b>{a.symbol}</b>
                  <strong>{formatUsd(a.usd)}</strong>
                  <i className={a.changeBps < 0 ? "sell" : "buy"}>
                    {formatBpsPct(a.changeBps)}
                  </i>
                </li>
              ))}
            </ul>
          ) : null}
          <span>{tx("home.crossSplit")}</span>
          <ul className="cross-split">
            {["BUY", "HOLD", "SELL"].map((side) => (
              <li key={side} className={side.toLowerCase()}>
                <b>{side}</b>
                <i>
                  <em
                    style={{
                      width: `${(read.sides[side] / Math.max(1, read.alive)) * 100}%`,
                    }}
                  />
                </i>
                <strong>{read.sides[side]}</strong>
              </li>
            ))}
          </ul>
          <span>{tx("home.crossBook")}</span>
          <strong className="cross-book">
            {formatBnb(read.bnb)} <small>BNB</small>
          </strong>
          <small>
            {sideWords(`${read.buys} BUY · ${read.sells} SELL`)}
          </small>
          <em>{tx("home.crossIfs")}</em>
        </aside>
        <div className="cross-mobile-rail">
          <div className="cross-mobile-row">
            <span>
              {headQuote ? tx("home.crossQuote") : tx("home.crossPrice")}
            </span>
            <strong>
              {headQuote
                ? formatUsd(headQuote.usd)
                : formatPrice(swarm.market.price)}
            </strong>
            <small
              className={
                (headQuote ? headQuote.changeBps : change) < 0 ? "sell" : "buy"
              }
            >
              {headQuote
                ? `${headQuote.symbol} ${formatBpsPct(headQuote.changeBps)}`
                : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            </small>
            <b>
              {tx("home.crossBook")} · {formatBnb(read.bnb)} <i>BNB</i>
            </b>
          </div>
          {liveQuotes.length > 0 ? (
            <ul className="cross-quotes is-mobile">
              {liveQuotes.map((a) => (
                <li key={a.id}>
                  <b>{a.symbol}</b> {formatUsd(a.usd)}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="cross-mobile-split" aria-hidden="true">
            {["BUY", "HOLD", "SELL"].map((side) => (
              <em
                key={side}
                className={side.toLowerCase()}
                style={{
                  width: `${(read.sides[side] / Math.max(1, read.alive)) * 100}%`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="cross-scroll" aria-hidden="true">
          <ChevronDown size={14} />
        </div>
        <div className="cross-rule" aria-hidden="true" />
        <footer className="cross-foot">
          <p className="cross-cause">
            #{String(cause.id).padStart(3, "0")} {cause.act} → {cause.side} ·{" "}
            {formatPrice(cause.price)} · T{String(cause.tick).padStart(6, "0")}{" "}
            · {cause.buy}/{cause.hold}/{cause.sell}
            {cause.fill ? ` · ${cause.heard} heard` : ""}
          </p>
          <div
            className="cross-modes"
            role="group"
            aria-label={tx("home.crossModes")}
          >
            {CROSS_MODES.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setLocked(key)}
              >
                {tx(MODE_KEYS[key])}
              </button>
            ))}
            {locked ? (
              <button
                type="button"
                className="cross-auto"
                onClick={() => setLocked(null)}
              >
                {locale === "zh" ? "自动巡览" : "Auto tour"}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </section>
  );
}
