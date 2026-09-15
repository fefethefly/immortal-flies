import React from "react";
import { useLocale } from "./use-locale.mjs";
import { SiteLink, SitePage } from "./site-chrome.jsx";
import "./public.css";
import "./blueprint.css";

const LAYERS = [
  ["L0", "blue.l0", "blue.l0p", "/brain.html", "nav.canon"],
  ["L1", "blue.l1", "blue.l1p", "/swarm.html", "nav.pit"],
  ["L2", "blue.l2", "blue.l2p", "/swarm.html", "nav.pit"],
  ["L3", "blue.l3", "blue.l3p", "/economy.html", "nav.economy"],
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
  ["01", "blue.identityTitle", "blue.identity"],
  ["02", "blue.vaultTitle", "blue.vault"],
  ["03", "blue.capitalTitle", "blue.capital"],
  ["04", "blue.portsTitle", "blue.ports"],
];

export function BlueprintPage() {
  const [locale, setLocale, tx] = useLocale(
    "meta.blueprintTitle",
    "meta.blueprintDesc",
  );
  return (
    <SitePage
      className="home blueprint"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      current="blueprint"
    >
      <main className="blue-main">
        <p className="kicker">{tx("nav.blueprint")}</p>
        <h1>{tx("blue.h1")}</h1>
        <p className="lead">{tx("blue.lead")}</p>

        <section>
          <h2>{tx("blue.layers")}</h2>
          <div className="blue-layers">
            {LAYERS.map(([id, title, body, href, go]) => (
              <SiteLink key={id} href={href} className="blue-layer">
                <small>{id}</small>
                <strong>{tx(title)}</strong>
                <p>{tx(body)}</p>
                <em>{tx(go)}</em>
              </SiteLink>
            ))}
          </div>
        </section>

        <section>
          <h2>{tx("blue.phases")}</h2>
          <ol className="blue-phases">
            {PHASES.map(([id, title, body, state]) => (
              <li key={id} data-state={state}>
                <small>{id}</small>
                <div>
                  <strong>{tx(title)}</strong>
                  <p>{tx(body)}</p>
                </div>
                <em>{tx(`blue.state.${state}`)}</em>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2>{tx("blue.later")}</h2>
          <ol>
            {DRAWN.map(([no, title, body]) => (
              <li key={no}>
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
