import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight } from "lucide-react";
import { loadOfficialToken } from "./token.mjs";
import { useLocale } from "./use-locale.mjs";
import { LocaleContext } from "./locale-context.jsx";
import { SiteBar, SiteLink } from "./site-chrome.jsx";
import { SealBar } from "./seal-bar.jsx";
import { useHomeSwarm } from "./home-field.jsx";
import { HomeObservatory } from "./home-observatory.jsx";
import { HomeLiveDecks } from "./home-live.jsx";
import { formatPrice, formatToken, reflexOf } from "./swarm.mjs";
import "./public.css";

const DOORS = [
  ["/", "nav.home", "public.doorHome"],
  ["/swarm.html", "nav.pit", "public.doorPit"],
  ["/brain.html", "nav.canon", "public.doorCanon"],
  ["/economy.html", "nav.economy", "public.doorEconomy"],
  ["/blueprint.html", "nav.blueprint", "public.doorBlueprint"],
];

function popcount(value) {
  let n = value >>> 0;
  let count = 0;
  while (n) {
    n &= n - 1;
    count += 1;
  }
  return count;
}

// The log is read straight off the live paper swarm: fills, reflexes, spikes,
// price drift. When the book goes quiet the colony itself is still the news.
function colonyLog(swarm, champ, tx) {
  const rows = [];
  for (const trade of swarm.trades.slice(0, 3)) {
    rows.push({
      key: `t${trade.tick}-${trade.flyId}`,
      kind: "ACT",
      tone: trade.side === "SELL" ? "red" : "gold",
      tick: trade.tick,
      text:
        trade.side === "BUY"
          ? tx("public.evBuy", {
              id: trade.flyId,
              amt: formatToken(trade.amount),
            })
          : tx("public.evSell", {
              id: trade.flyId,
              amt: formatToken(trade.amount),
            }),
    });
  }
  if (champ) {
    const reflex = reflexOf(champ);
    if (reflex && reflex.side !== "HOLD") {
      rows.push({
        key: `r${swarm.tick}-${champ.id}`,
        kind: "SENSE",
        tone: "neural",
        tick: Math.max(0, swarm.tick - 1),
        text: tx("public.evLean", { id: champ.id, side: reflex.side }),
      });
    }
    rows.push({
      key: `s${champ.brain?.spikes ?? 0}-${champ.id}`,
      kind: "MEMORY",
      tone: "quiet",
      tick: Math.max(0, swarm.tick - 2),
      text: tx("public.evSpikes", {
        id: champ.id,
        n: popcount(champ.brain?.spikes ?? 0),
      }),
    });
  }
  const prices = swarm.prices || [];
  if (prices.length > 1) {
    rows.push({
      key: `p${swarm.tick}`,
      kind: "BOOK",
      tone: "bone",
      tick: swarm.tick,
      text: tx("public.evPrice", {
        price: formatPrice(prices[prices.length - 1]),
      }),
    });
  }
  while (rows.length < 5) {
    const i = rows.length;
    rows.push({
      key: `h${swarm.tick}-${i}`,
      kind: "HOLD",
      tone: "quiet",
      tick: Math.max(0, swarm.tick - i * 3),
      text: tx("public.evHeart"),
    });
  }
  return rows.sort((a, b) => b.tick - a.tick).slice(0, 5);
}

