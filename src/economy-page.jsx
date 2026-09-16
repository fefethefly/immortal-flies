import React, { useState } from "react";
import {
  Award,
  Ban,
  BookOpen,
  Brain,
  Coins,
  Droplets,
  Flame,
  Fuel,
  Gift,
  Landmark,
  LockKeyhole,
  Network,
  ShieldOff,
  Wallet,
} from "lucide-react";
import { PROTOCOL_SPLIT, splitProtocol } from "./economy.mjs";
import { SplitWheel, SurplusEngine } from "./economy-rite.jsx";
import { tiltHandlers, usePrefersReduced, useReveal } from "./rite.jsx";
import { useLocale } from "./use-locale.mjs";
import { SiteLink, SitePage } from "./site-chrome.jsx";
import { EconomicModel } from "./economy-model.jsx";
import "./public.css";
import "./blueprint.css";
import "./economy.css";

const money = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

const CREDITS = [
  ["econ.free", "econ.freeP", Gift, 0.28],
  ["econ.locked", "econ.lockedP", LockKeyhole, 0.52],
  ["econ.earned", "econ.earnedP", Award, 0.7],
  ["econ.liquid", "econ.liquidP", Droplets, 0.86],
];

const STOPS = [
  ["econ.stopLoss", ShieldOff],
  ["econ.stopCredit", Ban],
  ["econ.stopExit", Landmark],
  ["econ.stopIfs", Coins],
];

const NOTS = [
  ["econ.notGas", "econ.notGasP", Fuel],
  ["econ.notNeuron", "econ.notNeuronP", Brain],
  ["econ.lockNotBurn", "econ.lockNotBurnP", Flame],
];

const HOSTS = [
  ["econ.hostIfs", "econ.hostIfsP", LockKeyhole],
  ["econ.hostBnb", "econ.hostBnbP", Wallet],
  ["econ.hostMesh", "econ.hostMeshP", Network],
];

const SPLIT_LABEL = {
  ifsBudget: "econ.split.ifs",
  reserve: "econ.split.reserve",
  capital: "econ.split.capital",
  lockReward: "econ.split.lock",
  eco: "econ.split.eco",
};

