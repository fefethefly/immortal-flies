import React, { useMemo, useState } from "react";
import { ArrowRight, FlaskConical, X } from "lucide-react";
import { formatBnb, formatToken } from "./swarm.mjs";
import { iffApi } from "./api-client.mjs";
import { replayChain, WORLD_POLICY } from "./brain/flyswarm/world.mjs";
import {
  EXPLAINER,
  QUESTIONS,
  TOOL_WHITELIST,
  answerQuestion,
  explainFly,
  policyCard,
  retrieveEvents,
} from "./brain/flyswarm/explain.mjs";
import { explorerAddress, explorerToken } from "./token.mjs";

const KIND_LABEL = {
  sense: "colony.ev.sense",
  act: "colony.ev.act",
  memory: "colony.ev.memory",
  trade: "colony.ev.trade",
  society: "colony.ev.society",
  risk: "colony.ev.risk",
};

const KIND_COLOR = {
  sense: "var(--gold)",
  act: "var(--nerve)",
  memory: "#ddcda6",
  trade: "#938a79",
  society: "#938a79",
  risk: "#b57660",
};

const SIDE_CLASS = (side) =>
  side === "BUY" ? "buy" : side === "SELL" ? "sell" : "hold";

function Eyebrow({ children }) {
  return <span className="world-eyebrow">{children}</span>;
}

function SimBadge({ tx }) {
  return <span className="sim-badge">{tx("view.simBadge")}</span>;
}

function ViewShell({ tx, title, lead, eyebrow, children, sim = true }) {
  return (
    <section className="world-view">
      <header className="world-view-head">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1>{title}</h1>
          <p>{lead}</p>
        </div>
        {sim && <SimBadge tx={tx} />}
      </header>
      {children}
    </section>
  );
}

export const VIEW_TABS = [
  ["pit", "view.nav.pit"],
  ["colony", "view.nav.colony"],
  ["intent", "view.nav.intent"],
  ["risk", "view.nav.risk"],
  ["execution", "view.nav.execution"],
  ["vault", "view.nav.vault"],
  ["ifs", "view.nav.ifs"],
];

export function ViewNav({ tab, setTab, tx, remote, onExplain }) {
  function onKeyDown(event) {
    const idx = VIEW_TABS.findIndex(([id]) => id === tab);
    let next = null;
    if (event.key === "ArrowRight")
      next = VIEW_TABS[(idx + 1) % VIEW_TABS.length];
    if (event.key === "ArrowLeft")
      next = VIEW_TABS[(idx - 1 + VIEW_TABS.length) % VIEW_TABS.length];
    if (!next) return;
    event.preventDefault();
    setTab(next[0]);
    const node = document.querySelector(
      `.view-nav-tabs button[data-tab="${next[0]}"]`,
    );
    node?.focus();
  }
  return (
    <nav className="view-nav" aria-label={tx("view.nav.label")}>
      <div
        className="view-nav-tabs"
        role="tablist"
        aria-label={tx("view.nav.label")}
        onKeyDown={onKeyDown}
      >
        {VIEW_TABS.map(([id, key], i) => (
          <button
            key={id}
            role="tab"
            data-tab={id}
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? "on" : ""}
            onClick={() => setTab(id)}
          >
            <small>{String(i + 1).padStart(2, "0")}</small>
            {tx(key)}
          </button>
        ))}
      </div>
      <span
        className={`api-badge ${remote ? "on" : ""}`}
        title={remote?.sessionId || ""}
      >
        {remote ? tx("view.api.live") : tx("view.api.local")}
      </span>
      <button className="view-explain" onClick={onExplain}>
        <FlaskConical size={13} />
        {tx("view.explainOpen")}
      </button>
    </nav>
  );
}

/* ---------- 事件落地 / 因果条 / 压力计 ---------- */

function EventMark({ event, tx }) {
  const label = tx(KIND_LABEL[event.kind] || "colony.ev.act");
  const sideClass = event.side ? SIDE_CLASS(event.side) : "";
  const who =
    event.flyId != null
      ? `#${event.flyId}`
      : event.kind === "society"
        ? "Σ"
        : event.kind === "sense"
          ? "◉"
          : "·";
  return (
    <span
      className={`ev-mark ${event.kind} ${sideClass}`}
      style={{ "--ev": KIND_COLOR[event.kind] || "#938a79" }}
      title={`${label} · T${event.tick} · ${who} ${event.side || ""}`}
    >
      <b>{who}</b>
      <i>
        {event.side === "BUY" ? "B" : event.side === "SELL" ? "S" : label[0]}
      </i>
      <small>T{event.tick}</small>
    </span>
  );
}

/** 现场：最近 16 个 tick 的事件按 tick 逐列。 */
export function LivingField({ world, tx }) {
  const ticks = useMemo(() => {
    const latest = world.events.slice(-64);
    const byTick = new Map();
    for (const e of latest) {
      if (!byTick.has(e.tick)) byTick.set(e.tick, []);
      byTick.get(e.tick).push(e);
    }
    const list = [...byTick.entries()].sort((a, b) => a[0] - b[0]).slice(-16);
    return list;
  }, [world]);
  const last = ticks.length ? ticks[ticks.length - 1][0] : world.tick;
  return (
    <div className="field" role="list" aria-label={tx("colony.field")}>
      <div className="field-baseline" aria-hidden="true" />
      {ticks.map(([tick, events]) => (
        <div
          className={`field-col ${tick === last ? "now" : ""}`}
          key={tick}
          role="listitem"
        >
          <small className="field-tick">T{tick}</small>
          <div className="field-marks">
            {events.slice(0, 6).map((e) => (
              <EventMark key={e.id} event={e} tx={tx} />
            ))}
          </div>
        </div>
      ))}
      {!ticks.length && <p className="empty-inline">{tx("colony.noCausal")}</p>}
    </div>
  );
}

