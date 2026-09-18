import React, { useEffect, useRef } from "react";
import { GOLD } from "./brand.mjs";
import { FlyMark } from "./vitruvian.jsx";
import { bookOf, reflexOf } from "./swarm.mjs";
import {
  formatBook,
  flyBook,
  formatMarketPrice,
  formatPaperFill,
  formatPaperValue,
} from "./paper-units.mjs";
import { FILL_HOLD_KEYS } from "./brain/fill-admit.mjs";
import { LocaleContext, useTx } from "./locale-context.jsx";
import { phenotypeOf } from "./brain/flyswarm/phenotype.mjs";

const WASH = {
  food: [176, 138, 74],
  threat: [138, 86, 74],
  light: [232, 226, 214],
  dark: [18, 16, 14],
};

export function timeLabel(tick) {
  const sec = Math.max(0, tick);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export function PitCanvas({ swarm, selectedId, wash, onSelect }) {
  const tx = useTx();
  const ref = useRef(null);
  const hits = useRef([]);
  const latest = useRef({ swarm, selectedId, wash });
  latest.current = { swarm, selectedId, wash };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0,
      height = 0,
      raf = 0,
      angle = 0;
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      const d = Math.min(devicePixelRatio, 2);
      canvas.width = width * d;
      canvas.height = height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    });
    resize.observe(canvas);

    function drawFly(x, y, scale, heading, lit) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading);
      ctx.scale(scale, scale);
      ctx.strokeStyle = lit ? "#f0ead9" : "#8a8172";
      ctx.fillStyle = lit ? "#17140f" : "#12100d";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(-11, 0, 7, 16, -0.5, 0, Math.PI * 2);
      ctx.ellipse(11, 0, 7, 16, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 2, 4.2, 12, 0, 0, Math.PI * 2);
      ctx.fillStyle = lit ? "#f0ead9" : "#a89e8c";
      ctx.fill();
      ctx.restore();
    }

    function draw() {
      raf = requestAnimationFrame(draw);
      if (document.hidden || !width) return;
      const { swarm, selectedId, wash } = latest.current;
      if (!reduced) angle += 0.0016;
      ctx.clearRect(0, 0, width, height);
      const cx = width * 0.48;
      const cy = height * 0.5;
      const r = Math.min(width, height) * 0.34;

      if (!reduced) {
        for (let i = 0; i < 42; i++) {
          const seed = (i * 97 + Math.floor(angle * 420)) % 997;
          const px = (seed * 1.73) % width;
          const py = (seed * 2.41 + i * 11) % height;
          ctx.fillStyle =
            i % 7 === 0 ? "rgba(240,185,11,.28)" : "rgba(147,161,129,.12)";
          ctx.fillRect(px, py, i % 3 === 0 ? 1.5 : 1, i % 3 === 0 ? 1.5 : 1);
        }
      }

      if (wash && WASH[wash]) {
        const [rr, gg, bb] = WASH[wash];
        const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.6);
        g.addColorStop(0, `rgba(${rr},${gg},${bb},0.22)`);
        g.addColorStop(1, "rgba(9,8,6,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.strokeStyle = "#2f2a1f";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();

      const prices = swarm.prices || [];
      if (prices.length > 1) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const span = Math.max(1, max - min);
        ctx.beginPath();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.3;
        prices.forEach((price, i) => {
          const x = width * 0.08 + (i / (prices.length - 1)) * width * 0.84;
          const y = height * 0.72 - ((price - min) / span) * height * 0.16;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }

      const living = swarm.flies.filter((fly) => fly.status === "alive");
      const dead = swarm.flies.filter((fly) => fly.status !== "alive");
      hits.current = [];
      living.forEach((fly, i) => {
        const theta = angle + (i / Math.max(living.length, 1)) * Math.PI * 2;
        const x = cx + Math.cos(theta) * r;
        const y = cy + Math.sin(theta) * r * 0.92;
        const lit = fly.id === selectedId;
        const heading =
          fly.lastSide === "BUY"
            ? -0.7
            : fly.lastSide === "SELL"
              ? 0.7
              : theta + Math.PI / 2;
        drawFly(x, y, lit ? 1.15 : 0.78, heading, lit);
        hits.current.push({ id: fly.id, x, y });
        ctx.fillStyle = lit ? "#f0ead9" : "#938a79";
        ctx.font = "10px 'IBM Plex Mono', monospace";
        ctx.fillText(`#${fly.id}`, x + 14, y - 10);
      });

      dead.slice(-8).forEach((fly, i) => {
        const theta = -0.4 + i * 0.18;
        const x = cx + Math.cos(theta) * r * 1.28;
        const y = cy + Math.sin(theta) * r * 1.18;
        ctx.fillStyle = "#443c2c";
        ctx.fillRect(x - 4, y - 4, 8, 8);
      });

      const chosen = swarm.flies.find((fly) => fly.id === selectedId);
      if (chosen) {
        const heading =
          chosen.lastSide === "BUY"
            ? -0.55
            : chosen.lastSide === "SELL"
              ? 0.55
              : 0;
        drawFly(cx, cy + 6, 1.7, heading, true);
      }
    }
    draw();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
    };
  }, []);

  function pick(event) {
    const box = ref.current.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    let best = null;
    let dist = 36;
    for (const hit of hits.current) {
      const d = Math.hypot(hit.x - x, hit.y - y);
      if (d < dist) {
        dist = d;
        best = hit.id;
      }
    }
    if (best != null) onSelect(best);
  }

  return (
    <canvas
      ref={ref}
      className="pit-canvas"
      aria-label={tx("pit.canvas")}
      onClick={pick}
    />
  );
}

