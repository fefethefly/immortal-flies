import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play, ScanLine } from "lucide-react";
import { formatBnb, formatPrice, layerFires, summarize } from "./swarm.mjs";
import { colonyPosition } from "./observatory-art.mjs";
import { createObservatoryRenderer } from "./observatory-renderer.mjs";
import { SiteLink } from "./site-chrome.jsx";
import { phenotypeOf } from "./brain/flyswarm/phenotype.mjs";
import { PhenotypeReadout } from "./phenotype-view.jsx";
import "./home-observatory.css";

const LIFE_CHIPS = ["L0", "Soul", "Genome", "Society"];

const MODES = ["neural", "society", "market"];
const COLORS = { neural: "#a9c4bb", society: "#c9a25e", market: "#93a181" };
const words = {
  zh: {
    eyebrow: "永生果蝇 · 数字生命观测站",
    title: "微小生命。",
    accent: "无限世界。",
    lead: "从一束神经信号，到一个自主协作的蝇群社会。观察它们感知、学习与交易，让每一次经历成为下一次进化的起点。",
    enter: "进入交易世界",
    canon: "探索生命内核",
    modes: ["神经活动", "蝇群社会", "市场脉冲"],
    auto: "自动巡览",
    pause: "暂停模拟",
    resume: "继续模拟",
    status: "本地模拟运行中",
    frozen: "模拟已暂停",
    alive: "活跃个体",
    active: "当前脉冲",
    generations: "谱系事件",
    ticks: "模拟时钟",
    sensory: "神经脉冲",
    society: "群体行为",
    memory: "生命谱系",
    market: "模拟市场",
    capital: "群体账本",
    economy: "IFS 经济层",
    inspect: "选择外围节点，追踪一只果蝇",
    schematic: "长相由基因组决定 · 不是随机皮肤",
    annotation: "粒子组成身体外形。体色、眼型、体型、条纹由出生种子固定算出。",
    genome: "基因组决定的长相",
    genomeClaim: "长相由基因组决定，不是另外贴上去的皮肤。",
    genomeNote:
      "64 个方格是基因组格子，由出生种子展开。它们不是神经元，也不是 MaleCNS 的连接权重。",
    genomeMint: "铸造提交的是基因组。解码器以后上线，已经铸造的灵魂也会长出对应长相。",
    notSkin: "不看叠加层、盈亏或 IFS。休眠只改变辉光。",
    price: "模拟价格 / BNB",
    cash: "纸面现金",
    fills: "保留成交",
    observed: "当前观察",
    waiting: "等待首次成交",
    lineageWait: "尚无代际事件，个体继续积累经历。",
    credit: "自主算力",
    vault: "金库与结算",
    planned: "MESH / SIM",
    vaultState: "待接入",
    token: "了解 $IFS",
    economyNote: "交易是第一个小世界。IFS 连接更广阔的经济层。",
    signal: "神经脉冲 → 行为解码 → 模拟成交",
    latest: "最近模拟成交",
    birth: "代际记录",
    all: "个体名册",
    stage: "聚焦视图",
  },
  en: {
    eyebrow: "IMMORTAL FLIES / DIGITAL LIFE OBSERVATORY",
    title: "Small lives.",
    accent: "Infinite worlds.",
    lead: "From a neural spark to a society of autonomous agents. Watch them sense, learn and trade. Every experience becomes the beginning of what comes next.",
    enter: "Enter trading world",
    canon: "Explore the life core",
    modes: ["Neural activity", "Colony behavior", "Market pulse"],
    auto: "Auto tour",
    pause: "Pause simulation",
    resume: "Resume simulation",
    status: "LOCAL SIMULATION",
    frozen: "SIMULATION PAUSED",
    alive: "Living agents",
    active: "Active spikes",
    generations: "Lineage events",
    ticks: "Simulation tick",
    sensory: "Neural activity",
    society: "Colony behavior",
    memory: "Life continuity",
    market: "Paper market",
    capital: "Colony book",
    economy: "IFS economy",
    inspect: "Select a satellite to follow its life",
    schematic: "PHENOTYPE IS A GENOME READOUT / NOT A SKIN",
    annotation:
      "Particle geometry is form. Colour, eyes, size and stripes are a deterministic readout of the birth seed.",
    genome: "Genome readout",
    genomeClaim: "Looks are a readout of the genome, not a separately minted skin.",
    genomeNote:
      "The 64 squares are genome chips expanded from the birth seed. They are not neurons, and not MaleCNS weights.",
    genomeMint:
      "Mint commits the genome. A later decoder can express every existing soul.",
    notSkin: "Overlay, PnL and IFS never paint the body. Sleep only changes the glow.",
    price: "SIM PRICE / BNB",
    cash: "Paper cash",
    fills: "Retained fills",
    observed: "OBSERVING",
    waiting: "Awaiting the first fill",
    lineageWait:
      "No lineage events yet. Life continues to accumulate experience.",
    credit: "Autonomous compute",
    vault: "Vault & settlement",
    planned: "MESH / SIM",
    vaultState: "PLANNED",
    token: "Explore $IFS",
    economyNote:
      "Trading is the first small world. IFS connects the economy beyond it.",
    signal: "NEURAL SPIKES → BEHAVIOR → PAPER FILLS",
    latest: "LATEST PAPER FILL",
    birth: "LINEAGE RECORD",
    all: "Agent roster",
    stage: "Focus view",
  },
};

