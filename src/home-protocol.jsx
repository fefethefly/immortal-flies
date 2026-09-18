import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { SiteLink } from "./site-chrome.jsx";
import { createHeroWebGL } from "./hero-webgl.mjs";
import { t } from "./i18n.mjs";
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
      instance = createHeroWebGL(
        node,
        () => read.current(),
        () => setState("fallback"),
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
    setStimuli((n) => n + 1);
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
        <button onClick={stimulate} disabled={paused || state !== "live"}>
          {zh ? "注入视觉刺激" : "Send visual stimulus"} ↗
        </button>
        <span>
          {zh
            ? "美术粒子 / 示意信号，不是生物放电数据"
            : "Art particles / illustrative signals, not biological recordings"}
        </span>
      </div>
    </div>
  );
}

const layers = [
  ["L0", "public.archL0", "public.archL0p", "public.archL0tag", "/brain.html"],
  ["L1", "public.archL1", "public.archL1p", "public.archL1tag", "/swarm.html"],
  [
    "L2",
    "public.archL2",
    "public.archL2p",
    "public.archL2tag",
    "/blueprint.html",
  ],
  [
    "L3",
    "public.archL3",
    "public.archL3p",
    "public.archL3tag",
    "/economy.html",
  ],
];
const researchSteps = [
  ["public.research1", "public.research1p"],
  ["public.research2", "public.research2p"],
  ["public.research3", "public.research3p"],
  ["public.research4", "public.research4p"],
  ["public.research5", "public.research5p"],
];

export function ProtocolArchitecture({ locale }) {
  const tx = (key) => t(locale, key);
  return (
    <section
      className="protocol-section"
      id="architecture"
      aria-labelledby="architecture-title"
    >
      <header className="protocol-section-head">
        <span>{tx("public.archKicker")}</span>
        <small>{tx("public.archSide")}</small>
      </header>
      <div className="protocol-thesis">
        <h2 id="architecture-title">
          {tx("public.archTitle")}
          <em>{tx("public.archEm")}</em>
        </h2>
        <p>{tx("public.archLead")}</p>
      </div>
      <div className="protocol-stack">
        {layers.map(([id, title, body, tag, href]) => (
          <SiteLink className="protocol-layer" href={href} key={id}>
            <span className="protocol-layer-id">{id}</span>
            <h3>{tx(title)}</h3>
            <p>
              {tx(body)}
              <code>{tx(tag)}</code>
            </p>
            <ArrowUpRight size={22} />
          </SiteLink>
        ))}
      </div>
      <p className="protocol-boundary">{tx("public.archBound")}</p>
    </section>
  );
}

export function ProtocolResearch({ locale }) {
  const tx = (key) => t(locale, key);
  return (
    <section
      id="research"
      className="protocol-section protocol-research"
      data-reveal="wait"
      aria-labelledby="research-title"
    >
      <header className="protocol-section-head">
        <span>{tx("public.researchKicker")}</span>
        <small>{tx("public.researchSide")}</small>
      </header>
      <div className="protocol-thesis">
        <h2 id="research-title">
          {tx("public.researchTitle")}
          <em>{tx("public.researchEm")}</em>
        </h2>
        <p>{tx("public.researchLead")}</p>
      </div>
      <ol className="protocol-research-steps">
        {researchSteps.map(([title, desc], i) => (
          <li key={title} style={{ "--step": i }}>
            <span>0{i + 1}</span>
            <h3>{tx(title)}</h3>
            <p>{tx(desc)}</p>
          </li>
        ))}
      </ol>
      <SiteLink className="protocol-research-link" href="/blueprint.html">
        {tx("public.researchGo")}
        <ArrowUpRight size={18} />
      </SiteLink>
    </section>
  );
}