export function EconomyPage() {
  const [locale, setLocale, tx] = useLocale("meta.econTitle", "meta.econDesc");
  const [revenue, setRevenue] = useState(40000);
  const [cost, setCost] = useState(18000);
  const [reserveGap, setReserveGap] = useState(6000);
  const reduced = usePrefersReduced();
  const tilt = tiltHandlers(reduced);
  const r = splitProtocol({ revenue, cost, reserveGap });
  useReveal(locale);

  return (
    <SitePage
      className="home blueprint econ"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      current="economy"
    >
      <main className="blue-main rite-main">
        <header className="rite-hero">
          <div>
            <p className="kicker">{tx("nav.economy")}</p>
            <h1>{tx("econ.h1")}</h1>
            <p className="lead">{tx("econ.lead")}</p>
            <div className="econ-formula">
              <span>R − C = N</span>
              <i />
              <span>T = min(max(N, 0), gap)</span>
              <i />
              <span>D = max(N − T, 0)</span>
            </div>
          </div>
          <SurplusEngine
            R={r.R}
            C={r.C}
            N={r.N}
            T={r.T}
            D={r.D}
            gap={reserveGap}
            caption={tx("econ.engineCaption")}
          />
        </header>

        <section className="econ-status" data-reveal>
          <article className="rite-card rite-tilt" {...tilt}>
            <span className="rite-orb live" />
            <Coins size={18} />
            <small>{tx("econ.liveTag")}</small>
            <strong>{tx("econ.liveIfs")}</strong>
            <p>{tx("econ.liveIfsP")}</p>
          </article>
          <article className="rite-card rite-tilt" {...tilt}>
            <span className="rite-orb paper" />
            <BookOpen size={18} />
            <small>{tx("econ.paperTag")}</small>
            <strong>{tx("econ.paperPit")}</strong>
            <p>{tx("econ.paperPitP")}</p>
          </article>
          <article className="rite-card rite-tilt" {...tilt}>
            <span className="rite-orb drawn" />
            <Landmark size={18} />
            <small>{tx("econ.drawnTag")}</small>
            <strong>{tx("econ.drawnFunds")}</strong>
            <p>{tx("econ.drawnFundsP")}</p>
          </article>
        </section>

        <section data-reveal>
          <h2>{tx("econ.creditTitle")}</h2>
          <p className="econ-hypo">{tx("econ.creditLead")}</p>
          <ol className="econ-credits">
            {CREDITS.map(([title, body, Icon, fill], i) => (
              <li
                key={title}
                className="rite-card rite-tilt"
                style={{ "--i": i, "--fill": fill }}
                {...tilt}
              >
                <div className="econ-vessel" aria-hidden="true">
                  <i />
                </div>
                <Icon size={18} />
                <small>{String(i + 1).padStart(2, "0")}</small>
                <strong>{tx(title)}</strong>
                <p>{tx(body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section data-reveal>
          <h2>{tx("econ.hostTitle")}</h2>
          <p className="econ-hypo">{tx("econ.hostLead")}</p>
          <p className="econ-formula">
            <span>{tx("econ.hostPath")}</span>
          </p>
          <ol className="econ-credits">
            {HOSTS.map(([title, body, Icon], i) => (
              <li
                key={title}
                className="rite-card rite-tilt"
                style={{ "--i": i }}
                {...tilt}
              >
                <Icon size={18} />
                <small>{String(i + 1).padStart(2, "0")}</small>
                <strong>{tx(title)}</strong>
                <p>{tx(body)}</p>
              </li>
            ))}
          </ol>
          <p className="econ-aside">
            <SiteLink href="/">{tx("public.mesh.label")}</SiteLink>
          </p>
        </section>

        <section data-reveal>
          <h2>{tx("econ.protocolTitle")}</h2>
          <p className="econ-hypo">{tx("econ.protocolLead")}</p>
          <div className="econ-lab">
            <aside className="econ-panel rite-card">
              <div className="econ-panel-head">
                <span>{tx("econ.labTitle")}</span>
                <small>{tx("econ.hypo")}</small>
              </div>
              <label className="econ-field" htmlFor="econ-r">
                <span>
                  {tx("econ.sliderR")}
                  <b>{money(revenue)}</b>
                </span>
                <input
                  id="econ-r"
                  type="range"
                  min="0"
                  max="120000"
                  step="1000"
                  value={revenue}
                  onChange={(e) => setRevenue(Number(e.target.value))}
                />
              </label>
              <label className="econ-field" htmlFor="econ-c">
                <span>
                  {tx("econ.sliderC")}
                  <b>{money(cost)}</b>
                </span>
                <input
                  id="econ-c"
                  type="range"
                  min="0"
                  max="80000"
                  step="1000"
                  value={cost}
                  onChange={(e) => setCost(Number(e.target.value))}
                />
              </label>
              <label className="econ-field" htmlFor="econ-t">
                <span>
                  {tx("econ.sliderGap")}
                  <b>{money(reserveGap)}</b>
                </span>
                <input
                  id="econ-t"
                  type="range"
                  min="0"
                  max="40000"
                  step="500"
                  value={reserveGap}
                  onChange={(e) => setReserveGap(Number(e.target.value))}
                />
              </label>
            </aside>
            <div className="econ-stack">
              <div className="econ-kpis">
                <div className={`econ-kpi rite-card ${r.N < 0 ? "risk" : ""}`}>
                  <span>N</span>
                  <strong>{money(r.N)}</strong>
                  <small>{tx("econ.kpiN")}</small>
                </div>
                <div className="econ-kpi rite-card">
                  <span>T</span>
                  <strong>{money(r.T)}</strong>
                  <small>{tx("econ.kpiT")}</small>
                </div>
                <div className="econ-kpi rite-card">
                  <span>D</span>
                  <strong>{money(r.D)}</strong>
                  <small>{tx("econ.kpiD")}</small>
                </div>
              </div>
              <section className="econ-panel rite-card">
                <div className="econ-panel-head">
                  <span>{tx("econ.split")}</span>
                  <small>35 / 25 / 20 / 10 / 10</small>
                </div>
                <div className="econ-split-visual">
                  <SplitWheel
                    amounts={{
                      ifsBudget: r.ifsBudget,
                      reserve: r.reserve,
                      capital: r.capital,
                      lockReward: r.lockReward,
                      eco: r.eco,
                    }}
                    total={r.D}
                  />
                  <div>
                    <div className="econ-split">
                      {PROTOCOL_SPLIT.map((s) => (
                        <i
                          key={s.key}
                          style={{
                            width: `${s.rate * 100}%`,
                            background: s.color,
                          }}
                        />
                      ))}
                    </div>
                    {PROTOCOL_SPLIT.map((s) => (
                      <div className="econ-row" key={s.key}>
                        <span>
                          <i style={{ background: s.color }} />
                          {tx(SPLIT_LABEL[s.key])}
                        </span>
                        <small>{s.rate * 100}%</small>
                        <strong>{money(r[s.key])}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="econ-aside">{tx("econ.buybackNote")}</p>
              </section>
            </div>
          </div>
        </section>

        <section data-reveal>
          <h2>{tx("econ.stopTitle")}</h2>
          <ol className="econ-stops">
            {STOPS.map(([key, Icon], i) => (
              <li key={key} className="rite-card" style={{ "--i": i }}>
                <Icon size={18} />
                <small>{String(i + 1).padStart(2, "0")}</small>
                <p>{tx(key)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section data-reveal>
          <h2>{tx("econ.notTitle")}</h2>
          <ol className="econ-nots">
            {NOTS.map(([title, body, Icon], i) => (
              <li key={title} className="rite-card rite-tilt" {...tilt}>
                <span className="rite-forbid" aria-hidden="true" />
                <Icon size={18} />
                <small>{String(i + 1).padStart(2, "0")}</small>
                <strong>{tx(title)}</strong>
                <p>{tx(body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <EconomicModel tx={tx} />

        <p className="note">
          {tx("econ.footer")}{" "}
          <SiteLink href="/blueprint.html">{tx("nav.blueprint")}</SiteLink>
        </p>
      </main>
    </SitePage>
  );
}