function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver !== "function") {
      nodes.forEach((node) => node.setAttribute("data-reveal", "done"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-reveal", "in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);
}

function App() {
  const [locale, setLocale, tx] = useLocale("meta.homeTitle", "meta.homeDesc");
  const [token, setToken] = useState(null);
  const { swarm, selectedId, select, paused, togglePause } = useHomeSwarm();
  const champ =
    swarm.flies.find((row) => row.id === selectedId) ||
    swarm.flies.find((row) => row.status === "alive") ||
    swarm.flies[0];
  useReveal();
  useEffect(() => {
    loadOfficialToken()
      .then(setToken)
      .catch(() => {});
  }, [locale]);
  const live = token?.status === "live" && token.address;
  const log = colonyLog(swarm, champ, tx);
  return (
    <LocaleContext.Provider value={{ locale, tx }}>
      <div className="home">
        <i className="home-grain" aria-hidden="true" />
        <SiteBar
          locale={locale}
          setLocale={setLocale}
          tx={tx}
          current="home"
          trailing={
            token?.twitter ? (
              <a
                className="bar-x"
                href={token.twitter}
                target="_blank"
                rel="noreferrer"
              >
                X
              </a>
            ) : null
          }
        />
        <SealBar token={token} tx={tx} />

        <HomeObservatory
          swarm={swarm}
          selectedId={champ?.id}
          onSelect={select}
          locale={locale}
          paused={paused}
          onPause={togglePause}
        />

        <HomeLiveDecks swarm={swarm} fly={champ} onSelect={select} />

        <section
          className="home-event-stream"
          aria-label={tx("public.logLabel")}
          data-reveal="wait"
        >
          <div className="event-head">
            <span>{tx("public.logLabel")}</span>
            <small>TICK {String(swarm.tick).padStart(4, "0")}</small>
          </div>
          <p className="event-note">{tx("public.logHint")}</p>
          <div className="event-grid">
            {log.map((row, i) => (
              <div
                className={`event-row ${row.tone}`}
                key={row.key}
                style={{ "--event-delay": `${i * 90}ms` }}
              >
                <b>{row.kind}</b>
                <span>{row.text}</span>
                <em>{String(row.tick % 100000).padStart(4, "0")}</em>
              </div>
            ))}
          </div>
        </section>

        <section
          className="world-map"
          aria-label={tx("public.worldKicker")}
          data-reveal="wait"
        >
          <div className="world-map-head">
            <span>{tx("public.worldKicker")}</span>
            <small>{tx("public.worldSide")}</small>
          </div>
          <div className="world-map-grid">
            <article className="world-map-card life-card">
              <span className="world-index">{tx("public.world1k")}</span>
              <i className="world-ghost" aria-hidden="true">
                01
              </i>
              <div className="world-stack" aria-hidden="true">
                <b />
                <b />
                <b />
                <b />
              </div>
              <h2>
                {tx("public.world1a")}
                <br />
                <em>{tx("public.world1em")}</em>
              </h2>
              <p>{tx("public.world1p")}</p>
              <a href="/brain.html">{tx("public.world1go")} ↗</a>
            </article>
            <article className="world-map-card social-card">
              <span className="world-index">{tx("public.world2k")}</span>
              <i className="world-ghost" aria-hidden="true">
                02
              </i>
              <div className="language-glyphs" aria-hidden="true">
                <b>SENSE</b>
                <i>→</i>
                <b>ACT</b>
                <i>→</i>
                <b>MEMORY</b>
              </div>
              <h2>
                {tx("public.world2a")}
                <br />
                <em>{tx("public.world2em")}</em>
              </h2>
              <p>{tx("public.world2p")}</p>
              <a href="/swarm.html">{tx("public.world2go")} ↗</a>
            </article>
            <article className="world-map-card finance-card">
              <span className="world-index">{tx("public.world3k")}</span>
              <i className="world-ghost" aria-hidden="true">
                03
              </i>
              <div className="finance-orbit" aria-hidden="true">
                <span>$IFS</span>
                <i>Credit</i>
                <b>Vault</b>
                <em>Trade</em>
              </div>
              <h2>
                {tx("public.world3a")}
                <br />
                <em>{tx("public.world3em")}</em>
              </h2>
              <p>{tx("public.world3p")}</p>
              <a href="/economy.html">{tx("public.world3go")} ↗</a>
            </article>
          </div>
          <div className="doors" aria-label={tx("public.doorsLabel")}>
            <small>{tx("public.doorsLabel")}</small>
            {DOORS.map(([href, nameKey, hintKey], i) => (
              <SiteLink key={href} href={href}>
                <em>{String(i + 1).padStart(2, "0")}</em>
                <span>{tx(nameKey)}</span>
                <small>{tx(hintKey)}</small>
              </SiteLink>
            ))}
          </div>
        </section>

        <div className="home-marquee" aria-hidden="true">
          <div>
            {Array.from({ length: 2 }, (_, i) => (
              <span key={i}>{tx("public.marquee")}</span>
            ))}
          </div>
        </div>

        <section className="home-later" data-reveal="wait">
          <div>
            <p className="kicker">{tx("public.blueTitle")}</p>
            <h2>{tx("public.laterTitle")}</h2>
            <p>{tx("public.laterLead")}</p>
          </div>
          <a href="/blueprint.html">
            {tx("nav.blueprint")}
            <ArrowUpRight size={15} />
          </a>
        </section>

        <p className="note disclaimer">{tx("public.disclaimer")}</p>
        <footer className="home-foot">
          <span className="foot-brand">IMMORTAL / IFS</span>
          <span>{tx("public.footScience")}</span>
          <span className="foot-links">
            {live ? (
              <>
                <a
                  href={`https://bscscan.com/token/${token.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  BscScan
                </a>
                <a
                  href={token.flapUrl || `https://flap.sh/bnb/${token.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Flap
                </a>
              </>
            ) : null}
            {token?.twitter ? (
              <a href={token.twitter} target="_blank" rel="noreferrer">
                X
              </a>
            ) : null}
          </span>
        </footer>
      </div>
    </LocaleContext.Provider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
