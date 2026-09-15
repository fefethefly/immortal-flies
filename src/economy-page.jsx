import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ECONOMY_DEFAULTS,
  FEE_SPLIT,
  calculateEconomy,
  teamVested,
} from "./economy.mjs";
import { useLocale } from "./use-locale.mjs";
import { SitePage } from "./site-chrome.jsx";
import "./public.css";
import "./blueprint.css";
import "./economy.css";

const money = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
  }).format(v);
const number = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);

const FIELDS = [
  ["players", "econ.fields.players", 0, 100000, 100, ""],
  ["payerRate", "econ.fields.payerRate", 0, 60, 1, "%"],
  ["spend", "econ.fields.spend", 0, 100, 1, "$"],
  ["marketVolume", "econ.fields.marketVolume", 0, 100, 1, "$"],
  ["fixedCost", "econ.fields.fixedCost", 0, 100000, 500, "$"],
  ["variableCost", "econ.fields.variableCost", 0, 3, 0.05, "$"],
  ["genesis", "econ.fields.genesis", 1, 992, 1, ""],
  ["tokenPrice", "econ.fields.tokenPrice", 0.0001, 0.02, 0.0001, "$"],
];

const PRESETS = [
  ["early", "econ.presetEarly", { players: 1000 }],
  ["growth", "econ.presetGrowth", {}],
  ["scale", "econ.presetScale", { players: 50000 }],
  ["stress", "econ.presetStress", { payerRate: 5, spend: 10, marketVolume: 3 }],
];

const ALLOC = [
  ["econ.alloc.eco", "econ.alloc.ecoNote", 35],
  ["econ.alloc.liq", "econ.alloc.liqNote", 20],
  ["econ.alloc.team", "econ.alloc.teamNote", 15],
  ["econ.alloc.treasury", "econ.alloc.treasuryNote", 15],
  ["econ.alloc.genesis", "econ.alloc.genesisNote", 10],
  ["econ.alloc.creator", "econ.alloc.creatorNote", 5],
];

const UTILS = [
  ["econ.util.burn", "econ.util.burnP"],
  ["econ.util.lock", "econ.util.lockP"],
  ["econ.util.nft", "econ.util.nftP"],
  ["econ.util.gen", "econ.util.genP"],
];

const SPLIT_LABEL = {
  team: "econ.split.team",
  burn: "econ.split.burn",
  genesisPool: "econ.split.genesisPool",
  season: "econ.split.season",
  preservation: "econ.split.preservation",
};

function App() {
  const [locale, setLocale, tx] = useLocale("meta.econTitle", "meta.econDesc");
  const [tab, setTab] = useState("sandbox");
  const [values, setValues] = useState({ ...ECONOMY_DEFAULTS });
  const [preset, setPreset] = useState("growth");
  const [month, setMonth] = useState(12);
  const r = calculateEconomy(values);

  function selectPreset(id, patch) {
    setPreset(id);
    setValues({ ...ECONOMY_DEFAULTS, ...patch });
  }

  return (
    <SitePage
      className="home blueprint econ"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      current="economy"
    >
      <main className="blue-main">
        <p className="kicker">{tx("nav.economy")}</p>
        <h1>{tx("econ.h1")}</h1>
        <p className="lead">{tx("econ.lead")}</p>
        <nav className="econ-tabs" aria-label={tx("econ.navLabel")}>
          {[
            ["sandbox", "01", "econ.sandbox"],
            ["issue", "02", "econ.issue"],
          ].map(([id, no, key]) => (
            <button
              key={id}
              className={tab === id ? "on" : ""}
              onClick={() => setTab(id)}
            >
              <small>{no}</small>
              {tx(key)}
            </button>
          ))}
        </nav>

        {tab === "sandbox" ? (
          <Sandbox
            tx={tx}
            values={values}
            setValues={setValues}
            preset={preset}
            setPreset={setPreset}
            selectPreset={selectPreset}
            r={r}
          />
        ) : (
          <Issue tx={tx} month={month} setMonth={setMonth} />
        )}

        <p className="note">{tx("econ.footer")}</p>
      </main>
    </SitePage>
  );
}

