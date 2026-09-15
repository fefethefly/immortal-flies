import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Moon, Pause, Play, Sun, Utensils, Zap } from "lucide-react";
import {
  FINANCIAL_PORTS,
  STIMULI,
  formatBnb,
  formatToken,
  reflexOf,
  summarize,
} from "./swarm.mjs";
import {
  PIT_STORE,
  createPitSession,
  pitView,
  pulsePit,
  restorePitSession,
  savePitSession,
  settleNow,
  stepPit,
} from "./brain/flyswarm/pit.mjs";
import {
  Balance,
  BookSplit,
  Cause,
  CullRing,
  Lineage,
  OrganStops,
  PitCanvas,
  PriceMark,
  Roster,
  TradeRiver,
  timeLabel,
} from "./swarm-pit.jsx";
import { LocaleContext } from "./locale-context.jsx";
import { useLocale } from "./use-locale.mjs";
import { RichText } from "./locale-switch.jsx";
import { SiteBar, recallFly, rememberFly } from "./site-chrome.jsx";
import { SealBar } from "./seal-bar.jsx";
import { loadOfficialToken } from "./token.mjs";
import "./swarm.css";

const ICONS = { food: Utensils, threat: Zap, light: Sun, dark: Moon };

function App() {
  const [locale, setLocale, tx] = useLocale("meta.pitTitle", "meta.pitDesc");
  const [view, setView] = useState(null);
  const [running, setRunning] = useState(true);
  const [selected, setSelected] = useState(() => recallFly() ?? 0);
  const [token, setToken] = useState(null);
  const [intensity, setIntensity] = useState(0.6);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sessionRef = useRef(null);
  const booted = useRef(false);

  const stats = useMemo(() => (view ? summarize(view) : null), [view]);
  const fly = view ? view.flies.find((row) => row.id === selected) || stats.board[0] : null;
  const cooldown = view ? Math.max(0, view.cooldownTicks - (view.tick - view.lastStimulusAt)) : 0;
  const lastStim = view?.stimuliLog[0];
  const wash = lastStim && view && view.tick - lastStim.tick < 12 ? lastStim.kind : null;
  const lastFill = view ? view.trades.find((row) => row.flyId === fly?.id) || view.trades[0] : null;
  const labels = Object.fromEntries(STIMULI.map((kind) => [kind, tx(`pit.stim.${kind}`)]));
  const hints = Object.fromEntries(STIMULI.map((kind) => [kind, tx(`pit.hint.${kind}`)]));

  useEffect(() => {
    setNotice(tx("pit.noticeOpen"));
  }, [locale]);

  useEffect(() => {
    loadOfficialToken().then(setToken).catch(() => {});
  }, []);

  // 启动：加载真实 MaleCNS 子图 → 内核 → 绑定创世（或从快照恢复）。
  useEffect(() => {
    if (booted.current) return undefined;
    booted.current = true;
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(PIT_STORE);
        const saved = raw ? JSON.parse(raw) : null;
        const session = saved ? await restorePitSession(saved) : await createPitSession();
        if (cancelled) return;
        sessionRef.current = session;
        setView(pitView(session));
      } catch (err) {
        setError(err.message || "交易坑无法启动");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 主循环：每秒一个完整蝇群协议 tick（话语/记忆/聚合），空闲时不推进。
  useEffect(() => {
    if (!sessionRef.current || !running) return undefined;
    let busy = false;
    const id = setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = await stepPit(sessionRef.current);
        setView(next);
        try {
          localStorage.setItem(PIT_STORE, JSON.stringify(savePitSession(sessionRef.current)));
        } catch {
          /* 私有模式仍可运行，只是不持久 */
        }
      } catch (err) {
        setError(err.message);
      }
      busy = false;
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  function selectFly(id) {
    setSelected(id);
    rememberFly(id);
  }

  useEffect(() => {
    if (!view || !fly) return;
    if (!view.flies.some((row) => row.id === selected)) selectFly(stats.board[0]?.id ?? 0);
  }, [view, fly, selected, stats]);

  function pulse(kind) {
    try {
      pulsePit(sessionRef.current, kind, intensity);
      setError("");
      setNotice(tx("pit.noticePulse", { label: labels[kind] }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function cullNow() {
    try {
      const next = await settleNow(sessionRef.current);
      setView(next);
      setError("");
      setNotice(tx("pit.noticeCull"));
    } catch (err) {
      setError(err.message);
    }
  }

  const reflex = fly ? reflexOf(fly) : null;

  if (!view) {
    return (
      <LocaleContext.Provider value={{ locale, tx }}>
        <div className="pit-app">
          <SiteBar locale={locale} setLocale={setLocale} tx={tx} current="pit" />
          <section className="pit">
            <div className="stage">
              <p className="pit-error" role="alert">
                {error || tx("pit.loading")}
              </p>
            </div>
          </section>
        </div>
      </LocaleContext.Provider>
    );
  }

  return (
    <LocaleContext.Provider value={{ locale, tx }}>
      <div className={`pit-app ${wash || ""}`}>
        <SiteBar
          locale={locale}
          setLocale={setLocale}
          tx={tx}
          current="pit"
          trailing={
            <>
              <SealBar token={token} tx={tx} compact />
              <div className="pit-live">
                <CullRing remain={stats.nextCullIn} total={view.cullEvery} />
                <span>
                  {tx("pit.settleIn", { time: timeLabel(stats.nextCullIn) })}
                  <small>
                    {tx("pit.rosterCount", {
                      alive: stats.alive,
                      total: stats.total,
                      audit: view.audit,
                    })}
                  </small>
                </span>
              </div>
            </>
          }
        />

        <section className="pit">
          <div className="stage">
            <div className="stage-notes">
              <span>MALECNS / 1400 NODES / TRADER</span>
              <span>
                TICK #{view.tick} · {formatBnb(stats.bnb)} BNB
              </span>
            </div>
            <PitCanvas swarm={view} selectedId={fly?.id} wash={wash} onSelect={selectFly} />
            <div className="stage-read">
              <small>{tx("pit.selected")}</small>
              <strong>#{fly?.id ?? "—"}</strong>
              <em className={reflex?.side.toLowerCase()}>{reflex?.side || "—"}</em>
              <PriceMark price={view.market.price} />
            </div>
            <p className="stage-caption">{tx("pit.caption")}</p>
          </div>

          <aside className="lectern">
            <div className="path">
              {FINANCIAL_PORTS.map((port, i) => (
                <React.Fragment key={port.id}>
                  {i > 0 && <i />}
                  <span className={port.status}>{port.label}</span>
                </React.Fragment>
              ))}
            </div>
            <h1>{tx("pit.title")}</h1>
            {fly && reflex ? (
              <Cause
                stim={lastStim ? `${labels[lastStim.kind]} ×${(lastStim.intensity / 100).toFixed(2)}` : null}
                reflex={reflex}
                trade={lastFill}
              />
            ) : (
              <p className="empty">{tx("pit.emptyFly")}</p>
            )}
            {fly && (
              <>
                <div className="fly-head">
                  <div>
                    <small>
                      GEN {fly.gen} · {fly.parent == null ? tx("pit.noParent") : tx("pit.parent", { id: fly.parent })}
                    </small>
                    <strong>#{fly.id}</strong>
                  </div>
                  <code>{fly.fingerprint}</code>
                </div>
                <BookSplit fly={fly} price={view.market.price} />
                <Balance fly={fly} />
              </>
            )}
            <OrganStops
              kinds={STIMULI}
              labels={labels}
              hints={hints}
              icons={ICONS}
              intensity={intensity}
              cooldown={cooldown}
              active={wash}
              onPulse={pulse}
              onIntensity={setIntensity}
            />
            <div className="lectern-actions">
              <button className="primary" onClick={() => setRunning((v) => !v)}>
                {running ? <Pause size={14} /> : <Play size={14} />}
                {running ? tx("pit.pause") : tx("pit.resume")}
              </button>
              <button className="ghost" onClick={cullNow} disabled={stats.alive < 2}>
                {tx("pit.settleNow")}
              </button>
            </div>
            {error && (
              <div className="pit-error" role="alert">
                {error}
              </div>
            )}
            <p className="lectern-note">{notice}</p>
          </aside>
        </section>

        <section className="after">
          <div>
            <h2>
              {tx("pit.lineage")} <small>{tx("pit.lineageHint")}</small>
            </h2>
            <Lineage lineage={view.lineage} flies={view.flies} />
          </div>
          <div className="wide">
            <h2>
              {tx("pit.river")}{" "}
              <small>{tx("pit.riverHint", { n: Math.min(18, stats.trades) })}</small>
            </h2>
            <TradeRiver trades={view.trades} />
          </div>
        </section>

        <section className="world-deck" aria-label="Agent Society trading world">
          <div className="world-intro">
            <span className="eyebrow">AGENT SOCIETY / TRADING WORLD</span>
            <h2>一群生命，<em>一笔被观察的风险。</em></h2>
            <p>果蝇先用行为语言交流，再由交易端口解释为动作。LLM 负责检索、规划与说明；风险边界始终由规则执行。</p>
            <div className="world-actions">
              <button className="primary" onClick={() => setNotice("PERSONAL BRANCH · 已创建一条可重放实验分支")}>改变一次经历</button>
              <button className="ghost" onClick={() => setNotice("REPLAY · 正在锁定当前事件链")}>重放因果链</button>
            </div>
          </div>
          <div className="signal-card">
            <div className="card-top"><span>NEURAL SIGNAL / LIVE</span><b>{String(view.tick).padStart(4, "0")}</b></div>
            <div className="signal-grid">
              {[["FOOD", stats.buys, "var(--nerve)"], ["THREAT", stats.sells, "#c27972"], ["MEMORY", view.lineage.length + 7, "var(--gold)"], ["CREDIT", Math.max(0, Math.round(stats.bnb * 100)), "#d7c4a0"]].map(([label, value, color]) => (
                <div className="signal-row" key={label}><span>{label}</span><strong style={{ color }}>{String(value).padStart(3, "0")}</strong><i><b style={{ width: `${Math.min(100, Number(value) * 4 + 8)}%`, background: color }} /></i></div>
              ))}
            </div>
            <div className="card-foot"><span>MALECNS / 1,400 NODE SUBGRAPH</span><span>REPLAYABLE</span></div>
          </div>
          <div className="market-card">
            <div className="card-top"><span>IFS / HIVE VAULT</span><b className="live-dot">● LIVE</b></div>
            <div className="market-price">{formatBnb(view.market.price)} <small>BNB / IFS</small></div>
            <div className="market-lines">{(view.prices || []).slice(-18).map((price, i, arr) => { const min = Math.min(...arr); const max = Math.max(...arr); return <i key={`${price}-${i}`} style={{ height: `${Math.max(4, 10 + ((price - min) / Math.max(1, max - min)) * 28)}px`, opacity: 0.25 + i / arr.length }} />; })}</div>
            <div className="market-meta"><span>HIVE STATE <b>{view.flies.filter((f) => f.status === "alive").length} ALIVE</b></span><span>IFS <b>SIM</b></span></div>
          </div>
        </section>

        <section className="seals">
          <h2>
            {tx("pit.roster")} <small>{tx("pit.rosterHint")}</small>
          </h2>
          <Roster board={stats.board} selectedId={fly?.id} onSelect={selectFly} />
        </section>

        <footer className="pit-footer">
          <span>
            IMMORTAL / THE PIT <b>TRADE FIRST.</b>
          </span>
          <p>
            <RichText
              text={tx("pit.footer")}
              tags={{
                altar: <a href="/blueprint.html">{tx("nav.altar")}</a>,
                canon: <a href="/brain.html">{tx("nav.canon")}</a>,
              }}
            />
          </p>
          <small>
            BUY {stats.buys} · SELL {stats.sells} · IFL {formatToken(stats.token)}
          </small>
        </footer>
      </div>
    </LocaleContext.Provider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
