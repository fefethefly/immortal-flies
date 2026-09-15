import React, { useEffect, useRef, useState } from "react";
import {
  formatPrice,
  loadStoredSwarm,
  reflexOf,
  saveStoredSwarm,
  tickSwarm,
} from "./swarm.mjs";
import { recallFly, rememberFly } from "./site-chrome.jsx";

const WASH = {
  BUY: [176, 138, 74],
  SELL: [138, 86, 74],
  HOLD: [90, 86, 78],
};

function nearestHit(hits, x, y, reach = 30) {
  let best = null;
  let dist = reach;
  for (const hit of hits) {
    const d = Math.hypot(hit.x - x, hit.y - y);
    if (d < dist) {
      dist = d;
      best = hit.id;
    }
  }
  return best;
}

export function HomeField({ swarm, selectedId, onSelect }) {
  const ref = useRef(null);
  const hits = useRef([]);
  const hover = useRef(null);
  const trail = useRef([]);
  const flyTrails = useRef(new Map());
  const latest = useRef({ swarm, selectedId });
  latest.current = { swarm, selectedId };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let raf = 0;
    const started = performance.now();
    const dust = Array.from({ length: 150 }, (_, i) => ({
      a: (i / 150) * Math.PI * 2 + (i % 5) * 0.17,
      r: 0.42 + (i % 11) * 0.048,
      s: 0.12 + (i % 7) * 0.045,
      z: 0.55 + (i % 4) * 0.28,
    }));
    const neurons = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      const ring = i % 3;
      return {
        x: Math.cos(a) * (0.18 + ring * 0.14),
        y: Math.sin(a) * (0.2 + ring * 0.12),
        phase: i * 0.71,
      };
    });
    const synapses = neurons.flatMap((node, i) => [
      [i, (i + 1) % neurons.length],
      [i, (i + 5) % neurons.length],
    ]);
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      const d = Math.min(devicePixelRatio, 2);
      canvas.width = width * d;
      canvas.height = height * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    });
    resize.observe(canvas);

    function localPoint(event) {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    }

    function onMove(event) {
      const { x, y } = localPoint(event);
      hover.current = nearestHit(hits.current, x, y, 32);
      canvas.style.cursor = hover.current != null ? "pointer" : "crosshair";
    }

    function drawFly(x, y, scale, heading, lit, flap, alpha = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(heading);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;
      const spread = 0.82 + flap * 0.38;
      const holo = lit ? [218, 205, 169] : [126, 137, 126];
      ctx.shadowBlur = lit ? 12 : 6;
      ctx.shadowColor = `rgba(${holo[0]},${holo[1]},${holo[2]},0.72)`;
      ctx.fillStyle = `rgba(${holo[0]},${holo[1]},${holo[2]},${lit ? 0.13 : 0.07})`;
      ctx.strokeStyle = `rgba(${holo[0]},${holo[1]},${holo[2]},${lit ? 0.9 : 0.55})`;
      ctx.lineWidth = lit ? 1.15 : 0.8;
      ctx.beginPath();
      ctx.ellipse(
        -11.5,
        -1,
        8.2,
        18 * spread,
        -0.58 + flap * 0.22,
        0,
        Math.PI * 2,
      );
      ctx.ellipse(
        11.5,
        -1,
        8.2,
        18 * spread,
        0.58 - flap * 0.22,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
      // Holographic wing particles make the silhouette read as a living signal field.
      ctx.shadowBlur = 0;
      for (let i = 0; i < 14; i += 1) {
        const side = i % 2 ? 1 : -1;
        const px = side * (5 + (i % 5) * 2.8);
        const py = -12 + ((i * 11) % 28) * spread;
        ctx.fillStyle = `rgba(${holo[0]},${holo[1]},${holo[2]},${0.2 + (i % 4) * 0.12})`;
        ctx.fillRect(px, py, 1.1, 1.1);
      }
      ctx.beginPath();
      ctx.ellipse(0, 2.2, 3.8, 12.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = lit ? "rgba(232,226,214,0.82)" : "rgba(138,131,118,0.62)";
      ctx.fill();
      ctx.strokeStyle = `rgba(${holo[0]},${holo[1]},${holo[2]},0.7)`;
      ctx.stroke();
      // Red compound eyes: multiple emitters rather than a single flat dot.
      ctx.beginPath();
      ctx.ellipse(-1.35, -8.2, 1.55, 2.2, -0.15, 0, Math.PI * 2);
      ctx.ellipse(1.35, -8.2, 1.55, 2.2, 0.15, 0, Math.PI * 2);
      ctx.fillStyle = lit ? "rgba(255,58,48,0.95)" : "rgba(178,46,42,0.72)";
      ctx.shadowBlur = lit ? 9 : 4;
      ctx.shadowColor = "rgba(255,42,36,0.9)";
      ctx.fill();
      ctx.shadowBlur = 0;
      for (let i = 0; i < 6; i += 1) {
        const ex = i < 3 ? -1.35 : 1.35;
        const ey = -9.1 + (i % 3) * 0.9;
        ctx.fillStyle = `rgba(255,${110 + (i % 3) * 35},${90 + (i % 2) * 45},${lit ? 0.9 : 0.55})`;
        ctx.fillRect(ex + (i % 2 ? 0.45 : -0.45), ey, 0.45, 0.45);
      }
      ctx.restore();
    }

    function draw(now) {
      raf = requestAnimationFrame(draw);
      if (document.hidden || !width) return;
      const { swarm: live, selectedId: focus } = latest.current;
      const t = reduced ? 0 : (now - started) / 1000;
      ctx.clearRect(0, 0, width, height);
      const cx = width * 0.5;
      const cy = height * 0.48;
      const base = Math.min(width, height) * 0.34;
      const breath = reduced ? 1 : 1 + Math.sin(t * 1.05) * 0.03;
      const r = base * breath;
      const chosen =
        live.flies.find((row) => row.id === focus) || live.flies[0];
      const wash = WASH[chosen?.lastSide] || WASH.HOLD;
      const pulse = reduced ? 0.2 : 0.18 + Math.sin(t * 1.7) * 0.07;

      const glow = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 1.72);
      glow.addColorStop(0, `rgba(${wash[0]},${wash[1]},${wash[2]},${pulse})`);
      glow.addColorStop(0.55, `rgba(${wash[0]},${wash[1]},${wash[2]},0.05)`);
      glow.addColorStop(1, "rgba(10,9,7,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = `rgba(176,138,74,${0.38 + Math.sin(t * 1.05) * 0.14})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([1.5, 9]);
      ctx.strokeStyle = "rgba(176,138,74,0.3)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.16, t * 0.28, t * 0.28 + Math.PI * 1.45);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(42,38,28,0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.stroke();

      // Astrolabe graduation: the field is an instrument, so it carries a scale.
      const gauge = r * 1.28;
      for (let step = 0; step < 72; step += 1) {
        const angle = (step / 72) * Math.PI * 2 - Math.PI / 2;
        const major = step % 6 === 0;
        const length = major ? 9 : 4;
        ctx.strokeStyle = major
          ? "rgba(176,138,74,0.4)"
          : "rgba(176,138,74,0.2)";
        ctx.lineWidth = major ? 1.1 : 0.7;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * gauge, cy + Math.sin(angle) * gauge);
        ctx.lineTo(
          cx + Math.cos(angle) * (gauge + length),
          cy + Math.sin(angle) * (gauge + length),
        );
        ctx.stroke();
      }
      ctx.font = "400 9px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "rgba(154,146,132,0.75)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      [
        ["0°", 0, -1],
        ["90°", 1, 0],
        ["180°", 0, 1],
        ["270°", -1, 0],
      ].forEach(([label, dx, dy]) => {
        ctx.fillText(label, cx + dx * (gauge + 24), cy + dy * (gauge + 24));
      });

      // Neural connectome: signal travels from sensory nodes to motor nodes.
      synapses.forEach(([a, b], edgeIndex) => {
        const from = neurons[a];
        const to = neurons[b];
        const x1 = cx + from.x * r * 1.9;
        const y1 = cy + from.y * r * 1.9;
        const x2 = cx + to.x * r * 1.9;
        const y2 = cy + to.y * r * 1.9;
        const wave = reduced
          ? 0
          : (Math.sin(t * 2.4 - edgeIndex * 0.42) + 1) / 2;
        ctx.strokeStyle = `rgba(196,176,122,${0.08 + wave * 0.2})`;
        ctx.lineWidth = 0.7 + wave * 0.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (!reduced && wave > 0.86) {
          const p = (wave - 0.86) / 0.14;
          ctx.fillStyle = `rgba(232,226,214,${p * 0.9})`;
          ctx.beginPath();
          ctx.arc(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      neurons.forEach((node, i) => {
        const x = cx + node.x * r * 1.9;
        const y = cy + node.y * r * 1.9;
        const active = reduced
          ? i % 5 === 0
          : Math.sin(t * 2.1 + node.phase) > 0.78;
        ctx.fillStyle = active
          ? "rgba(214,190,124,0.95)"
          : "rgba(176,138,74,0.42)";
        ctx.beginPath();
        ctx.arc(x, y, active ? 2.5 : 1.3, 0, Math.PI * 2);
        ctx.fill();
      });

      dust.forEach((speck) => {
        const spin = t * speck.s + speck.a;
        const x = cx + Math.cos(spin) * r * speck.r;
        const y = cy + Math.sin(spin) * r * speck.r * 0.88;
        ctx.fillStyle = `rgba(176,138,74,${0.12 + speck.z * 0.2})`;
        ctx.fillRect(x, y, speck.z, speck.z);
      });

      const prices = live.prices || [];
      if (prices.length > 1) {
        const slice = prices.slice(-48);
        const min = Math.min(...slice);
        const max = Math.max(...slice);
        const span = Math.max(1, max - min);
        const x0 = width * 0.08;
        const x1 = width * 0.92;
        const yBase = height * 0.85;
        const yTop = height * 0.72;
        const px = (i) => x0 + (i / (slice.length - 1)) * (x1 - x0);
        const py = (price) => yBase - ((price - min) / span) * (yBase - yTop);
        ctx.beginPath();
        slice.forEach((price, i) =>
          i ? ctx.lineTo(px(i), py(price)) : ctx.moveTo(px(i), py(price)),
        );
        const lastX = px(slice.length - 1);
        const lastY = py(slice[slice.length - 1]);
        ctx.lineTo(lastX, yBase + 2);
        ctx.lineTo(x0, yBase + 2);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, yTop, 0, yBase + 2);
        fill.addColorStop(0, "rgba(176,138,74,0.16)");
        fill.addColorStop(1, "rgba(176,138,74,0)");
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.beginPath();
        slice.forEach((price, i) =>
          i ? ctx.lineTo(px(i), py(price)) : ctx.moveTo(px(i), py(price)),
        );
        ctx.strokeStyle = "rgba(196,176,122,0.85)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = "rgba(196,176,122,0.3)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x0, lastY);
        ctx.lineTo(x1, lastY);
        ctx.stroke();
        ctx.setLineDash([]);
        const halo = reduced ? 0.35 : 0.35 + Math.sin(t * 2.6) * 0.25;
        ctx.beginPath();
        ctx.arc(
          lastX,
          lastY,
          6 + (reduced ? 0 : Math.sin(t * 2.6) * 2),
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = `rgba(196,176,122,${halo})`;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(lastX, lastY, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(232,226,214,0.95)";
        ctx.fill();
      }

      const last = live.trades[0];
      if (last && live.tick - last.tick < 8) {
        const flash = 1 - (live.tick - last.tick) / 8;
        ctx.strokeStyle = `rgba(232,226,214,${flash * 0.5})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (1.04 + (1 - flash) * 0.16), 0, Math.PI * 2);
        ctx.stroke();
      }

      const living = live.flies.filter((row) => row.status === "alive");
      hits.current = [];
      let selectedPos = null;
      living.forEach((row, i) => {
        const drift =
          t * (0.18 + (row.id % 5) * 0.028) +
          (i / Math.max(living.length, 1)) * Math.PI * 2;
        const lane = 0.86 + (row.id % 4) * 0.055;
        const lit = row.id === focus;
        const hot = row.id === hover.current;
        const wobble = reduced
          ? 0
          : Math.sin(t * 1.6 + row.id) * (lit ? 0.02 : 0.04);
        const radius = r * lane * (lit ? 0.82 : 1) * (1 + wobble);
        const x = cx + Math.cos(drift) * radius;
        const y = cy + Math.sin(drift) * radius * 0.9;
        const heading =
          row.lastSide === "BUY"
            ? -0.7 + Math.sin(t * 0.9 + row.id) * 0.1
            : row.lastSide === "SELL"
              ? 0.7 + Math.sin(t * 0.9 + row.id) * 0.1
              : drift + Math.PI / 2;
        const flap = reduced
          ? 0.42
          : 0.5 + Math.sin(t * (12 + (row.id % 4)) + row.id) * 0.5;
        if (lit) selectedPos = { x, y };
        if (!reduced) {
          const line = flyTrails.current.get(row.id) || [];
          line.push({ x, y });
          if (line.length > 26) line.shift();
          flyTrails.current.set(row.id, line);
          line.forEach((dot, j) => {
            const fade = (j / line.length) * (lit ? 0.4 : 0.2);
            ctx.fillStyle = `rgba(196,176,122,${fade})`;
            const dotSize = lit ? 2 : 1.4;
            ctx.fillRect(dot.x, dot.y, dotSize, dotSize);
          });
        }
        drawFly(
          x,
          y,
          lit ? 1.46 : hot ? 1.05 : 0.84,
          heading,
          lit || hot,
          flap,
          lit ? 1 : 0.86,
        );
        hits.current.push({ id: row.id, x, y });
      });

      if (selectedPos) {
        ctx.strokeStyle = "rgba(176,138,74,0.42)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(selectedPos.x, selectedPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(196,176,122,0.7)";
        ctx.beginPath();
        ctx.arc(
          selectedPos.x,
          selectedPos.y,
          22 + Math.sin(t * 2.2) * 2,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        if (!reduced) {
          trail.current.push({ x: selectedPos.x, y: selectedPos.y });
          if (trail.current.length > 18) trail.current.shift();
          trail.current.forEach((dot, i) => {
            ctx.fillStyle = `rgba(176,138,74,${(i / trail.current.length) * 0.22})`;
            ctx.fillRect(dot.x, dot.y, 2, 2);
          });
        }
      } else {
        trail.current = [];
      }

      // Vignette keeps the stage reading as one lit plate instead of a flat panel.
      const vignette = ctx.createRadialGradient(
        cx,
        cy,
        r * 1.15,
        cx,
        cy,
        Math.max(width, height) * 0.75,
      );
      vignette.addColorStop(0, "rgba(10,9,7,0)");
      vignette.addColorStop(1, "rgba(6,5,4,0.52)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    }

    canvas.addEventListener("mousemove", onMove);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", onMove);
      resize.disconnect();
    };
  }, []);

  function pick(event) {
    const box = ref.current.getBoundingClientRect();
    const id = nearestHit(
      hits.current,
      event.clientX - box.left,
      event.clientY - box.top,
      34,
    );
    if (id != null) onSelect?.(id);
  }

  const fly =
    swarm.flies.find((row) => row.id === selectedId) || swarm.flies[0];
  const reflex = fly ? reflexOf(fly) : null;
  return (
    <div className="home-field">
      <canvas
        ref={ref}
        className="home-field-canvas"
        aria-hidden="true"
        onClick={pick}
      />
      <div className="home-field-read">
        <small>#{fly?.id ?? "—"}</small>
        <strong className={reflex?.side.toLowerCase()}>
          {reflex?.side || "HOLD"}
        </strong>
        <em>{formatPrice(swarm.market.price)}</em>
      </div>
    </div>
  );
}

export function useHomeSwarm() {
  const [swarm, setSwarm] = useState(loadStoredSwarm);
  const [selectedId, setSelectedId] = useState(() => recallFly() ?? 0);
  const touched = useRef(false);
  const swarmRef = useRef(swarm);
  swarmRef.current = swarm;

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      setSwarm((current) => {
        const next = tickSwarm(current);
        saveStoredSwarm(next);
        return next;
      });
    }, 700);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const living = swarm.flies.filter((row) => row.status === "alive");
    if (living.length && !living.some((row) => row.id === selectedId)) {
      setSelectedId(living[0].id);
      rememberFly(living[0].id);
    }
  }, [swarm, selectedId]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || touched.current) return;
      const living = swarmRef.current.flies.filter(
        (row) => row.status === "alive",
      );
      if (!living.length) return;
      setSelectedId((current) => {
        const idx = living.findIndex((row) => row.id === current);
        const next = living[(idx + 1 + living.length) % living.length];
        rememberFly(next.id);
        return next.id;
      });
    }, 4200);
    return () => clearInterval(id);
  }, []);

  function select(id) {
    touched.current = true;
    setSelectedId(id);
    rememberFly(id);
  }
  return { swarm, selectedId, select };
}
