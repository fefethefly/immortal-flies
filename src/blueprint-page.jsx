import React from "react";
import { createRoot } from "react-dom/client";
import { useLocale } from "./use-locale.mjs";
import { SiteBar } from "./site-chrome.jsx";
import "./public.css";
import "./blueprint.css";

function App() {
  const [locale, setLocale, tx] = useLocale("meta.blueprintTitle", "meta.blueprintDesc");
  const live = [
    ["01", "nav.pit", "blue.pit", "/swarm.html"],
    ["02", "nav.canon", "blue.canon", "/brain.html"],
  ];
  const later = [
    ["03", "blue.identityTitle", "blue.identity"],
    ["04", "blue.vaultTitle", "blue.vault"],
    ["05", "blue.capitalTitle", "blue.capital"],
    ["06", "blue.portsTitle", "blue.ports"],
  ];
  return (
    <div className="home blueprint">
      <i className="home-grain" aria-hidden="true" />
      <SiteBar locale={locale} setLocale={setLocale} tx={tx} current="blueprint" />
      <main className="blue-main">
        <p className="kicker">{tx("nav.blueprint")}</p>
        <h1>{tx("blue.h1")}</h1>
        <p className="lead">{tx("blue.lead")}</p>
        <section>
          <h2>{tx("blue.live")}</h2>
          <ol>
            {live.map(([no, title, body, href]) => (
              <li key={no}>
                <a href={href}>
                  <small>{no}</small>
                  <strong>{tx(title)}</strong>
                  <p>{tx(body)}</p>
                </a>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2>{tx("blue.later")}</h2>
          <ol>
            {later.map(([no, title, body]) => (
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
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