function Sandbox({
  tx,
  values,
  setValues,
  preset,
  setPreset,
  selectPreset,
  r,
}) {
  return (
    <>
      <div className="econ-presets">
        {PRESETS.map(([id, key, patch]) => (
          <button
            key={id}
            className={preset === id ? "on" : ""}
            onClick={() => selectPreset(id, patch)}
          >
            {tx(key)}
          </button>
        ))}
      </div>
      <p className="econ-hypo">{tx("econ.hypo")}</p>
      <div className="econ-kpis">
        <Kpi
          title={tx("econ.kpiRevenue")}
          value={money(r.revenue)}
          note={tx("econ.kpiRevenueNote")}
        />
        <Kpi
          title={tx("econ.kpiProfit")}
          value={money(r.profit)}
          note={tx("econ.kpiProfitNote")}
          tone={r.profit < 0 ? "risk" : ""}
        />
        <Kpi
          title={tx("econ.kpiGenesis")}
          value={money(r.genesisPool)}
          note={tx("econ.kpiGenesisNote", {
            n: number(values.genesis),
            each: money(r.genesisSample),
          })}
        />
        <Kpi
          title={tx("econ.kpiBurn")}
          value={money(r.burn)}
          note={tx("econ.kpiBurnNote")}
          tone="risk"
        />
      </div>
      <div className="econ-grid">
        <aside className="econ-panel">
          <div className="econ-panel-head">
            <span>{tx("econ.hypotheses")}</span>
            <button onClick={() => selectPreset("growth", {})}>
              {tx("econ.reset")}
            </button>
          </div>
          {FIELDS.map(([key, label, min, max, step, unit]) => (
            <label className="econ-field" key={key} htmlFor={`econ-${key}`}>
              <span>
                {tx(label)}
                <b>
                  {key === "tokenPrice" ? values[key] : number(values[key])}
                  {unit}
                </b>
              </span>
              <input
                id={`econ-${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={values[key]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setPreset("custom");
                  setValues((current) => ({
                    ...current,
                    [key]:
                      step >= 1
                        ? Math.max(min, Math.min(max, Math.round(n)))
                        : Math.max(min, Math.min(max, n)),
                  }));
                }}
              />
            </label>
          ))}
        </aside>
        <div className="econ-stack">
          <section className="econ-panel">
            <div className="econ-panel-head">
              <span>{tx("econ.income")}</span>
              <small>{tx("econ.incomeUnit")}</small>
            </div>
            <div className="econ-row">
              <span>{tx("econ.gameSpend")}</span>
              <strong>{money(r.game)}</strong>
            </div>
            <div className="econ-row">
              <span>
                {tx("econ.marketFee")}
                <small>{tx("econ.traded", { n: money(r.traded) })}</small>
              </span>
              <strong>{money(r.marketFees)}</strong>
            </div>
            <p className="econ-aside">{tx("econ.incomeNote")}</p>
            <div className="econ-total">
              <span>{tx("econ.allocable")}</span>
              <b>{money(r.revenue)}</b>
            </div>
          </section>
          <section className="econ-panel">
            <div className="econ-panel-head">
              <span>{tx("econ.split")}</span>
              <small>{tx("econ.splitSum")}</small>
            </div>
            <div className="econ-split">
              {FEE_SPLIT.map((s) => (
                <i
                  key={s.key}
                  style={{ width: `${s.rate * 100}%`, background: s.color }}
                />
              ))}
            </div>
            {FEE_SPLIT.map((s) => (
              <div className="econ-row" key={s.key}>
                <span>
                  <i style={{ background: s.color }} />
                  {tx(SPLIT_LABEL[s.key])}
                </span>
                <small>{s.rate * 100}%</small>
                <strong>{money(r[s.key])}</strong>
              </div>
            ))}
            <p className="econ-aside">
              {tx("econ.burnNote")}
              <strong> {number(r.burnTokens)} NECTAR</strong>
              <small> {tx("econ.burnHint")}</small>
            </p>
          </section>
          <section className="econ-panel">
            <small>{tx("econ.breakEven")}</small>
            <strong className="econ-break">
              {r.breakEven == null
                ? tx("econ.breakNever")
                : tx("econ.breakAt", { n: number(r.breakEven) })}
            </strong>
            <p>
              {tx("econ.breakBody", {
                team: money(r.team),
                cost: money(r.cost),
                profit: money(r.profit),
              })}
            </p>
          </section>
        </div>
      </div>
      <p className="econ-principle">
        {tx("econ.principle")}
        <small>{tx("econ.principleNote")}</small>
      </p>
    </>
  );
}

function Issue({ tx, month, setMonth }) {
  return (
    <>
      <p className="econ-hypo">{tx("econ.issueBadge")}</p>
      <div className="econ-token">
        <div>
          <small>NECTAR</small>
          <strong>{tx("econ.tokenMeta")}</strong>
        </div>
        <div>
          <small>{tx("econ.supply")}</small>
          <strong>1,000,000,000</strong>
        </div>
        <div>
          <small>{tx("econ.inflation")}</small>
          <strong>{tx("econ.unlockOnly")}</strong>
        </div>
      </div>
      <div className="econ-grid">
        <section className="econ-panel">
          <div className="econ-panel-head">
            <span>{tx("econ.allocTitle")}</span>
            <small>{tx("econ.allocHint")}</small>
          </div>
          {ALLOC.map(([title, note, percent], i) => (
            <div className="econ-alloc" key={title}>
              <small>{String(i + 1).padStart(2, "0")}</small>
              <div>
                <strong>{tx(title)}</strong>
                <p>{tx(note)}</p>
              </div>
              <b>
                {percent}
                <em>%</em>
              </b>
            </div>
          ))}
        </section>
        <section className="econ-panel">
          <div className="econ-panel-head">
            <span>{tx("econ.vestTitle")}</span>
          </div>
          <h2 className="econ-vest-h">
            {tx("econ.vestH1")}
            <span>{tx("econ.vestH2")}</span>
          </h2>
          <label className="econ-field" htmlFor="econ-month">
            <span>{tx("econ.vestMonth", { n: month })}</span>
            <input
              id="econ-month"
              type="range"
              min="0"
              max="48"
              step="1"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </label>
          <div className="econ-vest-track">
            <i style={{ width: `${(teamVested(month) / 150000000) * 100}%` }} />
          </div>
          <div className="econ-total">
            <span>{tx("econ.vested")}</span>
            <b>
              {number(teamVested(month))}
              <small> NECTAR</small>
            </b>
          </div>
          <p className="econ-aside">{tx("econ.vestNote")}</p>
          <p className="econ-aside">
            {tx("econ.stakeSafe")}
            <small> {tx("econ.stakeSafeNote")}</small>
          </p>
        </section>
      </div>
      <ol className="econ-utils">
        {UTILS.map(([title, body]) => (
          <li key={title}>
            <strong>{tx(title)}</strong>
            <p>{tx(body)}</p>
          </li>
        ))}
      </ol>
    </>
  );
}

function Kpi({ title, value, note, tone = "" }) {
  return (
    <div className={`econ-kpi ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
