import React, { memo, useEffect, useRef } from "react";
import { useOnStage, usePrefersReduced } from "./rite.jsx";

const GOLD = "#c9a25e";
const NERVE = "#93a181";
const CLAY = "#b57660";
const BONE = "#d8c9a4";

function fit(canvas, w, h) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function paintLife(ctx, w, h, tick, dots) {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.42,
    cy = h * 0.52;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 18 + i * 16, 12 + i * 10, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(201,162,94,${0.28 - i * 0.04})`;
    ctx.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + tick * 0.02;
    const on = (tick + i * 3) % 18 < 6;
    ctx.fillStyle = on ? GOLD : "rgba(201,162,94,0.28)";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 46, cy + Math.sin(a) * 28, on ? 2.4 : 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const d of dots) {
    ctx.globalAlpha = d.life / d.max;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintLanguage(ctx, w, h, tick, dots) {
  ctx.clearRect(0, 0, w, h);
  const words = ["SENSE", "ACT", "MEMORY"];
  const ys = [h * 0.28, h * 0.5, h * 0.72];
  words.forEach((word, i) => {
    ctx.fillStyle = i === Math.floor(tick / 18) % 3 ? NERVE : BONE;
    ctx.font = "12px 'IBM Plex Mono', monospace";
    ctx.fillText(word, 18, ys[i]);
    ctx.strokeStyle = "rgba(147,161,129,0.35)";
    ctx.beginPath();
    ctx.moveTo(96, ys[i] - 4);
    ctx.lineTo(w - 16, ys[i] - 4);
    ctx.stroke();
  });
  for (const d of dots) {
    ctx.globalAlpha = d.life / d.max;
    ctx.fillStyle = NERVE;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintFinance(ctx, w, h, tick, dots) {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.55,
    cy = h * 0.5;
  ctx.strokeStyle = "rgba(201,162,94,0.3)";
  ctx.beginPath();
  ctx.arc(cx, cy, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 54, tick * 0.03, tick * 0.03 + 4.2);
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.font = "13px 'Cormorant Garamond', serif";
  ctx.textAlign = "center";
  ctx.fillText("IFS", cx, cy + 4);
  ctx.textAlign = "start";
  const labels = [
    [cx - 70, cy - 28, "Credit"],
    [cx + 48, cy - 20, "Vault"],
    [cx - 20, cy + 58, "Trade"],
  ];
  ctx.font = "9px 'IBM Plex Mono', monospace";
  ctx.fillStyle = BONE;
  for (const [x, y, t] of labels) ctx.fillText(t, x, y);
  for (const d of dots) {
    ctx.globalAlpha = d.life / d.max;
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintBoot(ctx, w, h, tick, dots) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  ctx.strokeStyle = "rgba(47,42,31,0.9)";
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(16, 20 + i * 28);
    ctx.lineTo(w - 16, 20 + i * 28);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - 48, 36);
  ctx.lineTo(cx + 48, 36);
  ctx.lineTo(cx + 18, 68);
  ctx.lineTo(cx - 18, 68);
  ctx.closePath();
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(cx - 70, 86, 140, 88, 12);
  ctx.fillStyle = "#12100d";
  ctx.fill();
  ctx.stroke();
  const fill = 0.35 + Math.sin(tick * 0.05) * 0.12;
  ctx.fillStyle = GOLD;
  ctx.globalAlpha = 0.72;
  ctx.fillRect(cx - 64, 86 + 88 * (1 - fill), 128, 88 * fill);
  ctx.globalAlpha = 1;
  ctx.fillStyle = BONE;
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText("MALE CNS / 1400", cx, 198);
  ctx.textAlign = "start";
  for (const d of dots) {
    ctx.globalAlpha = d.life / d.max;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const PAINT = {
  life: paintLife,
  language: paintLanguage,
  finance: paintFinance,
  boot: paintBoot,
};

export const LifeGlyph = memo(function LifeGlyph({ kind, tall }) {
  const reduced = usePrefersReduced();
  const host = useRef(null);
  const canvas = useRef(null);
  const onStage = useOnStage(host);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let w = node.clientWidth || 220;
    let h = node.clientHeight || (tall ? 220 : 120);
    let ctx = fit(node, w, h);
    const dots = [];
    let raf = 0;
    let tick = 0;
    const paint = PAINT[kind] || paintLife;
    const draw = () => paint(ctx, w, h, tick, dots);
    const resize = () => {
      w = node.clientWidth || 220;
      h = node.clientHeight || (tall ? 220 : 120);
      ctx = fit(node, w, h);
      draw();
    };
    const ro = new ResizeObserver(resize);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !onStage) return;
      tick += 1;
      if (kind === "life" && tick % 3 === 0) {
        const a = Math.random() * Math.PI * 2;
        dots.push({
          x: w * 0.42 + Math.cos(a) * 20,
          y: h * 0.52 + Math.sin(a) * 12,
          r: 1.4,
          vx: Math.cos(a) * 0.8,
          vy: Math.sin(a) * 0.5,
          life: 28,
          max: 28,
        });
      }
      if (kind === "language" && tick % 4 === 0) {
        const lane = Math.floor(Math.random() * 3);
        dots.push({
          x: 100,
          y: h * (0.28 + lane * 0.22) - 4,
          r: 1.6,
          vx: 1.6,
          vy: 0,
          life: 40,
          max: 40,
        });
      }
      if (kind === "finance") {
        const a = tick * 0.04;
        dots.push({
          x: w * 0.55 + Math.cos(a) * 54,
          y: h * 0.5 + Math.sin(a) * 54,
          r: 1.8,
          vx: 0,
          vy: 0,
          life: 16,
          max: 16,
          color: tick % 9 === 0 ? CLAY : GOLD,
        });
      }
      if (kind === "boot" && tick % 2 === 0) {
        dots.push({
          x: w / 2 + (Math.random() - 0.5) * 28,
          y: 40,
          r: 1.8,
          vx: 0,
          vy: 1.4,
          life: 36,
          max: 36,
        });
      }
      for (const d of dots) {
        d.x += d.vx || 0;
        d.y += d.vy || 0;
        d.life -= 1;
      }
      for (let i = dots.length - 1; i >= 0; i--) if (dots[i].life <= 0) dots.splice(i, 1);
      if (dots.length > 50) dots.splice(0, dots.length - 50);
      draw();
    };
    ro.observe(node);
    draw();
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [kind, onStage, reduced, tall]);

  return (
    <div className={`life-glyph ${tall ? "is-tall" : ""}`} ref={host} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
});