function Sparkline({ values, color = "currentColor" }) {
  const data = values.slice(-60);
  if (data.length < 2) return <div className="obs-chart-empty">—</div>;
  const low = Math.min(...data),
    span = Math.max(1, Math.max(...data) - low);
  const points = data
    .map(
      (n, i) =>
        `${(i / (data.length - 1)) * 240},${58 - ((n - low) / span) * 48}`,
    )
    .join(" ");
  return (
    <svg className="obs-spark" viewBox="0 0 240 66" aria-hidden="true">
      <path
        d="M0 16H240M0 36H240M0 58H240"
        stroke="currentColor"
        opacity=".12"
        fill="none"
      />
      <polygon points={`0,66 ${points} 240,66`} fill={color} opacity=".07" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        className="obs-chart-flow"
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray="12 85"
        pathLength="100"
      />
    </svg>
  );
}

function FlyHologram({ swarm, selectedId, mode, paused }) {
  const canvas = useRef(null),
    latest = useRef({ swarm, selectedId, mode, paused }),
    renderer = useRef(null);
  latest.current = { swarm, selectedId, mode, paused };
  useEffect(() => {
    const instance = createObservatoryRenderer(
      canvas.current,
      () => latest.current,
    );
    renderer.current = instance;
    return () => {
      instance.destroy();
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    renderer.current?.schedule();
  }, [swarm, selectedId, mode, paused]);
  return <canvas ref={canvas} className="obs-canvas" aria-hidden="true" />;
}

function Panel({
  number,
  title,
  active,
  children,
  activity,
  paused,
  className = "",
}) {
  const panel = useRef(null),
    flare = useRef(null),
    scan = useRef(null),
    previous = useRef(activity);
  useEffect(() => {
    const changed = previous.current !== activity;
    previous.current = activity;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    if (!changed || paused || media.matches || document.hidden) return;
    const box = panel.current.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight) return;
    const animations = [
      flare.current.animate(
        [{ opacity: 0.85 }, { opacity: 0.24, offset: 0.3 }, { opacity: 0 }],
        { duration: 650, easing: "ease-out" },
      ),
      scan.current.animate(
        [
          { transform: "translateX(-110%)", opacity: 0 },
          { opacity: 0.55, offset: 0.25 },
          { transform: "translateX(110%)", opacity: 0 },
        ],
        { duration: 600, easing: "ease-out" },
      ),
      panel.current.animate(
        [
          {
            borderColor: "var(--obs-accent)",
            boxShadow:
              "0 0 28px color-mix(in srgb, var(--obs-accent) 25%, transparent), inset 0 0 22px color-mix(in srgb, var(--obs-accent) 12%, transparent)",
          },
          { borderColor: "#2f2a1f", boxShadow: "0 0 0 transparent" },
        ],
        { duration: 680, easing: "ease-out" },
      ),
    ];
    const cancel = () => animations.forEach((animation) => animation.cancel());
    media.addEventListener("change", cancel);
    return () => {
      cancel();
      media.removeEventListener("change", cancel);
    };
  }, [activity, paused]);
  return (
    <section
      ref={panel}
      className={`obs-panel ${active ? "is-lit" : ""} ${className}`}
    >
      <div className="obs-panel-fx" aria-hidden="true">
        <i ref={flare} className="obs-panel-flare" />
        <i ref={scan} className="obs-panel-scan" />
      </div>
      <header>
        <span>
          <i />
          {title}
        </span>
        <small>{number}</small>
      </header>
      {children}
    </section>
  );
}

