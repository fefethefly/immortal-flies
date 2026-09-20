import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { useRunnerStatus } from "./use-runner-status.mjs";
import { formatBpsPct, formatUsd } from "./venue-quotes.mjs";
import {
  formatBook,
  formatMarketPrice,
  hiveBook,
  railMarket,
} from "./paper-units.mjs";
import { loadGraph } from "./brain/graph.mjs";
import { loadLifeDeployment, readSoulCensus } from "./life/chain.mjs";
import { birthHref } from "./life/birth-card.mjs";
import { hatchIntentFromLocation } from "./life/hatch-intent.mjs";
import { HatchPanel } from "./life/hatch-panel.jsx";
import { setPendingGiven } from "./life/names.mjs";
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

const SIDE_WORDS = /\b(SELL|BUY|HOLD|SIM|T\d+|#\d+|WBNB|BTCB|ETH|USDT|IFS)\b/g;

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
  quotes = null,
  pitLive = false,
  pitError = "",
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
  const [hatchOpen, setHatchOpen] = useState(() => {
    const intent = hatchIntentFromLocation();
    if (intent.given) setPendingGiven(intent.given);
    return intent.open;
  });
  const [census, setCensus] = useSoulCensus();
  const runner = useRunnerStatus();
  const rail = useMemo(() => railMarket(swarm, quotes), [swarm, quotes]);
  const book = useMemo(
    () => formatBook(swarm.market, hiveBook(swarm)),
    [swarm],
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
    () =>
      truthLines({
        field,
        swarm,
        census,
        locale,
        quotes,
        runner,
        pitLive,
        pitError,
      }),
    [field, swarm, census, locale, quotes, runner, pitLive, pitError],
  );
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
            <p>{tx("home.crossLead")}</p>
          </div>
          <div className="cross-tools">
            <button
              type="button"
              onClick={onPause}
              disabled={pitLive}
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
              {hatchOpen ? (
                tx("home.crossHatchClose")
              ) : (
                <>
                  <span className="cross-hatch-full">
                    {tx("home.crossHatch")}
                  </span>
                  <span className="cross-hatch-short">
                    {tx("home.crossHatchShort")}
                  </span>
                </>
              )}
            </button>
          </div>
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
          <span>{tx(rail.labelKey, { symbol: rail.symbol || "" })}</span>
          <strong>{rail.value}</strong>
          <small className={rail.down ? "sell" : "buy"}>
            {rail.symbol ? `${rail.symbol} ${rail.change}` : rail.change}
          </small>
          {rail.liveQuotes.length > 0 ? (
            <ul className="cross-quotes">
              {rail.liveQuotes.map((a) => (
                <li
                  key={a.id}
                  className={a.id === rail.loopId ? "focus" : undefined}
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
          <span>{tx(pitLive ? "home.crossBookLive" : "home.crossBook")}</span>
          <strong className="cross-book">{book.equity}</strong>
          {pitError ? (
            <small className="sell">{tx("pit.liveDown")}</small>
          ) : (
            <small className={book.down ? "sell" : "buy"}>
              {tx("home.crossPnl")} {book.pnl}
            </small>
          )}
          <em>{tx("home.crossIfs")}</em>
        </aside>
        <div className="cross-mobile-rail">
          <div className="cross-mobile-row">
            <span>{tx(rail.labelKey, { symbol: rail.symbol || "" })}</span>
            <strong>{rail.value}</strong>
            <small className={rail.down ? "sell" : "buy"}>
              {rail.symbol ? `${rail.symbol} ${rail.change}` : rail.change}
            </small>
            <b>
              {tx(pitLive ? "home.crossBookLive" : "home.crossBook")} ·{" "}
              {book.equity}
            </b>
          </div>
          {rail.liveQuotes.length > 0 ? (
            <ul className="cross-quotes is-mobile">
              {rail.liveQuotes.map((a) => (
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
            {formatMarketPrice(swarm.market).text}{" "}
            {formatMarketPrice(swarm.market).suffix} · T
            {String(cause.tick).padStart(6, "0")} · {cause.buy}/{cause.hold}/
            {cause.sell}
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
