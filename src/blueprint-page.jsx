import React, { useMemo, useState } from "react";
import {
  Cpu,
  DoorOpen,
  Fingerprint,
  Globe,
  Landmark,
  Network,
  Route,
  Wallet,
} from "lucide-react";
import { LayerCabinet, PhaseSpine } from "./blueprint-rite.jsx";
import { tiltHandlers, usePrefersReduced, useReveal } from "./rite.jsx";
import { useLocale } from "./use-locale.mjs";
import { SiteLink, SitePage } from "./site-chrome.jsx";
import "./public.css";
import "./blueprint.css";

const LAYERS = [
  ["L0", "blue.l0", "blue.l0p", "/brain.html", "nav.canon", Cpu],
  ["L1", "blue.l1", "blue.l1p", "/swarm.html", "nav.pit", Network],
  ["L2", "blue.l2", "blue.l2p", "/swarm.html", "nav.pit", Globe],
  ["L3", "blue.l3", "blue.l3p", "/economy.html", "nav.economy", Landmark],
];

const PHASES = [
  ["P0", "blue.p0", "blue.p0p", "now"],
  ["P1", "blue.p1", "blue.p1p", "now"],
  ["P2", "blue.p2", "blue.p2p", "now"],
  ["P3", "blue.p3", "blue.p3p", "next"],
  ["P4", "blue.p4", "blue.p4p", "later"],
  ["P5", "blue.p5", "blue.p5p", "later"],
  ["P6", "blue.p6", "blue.p6p", "later"],
  ["P7", "blue.p7", "blue.p7p", "later"],
];

const DRAWN = [
  ["01", "blue.identityTitle", "blue.identity", Fingerprint],
  ["02", "blue.vaultTitle", "blue.vault", Landmark],
  ["03", "blue.capitalTitle", "blue.capital", Wallet],
  ["04", "blue.portsTitle", "blue.ports", DoorOpen],
];

export function BlueprintPage() {
  const [locale, setLocale, tx] = useLocale(
    "meta.blueprintTitle",
    "meta.blueprintDesc",
  );
  const [active, setActive] = useState(-1);
  const reduced = usePrefersReduced();
  const tilt = tiltHandlers(reduced);
  const labels = useMemo(
    () => LAYERS.map((row) => tx(row[1])),
    [locale, tx],
  );
  useReveal(locale);

  return (
    <SitePage
      className="home blueprint"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      current="blueprint"
    >
      <main className="blue-main rite-main">
        <header className="rite-hero">
          <div>
            <p className="kicker">{tx("nav.blueprint")}</p>
            <h1>{tx("blue.h1")}</h1>
            <p className="lead">{tx("blue.lead")}</p>
            <p className="blue-dep">{tx("blue.depNote")}</p>
          </div>
          <LayerCabinet
            key={locale}
            labels={labels}
            active={active}
            onActive={setActive}
            caption={tx("blue.stackCaption")}
          />
        </header>

        <section data-reveal>
          <h2>{tx("blue.layers")}</h2>
          <div className="blue-layers">
            {LAYERS.map(([id, title, body, href, go, Icon], i) => (
              <SiteLink
                key={id}
                href={href}
                className={`blue-layer rite-card rite-tilt ${active === i ? "is-hot" : ""}`}
                style={{ "--i": i }}
                onPointerMove={tilt.onPointerMove}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={(event) => {
                  tilt.onPointerLeave?.(event);
                  setActive(-1);
                }}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(-1)}
              >
                <span className="blue-layer-mark">{id}</span>
                <Icon size={18} />
                <small>{id}</small>
                <strong>{tx(title)}</strong>
                <p>{tx(body)}</p>
                <em>{tx(go)}</em>
              </SiteLink>
            ))}
          </div>
        </section>

        <section data-reveal>
          <h2>
            <Route size={18} />
            {tx("blue.phases")}
          </h2>
          <div className="blue-phase-wrap">
            <PhaseSpine count={PHASES.length} nowCount={3} />
            <ol className="blue-phases">
              {PHASES.map(([id, title, body, state], i) => (
                <li key={id} data-state={state} style={{ "--i": i }}>
                  <small>{id}</small>
                  <div>
                    <strong>{tx(title)}</strong>
                    <p>{tx(body)}</p>
                  </div>
                  <em>{tx(`blue.state.${state}`)}</em>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section data-reveal>
          <h2>{tx("blue.later")}</h2>
          <ol className="blue-drawn">
            {DRAWN.map(([no, title, body, Icon]) => (
              <li key={no} className="rite-card rite-tilt" {...tilt}>
                <Icon size={18} />
                <small>{no}</small>
                <strong>{tx(title)}</strong>
                <p>{tx(body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <p className="note">{tx("blue.foot")}</p>
      </main>
    </SitePage>
  );
}
