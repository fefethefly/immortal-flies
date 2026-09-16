import React, { memo, useEffect, useRef } from "react";
import { useOnStage, usePrefersReduced } from "./rite.jsx";

const LAYERS = [
  { id: "L0", color: "#c9a25e", y: 0.16 },
  { id: "L1", color: "#93a181", y: 0.36 },
  { id: "L2", color: "#d8c9a4", y: 0.56 },
  { id: "L3", color: "#b57660", y: 0.76 },
];

function fitCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function slab(ctx, cx, y, w, h, skew, color, lit) {
  const left = cx - w / 2;
  ctx.beginPath();
  ctx.moveTo(left + skew, y);
  ctx.lineTo(left + w + skew, y);
  ctx.lineTo(left + w - skew, y + h);
  ctx.lineTo(left - skew, y + h);
  ctx.closePath();
  ctx.fillStyle = lit ? "rgba(201, 162, 94, 0.16)" : "rgba(18, 16, 13, 0.86)";
  ctx.fill();
  ctx.strokeStyle = lit ? color : "rgba(201, 162, 94, 0.28)";
  ctx.lineWidth = lit ? 1.6 : 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(left + skew, y);
  ctx.lineTo(left + w + skew, y);
  ctx.lineTo(left + w + skew - 10, y - 10);
  ctx.lineTo(left + skew - 10, y - 10);
  ctx.closePath();
  ctx.fillStyle = lit ? "rgba(201, 162, 94, 0.22)" : "rgba(28, 24, 18, 0.9)";
  ctx.fill();
  ctx.strokeStyle = "rgba(201, 162, 94, 0.2)";
  ctx.stroke();
}

export const LayerCabinet = memo(function LayerCabinet({
  labels,
  active,
  onActive,
  caption,
}) {
  const reduced = usePrefersReduced();
  const host = useRef(null);
  const canvas = useRef(null);
  const activeRef = useRef(active);
  const labelsRef = useRef(labels);
  const onActiveRef = useRef(onActive);
  const onStage = useOnStage(host);
  activeRef.current = active;
  labelsRef.current = labels;
  onActiveRef.current = onActive;

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let width = node.clientWidth || 440;
    let height = node.clientHeight || 520;
    let ctx = fitCanvas(node, width, height);
    const resize = () => {
      width = node.clientWidth || 440;
      height = node.clientHeight || 520;
      ctx = fitCanvas(node, width, height);
      paint(false);
    };
    const particles = [];
    let raf = 0;
    let last = 0;

    const geometryOf = () =>
      LAYERS.map((layer, i) => ({
        ...layer,
        y: height * layer.y,
        w: width * (0.58 + i * 0.05),
        h: 72,
        skew: 22 - i * 2,
        cx: width * 0.48,
      }));

    const paint = (moving) => {
      const geometry = geometryOf();
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(47, 42, 31, 0.85)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(10, 20 + i * 42);
        ctx.lineTo(width - 10, 20 + i * 42);
        ctx.stroke();
      }
      geometry.forEach((g, i) => {
        if (i < geometry.length - 1) {
          ctx.strokeStyle = "rgba(201, 162, 94, 0.22)";
          ctx.beginPath();
          ctx.moveTo(g.cx, g.y + g.h);
          ctx.lineTo(geometry[i + 1].cx, geometry[i + 1].y);
          ctx.stroke();
        }
      });
      [...geometry].reverse().forEach((g, rev) => {
        const i = geometry.length - 1 - rev;
        slab(ctx, g.cx, g.y, g.w, g.h, g.skew, g.color, activeRef.current === i);
        ctx.fillStyle = g.color;
        ctx.font = "12px 'IBM Plex Mono', monospace";
        ctx.fillText(g.id, g.cx - g.w / 2 + 18, g.y + 28);
        ctx.fillStyle = "#d8c9a4";
        ctx.font = "16px 'Cormorant Garamond', serif";
        ctx.fillText(labelsRef.current[i] || g.id, g.cx - g.w / 2 + 52, g.y + 30);
      });
      if (moving) {
        for (const p of particles) {
          p.y += p.vy;
          p.life -= 1;
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        for (let i = particles.length - 1; i >= 0; i--) {
          if (particles[i].life <= 0) particles.splice(i, 1);
        }
      }
    };

    const hit = (x, y) => {
      const geometry = geometryOf();
      for (let i = 0; i < geometry.length; i++) {
        const g = geometry[i];
        if (Math.abs(x - g.cx) < g.w / 2 + 12 && y > g.y - 12 && y < g.y + g.h + 6)
          return i;
      }
      return -1;
    };

    const onMove = (event) => {
      const box = node.getBoundingClientRect();
      const i = hit(event.clientX - box.left, event.clientY - box.top);
      if (i >= 0) onActiveRef.current?.(i);
    };
    const onLeave = () => onActiveRef.current?.(-1);
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !onStage) return;
      if (now - last < 33) return;
      last = now;
      const geometry = geometryOf();
      const from = geometry[Math.floor(Math.random() * 3)];
      if (Math.random() < 0.55) {
        particles.push({
          x: from.cx + (Math.random() - 0.5) * from.w * 0.4,
          y: from.y + from.h - 4,
          vy: 0.9 + Math.random() * 0.7,
          r: 2 + Math.random() * 1.4,
          color: from.color,
          life: 48,
          max: 48,
        });
        if (particles.length > 70) particles.shift();
      }
      paint(true);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(node);
    paint(false);
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [onStage, reduced]);

  return (
    <figure className="rite-cabinet" ref={host}>
      <canvas ref={canvas} aria-hidden="true" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
});

export const PhaseSpine = memo(function PhaseSpine({ count, nowCount }) {
  const reduced = usePrefersReduced();
  const host = useRef(null);
  const canvas = useRef(null);
  const onStage = useOnStage(host);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const width = 36;
    const height = node.clientHeight || count * 92;
    const ctx = fitCanvas(node, width, height);
    let raf = 0;
    let t = 0;
    const gap = height / count;

    const paint = (pulse) => {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(201, 162, 94, 0.28)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(18, 10);
      ctx.lineTo(18, height - 10);
      ctx.stroke();
      for (let i = 0; i < count; i++) {
        const y = 18 + i * gap;
        const live = i < nowCount;
        const next = i === nowCount;
        ctx.beginPath();
        ctx.arc(18, y, live ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = live ? "#c9a25e" : next ? "#93a181" : "#3a3428";
        ctx.fill();
        if (live && pulse) {
          ctx.beginPath();
          ctx.arc(18, y, 8 + Math.sin(pulse + i) * 2, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(201, 162, 94, 0.35)";
          ctx.stroke();
        }
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !onStage) return;
      t += 0.04;
      paint(t);
    };
    paint(0);
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [count, nowCount, onStage, reduced]);

  return (
    <div className="rite-spine" ref={host} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
});
