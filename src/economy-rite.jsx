import React, { memo, useEffect, useRef } from "react";
import { PROTOCOL_SPLIT } from "./economy.mjs";
import { useOnStage, usePrefersReduced } from "./rite.jsx";

const GOLD = "#c9a25e";
const CLAY = "#b57660";
const BONE = "#d8c9a4";
const MUTED = "#8a8172";

function fitCanvas(canvas, cssW, cssH) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function spawn(list, particle, cap) {
  list.push(particle);
  if (list.length > cap) list.splice(0, list.length - cap);
}

function drawPipe(ctx, x1, y1, x2, y2, color, dash) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.setLineDash([7, 8]);
  ctx.lineDashOffset = -dash;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawVessel(ctx, x, y, w, h, fill, color, rim) {
  const glass = ctx.createLinearGradient(x, y, x + w, y + h);
  glass.addColorStop(0, "rgba(36, 30, 22, 0.96)");
  glass.addColorStop(1, "rgba(12, 10, 8, 0.96)");
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 8);
  ctx.lineTo(x + w - 14, y + 8);
  ctx.strokeStyle = "rgba(240, 234, 217, 0.12)";
  ctx.stroke();
  if (fill > 0.02) {
    const inner = Math.max(10, (h - 10) * fill);
    const ly = y + h - inner - 4;
    const liquid = ctx.createLinearGradient(x, ly, x, y + h);
    liquid.addColorStop(0, color);
    liquid.addColorStop(1, "rgba(80, 60, 28, 0.95)");
    ctx.beginPath();
    ctx.roundRect(x + 5, ly, w - 10, inner, 8);
    ctx.fillStyle = liquid;
    ctx.globalAlpha = 0.88;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(x + 8, ly + 3);
    ctx.quadraticCurveTo(x + w / 2, ly - 4, x + w - 8, ly + 3);
    ctx.strokeStyle = "rgba(240, 234, 217, 0.45)";
    ctx.stroke();
  }
}

