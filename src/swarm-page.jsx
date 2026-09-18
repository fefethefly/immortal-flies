import React, { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Pause, Play, Sun, Utensils, Zap } from "lucide-react";
import { LifeGlyph } from "./life-glyphs.jsx";
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
  bootPitSession,
  pitView,
  pulsePit,
  savePitSession,
  settleNow,
  stepPit,
} from "./brain/flyswarm/pit.mjs";
import { offerObservation } from "./brain/flyswarm/market.mjs";
import { PhenotypeReadout } from "./phenotype-view.jsx";
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
import { iffApi } from "./api-client.mjs";
import { useVenueQuotes } from "./use-venue-quotes.mjs";
import {
  formatBpsPct,
  formatUsd,
  headlineAsset,
  observationFromQuotes,
} from "./venue-quotes.mjs";
import { createBranch, worldView } from "./brain/flyswarm/world.mjs";
import {
  ColonyView,
  ExecutionView,
  ExplainDrawer,
  IfsView,
  IntentView,
  RiskView,
  VaultView,
  ViewNav,
} from "./world-views.jsx";
import "./swarm.css";
import "./world.css";

const ICONS = { food: Utensils, threat: Zap, light: Sun, dark: Moon };

export function PitPage() {
  const [locale, setLocale, tx] = useLocale("meta.pitTitle", "meta.pitDesc");
  const [view, setView] = useState(null);
  const [world, setWorld] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("pit");
  const [explainOpen, setExplainOpen] = useState(false);
  const [selectedCausal, setSelectedCausal] = useState(null);
  const [running, setRunning] = useState(true);
  const [selected, setSelected] = useState(() => recallFly() ?? 0);
  const [token, setToken] = useState(null);
  const [intensity, setIntensity] = useState(0.6);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const sessionRef = useRef(null);
  const remoteRef = useRef(null);
  const mirrorFailures = useRef(0);
  const [remote, setRemote] = useState(null);
  const [creditRemote, setCreditRemote] = useState(null);
  const [vaultRemote, setVaultRemote] = useState(null);
  const venueQuotes = useVenueQuotes({ enabled: ready, intervalMs: 3000 });
  const headQuote = headlineAsset(venueQuotes);

  const stats = useMemo(() => (view ? summarize(view) : null), [view]);
  const fly = view
    ? view.flies.find((row) => row.id === selected) || stats.board[0]
    : null;
  const cooldown = view
    ? Math.max(0, view.cooldownTicks - (view.tick - view.lastStimulusAt))
    : 0;
  const lastStim = view?.stimuliLog[0];
  const wash =
    lastStim && view && view.tick - lastStim.tick < 12 ? lastStim.kind : null;
  const lastFill = view
    ? view.trades.find((row) => row.flyId === fly?.id) || view.trades[0]
    : null;
  const labels = Object.fromEntries(
    STIMULI.map((kind) => [kind, tx(`pit.stim.${kind}`)]),
  );
  const hints = Object.fromEntries(
    STIMULI.map((kind) => [kind, tx(`pit.hint.${kind}`)]),
  );

  useEffect(() => {
    setNotice(tx("pit.noticeOpen"));
  }, [locale]);

  // 可选后端：创建同种子的服务端镜像会话（存档 + LLM）。失败只降级，不阻塞本地场。
  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const created = await iffApi.createSession({
          seed: sessionRef.current?.aux?.seed ?? 20260916,
        });
        if (cancelled) return;
        const next = {
          sessionId: created.sessionId,
          ownerToken: created.ownerToken,
        };
        remoteRef.current = next;
        setRemote(next);
        fetchCredit(next);
      } catch {
        /* 无后端：本地确定性解释层照常运行 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // 只读 Kyber 报价注入本地 market-feed（成交仍 SIM）。静态站无 /v1 时走浏览器直连。
  useEffect(() => {
    if (!ready || !venueQuotes?.enabled) return;
    const obs = observationFromQuotes(venueQuotes);
    if (!obs) return;
    const session = sessionRef.current;
    if (session?.aux?.market) {
      try {
        offerObservation(session.aux.market, obs);
      } catch {
        /* stale or forbidden — keep paper walk */
      }
    }
    const r = remoteRef.current;
    if (r) {
      iffApi.offerMarket(r.sessionId, r.ownerToken, obs).catch(() => {});
    }
  }, [ready, venueQuotes]);

  /** 拉取服务端信用账本；失败回落本地纸面信用。 */
  async function fetchCredit(r = remoteRef.current) {
    if (!r) {
      setCreditRemote(null);
      return;
    }
    try {
      setCreditRemote(await iffApi.credit(r.sessionId));
    } catch {
      setCreditRemote(null);
    }
  }

  /** 拉取服务端用户金库；失败保持未接入显示。 */
  async function fetchVault() {
    if (!remoteRef.current) {
      setVaultRemote(null);
      return;
    }
    try {
      setVaultRemote(await iffApi.vault());
    } catch {
      setVaultRemote(null);
    }
  }

  /** 用户金库动作（注资/退出/结算，全部 SIM）。 */
  async function vaultAction(kind, body) {
    const r = remoteRef.current;
    if (!r) return;
    try {
      if (kind === "deposit") await iffApi.vaultDeposit(r.ownerToken, body);
      else if (kind === "exit") await iffApi.vaultExit(r.ownerToken, body);
      else if (kind === "settle") await iffApi.vaultSettle();
      setNotice(tx("vault.done"));
    } catch (err) {
      setNotice(`${tx("vault.err")} · ${err?.message || kind}`);
    }
    await fetchVault();
  }

  /** IFS 视图的信用动作（锁仓/占用/释放/解锁，全部 SIM）。 */
  async function creditAction(kind, body) {
    const r = remoteRef.current;
    if (!r) return;
    const actions = {
      stake: () => iffApi.creditStake(r.sessionId, r.ownerToken, body),
      unstake: () => iffApi.creditUnstake(r.sessionId, r.ownerToken, body),
      occupy: () => iffApi.creditOccupy(r.sessionId, r.ownerToken, body),
      release: () => iffApi.creditRelease(r.sessionId, r.ownerToken, body),
    };
    try {
      await actions[kind]();
      setNotice(tx("credit.done"));
      await fetchCredit();
    } catch (err) {
      setNotice(`${tx("credit.err")} · ${err?.message || kind}`);
      await fetchCredit();
    }
  }

  /** 向服务端镜像一次动作；连续失败后安静断开，UI 保持本地源。 */
  function mirror(action) {
    const r = remoteRef.current;
    if (!r) return;
    action(r)
      .then(() => {
        mirrorFailures.current = 0;
      })
      .catch(() => {
        mirrorFailures.current += 1;
        if (mirrorFailures.current >= 8) {
          remoteRef.current = null;
          setRemote(null);
        }
      });
  }

  useEffect(() => {
    loadOfficialToken()
      .then(setToken)
      .catch(() => {});
  }, []);

  // 启动：加载真实 MaleCNS 子图 → 内核 → 绑定创世（或从快照恢复）。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { session, discarded } = await bootPitSession();
        if (cancelled) return;
        sessionRef.current = session;
        setView(pitView(session));
        setWorld(worldView(session));
        setReady(true);
        if (discarded) setNotice(tx("pit.noticeReset"));
      } catch (err) {
        if (cancelled) return;
        console.warn("[pit] boot failed:", err?.stack || err);
        setError(err.message || tx("pit.bootFail"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 主循环：每秒一个完整蝇群协议 tick（话语/记忆/聚合 + 纸面世界），空闲时不推进。
  useEffect(() => {
    if (!ready || !running) return undefined;
    let busy = false;
    const id = setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const next = await stepPit(sessionRef.current);
        setView(next);
        setWorld(worldView(sessionRef.current));
        mirror((r) =>
          iffApi.tick(
            r.sessionId,
            r.ownerToken,
            `t${sessionRef.current.kernel.colony.tick}`,
          ),
        );
        try {
          localStorage.setItem(
            PIT_STORE,
            JSON.stringify(savePitSession(sessionRef.current)),
          );
        } catch {
          /* 私有模式仍可运行，只是不持久 */
        }
      } catch (err) {
        console.warn("[pit] tick failed:", err?.stack || err);
        setError(err.message);
      }
      busy = false;
    }, 1000);
    return () => clearInterval(id);
  }, [ready, running]);

  function selectFly(id) {
    setSelected(id);
    rememberFly(id);
  }

  useEffect(() => {
    if (!view || !fly) return;
    if (!view.flies.some((row) => row.id === selected))
      selectFly(stats.board[0]?.id ?? 0);
  }, [view, fly, selected, stats]);

  function pulse(kind) {
    try {
      pulsePit(sessionRef.current, kind, intensity);
      mirror((r) =>
        iffApi.stimulus(r.sessionId, r.ownerToken, { kind, intensity }),
      );
      setError("");
      setNotice(tx("pit.noticePulse", { label: labels[kind] }));
    } catch (err) {
      console.warn("[pit] pulse failed:", err?.stack || err);
      setError(err.message);
    }
  }

  async function cullNow() {
    try {
      const next = await settleNow(sessionRef.current);
      setView(next);
      setWorld(worldView(sessionRef.current));
      mirror((r) => iffApi.settle(r.sessionId, r.ownerToken));
      setError("");
      setNotice(tx("pit.noticeCull"));
      fetchCredit();
    } catch (err) {
      console.warn("[pit] settle failed:", err?.stack || err);
      setError(err.message);
    }
  }

  /** 切换视图；进 Risk / IFS 时刷新服务端信用账本。 */
  function switchTab(next) {
    setTab(next);
    if (next === "risk" || next === "ifs") fetchCredit();
    if (next === "vault") fetchVault();
  }

  function branchNow() {
    if (!sessionRef.current) return;
    const branch = createBranch(sessionRef.current, `exp-${view?.tick ?? 0}`);
    setWorld(worldView(sessionRef.current));
    setNotice(`${tx("colony.branchDone")} · ${branch.id}`);
  }

  const reflex = fly ? reflexOf(fly) : null;

  if (!view) {
    return (
      <LocaleContext.Provider value={{ locale, tx }}>
        <div className="pit-app">
          <SiteBar
            locale={locale}
            setLocale={setLocale}
            tx={tx}
            current="pit"
          />
          <section className="pit">
            <div className="stage pit-boot-stage">
              <LifeGlyph kind="boot" tall />
              <p className="pit-error" role="status">
                {error || tx("pit.loading")}
              </p>
              <small>{tx("pit.bootCaption")}</small>
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

        <ViewNav
          tab={tab}
          setTab={switchTab}
          tx={tx}
          remote={remote}
          onExplain={() => setExplainOpen(true)}
        />

        {tab === "pit" && (
          <>
            <div className="pit-front">
              <div className="pit-hero">
                <div>
                  <p className="pit-kicker">L2 / TRADING WORLD</p>
                  <ol className="pit-flow" aria-label={tx("pit.flowCaption")}>
                    <li>SENSE</li>
                    <li>ACT</li>
                    <li>PORT</li>
                  </ol>
                </div>
                <p>{tx("pit.flowCaption")}</p>
              </div>
              <section className="pit">
                <div className="stage">
                  <span className="stage-frame tl" />
                  <span className="stage-frame br" />
                  <div className="stage-notes">
                    <span>MALECNS / 12000 NODES / TRADER</span>
                    <span>
                      TICK #{view.tick} · {formatBnb(stats.bnb)} BNB
                    </span>
                  </div>
                  <PitCanvas
                    swarm={view}
                    selectedId={fly?.id}
                    wash={wash}
                    onSelect={selectFly}
                  />
                  <div className="stage-read">
                    <small>{tx("pit.selected")}</small>
                    <strong>#{fly?.id ?? "—"}</strong>
                    <em className={reflex?.side.toLowerCase()}>
                      {reflex?.side || "—"}
                    </em>
                    <PriceMark price={view.market.price} />
                  </div>
                  <p className="stage-caption">{tx("pit.caption")}</p>
                </div>

                <aside className="lectern">
                  <div className="path">
                    {FINANCIAL_PORTS.map((port, i) => (
                      <React.Fragment key={port.id}>
                        {i > 0 && <i className="path-flow" />}
                        <span className={port.status}>{port.label}</span>
                      </React.Fragment>
                    ))}
                  </div>
                  <h1>{tx("pit.title")}</h1>
                  {fly && reflex ? (
                    <Cause
                      stim={
                        lastStim
                          ? `${labels[lastStim.kind]} ×${(lastStim.intensity / 100).toFixed(2)}`
                          : null
                      }
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
                            GEN {fly.gen} ·{" "}
                            {fly.parent == null
                              ? tx("pit.noParent")
                              : tx("pit.parent", { id: fly.parent })}
                          </small>
                          <strong>#{fly.id}</strong>
                        </div>
                        <code>{fly.fingerprint}</code>
                      </div>
                      <PhenotypeReadout
                        fly={fly}
                        locale={locale}
                        compact
                        caption={tx("pheno.claim")}
                        note={tx("pheno.note")}
                      />
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
                    <button
                      className="primary"
                      onClick={() => setRunning((v) => !v)}
                    >
                      {running ? <Pause size={14} /> : <Play size={14} />}
                      {running ? tx("pit.pause") : tx("pit.resume")}
                    </button>
                    <button
                      className="ghost"
                      onClick={cullNow}
                      disabled={stats.alive < 2}
                    >
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
            </div>

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
                  <small>
                    {tx("pit.riverHint", { n: Math.min(18, stats.trades) })}
                  </small>
                </h2>
                <TradeRiver trades={view.trades} />
              </div>
            </section>

            <section
              className="world-deck"
              aria-label="Agent Society trading world"
            >
              <div className="world-intro">
                <span className="eyebrow">AGENT SOCIETY / TRADING WORLD</span>
                <h2>
                  <RichText
                    text={tx("pit.deckTitle")}
                    tags={{ risk: <em>{tx("pit.deckRisk")}</em> }}
                  />
                </h2>
                <p>{tx("pit.deckLead")}</p>
                <div className="world-actions">
                  <button className="primary" onClick={branchNow}>
                    {tx("colony.branch")}
                  </button>
                  <button className="ghost" onClick={() => setTab("colony")}>
                    {tx("colony.replay")}
                  </button>
                </div>
              </div>
              <div className="signal-card">
                <div className="card-top">
                  <span>NEURAL SIGNAL / LIVE</span>
                  <b>{String(view.tick).padStart(4, "0")}</b>
                </div>
                <div className="signal-grid">
                  {[
                    ["FOOD", stats.buys, "var(--nerve)"],
                    ["THREAT", stats.sells, "#b57660"],
                    ["MEMORY", view.lineage.length + 7, "var(--gold)"],
                    [
                      "CREDIT",
                      Math.max(0, Math.round(stats.bnb * 100)),
                      "#ddcda6",
                    ],
                  ].map(([label, value, color]) => (
                    <div className="signal-row" key={label}>
                      <span>{label}</span>
                      <strong style={{ color }}>
                        {String(value).padStart(3, "0")}
                      </strong>
                      <i>
                        <b
                          style={{
                            width: `${Math.min(100, Number(value) * 4 + 8)}%`,
                            background: color,
                          }}
                        />
                      </i>
                    </div>
                  ))}
                </div>
                <div className="card-foot">
                  <span>MALECNS / 1,400 NODE SUBGRAPH</span>
                  <span>REPLAYABLE</span>
                </div>
              </div>
              <div className="market-card">
                <div className="card-top">
                  <span>
                    {view.market.quote === "LIVE" || venueQuotes?.enabled
                      ? tx("pit.venueLive")
                      : "IFS / HIVE VAULT"}
                  </span>
                  <b className="live-dot">
                    ●{" "}
                    {view.market.quote === "LIVE" || venueQuotes?.focus
                      ? "LIVE QUOTE"
                      : "LIVE"}
                  </b>
                </div>
                <div className="market-price">
                  {headQuote
                    ? formatUsd(headQuote.usd)
                    : formatBnb(view.market.price)}{" "}
                  <small>
                    {headQuote
                      ? `${headQuote.symbol} / USDT`
                      : view.market.focusAssetId || venueQuotes?.focus?.assetId
                        ? `FOCUS ${view.market.focusAssetId || venueQuotes.focus.assetId}`
                        : "BNB / IFS"}
                  </small>
                </div>
                {Array.isArray(venueQuotes?.assets) && venueQuotes.assets.length > 0 && (
                  <div className="venue-quotes" aria-label="venue quotes">
                    {venueQuotes.assets.map((a) => (
                      <span
                        key={a.id}
                        className={
                          venueQuotes.focus?.assetId === a.id ||
                          headQuote?.id === a.id
                            ? "venue-quote focus"
                            : "venue-quote"
                        }
                      >
                        <b>{a.symbol}</b>{" "}
                        {a.usd != null ? formatUsd(a.usd) : "—"}{" "}
                        {formatBpsPct(a.changeBps)}
                        {a.stale ? " · stale" : ""}
                      </span>
                    ))}
                    <em className="venue-note">{tx("pit.venueNote")}</em>
                  </div>
                )}
                <div className="market-lines">
                  {(view.prices || []).slice(-18).map((price, i, arr) => {
                    const min = Math.min(...arr);
                    const max = Math.max(...arr);
                    return (
                      <i
                        key={`${price}-${i}`}
                        style={{
                          height: `${Math.max(4, 10 + ((price - min) / Math.max(1, max - min)) * 28)}px`,
                          opacity: 0.25 + i / arr.length,
                        }}
                      />
                    );
                  })}
                </div>
                <div className="market-meta">
                  <span>
                    HIVE STATE{" "}
                    <b>
                      {view.flies.filter((f) => f.status === "alive").length}{" "}
                      ALIVE
                    </b>
                  </span>
                  <span>
                    FILL <b>SIM</b>
                    {view.market.quote === "LIVE" || venueQuotes?.focus
                      ? " · QUOTE LIVE"
                      : ""}
                  </span>
                </div>
              </div>
            </section>

            <section className="seals">
              <h2>
                {tx("pit.roster")} <small>{tx("pit.rosterHint")}</small>
              </h2>
              <Roster
                board={stats.board}
                selectedId={fly?.id}
                onSelect={selectFly}
              />
            </section>
          </>
        )}

        {tab === "colony" &&
          (world ? (
            <ColonyView
              world={world}
              tx={tx}
              sessionRef={sessionRef}
              onBranch={branchNow}
              selectedCausal={selectedCausal}
              setSelectedCausal={setSelectedCausal}
              remote={remote}
              locale={locale}
            />
          ) : (
            <section className="world-view">
              <p className="pit-error" role="alert">
                {tx("pit.loading")}
              </p>
            </section>
          ))}
        {tab === "intent" && world && <IntentView world={world} tx={tx} />}
        {tab === "risk" && world && (
          <RiskView world={world} tx={tx} creditRemote={creditRemote} />
        )}
        {tab === "execution" && world && (
          <ExecutionView world={world} tx={tx} />
        )}
        {tab === "vault" && world && (
          <VaultView
            world={world}
            tx={tx}
            vaultRemote={vaultRemote}
            remote={remote}
            onVaultAction={vaultAction}
          />
        )}
        {tab === "ifs" && world && (
          <IfsView
            world={world}
            tx={tx}
            token={token}
            credit={creditRemote}
            remote={remote}
            onCreditAction={creditAction}
          />
        )}

        <footer className="pit-footer">
          <span>
            IMMORTAL / THE PIT <b>TRADE FIRST.</b>
          </span>
          <p>
            <RichText
              text={tx("pit.footer")}
              tags={{
                field: <a href="/field.html">{tx("nav.field")}</a>,
                altar: <a href="/blueprint.html">{tx("nav.altar")}</a>,
                canon: <a href="/brain.html">{tx("nav.canon")}</a>,
              }}
            />
          </p>
          <small>
            BUY {stats.buys} · SELL {stats.sells} · IFL{" "}
            {formatToken(stats.token)}
          </small>
        </footer>

        <ExplainDrawer
          open={explainOpen}
          onClose={() => setExplainOpen(false)}
          sessionRef={sessionRef}
          tx={tx}
          flyId={fly?.id ?? 0}
          remote={remote}
          locale={locale}
        />
      </div>
    </LocaleContext.Provider>
  );
}
