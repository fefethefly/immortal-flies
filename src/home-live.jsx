import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useTx } from "./locale-context.jsx";
import { SiteLink } from "./site-chrome.jsx";
import {
  LAYERS,
  bookOf,
  formatBnb,
  formatPrice,
  formatToken,
  layerFires,
  reflexOf,
  summarize,
} from "./swarm.mjs";
import { timeLabel } from "./swarm-pit.jsx";

function popcount(value) {
  let n = value >>> 0;
  let count = 0;
  while (n) {
    n &= n - 1;
    count += 1;
  }
  return count;
}

export function HomeMeters({ swarm, fly, token }) {
  const tx = useTx();
  const stats = summarize(swarm);
  const last = swarm.trades[0];
  const live = token?.status === "live" && token.address;
  const ticker = `$${token?.symbol || "IFS"}`;
  return (
    <dl className="home-meters">
      <div>
        <dt>{tx("public.metersTick", { n: swarm.tick })}</dt>
        <dd>
          {tx("public.metersListed", {
            alive: stats.alive,
            total: stats.total,
          })}
        </dd>
      </div>
      <div>
        <dt>{tx("public.metersPrice")}</dt>
        <dd>{formatPrice(swarm.market.price)}</dd>
      </div>
      <div>
        <dt>{fly ? `#${fly.id}` : "—"}</dt>
        <dd className={fly?.lastSide.toLowerCase()}>
          {fly?.lastSide || "HOLD"}
        </dd>
      </div>
      <div>
        <dt>{tx("public.metersFill")}</dt>
        <dd>{last ? `${last.side} #${last.flyId}` : tx("tape.noFill")}</dd>
      </div>
      <div className="wide">
        <dt>{ticker}</dt>
        <dd>
          {live
            ? tx("public.taxLine", {
                buy: (token.buyTaxBps || 100) / 100,
                sell: (token.sellTaxBps || 100) / 100,
              })
            : tx("public.unlaunched")}
        </dd>
      </div>
    </dl>
  );
}

export function HomeLiveDecks({ swarm, fly, onSelect }) {
  const tx = useTx();
  const [canon, setCanon] = useState(null);
  useEffect(() => {
    fetch("/data/malecns-circuit/manifest.json")
      .then((response) => (response.ok ? response.json() : null))
      .then(setCanon)
      .catch(() => setCanon(null));
  }, []);
  return (
    <section
      className="home-decks"
      aria-label={tx("public.liveDeck")}
      data-reveal="wait"
    >
      <HomePitDeck swarm={swarm} fly={fly} onSelect={onSelect} />
      <HomeCanonDeck fly={fly} swarm={swarm} canon={canon} />
    </section>
  );
}

function HomePitDeck({ swarm, fly, onSelect }) {
  const tx = useTx();
  const reflex = fly ? reflexOf(fly) : null;
  const bag = fly ? bookOf(fly, swarm.market.price) : null;
  const why = reflex
    ? reflex.side === "BUY"
      ? tx("pit.whyBuy")
      : reflex.side === "SELL"
        ? tx("pit.whySell")
        : tx("pit.whyHold")
    : null;
  const board = summarize(swarm)
    .board.filter((row) => row.status === "alive")
    .slice(0, 5);
  const river = swarm.trades.slice(0, 6);
  const lean = reflex ? Math.max(-1, Math.min(1, reflex.lean)) : 0;
  return (
    <article className="home-deck" data-index="01">
      <header>
        <small>01</small>
        <h2>{tx("nav.pit")}</h2>
        <p>{tx("public.livePitHint")}</p>
      </header>
      {fly && reflex ? (
        <div className="home-reflex">
          <div>
            <b className={reflex.side.toLowerCase()}>{reflex.side}</b>
            <span>{why}</span>
          </div>
          <div className="home-beam" aria-hidden="true">
            <i style={{ transform: `translateX(${lean * 42}%)` }} />
          </div>
          <small>
            {tx("pit.approach", { n: reflex.approach })} ·{" "}
            {tx("pit.retreat", { n: reflex.retreat })}
            {bag
              ? ` · ${tx("pit.equity", { bnb: formatBnb(bag.equity) })}`
              : ""}
          </small>
        </div>
      ) : (
        <p className="home-empty">{tx("pit.emptyFly")}</p>
      )}
      <ol className="home-river">
        {river.length ? (
          river.map((row, i) => (
            <li
              key={`${row.tick}-${row.flyId}-${i}`}
              className={row.side.toLowerCase()}
            >
              <small>{timeLabel(row.tick)}</small>
              <b>{row.side}</b>
              <span>#{row.flyId}</span>
              <em>
                {row.side === "BUY"
                  ? `${formatBnb(row.amount)} BNB`
                  : `${formatToken(row.amount)} IFL`}
              </em>
            </li>
          ))
        ) : (
          <li className="empty">{tx("pit.emptyRiver")}</li>
        )}
      </ol>
      <div className="home-seals">
        {board.map((row) => (
          <button
            key={row.id}
            type="button"
            className={row.id === fly?.id ? "on" : ""}
            onClick={() => onSelect(row.id)}
          >
            #{row.id}
            <em className={row.lastSide.toLowerCase()}>{row.lastSide}</em>
          </button>
        ))}
      </div>
      <SiteLink className="deck-go" href="/swarm.html">
        {tx("public.enterPit")}
        <ArrowUpRight size={14} />
      </SiteLink>
    </article>
  );
}

