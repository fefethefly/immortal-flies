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
            src="/mark/particle.png"
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
          ? "架构不等于全部上线：交易与经济页面仍为 SIM；群体智慧协议是设计稿，未实现。跨链、跨物种迁徙是预留能力，尚未开放。"
          : "Architecture is not a shipping claim: trading and economy remain SIM; the swarm intelligence protocol is a design, not implemented. Cross-chain and cross-species migration are reserved capabilities, not open features."}
      </p>
    </section>
  );
}

export function ProtocolResearch({ locale }) {
  const zh = locale === "zh";
  return (
    <section
      id="research"
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
            ? "协议标准化的不是智慧本身，而是任务、语言、学习、聚合、身份五个可验证接口。增益必须能被复算。T3、T4 通过前，不说群体智能已实现。"
            : "The protocol does not standardize intelligence. It standardizes five verifiable interfaces: task, message, learn, pool, identity. Every gain must be recomputable. Until T3 and T4 pass, we do not say swarm intelligence is here."}
        </p>
      </div>
      <ol className="protocol-research-steps">
        {(zh
          ? [
              ["任务", "先定义成功，再谈活动。"],
              ["语言", "观察与确认补依据。收到不等于服从。"],
              ["学习", "可回滚的状态变更。旧版本永不覆盖。"],
              ["聚合", "经验经对照与复现，才晋升。"],
              ["身份", "生命与运行器分开。晋升不进 Soul。"],
            ]
          : [
              ["Task", "Define success before counting activity."],
              ["Message", "Observe and confirm carry evidence. Received is not obeyed."],
              ["Learn", "Reversible state change. Old versions stay."],
              ["Pool", "Promote experience only after controlled replication."],
              ["Identity", "Life and runner stay apart. Promotion never enters Soul."],
            ]
        ).map(([title, desc], i) => (
          <li key={title}>
            <span>0{i + 1}</span>
            <h3>{title}</h3>
            <p>{desc}</p>
          </li>
        ))}
      </ol>
      <SiteLink className="protocol-research-link" href="/blueprint.html#swarm">
        {zh
          ? "阅读群体智慧协议与交付边界"
          : "Read the swarm protocol and delivery boundaries"}
        <ArrowUpRight size={18} />
      </SiteLink>
    </section>
  );
}
