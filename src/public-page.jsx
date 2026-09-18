import React, { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Compass,
  Cpu,
  HardDrive,
  Landmark,
  Layers,
  Orbit,
  Tag,
  Radio,
  Sparkles,
} from "lucide-react";
import { loadOfficialToken } from "./token.mjs";
import { useLocale } from "./use-locale.mjs";
import { LocaleContext } from "./locale-context.jsx";
import { SiteBar, SiteLink, SocialX } from "./site-chrome.jsx";
import { SealBar } from "./seal-bar.jsx";
import { useHomePit } from "./use-home-pit.mjs";
import { HomeCrossSection } from "./home-cross-section.jsx";
import { PhenotypeReadout } from "./phenotype-view.jsx";
import { HomeMeshAtlas } from "./home-mesh.jsx";
import { HomeLiveDecks } from "./home-live.jsx";
import { LifeGlyph } from "./life-glyphs.jsx";
import { tiltHandlers, usePrefersReduced } from "./rite.jsx";
import { colonyLog } from "./home-colony-log.mjs";
import { ProtocolResearch } from "./home-protocol.jsx";
import { HomeCensus } from "./home-census.jsx";
import "./public.css";

const INDEX = [
  {
    items: [
      ["/field.html", "nav.field", "public.doorField", Orbit],
      ["/habitat.html", "nav.habitat", "public.doorHabitat", Sparkles],
      ["/host.html", "nav.host", "public.doorHost", HardDrive],
      ["/market.html", "nav.market", "public.doorMarket", Tag],
      ["/#mesh", "nav.mesh", "public.doorMesh", Layers],
      ["/brain.html", "nav.canon", "public.doorCanon", Cpu],
      ["/blueprint.html", "nav.blueprint", "public.doorBlueprint", Compass],
      ["/swarm.html", "nav.pit", "public.doorPit", Activity],
      ["/economy.html", "nav.economy", "public.doorEconomy", Landmark],
    ],
  },
];
const LOG_ICONS = {
  ACT: Activity,
};

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