/** 因果条：一条因果链接 = 起因 → 结果。点击可重放。 */
export function CausalStrips({ world, tx, onReplay, selected }) {
  const index = useMemo(
    () => new Map(world.events.map((e) => [e.id, e])),
    [world],
  );
  if (!world.causal.length)
    return <p className="empty-inline">{tx("colony.noCausal")}</p>;
  return (
    <ol className="causal" role="list">
      {world.causal.map((link) => {
        const froms = link.from.map((id) => index.get(id)).filter(Boolean);
        const to = index.get(link.to);
        if (!to || !froms.length) return null;
        return (
          <li key={link.id}>
            <button
              className={`causal-strip ${selected === link.id ? "on" : ""}`}
              onClick={() => onReplay(link.id)}
              aria-pressed={selected === link.id}
            >
              <span className="causal-from">
                {froms.map((e) => (
                  <EventMark key={e.id} event={e} tx={tx} />
                ))}
              </span>
              <ArrowRight size={14} className="causal-arrow" />
              <EventMark event={to} tx={tx} />
              <em>{link.kind.toUpperCase()}</em>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** 重放面板：一条链的全部节点与连线。 */
export function ReplayPanel({ world, linkId, tx }) {
  const chain = useMemo(() => {
    if (!linkId) return null;
    const link = world.causal.find((l) => l.id === linkId);
    return link ? replayChain(world, link.to) : null;
  }, [world, linkId]);
  if (!chain || !chain.nodes.length) return null;
  const index = new Map(chain.nodes.map((n) => [n.id, n]));
  return (
    <div className="replay-panel">
      <Eyebrow>{tx("colony.replayTitle")}</Eyebrow>
      <p className="replay-hint">{tx("colony.replayHint")}</p>
      <div className="replay-nodes">
        {chain.nodes.map((node, i) => (
          <React.Fragment key={node.id}>
            {i > 0 && <ArrowRight size={12} className="causal-arrow" />}
            <EventMark event={node} tx={tx} />
          </React.Fragment>
        ))}
      </div>
      <div className="replay-links">
        {chain.links.map((link) => (
          <span key={link.id}>
            <small>{link.kind.toUpperCase()}</small>
            {link.from
              .map((id) => (index.has(id) ? `T${index.get(id).tick}` : id))
              .join("+")}{" "}
            → T{index.get(link.to)?.tick}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 蜂巢压力计：0 = 卖压，100 = 买压。 */
export function PressureGauge({ world }) {
  const { gauge, buy, sell, hold } = world.pressure;
  const angle = -90 + (gauge * 180) / 100;
  return (
    <div className="gauge">
      <svg viewBox="0 0 100 62" aria-hidden="true">
        <path d="M 8 56 A 42 42 0 0 1 92 56" className="gauge-arc" />
        <line
          x1="50"
          y1="56"
          x2="50"
          y2="18"
          className="gauge-needle"
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: "50px 56px",
          }}
        />
        <circle cx="50" cy="56" r="3" className="gauge-hub" />
      </svg>
      <div className="gauge-read">
        <span className="sell">SELL {sell}</span>
        <b>{gauge}</b>
        <span className="buy">BUY {buy}</span>
      </div>
      <small className="gauge-hold">HOLD {hold}</small>
    </div>
  );
}

/* ---------- ask 通道 ---------- */

export function AskPanel({ sessionRef, tx, remote, locale }) {
  const [asked, setAsked] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [freeText, setFreeText] = useState("");

  async function ask(id) {
    if (!sessionRef.current) return;
    setAsked(id);
    setLoading(true);
    try {
      if (remote) {
        const data = await iffApi.ask(remote.ownerToken, {
          sessionId: remote.sessionId,
          questionId: id,
          locale,
        });
        setAnswer({
          key: data.answer?.key || "ask.unknown",
          params: data.answer?.params || {},
          refs: data.answer?.refs || [],
          narrative: data.narrative || null,
          degraded: data.degraded !== false,
        });
      } else {
        const local = answerQuestion(sessionRef.current, id);
        setAnswer({
          key: local.key,
          params: local.params,
          refs: local.refs,
          narrative: null,
          degraded: true,
        });
      }
    } catch {
      const local = answerQuestion(sessionRef.current, id);
      setAnswer({
        key: local.key,
        params: local.params,
        refs: local.refs,
        narrative: null,
        degraded: true,
      });
    }
    setLoading(false);
  }

  async function askFree(event) {
    event.preventDefault();
    const text = freeText.trim();
    if (!text || !remote) return;
    setAsked(null);
    setLoading(true);
    try {
      const data = await iffApi.ask(remote.ownerToken, {
        sessionId: remote.sessionId,
        text,
        locale,
      });
      setAnswer({
        key: "ask.free",
        params: { text },
        refs: data.answer?.refs || [],
        narrative: data.narrative || null,
        degraded: data.degraded !== false,
      });
    } catch {
      setAnswer({
        key: "ask.unknown",
        params: {},
        refs: [],
        narrative: null,
        degraded: true,
      });
    }
    setLoading(false);
  }

  return (
    <div className="ask-panel">
      <h3>{tx("colony.ask")}</h3>
      <p>{tx("colony.askHint")}</p>
      <ul className="ask-list">
        {QUESTIONS.map((q) => (
          <li key={q.id}>
            <button
              className={asked === q.id ? "on" : ""}
              onClick={() => ask(q.id)}
              disabled={loading}
            >
              {tx(`ask.q.${q.id.slice(2)}`)}
            </button>
          </li>
        ))}
      </ul>
      <form className="ask-free" onSubmit={askFree}>
        <input
          type="text"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder={tx("ask.freePlaceholder")}
          disabled={!remote}
          maxLength={500}
          aria-label={tx("ask.freePlaceholder")}
        />
        <button type="submit" disabled={!remote || !freeText.trim() || loading}>
          {tx("colony.ask.ask")}
        </button>
      </form>
      {!remote && <p className="ask-free-hint">{tx("ask.freeHint")}</p>}
      {loading && (
        <div className="ask-answer" role="status">
          <small>{tx("ask.sending")}</small>
        </div>
      )}
      {!loading && answer && (
        <div className="ask-answer" role="status">
          <small>
            {tx("colony.ask.answer")}
            {remote
              ? ` · ${answer.degraded ? tx("explain.local") : tx("explain.remote")}`
              : ` · ${tx("explain.local")}`}
          </small>
          {answer.narrative && <p className="narrative">{answer.narrative}</p>}
          <p>{tx(answer.key, answer.params)}</p>
          {answer.refs.length > 0 && (
            <code>
              {tx("explain.refs")}: {answer.refs.join(" · ")}
            </code>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- COLONY ---------- */

export function ColonyView({
  world,
  tx,
  sessionRef,
  onBranch,
  selectedCausal,
  setSelectedCausal,
  remote,
  locale,
}) {
  const society = world.society;
  const split = society.split;
  return (
    <ViewShell
      tx={tx}
      eyebrow={`AGENT SOCIETY / TRADING WORLD · TICK ${world.tick}`}
      title={tx("colony.title")}
      lead={tx("colony.lead")}
    >
      <div className="society-strip">
        <div
          className={`society-state ${split ? "split" : society.status.toLowerCase()}`}
        >
          <small>{tx("colony.society")}</small>
          <b>{society.status}</b>
          <em>{society.side}</em>
          {split && <span className="split-badge">SPLIT</span>}
        </div>
        <div className="society-weights">
          <span className="buy">
            BUY <b>{society.buyWeight}</b>
          </span>
          <span className="sell">
            SELL <b>{society.sellWeight}</b>
          </span>
          <span>
            HOLD <b>{society.holdWeight}</b>
          </span>
        </div>
        <div className="gauge-wrap">
          <small>{tx("colony.pressure")}</small>
          <PressureGauge world={world} />
        </div>
        <div className="society-actions">
          <button className="ghost" onClick={onBranch}>
            <FlaskConical size={13} />
            {tx("colony.branch")}
          </button>
        </div>
      </div>

      <div className="colony-grid">
        <div className="colony-main">
          <section className="panel">
            <h2>
              {tx("colony.field")} <small>{tx("colony.eventsHint")}</small>
            </h2>
            <LivingField world={world} tx={tx} />
          </section>
          <section className="panel">
            <h2>
              {tx("colony.causal")} <small>{tx("colony.causalHint")}</small>
            </h2>
            <CausalStrips
              world={world}
              tx={tx}
              selected={selectedCausal}
              onReplay={(id) =>
                setSelectedCausal((v) => (v === id ? null : id))
              }
            />
            <ReplayPanel world={world} linkId={selectedCausal} tx={tx} />
          </section>
        </div>
        <aside className="colony-side">
          <section className="panel">
            <h2>
              {tx("colony.influence")}{" "}
              <small>{tx("colony.influenceHint")}</small>
            </h2>
            <ul className="influence">
              {world.influence.map((edge, i) => (
                <li key={`${edge.from}-${edge.to}-${i}`}>
                  <span>
                    {typeof edge.from === "number"
                      ? `#${edge.from}`
                      : tx("colony.byWorld")}
                  </span>
                  <ArrowRight size={12} />
                  <span>
                    {edge.to === "hive" ? tx("colony.byHive") : `#${edge.to}`}
                  </span>
                  <em>{edge.kind.toUpperCase()}</em>
                </li>
              ))}
              {!world.influence.length && (
                <li className="empty-inline">{tx("colony.noCausal")}</li>
              )}
            </ul>
          </section>
          <AskPanel
            sessionRef={sessionRef}
            tx={tx}
            remote={remote}
            locale={locale}
          />
        </aside>
      </div>
    </ViewShell>
  );
}

/* ---------- INTENT ---------- */

const PIPELINE = [
  "behavior",
  "tradeport",
  "risk",
  "credit",
  "auth",
  "executor",
  "receipt",
];

export function IntentView({ world, tx }) {
  return (
    <ViewShell
      tx={tx}
      eyebrow={`BEHAVIOR → PORT · TICK ${world.tick}`}
      title={tx("intent.title")}
      lead={tx("intent.lead")}
    >
      <div className="pipeline" aria-label={tx("intent.pipeline")}>
        {PIPELINE.map((step, i) => (
          <React.Fragment key={step}>
            {i > 0 && <ArrowRight size={12} />}
            <span className={i < 2 ? "live" : ""}>{step.toUpperCase()}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="intent-grid">
        {world.intents.map((row) => (
          <article
            className={`intent-card ${row.changed ? "turned" : ""}`}
            key={row.flyId}
          >
            <header>
              <span>#{row.flyId}</span>
              <em className={row.changed ? "turned" : "held"}>
                {row.changed ? tx("intent.turned") : tx("intent.held")}
              </em>
            </header>
            <div className="intent-native">
              <small>{tx("intent.native")}</small>
              <b>{row.action}</b>
              <div className="rate-bars">
                <span>
                  L <i style={{ width: `${Math.min(100, row.left * 16)}%` }} />
                </span>
                <span>
                  R <i style={{ width: `${Math.min(100, row.right * 16)}%` }} />
                </span>
              </div>
              <code>
                food {row.food} · threat {row.threat} · light {row.light}
              </code>
            </div>
            <div className="intent-read">
              <small>{tx("intent.read")}</small>
              <b className={SIDE_CLASS(row.side)}>{row.side}</b>
              <div className="conf-bar">
                <i style={{ width: `${row.confidence}%` }} />
              </div>
              <code>conf {row.confidence}</code>
            </div>
          </article>
        ))}
      </div>
      <p className="view-note">{tx("intent.note")}</p>
    </ViewShell>
  );
}

/* ---------- RISK ---------- */

export function RiskView({ world, tx, creditRemote }) {
  const r = world.risk;
  const top = r.concentration[0];
  const remoteBySoul = useMemo(() => {
    const map = new Map();
    for (const soul of creditRemote?.souls || []) map.set(soul.soulId, soul);
    return map;
  }, [creditRemote]);
  const creditOfFly = (p) => remoteBySoul.get(p.soulId) || p.credit;
  const creditTop = [...r.positions].sort(
    (a, b) => creditOfFly(b).usable - creditOfFly(a).usable,
  )[0];
  const policy = policyCard();
  return (
    <ViewShell
      tx={tx}
      eyebrow={`RISK POLICY · ${world.policy}`}
      title={tx("risk.title")}
      lead={tx("risk.lead")}
    >
      <div className="kpi-grid">
        <div className="kpi">
          <small>
            {tx("risk.aggregate")} · {tx("risk.equity")}
          </small>
          <b>{formatBnb(r.aggregate.equity)}</b>
          <em>BNB</em>
        </div>
        <div className="kpi">
          <small>{tx("risk.liquidity")}</small>
          <b>{(r.liquidityBps / 100).toFixed(2)}%</b>
          <em>
            {tx("risk.cash")} {formatBnb(r.aggregate.cash)}
          </em>
        </div>
        <div className="kpi">
          <small>{tx("risk.concentration")}</small>
          <b>{(top ? top.shareBps / 100 : 0).toFixed(2)}%</b>
          <em>
            #{top?.flyId ?? "—"} · {tx("risk.cap")}{" "}
            {(WORLD_POLICY.concentrationCapBps / 100).toFixed(0)}%
          </em>
        </div>
        <div className="kpi">
          <small>{tx("risk.drawdown")}</small>
          <b className={r.drawdown.currentBps > 0 ? "neg" : ""}>
            {(r.drawdown.currentBps / 100).toFixed(2)}%
          </b>
          <em>
            {tx("risk.alert")}{" "}
            {(WORLD_POLICY.drawdownAlertBps / 100).toFixed(0)}%
          </em>
        </div>
        <div className="kpi">
          <small>
            {tx("risk.credit")} · top{" "}
            {creditRemote ? `· ${tx("credit.api")}` : ""}
          </small>
          <b>
            #{creditTop?.flyId ?? "—"}{" "}
            {creditOfFly(creditTop || { credit: { usable: 0 } }).usable}
          </b>
          <em>{tx("risk.creditFormula")}</em>
        </div>
      </div>

      <div className="risk-grid">
        <section className="panel">
          <h2>{tx("risk.positions")}</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>FLY</th>
                <th>GEN</th>
                <th>{tx("risk.equity").toUpperCase()}</th>
                <th>{tx("risk.inventory").toUpperCase()}</th>
                <th>SHARE</th>
                <th>{tx("risk.credit").toUpperCase()}</th>
              </tr>
            </thead>
            <tbody>
              {r.positions.map((p) => {
                const credit = creditOfFly(p);
                return (
                  <tr
                    key={p.flyId}
                    className={p.status === "retired" ? "dim" : ""}
                  >
                    <td>#{p.flyId}</td>
                    <td>{p.gen}</td>
                    <td>{formatBnb(p.equity)}</td>
                    <td>{formatBnb(p.value)}</td>
                    <td>
                      <span className="share-cell">
                        <i
                          style={{
                            width: `${Math.min(100, p.shareBps / 100)}%`,
                          }}
                        />
                        {(p.shareBps / 100).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      {credit.usable}
                      {creditRemote && (
                        <small className="credit-api">API</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>{tx("risk.rejects")}</h2>
          <ul className="rejects">
            {r.rejects.map((rej, i) => (
              <li key={`${rej.tick}-${i}`}>
                <small>T{rej.tick}</small>
                <b>{rej.kind.toUpperCase()}</b>
                <em>
                  {rej.reasons
                    ? rej.reasons.join(" / ")
                    : `-${(rej.drawdownBps / 100).toFixed(0)}%`}
                </em>
              </li>
            ))}
            {!r.rejects.length && (
              <li className="empty-inline">{tx("risk.noRejects")}</li>
            )}
          </ul>
          <h2>{tx("risk.policy")}</h2>
          <ul className="policy-list">
            <li>
              <span>voteCapPerUtterance</span>
              <b>{policy.society.voteCapPerUtterance}</b>
            </li>
            <li>
              <span>voteCapPerRunner</span>
              <b>{policy.society.voteCapPerRunner}</b>
            </li>
            <li>
              <span>splitThresholdBps</span>
              <b>{policy.society.splitThresholdBps}</b>
            </li>
            <li>
              <span>concentrationCapBps</span>
              <b>{policy.world.concentrationCapBps}</b>
            </li>
            <li>
              <span>drawdownAlertBps</span>
              <b>{policy.world.drawdownAlertBps}</b>
            </li>
          </ul>
        </section>
      </div>
    </ViewShell>
  );
}

/* ---------- EXECUTION ---------- */

export function ExecutionView({ world, tx }) {
  const s = world.execution.stats;
  return (
    <ViewShell
      tx={tx}
      eyebrow={`EXECUTION · SLIP ${world.execution.slippageBps / 100}% · TAX ${world.execution.taxBps / 100}% · ${world.execution.quote === "LIVE" ? "QUOTE LIVE / FILL SIM" : "PAPER SIM"}`}
      title={tx("exec.title")}
      lead={
        world.execution.quote === "LIVE" ? tx("exec.leadLive") : tx("exec.lead")
      }
    >
      <div className="kpi-grid five">
        <div className="kpi">
          <small>{tx("exec.fills")}</small>
          <b>{s.fills}</b>
          <em>SIM</em>
        </div>
        <div className="kpi">
          <small>{tx("exec.buys")}</small>
          <b className="buy">{s.buys}</b>
          <em>{formatBnb(s.buyVol)} BNB</em>
        </div>
        <div className="kpi">
          <small>{tx("exec.sells")}</small>
          <b className="sell">{s.sells}</b>
          <em>{formatBnb(s.sellVol)} BNB</em>
        </div>
        <div className="kpi">
          <small>{tx("exec.taxIn")}</small>
          <b>{formatBnb(s.taxIn)}</b>
          <em>BNB</em>
        </div>
        <div className="kpi">
          <small>{tx("exec.flagged")}</small>
          <b className={s.flagged ? "neg" : ""}>{s.flagged}</b>
          <em>audit mark</em>
        </div>
      </div>
      <section className="panel">
        <h2>{tx("exec.receipts")}</h2>
        {world.execution.receipts.length ? (
          <table className="data-table receipts">
            <thead>
              <tr>
                <th>TICK</th>
                <th>FLY</th>
                <th>SIDE</th>
                <th>ASSET</th>
                <th>{tx("exec.notional").toUpperCase()}</th>
                <th>{tx("exec.slippage").toUpperCase()}</th>
                <th>{tx("exec.tax").toUpperCase()}</th>
                <th>{tx("exec.verdict").toUpperCase()}</th>
              </tr>
            </thead>
            <tbody>
              {world.execution.receipts.map((r) => (
                <tr
                  key={r.id}
                  className={r.verdict !== "PASS" ? "flagged" : ""}
                >
                  <td>{r.tick}</td>
                  <td>#{r.flyId}</td>
                  <td className={SIDE_CLASS(r.side)}>{r.side}</td>
                  <td>
                    {r.assetId || "—"}
                    {r.quote === "LIVE" ? (
                      <small className="quote-tag"> LIVE/SIM</small>
                    ) : null}
                  </td>
                  <td>{formatBnb(r.notionalBnb)}</td>
                  <td>{(r.slippageBps / 100).toFixed(1)}%</td>
                  <td>{formatBnb(r.taxPaid)}</td>
                  <td>
                    <span className={`verdict ${r.verdict.toLowerCase()}`}>
                      {r.verdict}
                      {r.verdictNote && <small>{r.verdictNote}</small>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-inline">{tx("exec.noReceipts")}</p>
        )}
      </section>
    </ViewShell>
  );
}

/* ---------- VAULT ---------- */

export function VaultView({ world, tx, vaultRemote, remote, onVaultAction }) {
  const v = world.vault;
  const h = v.hive;
  const [depositAmt, setDepositAmt] = useState("");
  const [exitShares, setExitShares] = useState("");
  const u = vaultRemote;
  const max = Math.max(
    1,
    ...v.history.map((row) => Math.max(row.nav, row.highWater)),
  );
  return (
    <ViewShell
      tx={tx}
      eyebrow={`VAULT · ${v.policy.feeBps / 100}% FEE · ${v.policy.vaultBps / 100}% VAULT`}
      title={tx("vault.title")}
      lead={tx("vault.lead")}
    >
      <div className="vault-grid">
        <section className="panel vault-user">
          {u ? (
            <>
              <h2>
                {tx("vault.api")} <small>{tx("credit.sim")}</small>
              </h2>
              <dl>
                <div>
                  <dt>{tx("risk.cash")}</dt>
                  <dd>{u.cash}</dd>
                </div>
                <div>
                  <dt>{tx("vault.shares")}</dt>
                  <dd>{u.shares}</dd>
                </div>
                <div>
                  <dt>{tx("risk.nav")}</dt>
                  <dd>{(u.nav / 1000000).toFixed(6)}</dd>
                </div>
                <div>
                  <dt>{tx("vault.highWater")}</dt>
                  <dd>{(u.highWater / 1000000).toFixed(6)}</dd>
                </div>
                <div>
                  <dt>{tx("vault.realizedPool")}</dt>
                  <dd>{u.realizedPool}</dd>
                </div>
                <div>
                  <dt>{tx("vault.feeRevenue")}</dt>
                  <dd>{u.feeRevenue}</dd>
                </div>
              </dl>
              <form
                className="credit-stake"
                onSubmit={(e) => {
                  e.preventDefault();
                  const amount = Number(depositAmt);
                  if (!Number.isSafeInteger(amount) || amount <= 0) return;
                  onVaultAction?.("deposit", { amount });
                  setDepositAmt("");
                }}
              >
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(e.target.value)}
                  placeholder={tx("credit.amount")}
                  aria-label={tx("vault.deposit")}
                />
                <button type="submit" disabled={!depositAmt}>
                  {tx("vault.deposit")}
                </button>
              </form>
              <form
                className="credit-stake"
                onSubmit={(e) => {
                  e.preventDefault();
                  const shares = Number(exitShares);
                  if (!Number.isSafeInteger(shares) || shares <= 0) return;
                  onVaultAction?.("exit", { shares });
                  setExitShares("");
                }}
              >
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={exitShares}
                  onChange={(e) => setExitShares(e.target.value)}
                  placeholder={tx("vault.exitShares")}
                  aria-label={tx("vault.exit")}
                />
                <button type="submit" disabled={!exitShares}>
                  {tx("vault.exit")}
                </button>
              </form>
              <div className="credit-stake-actions">
                <button onClick={() => onVaultAction?.("settle")}>
                  {tx("vault.settle")}
                </button>
              </div>
              <h2>{tx("vault.batches")}</h2>
              <ul className="credit-stakes">
                {u.batches.map((batch) => (
                  <li key={batch.id}>
                    <span>{batch.positionId}</span>
                    <b>{batch.shares}</b>
                    <em>
                      {batch.owner.slice(0, 14)}… · nav{" "}
                      {(batch.navAtEntry / 1000000).toFixed(4)} · {batch.status}
                    </em>
                  </li>
                ))}
              </ul>
              <h2>{tx("vault.exits")}</h2>
              <ul className="credit-stakes">
                {u.exits.map((exit) => (
                  <li key={exit.id}>
                    <span>{exit.id}</span>
                    <b>{exit.shares}</b>
                    <em>
                      {exit.status === "queued"
                        ? tx("vault.queued")
                        : `${tx("vault.done")} · ${exit.realized}`}
                    </em>
                  </li>
                ))}
                {!u.exits.length && (
                  <li className="empty-inline">{tx("vault.exitsEmpty")}</li>
                )}
              </ul>
              <p className="view-note">{tx("vault.note")}</p>
            </>
          ) : (
            <>
              <h2>{tx("vault.user")}</h2>
              <b className="off">{tx("vault.notConnected")}</b>
              <dl>
                <div>
                  <dt>{tx("risk.equity")}</dt>
                  <dd>0.0000</dd>
                </div>
                <div>
                  <dt>{tx("vault.shares")}</dt>
                  <dd>0</dd>
                </div>
              </dl>
              <h2>{tx("vault.exits")}</h2>
              <p className="empty-inline">{tx("vault.exitsEmpty")}</p>
              <p className="view-note">{tx("vault.note")}</p>
            </>
          )}
        </section>
        <section className="panel">
          <h2>{tx("vault.hive")}</h2>
          <div className="kpi-grid four">
            <div className="kpi">
              <small>{tx("risk.nav")}</small>
              <b>{formatBnb(h.nav)}</b>
              <em>BNB</em>
            </div>
            <div className="kpi">
              <small>{tx("vault.highWater")}</small>
              <b>{formatBnb(h.highWater)}</b>
              <em>BNB</em>
            </div>
            <div className="kpi">
              <small>{tx("vault.surplus")}</small>
              <b className={h.surplus > 0 ? "buy" : ""}>
                {formatBnb(h.surplus)}
              </b>
              <em>{tx("vault.realizedOnly")}</em>
            </div>
            <div className="kpi">
              <small>{tx("vault.buybackBudget")}</small>
              <b>{formatBnb(h.buybackBudget)}</b>
              <em>{tx("vault.notSpent")}</em>
            </div>
            <div className="kpi">
              <small>{tx("vault.realized")}</small>
              <b className={h.realized >= 0 ? "buy" : "neg"}>
                {formatBnb(h.realized)}
              </b>
              <em>BNB</em>
            </div>
            <div className="kpi">
              <small>{tx("vault.deposited")}</small>
              <b>{formatBnb(h.deposited)}</b>
              <em>BNB</em>
            </div>
            <div className="kpi">
              <small>{tx("vault.feesIn")}</small>
              <b>{formatBnb(h.feesIn)}</b>
              <em>BNB</em>
            </div>
            <div className="kpi">
              <small>{tx("vault.reserve")}</small>
              <b>{formatBnb(h.reserve)}</b>
              <em>BNB</em>
            </div>
          </div>
          <h2>{tx("vault.history")}</h2>
          <div className="nav-bars">
            {v.history.map((row) => (
              <span
                key={row.tick}
                className="nav-col"
                title={`T${row.tick} nav ${formatBnb(row.nav)}`}
              >
                <i
                  className="nav"
                  style={{ height: `${Math.max(3, (row.nav / max) * 72)}px` }}
                />
                <i
                  className="hw"
                  style={{
                    height: `${Math.max(3, (row.highWater / max) * 72)}px`,
                  }}
                />
              </span>
            ))}
          </div>
          <ul className="policy-list">
            <li>
              <span>feeBps</span>
              <b>{v.policy.feeBps}</b>
            </li>
            <li>
              <span>vaultBps / reserveBps</span>
              <b>
                {v.policy.vaultBps} / {v.policy.reserveBps}
              </b>
            </li>
            <li>
              <span>buybackBps</span>
              <b>{v.policy.buybackBps}</b>
            </li>
          </ul>
        </section>
      </div>

      {world.protocol && <ProtocolPanel protocol={world.protocol} tx={tx} />}
    </ViewShell>
  );
}

/* ---------- 协议自有资金（P4） ---------- */

function ProtocolPanel({ protocol, tx }) {
  const last = protocol.last;
  return (
    <section className="panel protocol-panel">
      <h2>
        {tx("proto.title")} <small>{tx("proto.sim")}</small>
        {protocol.halted && (
          <span className="halt-badge">{tx("proto.halted")}</span>
        )}
      </h2>
      <div className="kpi-grid four">
        <div className="kpi">
          <small>{tx("proto.revenue")}</small>
          <b>
            {formatBnb(
              protocol.revenue.perfFees +
                protocol.revenue.serviceFees +
                protocol.revenue.realizedPnl,
            )}
          </b>
          <em>
            {tx("proto.perfFees")} {formatBnb(protocol.revenue.perfFees)} ·{" "}
            {tx("proto.serviceFees")} {formatBnb(protocol.revenue.serviceFees)}
          </em>
        </div>
        <div className="kpi">
          <small>{tx("proto.costs")}</small>
          <b>{formatBnb(protocol.costs)}</b>
          <em>{tx("proto.costAccrual")}</em>
        </div>
        <div className="kpi">
          <small>{tx("proto.net")}</small>
          <b className={protocol.net >= 0 ? "buy" : "neg"}>
            {formatBnb(protocol.net)}
          </b>
          <em>
            {tx("proto.distributable")}{" "}
            {last ? formatBnb(last.distributable) : "0.0000"}
          </em>
        </div>
        <div className="kpi">
          <small>{tx("proto.buyback")}</small>
          <b className={protocol.buyback.eligible ? "buy" : ""}>
            {formatBnb(protocol.buyback.budget)}
          </b>
          <em>
            {protocol.buyback.eligible
              ? tx("proto.eligible")
              : `${tx("proto.blocked")}${
                  protocol.haltedReason ? ` · ${protocol.haltedReason}` : ""
                }`}
          </em>
        </div>
      </div>
      <div className="protocol-row">
        <ul className="policy-list protocol-alloc">
          <li>
            <span>{tx("proto.allocation")}</span>
            <b>
              {tx("proto.ifsBudget")} {protocol.allocation.ifsBudget}
            </b>
          </li>
          <li>
            <span>{tx("proto.reserve")}</span>
            <b>{protocol.reserve}</b>
          </li>
          <li>
            <span>{tx("proto.ownCapital")}</span>
            <b>{protocol.allocation.ownCapital}</b>
          </li>
          <li>
            <span>{tx("proto.stakeRewards")}</span>
            <b>{protocol.allocation.stakeRewards}</b>
          </li>
          <li>
            <span>{tx("proto.ecosystem")}</span>
            <b>{protocol.allocation.ecosystem}</b>
          </li>
        </ul>
        <div className="protocol-receipts">
          <small>{tx("proto.records")}</small>
          <ul>
            {protocol.records.map((record) => (
              <li key={record.id}>
                <span>T{record.tick}</span>
                <b>N {formatBnb(record.net)}</b>
                <em>
                  D {formatBnb(record.distributable)}
                  {record.halted ? ` · ${tx("proto.halted")}` : ""}
                </em>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- IFS ---------- */

export function IfsView({ world, tx, token, credit, remote, onCreditAction }) {
  const i = world.ifs;
  const [soulId, setSoulId] = useState("");
  const [amount, setAmount] = useState("");
  const aliveSouls = world.intents || [];
  const stakes = credit?.stakes || [];
  const policy = credit?.policy || null;
  const minStake = policy ? policy.bondedStakeMin : i.bondedStakeMin;

  function runStake(event) {
    event.preventDefault();
    const value = Number(amount);
    if (!soulId || !Number.isSafeInteger(value)) return;
    onCreditAction?.("stake", { soulId, amount: value });
    setAmount("");
  }

  return (
    <ViewShell
      tx={tx}
      eyebrow={`$IFS · ${token?.status === "live" ? tx("ifs.eyebrowLive") : tx("ifs.eyebrowPending")}`}
      title={tx("ifs.title")}
      lead={tx("ifs.lead")}
    >
      <div className="ifs-grid">
        <section className="panel">
          <h2>{tx("ifs.official")}</h2>
          {token ? (
            <dl className="token-facts">
              <div>
                <dt>{token.name}</dt>
                <dd>{token.symbol}</dd>
              </div>
              <div>
                <dt>{tx("ifs.chain")}</dt>
                <dd>BNB · {token.chainId}</dd>
              </div>
              <div>
                <dt>{tx("ifs.tax")}</dt>
                <dd>
                  {token.buyTaxBps / 100}% / {token.sellTaxBps / 100}%
                </dd>
              </div>
              {token.address && (
                <div className="wide">
                  <dt>{tx("public.ca")}</dt>
                  <dd>
                    <a
                      href={explorerToken(token.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {token.address}
                    </a>
                  </dd>
                </div>
              )}
              {token.vault ? (
                <div className="wide">
                  <dt>{tx("ifs.hive")}</dt>
                  <dd>
                    <a
                      href={explorerAddress(token.vault, token.chainId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {token.vault}
                    </a>
                  </dd>
                </div>
              ) : null}
              {token.ops ? (
                <div className="wide">
                  <dt>{tx("ifs.ops")}</dt>
                  <dd>
                    <a
                      href={explorerAddress(token.ops, token.chainId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {token.ops}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="empty-inline">{tx("public.tokenError")}</p>
          )}

          {remote && (
            <>
              <h2>
                {tx("credit.ledger")} <small>{tx("credit.sim")}</small>
              </h2>
              <ul className="credit-souls">
                {(credit?.souls || []).map((soul) => (
                  <li key={soul.soulId}>
                    <span>{soul.soulId}</span>
                    <b>{soul.usable}</b>
                    <em>
                      {tx("credit.free")} {soul.free} · {tx("risk.credit")}{" "}
                      {soul.capacity} · {tx("credit.dividends")}{" "}
                      {soul.dividends} · {tx("credit.rwaQuota")} {soul.rwaQuota}
                    </em>
                  </li>
                ))}
              </ul>
              <p className="view-note">{tx("credit.rwaHint")}</p>
              <form className="credit-stake" onSubmit={runStake}>
                <select
                  value={soulId}
                  onChange={(e) => setSoulId(e.target.value)}
                  aria-label={tx("credit.soul")}
                >
                  <option value="">{tx("credit.soul")}…</option>
                  {aliveSouls.map((row) => (
                    <option key={row.soulId} value={row.soulId}>
                      #{row.flyId} · {row.soulId}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={minStake}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`${tx("credit.amount")} ≥ ${minStake}`}
                  aria-label={tx("credit.amount")}
                />
                <button type="submit" disabled={!soulId || !amount}>
                  {tx("credit.stake")}
                </button>
              </form>
              <ul className="credit-stakes">
                {stakes.map((stake) => (
                  <li key={stake.id}>
                    <span>{stake.id}</span>
                    <b>{stake.amount}</b>
                    <em>
                      T{stake.lockedAt}→T{stake.unlockAt}
                      {stake.occupiedBy
                        ? ` · ${tx("credit.occupiedBy")} ${stake.occupiedBy.purpose}`
                        : ""}
                    </em>
                    <span className="credit-stake-actions">
                      {stake.occupiedBy ? (
                        <button
                          onClick={() =>
                            onCreditAction?.("release", { stakeId: stake.id })
                          }
                        >
                          {tx("credit.release")}
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            onCreditAction?.("occupy", {
                              stakeId: stake.id,
                              purpose: "service",
                            })
                          }
                        >
                          {tx("credit.occupy")}
                        </button>
                      )}
                      <button
                        disabled={stake.occupiedBy}
                        onClick={() =>
                          onCreditAction?.("unstake", { stakeId: stake.id })
                        }
                      >
                        {tx("credit.unstake")}
                      </button>
                    </span>
                  </li>
                ))}
                {!stakes.length && (
                  <li className="empty-inline">{tx("credit.noStakes")}</li>
                )}
              </ul>
            </>
          )}
        </section>
        <section className="panel">
          <h2>{tx("ifs.paper")}</h2>
          <div className="ifs-panels">
            <div className="ifs-panel off">
              <b>{tx("ifs.buy")}</b>
              <p>{tx("ifs.buyNote")}</p>
            </div>
            <div className="ifs-panel">
              <b>{tx("ifs.lock")}</b>
              <p>
                {tx("ifs.lockNote", {
                  min: i.bondedStakeMin,
                  ticks: i.bondedUnlockTicks,
                })}
              </p>
              <code>
                {remote
                  ? `${tx("credit.stakes")} ${stakes.length} · ${tx("credit.api")}`
                  : `locked ${i.paperLocked}`}
              </code>
            </div>
            <div className="ifs-panel">
              <b>{tx("ifs.collateral")}</b>
              <p>{tx("ifs.collateralNote")}</p>
              <code>
                {remote
                  ? `${tx("credit.occupiedBy")} ${stakes.filter((s) => s.occupiedBy).length}`
                  : `occupied ${i.paperLocked}`}
              </code>
            </div>
            <div className="ifs-panel">
              <b>{tx("ifs.fees")}</b>
              <p>{tx("ifs.feesNote")}</p>
              <code>{formatBnb(i.venueFeesIn)} BNB</code>
            </div>
            <div className="ifs-panel">
              <b>{tx("ifs.budget")}</b>
              <p>{tx("ifs.budgetNote")}</p>
              <code>{formatBnb(i.buyback.budget)} BNB</code>
            </div>
            <div className={`ifs-panel ${i.buyback.triggered ? "on" : "off"}`}>
              <b>{tx("ifs.buyback")}</b>
              <p>
                {i.buyback.triggered
                  ? tx("ifs.buybackReady")
                  : tx("ifs.buybackIdle")}
              </p>
              <code>spent {formatBnb(i.buyback.spent)} BNB</code>
            </div>
          </div>
          <p className="view-note">{tx("ifs.notBurn")}</p>
        </section>
      </div>
    </ViewShell>
  );
}

/* ---------- LLM 解释抽屉 ---------- */

const DRAWER_TABS = [
  ["explain", "explain.tab.explain"],
  ["retrieve", "explain.tab.retrieve"],
  ["plans", "explain.tab.plans"],
  ["tools", "explain.tab.tools"],
  ["validate", "explain.tab.validate"],
];

export function ExplainDrawer({
  open,
  onClose,
  sessionRef,
  tx,
  flyId,
  remote,
  locale,
}) {
  const [tab, setTab] = useState("explain");
  const [kind, setKind] = useState("all");
  const [remoteData, setRemoteData] = useState(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const session = sessionRef.current;
  const world = session?.world ? session.world : null;
  const kernel = session?.kernel || null;
  const target = kernel
    ? kernel.colony.members.find((m) => m.id === flyId) ||
      kernel.colony.members.find((m) => m.status === "alive")
    : null;

  const explanation = useMemo(
    () => (session && target ? explainFly(session, target.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, target?.id],
  );
  const hits = useMemo(
    () => (world && kind !== "all" ? retrieveEvents(world, { kind }) : []),
    [world, kind],
  );

  // 远端解释：API + LLM 可用时拉取叙述；任何失败静默回落本地确定性解释。
  React.useEffect(() => {
    if (!open || !remote || !target) {
      setRemoteData(null);
      return undefined;
    }
    let cancelled = false;
    setRemoteLoading(true);
    iffApi
      .explain(remote.ownerToken, {
        sessionId: remote.sessionId,
        flyId: target.id,
        locale,
      })
      .then((data) => {
        if (!cancelled) setRemoteData(data);
      })
      .catch(() => {
        if (!cancelled) setRemoteData(null);
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, remote, target?.id, locale]);

  React.useEffect(() => {
    if (!open || !remote) return undefined;
    let cancelled = false;
    setRemoteLoading(true);
    iffApi
      .plan(remote.ownerToken, { sessionId: remote.sessionId })
      .then((data) => {
        if (!cancelled) setRemoteData((prev) => ({ ...prev, plan: data }));
      })
      .catch(() => {
        if (!cancelled) setRemoteData((prev) => ({ ...prev, plan: null }));
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, remote]);

  React.useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="explain-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={tx("explain.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <Eyebrow>
              {remote
                ? `${tx("explain.remote").toUpperCase()} · ${remoteData?.explainer?.modelId || "API"}`
                : `${EXPLAINER.provider.toUpperCase()} · ${EXPLAINER.modelId}`}
            </Eyebrow>
            <h2>{tx("explain.title")}</h2>
            <p className="degraded">
              {remote && !remoteData?.explainer?.degraded
                ? `${tx("explain.remote")} · LLM`
                : tx("explain.degraded")}
            </p>
          </div>
          <button
            className="drawer-close"
            onClick={onClose}
            aria-label={tx("view.explainClose")}
          >
            <X size={16} />
          </button>
        </header>
        <nav className="drawer-tabs">
          {DRAWER_TABS.map(([id, key]) => (
            <button
              key={id}
              className={tab === id ? "on" : ""}
              onClick={() => setTab(id)}
            >
              {tx(key)}
            </button>
          ))}
        </nav>
        <div className="drawer-body">
          {tab === "explain" && (
            <div className="explain-steps">
              {target && explanation ? (
                <>
                  <h3>{tx("explain.flyLabel", { id: target.id })}</h3>
                  {remoteLoading && (
                    <p className="view-note">{tx("ask.sending")}</p>
                  )}
                  {remoteData?.narrative && (
                    <div className="explain-step narrative-step">
                      <small>
                        {tx("explain.narrative")} ·{" "}
                        {remoteData.explainer?.modelId}
                      </small>
                      <p>{remoteData.narrative}</p>
                    </div>
                  )}
                  {(remoteData?.steps || explanation.steps).map((step, i) => (
                    <div className="explain-step" key={i}>
                      <small>T{step.tick ?? target.session.state.ticks}</small>
                      <p>{tx(step.key, step.params)}</p>
                      {step.refs.length > 0 && (
                        <code>
                          {tx("explain.refs")}: {step.refs.join(" · ")}
                        </code>
                      )}
                    </div>
                  ))}
                </>
              ) : (
                <p className="empty-inline">
                  {tx("explain.unknown", { id: flyId ?? "—" })}
                </p>
              )}
            </div>
          )}
          {tab === "retrieve" && (
            <div className="retrieve">
              <p className="view-note">{tx("explain.retrieveHint")}</p>
              <div className="kind-filter">
                {["all", ...WORLD_POLICY.kinds].map((k) => (
                  <button
                    key={k}
                    className={kind === k ? "on" : ""}
                    onClick={() => setKind(k)}
                  >
                    {k === "all" ? tx("explain.all") : k.toUpperCase()}
                  </button>
                ))}
              </div>
              <ul className="retrieve-list">
                {hits.map(({ event }) => (
                  <li key={event.id}>
                    <EventMark event={event} tx={tx} />
                    <code>{event.id}</code>
                  </li>
                ))}
                {kind !== "all" && !hits.length && (
                  <li className="empty-inline">{tx("explain.noHits")}</li>
                )}
              </ul>
            </div>
          )}
          {tab === "plans" && (
            <div className="plans-wrap">
              {remote && remoteData?.plan?.narrative && (
                <div className="explain-step narrative-step">
                  <small>{tx("explain.narrative")}</small>
                  <p>{remoteData.plan.narrative}</p>
                </div>
              )}
              <ul className="plan-list">
                {(remoteData?.plan?.plans || world?.plans || []).map((plan) => (
                  <li key={plan.id} className={plan.status.toLowerCase()}>
                    <header>
                      <b>{plan.status}</b>
                      <span>
                        {plan.kind.toUpperCase()} · {plan.side}
                      </span>
                      <em>
                        {tx("explain.plan.by")}{" "}
                        {plan.source === "quorum"
                          ? tx("explain.plan.quorum")
                          : tx("explain.plan.utterance")}
                        {plan.flyId != null ? ` #${plan.flyId}` : ""}
                      </em>
                    </header>
                    <dl>
                      <div>
                        <dt>{tx("explain.plan.budget")}</dt>
                        <dd>
                          {plan.side === "SELL"
                            ? formatToken(plan.budget)
                            : formatBnb(plan.budget)}
                        </dd>
                      </div>
                      <div>
                        <dt>{tx("explain.plan.confidence")}</dt>
                        <dd>{plan.confidence}</dd>
                      </div>
                    </dl>
                    {plan.reasons?.length > 0 && (
                      <code>{plan.reasons.join(" / ")}</code>
                    )}
                  </li>
                ))}
                {!(remoteData?.plan?.plans || world?.plans)?.length && (
                  <li className="empty-inline">{tx("explain.noHits")}</li>
                )}
              </ul>
            </div>
          )}
          {tab === "tools" && (
            <ul className="tool-list">
              {TOOL_WHITELIST.map((tool) => (
                <li key={tool.id}>
                  <b>{tx(tool.titleKey)}</b>
                  <p>{tx(tool.scopeKey)}</p>
                  <code>
                    {tool.id}@{tool.version} · {tx("explain.tool.sign")}{" "}
                    {tx("explain.tool.no")} · {tx("explain.tool.write")}{" "}
                    {tx("explain.tool.no")} · {tx("explain.tool.budget")}{" "}
                    {tool.budget
                      ? tool.budget.toString().toUpperCase()
                      : tx("explain.tool.no")}
                  </code>
                </li>
              ))}
            </ul>
          )}
          {tab === "validate" && (
            <div className="validate">
              <p className="view-note">{tx("explain.validate.hint")}</p>
              <h3>{tx("explain.validate.param")}</h3>
              <ul className="policy-list">
                {Object.entries(policyCard().society).map(([key, value]) => (
                  <li key={key}>
                    <span>{key}</span>
                    <b>{value}</b>
                  </li>
                ))}
                {Object.entries(policyCard().world).map(([key, value]) => (
                  <li key={key}>
                    <span>{key}</span>
                    <b>{value}</b>
                  </li>
                ))}
                {Object.entries(policyCard().treasury).map(([key, value]) => (
                  <li key={key}>
                    <span>{key}</span>
                    <b>{value}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <footer className="drawer-foot">
          {tx("explain.degraded")} · AUDIT SIM
        </footer>
      </aside>
    </div>
  );
}