export function Cause({ stim, reflex, trade, hold, market }) {
  const tx = useTx();
  const why =
    reflex.side === "BUY"
      ? tx("pit.whyBuy")
      : reflex.side === "SELL"
        ? tx("pit.whySell")
        : tx("pit.whyHold");
  const holdText = FILL_HOLD_KEYS[hold] ? tx(FILL_HOLD_KEYS[hold]) : "";
  return (
    <p className="cause" aria-live="polite">
      <span>{stim || tx("pit.market")}</span>
      <i />
      <span>{why}</span>
      <i />
      <b className={reflex.side.toLowerCase()}>{reflex.side}</b>
      {trade ? <em>{formatPaperFill(trade, market)}</em> : holdText ? <em>{holdText}</em> : null}
    </p>
  );
}

export function Balance({ fly }) {
  const tx = useTx();
  const reflex = reflexOf(fly);
  const lean = Math.max(-1, Math.min(1, reflex.lean));
  return (
    <div className="balance" aria-label={tx("pit.wta")}>
      <div className="balance-meta">
        <span>{tx("pit.approach", { n: reflex.approach })}</span>
        <strong>{reflex.confidence}</strong>
        <span>{tx("pit.retreat", { n: reflex.retreat })}</span>
      </div>
      <div className="balance-beam">
        <div className="beam" style={{ transform: `rotate(${lean * 16}deg)` }}>
          <b>BUY</b>
          <i />
          <b>SELL</b>
        </div>
        <em />
      </div>
    </div>
  );
}

export function BookSplit({ fly, price, mark = "IFS", assetId = null }) {
  const tx = useTx();
  const market = { price, mark, assetId };
  const bag = fly ? bookOf(fly, price) : { cashShare: 0, inventoryShare: 0 };
  const shown = formatBook(market, flyBook(fly, market));
  return (
    <div className="book-split" aria-label={tx("pit.book")}>
      <div>
        <span>{tx("pit.cash")}</span>
        <strong>{shown.cash}</strong>
        <i style={{ width: `${bag.cashShare}%` }} />
      </div>
      <div>
        <span>{tx("pit.inventory")}</span>
        <strong>
          {shown.qty}
          <small>{shown.inventory}</small>
        </strong>
        <i className="inv" style={{ width: `${bag.inventoryShare}%` }} />
      </div>
      <small className={shown.down ? "sell" : "buy"}>
        {tx("pit.equity", { nav: shown.equity })} · {tx("home.crossPnl")}{" "}
        {shown.pnl}
      </small>
    </div>
  );
}