export function HomePage() {
  const [locale, setLocale, tx] = useLocale("meta.homeTitle", "meta.homeDesc");
  const [token, setToken] = useState(null);
  const {
    swarm,
    selectedId,
    select,
    poke,
    paused,
    togglePause,
    venueQuotes,
    live: pitLive,
    error: pitError,
  } = useHomePit();
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
  const log = colonyLog(swarm, tx);
  const reduced = usePrefersReduced();
  const tilt = tiltHandlers(reduced);
  return (
    <LocaleContext.Provider value={{ locale, tx }}>
      <div className="home">
        <i className="home-grain" aria-hidden="true" />
        <SiteBar
          locale={locale}
          setLocale={setLocale}
          tx={tx}
          current="home"
          token={token}
        />
        <HomeCrossSection
          swarm={swarm}
          selectedId={champ?.id}
          onSelect={select}
          onPoke={poke}
          locale={locale}
          paused={paused}
          onPause={togglePause}
          quotes={venueQuotes}
          pitLive={pitLive}
          pitError={pitError}
          tx={tx}
        />

        <details className="home-token-disclosure">
          <summary>
            {tx("nav.verifyToken")} <span aria-hidden="true">↗</span>
          </summary>
          <SealBar token={token} tx={tx} />
        </details>

        <HomeCensus tx={tx} />

        <HomeLiveDecks swarm={swarm} fly={champ} onSelect={select} />

        <section
          className="home-event-stream"
          aria-label={tx("public.logLabel")}
          data-reveal="wait"
        >
          <div className="event-head">
            <span>{tx("public.logLabel")}</span>
            <small key={swarm.tick} className="event-tick">
              TICK {String(swarm.tick).padStart(4, "0")}
            </small>
          </div>
          <p className="event-note">{tx("public.logHint")}</p>
          {log.length ? (
            <ol
              className="event-tape"
              aria-live="polite"
              aria-relevant="additions"
            >
              {log.map((row, i) => {
                const Icon = LOG_ICONS[row.kind] || Radio;
                return (
                  <li
                    className={`event-row ${row.tone}${row.fresh ? " is-fresh" : ""}`}
                    key={row.key}
                    style={{ "--event-delay": `${Math.min(i, 4) * 50}ms` }}
                  >
                    <b>
                      <Icon size={11} aria-hidden="true" />
                      {row.kind}
                    </b>
                    <span>{row.text}</span>
                    <em>{String(row.tick % 100000).padStart(4, "0")}</em>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="event-empty">{tx("public.logEmpty")}</p>
          )}
        </section>

        <HomeMeshAtlas tx={tx} />
        <ProtocolResearch locale={locale} />

        <section
          className="home-pheno-band"
          aria-label={tx("public.phenoKicker")}
          data-reveal="wait"
        >
          <div>
            <span>{tx("public.phenoKicker")}</span>
            <h2>
              {tx("public.phenoTitle")}
              <em>{tx("public.phenoEm")}</em>
            </h2>
            <p>{tx("public.phenoP")}</p>
            <SiteLink href="/swarm.html">{tx("public.phenoGo")} ↗</SiteLink>
          </div>
          <PhenotypeReadout fly={champ} locale={locale} compact />
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
            <article className="world-map-card life-card rite-tilt" {...tilt}>
              <span className="world-index">{tx("public.world1k")}</span>
              <i className="world-ghost" aria-hidden="true">
                01
              </i>
              <Cpu size={18} />
              <LifeGlyph kind="life" />
              <h2>
                {tx("public.world1a")}
                <br />
                <em>{tx("public.world1em")}</em>
              </h2>
              <p>{tx("public.world1p")}</p>
              <SiteLink href="/brain.html">{tx("public.world1go")} ↗</SiteLink>
            </article>
            <article className="world-map-card social-card rite-tilt" {...tilt}>
              <span className="world-index">{tx("public.world2k")}</span>
              <i className="world-ghost" aria-hidden="true">
                02
              </i>
              <Radio size={18} />
              <LifeGlyph kind="language" />
              <h2>
                {tx("public.world2a")}
                <br />
                <em>{tx("public.world2em")}</em>
              </h2>
              <p>{tx("public.world2p")}</p>
              <SiteLink href="/swarm.html">{tx("public.world2go")} ↗</SiteLink>
            </article>
            <article
              className="world-map-card finance-card rite-tilt"
              {...tilt}
            >
              <span className="world-index">{tx("public.world3k")}</span>
              <i className="world-ghost" aria-hidden="true">
                03
              </i>
              <Landmark size={18} />
              <LifeGlyph kind="finance" />
              <h2>
                {tx("public.world3a")}
                <br />
                <em>{tx("public.world3em")}</em>
              </h2>
              <p>{tx("public.world3p")}</p>
              <SiteLink href="/economy.html">
                {tx("public.world3go")} ↗
              </SiteLink>
            </article>
          </div>
          <div
            className="doors site-index"
            aria-label={tx("public.doorsLabel")}
          >
            <small>{tx("public.doorsLabel")}</small>
            {INDEX.map((group, groupIndex) => (
              <div
                key={groupIndex}
                className={`site-index-group${group.items.length === 1 ? " is-single" : ""}`}
              >
                {group.items.map(([href, nameKey, hintKey, Icon], i) => (
                  <SiteLink key={href} href={href}>
                    <em>{String(i + 1).padStart(2, "0")}</em>
                    <Icon size={14} />
                    <span>{tx(nameKey)}</span>
                    <small>{tx(hintKey)}</small>
                  </SiteLink>
                ))}
              </div>
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
          <SiteLink href="/blueprint.html">
            {tx("public.laterGo")}
            <ArrowUpRight size={15} />
          </SiteLink>
        </section>

        <footer className="home-foot">
          <div className="foot-grid">
            <div className="foot-brand-block">
              <SiteLink href="/" className="foot-wordmark">
                IMMORTAL
              </SiteLink>
              <p>{tx("public.footTag")}</p>
            </div>
            <nav aria-label={tx("public.footProduct")}>
              <small>{tx("public.footProduct")}</small>
              <SiteLink href="/field.html">{tx("nav.field")}</SiteLink>
              <SiteLink href="/habitat.html">{tx("nav.habitat")}</SiteLink>
              <SiteLink href="/market.html">{tx("nav.market")}</SiteLink>
              <SiteLink href="/swarm.html">{tx("nav.pit")}</SiteLink>
            </nav>
            <nav aria-label={tx("public.footExplore")}>
              <small>{tx("public.footExplore")}</small>
              <SiteLink href="/brain.html">{tx("nav.canon")}</SiteLink>
              <SiteLink href="/blueprint.html">{tx("nav.blueprint")}</SiteLink>
              <SiteLink href="/docs.html">{tx("nav.docs")}</SiteLink>
              <SiteLink href="/economy.html">{tx("nav.economy")}</SiteLink>
            </nav>
            <nav aria-label={tx("public.footOfficial")}>
              <small>{tx("public.footOfficial")}</small>
              {live ? (
                <>
                  <a
                    href={`https://bscscan.com/token/${token.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx("public.footBsc")}
                  </a>
                  <a
                    className="foot-trade"
                    href={
                      token.flapUrl || `https://flap.sh/bnb/${token.address}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx("public.footFlap")}
                  </a>
                </>
              ) : null}
              {token?.twitter ? <SocialX href={token.twitter} tx={tx} /> : null}
            </nav>
          </div>
          <div className="foot-colophon">
            <p>{tx("public.footScience")}</p>
            <p>{tx("public.disclaimer")}</p>
            <small>{tx("public.footCopy")}</small>
          </div>
        </footer>
      </div>
    </LocaleContext.Provider>
  );
}