function HomeCanonDeck({ fly, swarm, canon }) {
  const tx = useTx();
  const fires = fly ? layerFires(fly.brain.spikes) : [];
  return (
    <article className="home-deck canon-deck" data-index="02">
      <header>
        <small>02</small>
        <h2>{tx("nav.canon")}</h2>
        <p>{tx("public.liveCanonHint")}</p>
      </header>
      <div className="home-canon-meta">
        <span>{tx("public.paperNodes", { n: 24 })}</span>
        <span>
          {canon
            ? tx("public.circuitReady", {
                neurons: Number(canon.neurons).toLocaleString("en-US"),
                edges: Number(canon.edges).toLocaleString("en-US"),
              })
            : tx("public.circuitWait")}
        </span>
      </div>
      <HomeScope fly={fly} tick={swarm.tick} />
      <ol className="home-layers">
        {LAYERS.map((layer) => {
          const row = fires.find((item) => item.id === layer.id);
          const ratio = row && row.size ? row.count / row.size : 0;
          return (
            <li key={layer.id}>
              <span>{tx(`public.layer.${layer.id}`)}</span>
              <i>
                <em style={{ width: `${Math.round(ratio * 100)}%` }} />
              </i>
              <b>
                {row?.count ?? 0}/{row?.size ?? 0}
              </b>
            </li>
          );
        })}
      </ol>
      <div className="home-bits" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => (
          <i key={i} className={(fly?.brain.spikes >> i) & 1 ? "on" : ""} />
        ))}
      </div>
      <a className="deck-go" href="/brain.html">
        {tx("public.openCanon")}
        <ArrowUpRight size={14} />
      </a>
    </article>
  );
}

function HomeScope({ fly, tick }) {
  const tx = useTx();
  const canvas = useRef(null);
  const trace = useRef([]);
  const count = fly ? popcount(fly.brain.spikes) : 0;
  useEffect(() => {
    trace.current = [...trace.current, count].slice(-48);
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext("2d");
    const width = node.clientWidth || 280;
    const height = 64;
    const d = Math.min(devicePixelRatio, 2);
    node.width = width * d;
    node.height = height * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#2f2a1f";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (height * i) / 4);
      ctx.lineTo(width, (height * i) / 4);
      ctx.stroke();
    }
    const series = trace.current;
    if (series.length < 2) return;
    const max = Math.max(1, ...series);
    ctx.beginPath();
    ctx.strokeStyle = "#c9a25e";
    ctx.lineWidth = 1.3;
    series.forEach((value, i) => {
      const x = (i / (series.length - 1)) * width;
      const y = height - 6 - (value / max) * (height - 14);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }, [tick, count]);
  return (
    <div className="home-scope">
      <small>{tx("public.scope")}</small>
      <canvas ref={canvas} />
    </div>
  );
}
