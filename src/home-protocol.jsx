import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { SiteLink } from "./site-chrome.jsx";
import { createHeroWebGL } from "./hero-webgl.mjs";
import "./home-protocol.css";

export function ProtocolVisual({ locale, paused, onPause, onStimulus }) {
  const [stimuli, setStimuli] = useState(0);
  const [state, setState] = useState("loading");
  const canvas = useRef(null);
  const engine = useRef(null);
  const read = useRef(() => ({ paused }));
  read.current = () => ({ paused });
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let instance;
    try {
      instance = createHeroWebGL(node, () => read.current(), () =>
        setState("fallback"),
      );
    } catch {
      setState("fallback");
      return;
    }
    setState("live");
    engine.current = instance;
    instance.sync();
    return () => {
      instance?.destroy();
      engine.current = null;
    };
  }, []);
  useEffect(() => {
    engine.current?.sync();
  }, [paused]);
  const stimulate = () => {
    if (!engine.current?.stimulate()) return;
    setStimuli(n => n + 1);
    onStimulus?.();
  };
  const zh = locale === "zh";
  return (
    <div className={`protocol-visual ${paused ? "is-paused" : ""}`}>
      <div className="protocol-visual-bar">
        <span>
          {zh ? "WEBGL / 行为可视化演示" : "WEBGL / BEHAVIOR VISUALIZATION"}
        </span>
        <button
          onClick={onPause}
          aria-label={
            paused
              ? zh
                ? "继续模拟与动效"
                : "Resume simulation and motion"
              : zh
                ? "暂停模拟与动效"
                : "Pause simulation and motion"
          }
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
      </div>
      <div className={`protocol-scene ${state}`} data-stimuli={stimuli}>
        {state === "fallback" ? (
          <img
            src="/mark/ifs.png?v=thorax"
            width="1024"
            height="1024"
            alt={
              zh
                ? "骨白点云果蝇，金色双翼与红色复眼，美术示意"
                : "Illustrative point-cloud fruit fly with gold wings and red compound eyes"
            }
          />
        ) : (
          <canvas
            ref={canvas}
            className="protocol-canvas"
            onClick={stimulate}
            aria-label={
              zh
                ? "粒子果蝇实验场，点击触发刺激演示"
                : "Particle fly experiment stage; click to trigger a stimulus demo"
            }
            role="img"
          />
        )}
        <span className="protocol-specimen-tag">
          DROSOPHILA / NEURAL CORE
          <br />
          <b>
            {state === "fallback"
              ? zh
                ? "静态视图"
                : "Static view"
              : zh
                ? "点击画面触发刺激演示"
                : "Click to trigger a stimulus demo"}
          </b>
        </span>
        {state === "loading" ? (
          <p className="protocol-scene-status" role="status">
            {zh ? "正在载入粒子场景…" : "Loading particle scene…"}
          </p>
        ) : null}
      </div>
      <div className="webgl-controls">
        <button onClick={stimulate} disabled={paused || state !== "live"}>{zh ? "注入视觉刺激" : "Send visual stimulus"} ↗</button>
        <span>{zh ? "美术粒子 / 示意信号，不是生物放电数据" : "Art particles / illustrative signals, not biological recordings"}</span>
      </div>
    </div>
  );
}