export function HomeObservatory({
  swarm,
  selectedId,
  onSelect,
  locale,
  paused,
  onPause,
}) {
  const consoleRef = useRef(null);
  useEffect(() => {
    const node = consoleRef.current;
    let visible = true;
    const sync = () => {
      node.dataset.visible = String(visible && !document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const w = words[locale] || words.en;
  const [manual, setManual] = useState(null);
  const mode = manual || MODES[Math.floor(swarm.tick / 9) % MODES.length];
  const stats = summarize(swarm),
    fly = swarm.flies.find((f) => f.id === selectedId) || swarm.flies[0];
  const pheno = fly ? phenotypeOf(fly) : null;
  const living = swarm.flies.filter((f) => f.status === "alive");
  const layers = layerFires(fly?.brain?.spikes || 0),
    spikes = layers.reduce((n, l) => n + l.count, 0);
  const counts = ["BUY", "HOLD", "SELL"].map(
    (side) => living.filter((f) => f.lastSide === side).length,
  );
  const last = swarm.trades[0];
  const recentPrices = swarm.prices.slice(-60),
    first = recentPrices[0] || swarm.market.price;
  const change = (swarm.market.price / first - 1) * 100;
  return (
    <section
      className="observatory"
      style={{ "--obs-accent": COLORS[mode] }}
      aria-label={w.eyebrow}
    >
      <div className="obs-intro">
        <div>
          <p className="obs-eyebrow">
            <span />
            {w.eyebrow}
          </p>
          <h1>
            {w.title} <em>{w.accent}</em>
          </h1>
          <ul className="obs-chips" aria-hidden="true">
            {LIFE_CHIPS.map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        </div>
        <div className="obs-intro-side">
          <p>{w.lead}</p>
          <div className="obs-actions">
            <SiteLink className="obs-enter" href="/swarm.html">
              {w.enter}
              <ArrowUpRight size={15} />
            </SiteLink>
            <SiteLink href="/brain.html">
              {w.canon}
              <ArrowUpRight size={14} />
            </SiteLink>
          </div>
        </div>
      </div>
      <div
        ref={consoleRef}
        className="obs-console"
        data-mode={mode}
        data-paused={paused}
      >
        <header className="obs-topbar">
          <div className="obs-system">
            <i className={paused ? "" : "is-live"} />
            <b>THE LIVING NETWORK</b>
            <span>{paused ? w.frozen : w.status}</span>
          </div>
          <div className="obs-top-stats">
            <span>
              {w.alive}
              <b>{String(stats.alive).padStart(2, "0")}</b>
            </span>
            <span>
              {w.active}
              <b>
                {spikes}
                <small>/24</small>
              </b>
            </span>
            <span>
              {w.generations}
              <b>{swarm.lineage.length}</b>
            </span>
            <span>
              {w.ticks}
              <b data-testid="obs-tick">
                {String(swarm.tick).padStart(6, "0")}
              </b>
            </span>
          </div>
        </header>
        <div className="obs-toolbar">
          <div className="obs-tabs" role="group" aria-label={w.stage}>
            {MODES.map((key, i) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setManual(key)}
              >
                <span>0{i + 1}</span>
                {w.modes[i]}
              </button>
            ))}
          </div>
          <div className="obs-tools">
            <button
              type="button"
              aria-pressed={manual === null}
              onClick={() => setManual(null)}
            >
              <ScanLine size={13} />
              {w.auto}
            </button>
            <button
              type="button"
              onClick={onPause}
              aria-label={paused ? w.resume : w.pause}
              title={paused ? w.resume : w.pause}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          </div>
        </div>
        <div className="obs-body">
          <div className="obs-rail obs-left">
            <Panel
              number="01 / SENSE"
              activity={`${fly?.id}:${fly?.brain?.spikes}`}
              paused={paused}
              title={w.sensory}
              active={mode === "neural"}
            >
              <div className="obs-reading">
                <strong>
                  {String(spikes).padStart(2, "0")}
                  <small> / 24</small>
                </strong>
                <span>
                  SPIKES
                  <br />#{String(fly?.id ?? 0).padStart(4, "0")}
                </span>
              </div>
              <div className="obs-neurons" aria-label={`${spikes}/24`}>
                {Array.from({ length: 24 }, (_, i) => (
                  <i
                    key={i}
                    className={(fly?.brain?.spikes >>> i) & 1 ? "on" : ""}
                  />
                ))}
              </div>
              <div className="obs-layers">
                {layers.map((l) => (
                  <div key={l.id}>
                    <span>{l.label}</span>
                    <i>
                      <b style={{ width: `${(l.count / l.size) * 100}%` }} />
                    </i>
                    <small>
                      {l.count}/{l.size}
                    </small>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel
              number="02 / SOCIETY"
              activity={`${stats.alive}:${counts.join(":")}`}
              paused={paused}
              title={w.society}
              active={mode === "society"}
            >
              <div className="obs-society-bars">
                {["BUY", "HOLD", "SELL"].map((side, i) => (
                  <div key={side} className={side.toLowerCase()}>
                    <span>{side}</span>
                    <i>
                      <b
                        style={{
                          width: `${(counts[i] / Math.max(1, living.length)) * 100}%`,
                        }}
                      />
                    </i>
                    <strong>{counts[i]}</strong>
                  </div>
                ))}
              </div>
              <p className="obs-panel-caption">
                {w.alive} <b>{stats.alive}</b> / {stats.total}
              </p>
            </Panel>
            <Panel
              number="03 / CONTINUITY"
              activity={`${swarm.lineage.length}:${swarm.lineage[0]?.tick}`}
              paused={paused}
              title={w.memory}
              active={mode === "society"}
            >
              <div className="obs-lineage">
                {swarm.lineage.length ? (
                  swarm.lineage.slice(0, 3).map((row, i) => (
                    <div key={i}>
                      <i />
                      <span>
                        {w.birth} {swarm.lineage.length - i}
                      </span>
                      <code>T{row.tick}</code>
                    </div>
                  ))
                ) : (
                  <p>{w.lineageWait}</p>
                )}
              </div>
              <SiteLink className="obs-panel-link" href="/brain.html">
                SOUL → MEMORY → BRANCH <ArrowUpRight size={12} />
              </SiteLink>
            </Panel>
          </div>
          <div className="obs-stage">
            <div className="obs-stage-top">
              <span>SPECIMEN / DROSOPHILA</span>
              <span>HOLOGRAPHIC VIEW</span>
            </div>
            <div className="obs-space">
              <FlyHologram
                swarm={swarm}
                selectedId={selectedId}
                mode={mode}
                paused={paused}
              />
              <div
                className={`obs-satellites ${living.length > 12 ? "is-dense" : ""}`}
                role="group"
                aria-label={w.all}
              >
                {living.map((f, i) => {
                  const p = colonyPosition(i, living.length);
                  const look = phenotypeOf(f);
                  return (
                    <button
                      type="button"
                      key={f.id}
                      className={`obs-node ${f.id === selectedId ? "selected" : ""} ${f.lastSide.toLowerCase()}`}
                      style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        "--pheno": look.art.body,
                      }}
                      aria-label={`Fly ${f.id} · ${look.summary[locale === "zh" ? "zh" : "en"]}`}
                      aria-pressed={f.id === selectedId}
                      onClick={() => onSelect(f.id)}
                    >
                      <i />
                      <span>#{String(f.id).padStart(3, "0")}</span>
                      <small>{look.hue[locale === "zh" ? "zh" : "en"]}</small>
                    </button>
                  );
                })}
              </div>
              <div className="obs-specimen-label">
                <span>
                  {w.observed} / #{String(fly?.id ?? 0).padStart(4, "0")}
                </span>
                <strong>
                  {pheno ? pheno.hue[locale === "zh" ? "zh" : "en"].toUpperCase() : "IMMORTAL"}
                  <span> / </span>
                  FLY
                </strong>
                <small>{pheno ? pheno.summary[locale === "zh" ? "zh" : "en"] : w.schematic}</small>
              </div>
            </div>
            <div className="obs-stage-bottom">
              <span>
                <i />
                {w.inspect}
              </span>
              <span>LOCAL / SIM</span>
            </div>
          </div>
          <div className="obs-rail obs-right">
            <Panel
              number="04 / MARKET"
              activity={swarm.market.price}
              paused={paused}
              title={w.market}
              active={mode === "market"}
            >
              <div className="obs-price">
                <span>{w.price}</span>
                <strong>{formatPrice(swarm.market.price)}</strong>
                <small className={change < 0 ? "sell" : "buy"}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%{" "}
                  <span>/ {recentPrices.length} TICKS</span>
                </small>
              </div>
              <Sparkline values={swarm.prices} />
            </Panel>
            <Panel
              number="05 / PAPER BOOK"
              activity={`${stats.bnb}:${last?.tick}:${last?.flyId}`}
              paused={paused}
              title={w.capital}
              active={mode === "market"}
            >
              <div className="obs-book">
                <span>{w.cash}</span>
                <strong>
                  {formatBnb(stats.bnb)} <small>BNB</small>
                </strong>
              </div>
              <div className="obs-book-footer">
                <span>
                  {w.fills}
                  <b>{stats.trades}</b>
                </span>
                <span className="buy">
                  BUY <b>{stats.buys}</b>
                </span>
                <span className="sell">
                  SELL <b>{stats.sells}</b>
                </span>
              </div>
              <p className="obs-fill">
                {last
                  ? `T${last.tick} / #${last.flyId} / ${last.side}`
                  : w.waiting}
              </p>
            </Panel>
            <Panel
              number="06 / ECONOMY"
              paused={paused}
              title={w.economy}
              active={false}
              className="obs-economy"
            >
              <div className="obs-ifs">
                <span>◎</span>
                <strong>$IFS</strong>
                <small>ECONOMIC LAYER</small>
              </div>
              <div className="obs-planned">
                <span>{w.credit}</span>
                <small>{w.planned}</small>
              </div>
              <div className="obs-planned">
                <span>{w.vault}</span>
                <small>{w.vaultState}</small>
              </div>
              <SiteLink className="obs-panel-link" href="/economy.html">
                {w.token}
                <ArrowUpRight size={12} />
              </SiteLink>
            </Panel>
          </div>
        </div>
        <footer className="obs-ticker">
          <span className="obs-ticker-label">SIGNAL / FEED</span>
          <span>{w.signal}</span>
          <span>
            {last
              ? `${w.latest} · #${last.flyId} ${last.side} · T${last.tick}`
              : w.waiting}
          </span>
          <b>SIM ONLY</b>
        </footer>
      </div>
      <div className="obs-caption">
        <span>{w.annotation}</span>
        <span>01 — LOOKS ARE A READOUT OF THE GENOME.</span>
      </div>
      <aside className="obs-genome" aria-label={w.genome}>
        <PhenotypeReadout
          fly={fly}
          locale={locale}
          compact
          caption={w.genomeClaim}
          note={w.genomeNote}
        />
        <div className="obs-genome-copy">
          <p>{w.genomeMint}</p>
          <p>{w.notSkin}</p>
          <SiteLink href="/blueprint.html">
            {locale === "zh" ? "蓝图里的身份规则" : "Identity rules on the blueprint"}
            <ArrowUpRight size={12} />
          </SiteLink>
        </div>
      </aside>
    </section>
  );
}
