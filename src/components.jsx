import React, { useEffect, useRef } from "react";
import { ArrowUpRight, X, MoveUpRight } from "lucide-react";
import { FlyMark, VitruvianFly } from "./vitruvian.jsx";

export { FlyMark, VitruvianFly };
export function SectionLabel({ number, children, right }) {
  return (
    <div className="section-label">
      <span className="section-index">{number}</span>
      <span>{children}</span>
      <i />
      {right && <span className="label-right">{right}</span>}
    </div>
  );
}
export function SignalCanvas({ brain, variant = "hero" }) {
  const canvas = useRef(null),
    state = useRef(brain);
  useEffect(() => {
    state.current = brain;
  }, [brain]);
  useEffect(() => {
    const el = canvas.current,
      ctx = el.getContext("2d");
    let width = 0,
      height = 0,
      frame = 0,
      visible = true,
      time = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const rect = el.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const d = Math.min(devicePixelRatio, 2);
      el.width = width * d;
      el.height = height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    intersection.observe(el);
    function draw() {
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden || !width) return;
      time += reduced ? 0 : 0.006;
      ctx.clearRect(0, 0, width, height);
      if (variant === "hero") {
        for (let i = 0; i < 80; i++) {
          const x =
              (Math.sin(i * 13.17) * 0.5 + 0.5) * width +
              Math.sin(time + i) * 4,
            y =
              (Math.cos(i * 7.34) * 0.5 + 0.5) * height +
              Math.cos(time * 0.7 + i) * 5;
          const alpha = 0.08 + (Math.sin(time + i) * 0.5 + 0.5) * 0.2;
          ctx.fillStyle = `rgba(208, 205, 200,${alpha})`;
          ctx.fillRect(x, y, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
        }
        return;
      }
      const points = Array.from({ length: 16 }, (_, i) => ({
        x: width * (0.15 + (Math.sin(i * 4.73) * 0.5 + 0.5) * 0.7),
        y: height * (0.15 + (Math.cos(i * 2.97) * 0.5 + 0.5) * 0.65),
      }));
      const b = state.current;
      points.forEach((p, i) => {
        const prev = points[(i + 15) % 16],
          active = !!(b.spikes & (1 << i));
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = active
          ? "rgba(176, 138, 74,.7)"
          : "rgba(196, 184, 154,.18)";
        ctx.lineWidth = active ? 1.3 : 0.6;
        ctx.stroke();
        if (!b.dormant && !reduced) {
          const v = (time * 0.35 + i * 0.13) % 1;
          ctx.beginPath();
          ctx.arc(
            prev.x + (p.x - prev.x) * v,
            prev.y + (p.y - prev.y) * v,
            1.5,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "rgba(176, 138, 74,.85)";
          ctx.fill();
        }
        const strength = b.potential[i] / 170;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 + strength * 4, 0, Math.PI * 2);
        ctx.fillStyle = active
          ? "#b08a4a"
          : `rgba(196, 184, 154,${0.15 + strength * 0.45})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13 + strength * 6, 0, Math.PI * 2);
        ctx.strokeStyle = active
          ? "rgba(206, 197, 182,.4)"
          : "rgba(171, 160, 140,.12)";
        ctx.stroke();
        ctx.font = "9px monospace";
        ctx.fillStyle = "#8e8b85";
        ctx.fillText(String(i + 1).padStart(2, "0"), p.x + 16, p.y - 12);
      });
    }
    resize();
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
    };
  }, [variant]);
  return (
    <canvas
      ref={canvas}
      className={`signal-canvas ${variant}`}
      aria-label={
        variant === "network" ? "16 个模型节点的电位与脉冲示意" : "装饰性星尘"
      }
    />
  );
}
export function NeuralBars({ brain }) {
  return (
    <div
      className={`neural-bars ${brain.dormant ? "quiet" : ""}`}
      aria-label="当前神经元电位"
    >
      {brain.potential.map((p, i) => (
        <i
          key={i}
          style={{ height: `${8 + (p / 170) * 26}px`, opacity: 0.35 + p / 220 }}
        />
      ))}
    </div>
  );
}
export function Modal({ title, eyebrow, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement;
    el.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content">
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="关闭弹窗"
        >
          <X size={20} />
        </button>
        <div className="eyebrow">{eyebrow || "IMMORTAL / FIELD NOTES"}</div>
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
export function SoulCard({ index, name, tone, descriptor, onOpen, brain }) {
  const ref = useRef(null);
  function tilt(e) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = e.currentTarget.getBoundingClientRect(),
      x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty("--rx", `${(y - 0.5) * -9}deg`);
    ref.current.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
    ref.current.style.setProperty("--gx", `${x * 100}%`);
    ref.current.style.setProperty("--gy", `${y * 100}%`);
  }
  function reset() {
    ref.current.style.setProperty("--rx", "0deg");
    ref.current.style.setProperty("--ry", "0deg");
  }
  return (
    <button
      className={`soul-card ${tone}`}
      ref={ref}
      onPointerMove={tilt}
      onPointerLeave={reset}
      onClick={onOpen}
      aria-label={`查看 ${name} 创世卡片`}
    >
      <div className="card-sheen" />
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
      <div className="card-top">
        <span>SEAL / GENESIS</span>
        <span>GEN 0</span>
      </div>
      <div className="card-art">
        <VitruvianFly
          dormant={tone === "gold" && brain?.dormant}
          label={`SOUL #${index}`}
        />
        <span className="card-axis">DROSOPHILA / {index}</span>
        <span className="card-hash">IFF–{index}–G0</span>
      </div>
      <div className="card-info">
        <div className="card-number">
          SOUL #{index}
          <ArrowUpRight size={18} />
        </div>
        <h3>{name}</h3>
        <p>{descriptor}</p>
        <div className="card-bottom">
          <span>
            <i />{" "}
            {tone === "gold" && brain?.dormant ? "DORMANT" : "VISUAL CONCEPT"}
          </span>
          <span>未发行</span>
        </div>
      </div>
    </button>
  );
}
export function RuleTile({ icon: Icon, number, title, children }) {
  return (
    <article className="rule-tile">
      <div className="rule-icon">
        <Icon size={24} />
        <span>{number}</span>
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      <MoveUpRight size={16} className="rule-arrow" />
    </article>
  );
}