const layers = [
  [
    "L0",
    "Life core",
    "生命内核",
    "Identity persists. State can be replayed.",
    "身份延续，状态可重放。",
    "Soul · Genome · Session · Replay",
    "/brain.html",
  ],
  [
    "L1",
    "Agent society",
    "生命社会",
    "Independent lives. A shared behavioral language.",
    "独立经历，共同的行为语言。",
    "SENSE · ACT · MEMORY · PROPOSE",
    "/swarm.html",
  ],
  [
    "L2",
    "Open worlds",
    "开放世界",
    "Different tasks. The same accountable lives.",
    "不同任务，同一个可追溯的生命。",
    "World · Task · Port · Policy",
    "/blueprint.html",
  ],
  [
    "L3",
    "Agent economy",
    "智能体经济",
    "Tools expand capability. Rules bound authority.",
    "工具扩展能力，规则约束权限。",
    "LLM · Tools · Credit · IFS",
    "/economy.html",
  ],
];
export function ProtocolArchitecture({ locale }) {
  const zh = locale === "zh";
  return (
    <section
      className="protocol-section"
      id="architecture"
      aria-labelledby="architecture-title"
    >
      <header className="protocol-section-head">
        <span>01 / PROTOCOL ARCHITECTURE</span>
        <small>
          {zh ? "四层架构 · 分阶段交付" : "Four layers · incremental delivery"}
        </small>
      </header>
      <div className="protocol-thesis">
        <h2 id="architecture-title">
          {zh ? "不止一个智能体。" : "Beyond a single agent."}
          <em>
            {zh ? "是一套共同生长的规则。" : "A shared structure for growth."}
          </em>
        </h2>
        <p>
          {zh
            ? "果蝇是起点，不是协议的边界。将生命、社会、世界与经济解耦，让新模型、新任务和新工具可以接入，而不改写一个生命的过去。"
            : "The fly is a starting point, not the protocol’s boundary. Separate life, society, worlds and economy so new models, tasks and tools can connect without rewriting a life’s past."}
        </p>
      </div>
      <div className="protocol-stack">
        {layers.map(([id, en, cn, descEn, descCn, code, href]) => (
          <SiteLink className="protocol-layer" href={href} key={id}>
            <span className="protocol-layer-id">{id}</span>
            <h3>{zh ? cn : en}</h3>
            <p>
              {zh ? descCn : descEn}
              <code>{code}</code>
            </p>
            <ArrowUpRight size={22} />
          </SiteLink>
        ))}
      </div>
      <p className="protocol-boundary">
        {zh
          ? "架构不等于全部上线：交易与经济页面仍为 SIM；跨链、跨物种迁徙是预留能力，尚未开放。"
          : "Architecture is not a shipping claim: trading and economy remain SIM; cross-chain and cross-species migration are reserved capabilities, not open features."}
      </p>
    </section>
  );
}

export function ProtocolResearch({ locale }) {
  const zh = locale === "zh";
  return (
    <section
      className="protocol-section protocol-research"
      aria-labelledby="research-title"
    >
      <header className="protocol-section-head">
        <span>04 / RESEARCH FRONTIER</span>
        <small>
          {zh
            ? "研究路线 · 尚未完成"
            : "Research direction · not yet delivered"}
        </small>
      </header>
      <div className="protocol-thesis">
        <h2 id="research-title">
          {zh ? "智慧不是一句宣言。" : "Intelligence is not a slogan."}
          <em>
            {zh
              ? "每一次增益，都应能复算。"
              : "Every gain should be reproducible."}
          </em>
        </h2>
        <p>
          {zh
            ? "通用智慧是方向，可验证协作是下一步。用固定任务、预算与种子，对照单体与群体，检验经验是否值得保留、共享与继承。"
            : "General intelligence is the direction. Verifiable cooperation is the next step: compare individuals and groups under fixed tasks, budgets and seeds before retaining, sharing or inheriting experience."}
        </p>
      </div>
      <ol className="protocol-research-steps">
        {(zh
          ? [
              ["任务", "定义成功，而不只展示活动。"],
              ["复核", "经验附带依据，让他人独立重放。"],
              ["晋升", "增益经对照验证，才进入共享经验。"],
            ]
          : [
              ["Task", "Define success, not just activity."],
              ["Replication", "Attach evidence others can replay."],
              [
                "Promotion",
                "Share experience only after controlled evaluation.",
              ],
            ]
        ).map(([title, desc], i) => (
          <li key={title}>
            <span>0{i + 1}</span>
            <h3>{title}</h3>
            <p>{desc}</p>
          </li>
        ))}
      </ol>
      <SiteLink className="protocol-research-link" href="/blueprint.html">
        {zh
          ? "阅读协议蓝图与交付边界"
          : "Read the blueprint and delivery boundaries"}
        <ArrowUpRight size={18} />
      </SiteLink>
    </section>
  );
}