export function CullRing({ remain, total }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const ratio = total ? remain / total : 0;
  return (
    <svg className="cull-ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r={r} />
      <circle
        cx="22"
        cy="22"
        r={r}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - ratio)}
      />
    </svg>
  );
}

export function OrganStops({
  kinds,
  labels,
  hints,
  icons,
  intensity,
  cooldown,
  active,
  onPulse,
  onIntensity,
}) {
  const tx = useTx();
  return (
    <div className="organ">
      <label className="organ-intensity">
        <span>
          {tx("pit.force")} <b>{intensity.toFixed(2)}</b>
        </span>
        <input
          type="range"
          min="0.15"
          max="1"
          step="0.05"
          value={intensity}
          onChange={(e) => onIntensity(Number(e.target.value))}
        />
      </label>
      <div className="stops">
        {kinds.map((kind) => {
          const Icon = icons[kind];
          return (
            <button
              key={kind}
              className={`stop ${kind} ${active === kind ? "on" : ""}`}
              disabled={cooldown > 0}
              onClick={() => onPulse(kind)}
            >
              <Icon size={16} strokeWidth={1.5} />
              <strong>{labels[kind]}</strong>
              <small>{hints[kind]}</small>
            </button>
          );
        })}
      </div>
      <em>
        {cooldown > 0 ? tx("pit.cooldown", { s: cooldown }) : tx("pit.anyone")}
      </em>
    </div>
  );
}

export function Roster({ board, selectedId, onSelect, market }) {
  const tx = useTx();
  const locale = React.useContext(LocaleContext).locale === "zh" ? "zh" : "en";
  if (!board.length) return <p className="empty">{tx("pit.emptySwarm")}</p>;
  return (
    <ul className="roster" aria-label={tx("pit.listedRetired")}>
      {board.map((row, i) => {
        const look = row.phenotype || phenotypeOf(row);
        return (
          <li key={row.id}>
            <button
              className={`${row.id === selectedId ? "selected" : ""} ${row.status}`}
              onClick={() => onSelect(row.id)}
              style={{ "--pheno": look.art.body }}
            >
              <FlyMark small inherit />
              <span>
                <b>
                  {i + 1} · #{row.id}
                </b>
                <small>
                  GEN {row.gen} · {look.hue[locale]} ·{" "}
                  {row.status === "alive" ? tx("pit.alive") : tx("pit.dead")}
                </small>
              </span>
              <em className={row.lastSide.toLowerCase()}>{row.lastSide}</em>
              <strong>
                {formatPaperValue(row.equity, market)}
                <small>
                  {row.roi >= 0 ? "+" : ""}
                  {(row.roi / 10).toFixed(1)}%
                </small>
              </strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Lineage({ lineage, flies }) {
  const tx = useTx();
  if (!lineage.length) {
    return <p className="empty">{tx("pit.emptyLineage")}</p>;
  }
  return (
    <ol className="lineage">
      {lineage.slice(0, 6).map((row) => {
        const child = flies.find((fly) => fly.id === row.child);
        return (
          <li key={`${row.tick}-${row.child}`}>
            <span>#{row.parent}</span>
            <i />
            <span>
              #{row.culled} {tx("pit.culled")}
            </span>
            <i />
            <b>#{row.child}</b>
            <em>
              GEN {child?.gen ?? "—"} · t={row.tick}
            </em>
          </li>
        );
      })}
    </ol>
  );
}

export function TradeRiver({ trades, market }) {
  const tx = useTx();
  if (!trades.length) {
    return <p className="empty">{tx("pit.emptyRiver")}</p>;
  }
  return (
    <ol className="river">
      {trades.slice(0, 18).map((row, i) => (
        <li
          key={`${row.tick}-${row.flyId}-${i}`}
          className={row.side.toLowerCase()}
        >
          <small>{timeLabel(row.tick)}</small>
          <b>{row.side}</b>
          <span>#{row.flyId}</span>
          <em>{formatPaperFill(row, market)}</em>
        </li>
      ))}
    </ol>
  );
}

export function PriceMark({ price, mark, assetId }) {
  const shown = formatMarketPrice({ price, mark, assetId });
  return (
    <span className="price-mark">
      {shown.text}
      {shown.suffix ? ` ${shown.suffix}` : ""}
    </span>
  );
}
