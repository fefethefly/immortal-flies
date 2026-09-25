import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowUpRight, ArrowRight, Pause, Play, X } from "lucide-react";
import { useLocale } from "./use-locale.mjs";
import { LocaleContext } from "./locale-context.jsx";
import { SiteLink } from "./site-chrome.jsx";
import { usePrefersReduced } from "./rite.jsx";
import { loadGraph } from "./brain/graph.mjs";
import { loadOfficialToken } from "./token.mjs";
import { ImmersiveStage } from "./home-immersive-stage.jsx";
import { HatchPanel } from "./life/hatch-panel.jsx";
import { hatchIntentFromLocation } from "./life/hatch-intent.mjs";
import { setPendingGiven } from "./life/names.mjs";
import { useLocalLife } from "./use-home-life.mjs";
import {
  Emergence,
  IdentityContinuity,
  Encounter,
  Recollection,
  LifeHorizon,
  goToChapter,
} from "./home-cinematic.jsx";
import { cinematicCopy } from "./home-cinematic-copy.mjs";
import { HomeNavigation } from "./home-navigation.jsx";
import { livingCopy } from "./home-living-copy.mjs";
import "@fontsource/geist/latin-300.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "./public.css";
import "./life/life.css";
import "./home-living.css";
import "./home-immersive.css";
import "./home-cinematic.css";
import "./home-first-contact.css";
import "./home-connectome.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);
const MANIFEST = "/data/malecns-circuit/manifest.json";
const FOOTER_PATHS = [
  "/brain.html",
  "/host.html",
  "/market.html",
  "/protocol.html",
  "/economy.html",
  "/docs.html",
];
function Worlds({ copy, onSelect }) {
  const [selected, setSelected] = useState(0);
  return (
    <section className="living-worlds" id="worlds" data-scene="worlds">
      <div className="living-worlds-heading living-reveal">
        <h2>{copy.worlds}</h2>
        <p>{copy.worldsP}</p>
      </div>
      <div className="living-world-list">
        {copy.worldItems.map((world, i) => (
          <article
            key={world.glyph}
            className={`living-world ${selected === i ? "is-selected" : ""}`}
          >
            <button
              onClick={() => {
                setSelected(i);
                onSelect(i);
              }}
              aria-expanded={selected === i}
              aria-controls={`living-world-${i}`}
            >
              <span>{world.name}</span>
              <small>{world.status}</small>
              <ArrowUpRight size={23} />
            </button>
            <div
              id={`living-world-${i}`}
              className="living-world-detail"
              hidden={selected !== i}
            >
              <div>
                <p>{world.text}</p>
                <SiteLink href={world.href} className="living-text-link">
                  {world.cta}
                  <ArrowRight size={16} />
                </SiteLink>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LivingHomePage() {
  const [locale, setLocale, tx] = useLocale("meta.homeTitle", "meta.homeDesc");
  const copy = livingCopy[locale] || livingCopy.en;
  const cinema = cinematicCopy[locale] || cinematicCopy.en;
  const reduced = usePrefersReduced();
  const page = useRef(null),
    fieldRef = useRef(null),
    projectionRef = useRef(null),
    dialog = useRef(null),
    hatchTrigger = useRef(null);
  const [graph, setGraph] = useState(null),
    [loadState, setLoadState] = useState("loading"),
    [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false),
    [hatch, setHatch] = useState(false),
    [token, setToken] = useState(null);
  const life = useLocalLife(graph, reduced);
  const [mode, setMode] = useState("individual");
  const [rotation, setRotation] = useState(0);
  const [world, setWorld] = useState(0);
  const [opening, setOpening] = useState(0);
  useEffect(() => {
    let gone = false;
    setLoadState("loading");
    setGraph(null);
    loadGraph(MANIFEST)
      .then((next) => {
        if (!gone) {
          setGraph(next);
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (!gone) setLoadState("failed");
      });
    return () => {
      gone = true;
    };
  }, [attempt]);
  useEffect(() => {
    let gone = false;
    loadOfficialToken()
      .then((next) => {
        if (!gone) setToken(next);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, []);
  useEffect(() => {
    const intent = hatchIntentFromLocation();
    if (intent.given) setPendingGiven(intent.given);
    if (intent.open) setHatch(true);
  }, []);
  useEffect(() => {
    if (!hatch || !dialog.current) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current.querySelector("button")?.focus();
    const onKey = (event) => {
      // The existing wallet and birth-card pickers portal to document.body.
      // Let their own focus/escape handling take precedence while open.
      if (document.querySelector(".wallet-veil, .birth-veil")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setHatch(false);
      }
      if (event.key !== "Tab") return;
      const items = [
        ...dialog.current.querySelectorAll(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      hatchTrigger.current?.focus();
    };
  }, [hatch]);
  useGSAP(
    () => {
      if (reduced) return;
      gsap.utils.toArray(".living-reveal").forEach((el) =>
        gsap.from(el, {
          y: 35,
          opacity: 0,
          duration: 1,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 91%", once: true },
        }),
      );
      ScrollTrigger.create({
        trigger: ".cinema-emergence",
        start: "top top",
        end: "+=15%",
        pin: ".cinema-hero-frame",
        pinSpacing: false,
      });
      gsap.from(".cinema-hero-copy", {
        y: 24,
        opacity: 0,
        duration: 1.5,
        delay: 0.6,
        ease: "power3.out",
      });
      gsap.fromTo(
        ".cinema-vision-line",
        { opacity: 0.16, y: 30 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.4,
          ease: "none",
          scrollTrigger: {
            trigger: ".cinema-horizon",
            start: "top 75%",
            end: "center 50%",
            scrub: true,
          },
        },
      );
    },
    { scope: page, dependencies: [locale, reduced], revertOnUpdate: true },
  );
  const openHatch = (event) => {
    hatchTrigger.current = event.currentTarget;
    setHatch(true);
  };
  return (
    <LocaleContext.Provider value={{ locale, tx }}>
      <div
        ref={page}
        className={`living-home living-immersive living-cinema living-${locale}`}
        data-motion={paused || reduced ? "still" : "on"}
      >
        <a
          className="living-skip"
          href="#observe"
          onClick={(event) => goToChapter(event, "#observe")}
        >
          {copy.skip}
        </a>
        <ImmersiveStage
          page={page}
          graph={graph}
          frame={life.frame}
          reduced={reduced}
          paused={paused}
          world={world}
          copy={copy}
          fieldRef={fieldRef}
          projectionRef={projectionRef}
          explorer={{
            mode,
            rotation,
            record: life.activeRecord,
            frameIndex: life.frameIndex,
            busy: life.busy,
            opening,
          }}
        />
        <div className="immersive-progress" aria-hidden="true">
          <span />
        </div>
        <button
          className="immersive-motion"
          aria-label={paused ? copy.resume : copy.pause}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={14} /> : <Pause size={14} />}
          <span>{paused ? copy.resume : copy.pause}</span>
        </button>
        <HomeNavigation
          locale={locale}
          setLocale={setLocale}
          tx={tx}
          hatchLabel={copy.hatch}
          onHatch={openHatch}
        />
        <main>
          <Emergence
            text={cinema}
            life={life}
            graph={graph}
            loadState={loadState}
            onRetry={() => setAttempt((value) => value + 1)}
            onOpening={() => {
              setPaused(false);
              setOpening((value) => value + 1);
            }}
          />
          <IdentityContinuity text={cinema} />
          <Encounter
            text={cinema}
            fieldRef={fieldRef}
            projectionRef={projectionRef}
            copy={copy}
            mode={mode}
            onMode={setMode}
            life={life}
            graph={graph}
            loadState={loadState}
            onRetry={() => setAttempt((value) => value + 1)}
            onRotation={setRotation}
          />
          <Recollection text={cinema} copy={copy} locale={locale} life={life} />
          <LifeHorizon text={cinema} />
          <Worlds copy={copy} onSelect={setWorld} />
          <section className="living-cta" id="begin" data-scene="begin">
            <div className="living-reveal">
              <span className="living-kicker">YOUR FIRST IMMORTAL</span>
              <h2>
                {copy.ctaTitle[0]}
                <br />
                <span>{copy.ctaTitle[1]}</span>
              </h2>
              <p>{copy.ctaText}</p>
              <button className="living-button" onClick={openHatch}>
                {copy.hatch}
                <ArrowUpRight size={18} />
              </button>
              <small>{copy.hatchNote}</small>
            </div>
          </section>
        </main>
        <footer className="living-footer">
          <div className="living-footer-top">
            <div>
              <SiteLink className="living-footer-brand" href="/">
                IMMORTAL
              </SiteLink>
              <p>{copy.footerLine}</p>
            </div>
            <nav aria-label={copy.menu}>
              {copy.footerLinks.map((label, i) => (
                <SiteLink key={label} href={FOOTER_PATHS[i]}>
                  {label}
                </SiteLink>
              ))}
              <a
                href="https://x.com/imfruitflies"
                target="_blank"
                rel="noreferrer"
              >
                X <ArrowUpRight size={12} />
              </a>
              {token?.status === "live" && token.address && (
                <a
                  href={`https://bscscan.com/token/${token.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.token}
                  <ArrowUpRight size={12} />
                </a>
              )}
            </nav>
          </div>
          <div className="living-footer-bottom">
            <span>{copy.copy}</span>
            <p>{copy.credit}</p>
          </div>
        </footer>
        {hatch && (
          <div
            className="living-hatch-backdrop"
            onClick={(event) => {
              if (
                event.target === event.currentTarget &&
                !document.querySelector(".wallet-veil, .birth-veil")
              )
                setHatch(false);
            }}
          >
            <section
              ref={dialog}
              className="living-hatch-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="living-hatch-title"
            >
              <button
                className="living-dialog-close"
                aria-label={copy.close}
                onClick={() => setHatch(false)}
              >
                <X size={20} />
              </button>
              <span className="living-kicker">IMMORTAL / GENESIS</span>
              <h2 id="living-hatch-title">{copy.hatchPanel}</h2>
              <p>{copy.hatchDetails}</p>
              <HatchPanel compact />
            </section>
          </div>
        )}
      </div>
    </LocaleContext.Provider>
  );
}