function drawHopper(ctx, cx, y) {
  ctx.beginPath();
  ctx.moveTo(cx - 42, y);
  ctx.lineTo(cx + 42, y);
  ctx.lineTo(cx + 16, y + 36);
  ctx.lineTo(cx - 16, y + 36);
  ctx.closePath();
  ctx.fillStyle = "rgba(28, 24, 18, 0.95)";
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

export const SurplusEngine = memo(function SurplusEngine({
  R,
  C,
  N,
  T,
  D,
  gap,
  caption,
}) {
  const reduced = usePrefersReduced();
  const host = useRef(null);
  const canvas = useRef(null);
  const values = useRef({ R, C, N, T, D, gap });
  const onStage = useOnStage(host);
  values.current = { R, C, N, T, D, gap };

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    let width = node.clientWidth || 420;
    let height = node.clientHeight || 520;
    let ctx = fitCanvas(node, width, height);
    const particles = [];
    let raf = 0;
    let last = 0;
    let tick = 0;

    const resize = () => {
      width = node.clientWidth || 420;
      height = node.clientHeight || 520;
      ctx = fitCanvas(node, width, height);
      drawFrame(true);
    };

    const drawFrame = (still) => {
      const v = values.current;
      const nFill = Math.min(1, Math.max(0, v.N) / Math.max(v.R, 1));
      const tFill = v.gap ? Math.min(1, v.T / v.gap) : 0;
      const dFill = Math.min(1, v.D / Math.max(v.R * 0.45, 1));
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(47, 42, 31, 0.9)";
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 10; i++) {
        const y = 28 + i * 48;
        ctx.beginPath();
        ctx.moveTo(16, y);
        ctx.lineTo(width - 16, y);
        ctx.stroke();
      }

      const cistern = { x: width * 0.26, y: 156, w: width * 0.48, h: 176 };
      const flask = { x: 22, y: 368, w: 110, h: 122 };
      const well = { x: width - 136, y: 368, w: 114, h: 122 };
      const cx = width / 2;
      const dash = tick * 1.6;

      drawHopper(ctx, cx, 38);
      drawPipe(ctx, cx, 74, cx, cistern.y, GOLD, dash);
      drawPipe(ctx, cistern.x, cistern.y + 78, 18, cistern.y + 78, CLAY, dash);
      drawPipe(
        ctx,
        cistern.x + cistern.w / 2,
        cistern.y + cistern.h,
        flask.x + flask.w / 2,
        flask.y,
        "#9c855f",
        dash,
      );
      drawPipe(
        ctx,
        cistern.x + cistern.w / 2,
        cistern.y + cistern.h,
        well.x + well.w / 2,
        well.y,
        GOLD,
        dash,
      );

      drawVessel(ctx, cistern.x, cistern.y, cistern.w, cistern.h, nFill, GOLD, v.N < 0 ? CLAY : GOLD);
      drawVessel(ctx, flask.x, flask.y, flask.w, flask.h, tFill, "#c4b07a", MUTED);
      drawVessel(ctx, well.x, well.y, well.w, well.h, dFill, GOLD, GOLD);

      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillStyle = GOLD;
      ctx.fillText("R  inflow", cx - 34, 32);
      ctx.fillStyle = v.N < 0 ? CLAY : GOLD;
      ctx.fillText("N  surplus", cistern.x + 14, cistern.y + 22);
      ctx.fillStyle = CLAY;
      ctx.fillText("C", 20, cistern.y + 68);
      ctx.fillStyle = MUTED;
      ctx.fillText("T  reserve", flask.x + 10, flask.y + 20);
      ctx.fillStyle = GOLD;
      ctx.fillText("D  split", well.x + 10, well.y + 20);

      let streamX = well.x + 10;
      for (const row of PROTOCOL_SPLIT) {
        const sw = Math.max(8, (well.w - 20) * row.rate);
        ctx.fillStyle = row.color;
        ctx.globalAlpha = v.D > 0 ? 0.7 : 0.22;
        ctx.fillRect(streamX, well.y + well.h + 8, sw - 3, 5);
        ctx.globalAlpha = 1;
        streamX += sw;
      }

      if (!still) {
        for (const p of particles) {
          p.x += p.vx;
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

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !onStage) return;
      if (now - last < 32) return;
      last = now;
      tick += 1;
      const v = values.current;
      const rChance = Math.min(0.9, 0.12 + v.R / 140000);
      const cChance = Math.min(0.7, 0.08 + v.C / 120000);
      if (Math.random() < rChance) {
        spawn(
          particles,
          {
            x: width / 2 + (Math.random() - 0.5) * 36,
            y: 58,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 1.4 + Math.random(),
            r: 2 + Math.random() * 1.6,
            color: GOLD,
            life: 70,
            max: 70,
          },
          90,
        );
      }
      if (Math.random() < cChance) {
        spawn(
          particles,
          {
            x: width * 0.28,
            y: 238 + Math.random() * 20,
            vx: -1.4 - Math.random(),
            vy: (Math.random() - 0.5) * 0.4,
            r: 1.1,
            color: CLAY,
            life: 46,
            max: 46,
          },
          90,
        );
      }
      if (v.T > 0 && tick % 3 === 0) {
        spawn(
          particles,
          {
            x: width * 0.42,
            y: 336,
            vx: -0.9,
            vy: 1.5,
            r: 1.3,
            color: "#9c855f",
            life: 50,
            max: 50,
          },
          90,
        );
      }
      if (v.D > 0 && tick % 2 === 0) {
        const row = PROTOCOL_SPLIT[tick % PROTOCOL_SPLIT.length];
        spawn(
          particles,
          {
            x: width * 0.58,
            y: 336,
            vx: 1.1,
            vy: 1.6,
            r: 1.2,
            color: row.color,
            life: 54,
            max: 54,
          },
          90,
        );
      }
      drawFrame(false);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(node);
    drawFrame(true);
    if (!reduced) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [onStage, reduced]);

  return (
    <figure className="rite-engine" ref={host}>
      <canvas ref={canvas} aria-hidden="true" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
});

export const SplitWheel = memo(function SplitWheel({ amounts, total }) {
  const reduced = usePrefersReduced();
  const host = useRef(null);
  const canvas = useRef(null);
  const values = useRef({ amounts, total });
  const onStage = useOnStage(host);
  values.current = { amounts, total };

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const size = node.clientWidth || 220;
    const ctx = fitCanvas(node, size, size);
    let raf = 0;
    let angle = 0;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.34;

    const paint = (spin) => {
      const { amounts: map, total: sum } = values.current;
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 18, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(47, 42, 31, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();
      let start = -Math.PI / 2 + spin;
      for (const row of PROTOCOL_SPLIT) {
        const share = sum > 0 ? map[row.key] / sum : row.rate;
        const sweep = share * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, start + sweep);
        ctx.strokeStyle = row.color;
        ctx.lineWidth = 16;
        ctx.lineCap = "butt";
        ctx.stroke();
        start += sweep;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 22, 0, Math.PI * 2);
      ctx.fillStyle = "#12100d";
      ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("D", cx, cy - 4);
      ctx.fillStyle = MUTED;
      ctx.font = "9px 'IBM Plex Mono', monospace";
      ctx.fillText("35/25/20/10/10", cx, cy + 14);
      ctx.textAlign = "start";
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !onStage) return;
      angle += 0.004;
      paint(angle);
    };
    paint(0);
    if (!reduced && total > 0) raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onStage, reduced, total > 0]);

  return (
    <div className="rite-wheel" ref={host} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
});
