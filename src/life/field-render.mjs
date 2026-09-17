import { flyPhase, flySprite } from "./fly-sprite.mjs";

export { flySprite };

const TAU = Math.PI * 2;

function hexRgb(hex) {
  const n = Number.parseInt(String(hex || "#f0b90b").replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba({ r, g, b }, a) {
  return `rgba(${r},${g},${b},${a})`;
}

function liftRgb(hex) {
  const c = hexRgb(hex);
  const max = Math.max(c.r, c.g, c.b, 1);
  const lift = max < 140 ? 140 / max : 1;
  return {
    r: Math.min(255, Math.round(c.r * lift + 36)),
    g: Math.min(255, Math.round(c.g * lift + 24)),
    b: Math.min(255, Math.round(c.b * lift + 14)),
  };
}

export function createFieldRenderer(canvas, read) {
  const ctx = canvas.getContext("2d");
  let frame = 0;
  let running = true;
  let width = 0;
  let height = 0;
  let tick = 0;
  let adj = [];
  let adjSrc = null;
  const hits = [];
  const shimmer = [];

  function resize() {
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = box.width;
    height = box.height;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(neuron, camera) {
    const cy = Math.cos(camera.yaw);
    const sy = Math.sin(camera.yaw);
    const cp = Math.cos(camera.pitch);
    const sp = Math.sin(camera.pitch);
    const x1 = neuron.x * cy + neuron.z * sy;
    const z1 = -neuron.x * sy + neuron.z * cy;
    const y2 = neuron.y * cp - z1 * sp;
    const z2 = neuron.y * sp + z1 * cp;
    const persp = 1 / Math.max(0.42, 1.28 - z2 * 0.28);
    const scale = Math.min(width * 0.34, height * 0.44) * camera.zoom;
    return {
      x: width / 2 + x1 * scale * persp,
      y: height * 0.5 - y2 * scale * persp,
      depth: z2,
      persp,
      r: Math.max(1.05, (1.85 + (neuron.t > 2 ? 0.7 : 0)) * persp),
    };
  }

  function draw() {
    if (!running) return;
    frame = requestAnimationFrame(draw);
    const { field, souls, selected, camera, pulses, reduced, wallet, hoverId } =
      read();
    if (!field) return;
    resize();
    hits.length = 0;
    tick += reduced ? 0 : 1;
    if (shimmer.length !== field.neurons.length) {
      shimmer.length = field.neurons.length;
      shimmer.fill(0);
    }
    if (adjSrc !== field.edges) {
      adjSrc = field.edges;
      adj = Array.from({ length: field.neurons.length }, () => []);
      for (const pair of field.edges || []) {
        adj[pair[0]]?.push(pair[1]);
        adj[pair[1]]?.push(pair[0]);
      }
    }

    ctx.clearRect(0, 0, width, height);
    const ore = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      16,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    ore.addColorStop(0, "rgba(72, 50, 18, 0.5)");
    ore.addColorStop(0.38, "rgba(28, 20, 10, 0.62)");
    ore.addColorStop(1, "rgba(6, 5, 4, 0.96)");
    ctx.fillStyle = ore;
    ctx.fillRect(0, 0, width, height);

    if (!reduced) camera.yaw += 0.0022;
    const projected = field.neurons.map((neuron) => project(neuron, camera));
    const live = new Map(souls.map((soul) => [soul.perch, soul]));
    const order = field.neurons.map((_, i) => i);
    order.sort((a, b) => projected[a].depth - projected[b].depth);

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    for (const p of projected) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const mass = ctx.createRadialGradient(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      20,
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      Math.max(maxX - minX, maxY - minY) * 0.58,
    );
    mass.addColorStop(0, "rgba(88, 62, 22, 0.28)");
    mass.addColorStop(0.55, "rgba(36, 24, 10, 0.16)");
    mass.addColorStop(1, "rgba(10, 8, 5, 0)");
    ctx.fillStyle = mass;
    ctx.beginPath();
    ctx.ellipse(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (maxX - minX) * 0.42,
      (maxY - minY) * 0.48,
      0,
      0,
      TAU,
    );
    ctx.fill();

    for (const key of Object.keys(pulses)) {
      const i = Number(key);
      if (!pulses[i]) continue;
      shimmer[i] = Math.max(shimmer[i], pulses[i]);
      for (const other of adj[i] || []) {
        shimmer[other] = Math.max(shimmer[other], pulses[i] * 0.58);
      }
    }

    if (field.edges?.length) {
      const buckets = [
        new Path2D(),
        new Path2D(),
        new Path2D(),
        new Path2D(),
        new Path2D(),
        new Path2D(),
      ];
      for (const [a, b] of field.edges) {
        const A = projected[a];
        const B = projected[b];
        const depth = (A.depth + B.depth) / 2;
        const bucket = Math.min(
          5,
          Math.max(0, Math.floor(((depth + 1.2) / 2.4) * 6)),
        );
        buckets[bucket].moveTo(A.x, A.y);
        buckets[bucket].lineTo(B.x, B.y);
      }
      ctx.lineWidth = 0.85;
      for (let i = 0; i < buckets.length; i += 1) {
        ctx.strokeStyle = `rgba(226, 178, 84, ${(0.055 + ((i + 0.4) / 6) * 0.16).toFixed(3)})`;
        ctx.stroke(buckets[i]);
      }
    }

    for (const i of order) {
      const neuron = field.neurons[i];
      const p = projected[i];
      const soul = live.get(neuron.i);
      const transmitter = field.transmitters[neuron.t];
      const depth = (p.depth + 1.15) / 2.3;
      if (!reduced && Math.random() < 0.0018)
        shimmer[i] = 0.28 + Math.random() * 0.35;
      shimmer[i] *= 0.965;
      const pulse = Math.max(pulses[neuron.i] || 0, shimmer[i]);
      const twinkle = 0.5 + 0.5 * Math.sin(tick * 0.035 + neuron.i * 0.13);
      if (soul) continue;
      const rare = neuron.t > 2;
      const rgb = hexRgb(transmitter.hex);
      const size = p.r * (rare ? 2.05 : 1.45) * (1 + pulse * 0.95);
      ctx.globalAlpha = Math.min(
        1,
        0.28 + depth * 0.62 + pulse * 0.75 + (rare ? 0.1 : 0),
      );
      ctx.fillStyle = rgba(rgb, 1);
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      if (pulse > 0.35) {
        ctx.globalAlpha = pulse * 0.22;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * (3.2 + twinkle), 0, TAU);
        ctx.fill();
      }
    }

    for (const soul of souls) {
      const neuron = field.neurons[soul.perch];
      if (!neuron) continue;
      const p = projected[soul.perch];
      const art = soul.phenotype.art;
      const rgb = liftRgb(art.body);
      const eye = liftRgb(art.eye);
      const mine = wallet && soul.owner.toLowerCase() === wallet.toLowerCase();
      const picked =
        selected?.tokenId === soul.tokenId || hoverId === soul.tokenId;
      const birth = pulses[soul.perch] || 0;
      const beat = 0.5 + 0.5 * Math.sin(tick * 0.1 + soul.tokenId);
      const flash = 0.5 + 0.5 * Math.sin(tick * 0.16 + soul.tokenId * 1.7);
      const k = (0.72 + ((p.depth + 1) / 2) * 0.55) * camera.zoom;
      ctx.globalAlpha = 0.16 + beat * 0.22 + birth * 0.5 + (picked ? 0.1 : 0);
      ctx.fillStyle = rgba(rgb, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (26 + beat * 9 + birth * 30) * k, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.18 + flash * 0.28 + birth * 0.2;
      ctx.fillStyle = rgba(eye, 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (10 + flash * 4) * k, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.88 + birth * 0.12;
      ctx.strokeStyle = mine ? "#f0d27a" : rgba(rgb, 0.95);
      ctx.lineWidth = mine ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (7.4 + beat * 1.8) * k, 0, TAU);
      ctx.stroke();
      const tile = flySprite(art, {
        flying: true,
        phase: flyPhase(tick * 0.016, soul.tokenId),
      });
      const rot =
        Math.sin(soul.tokenId * 1.7) * 0.18 +
        Math.sin(tick * 0.012 + soul.tokenId) * 0.08;
      const sz = 44 * k * (art.scale || 1);
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(rot);
      ctx.drawImage(tile, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
      if (mine) {
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = "#f0d27a";
        ctx.font = "10px IBM Plex Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText("★", p.x, p.y - 16 * k);
      }
      if (picked || mine || souls.length < 24) {
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = "#e6dcc4";
        ctx.font = "10px IBM Plex Mono, monospace";
        ctx.textAlign = "left";
        ctx.fillText(`#${soul.tokenId}`, p.x + 11, p.y);
      }
      hits.push({ x: p.x, y: p.y, r: 16 * k, tokenId: soul.tokenId });
    }

    ctx.globalAlpha = 1;
    const veil = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.28,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.62,
    );
    veil.addColorStop(0, "rgba(8,7,5,0)");
    veil.addColorStop(1, "rgba(8,7,5,0.42)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, height);

    for (const key of Object.keys(pulses)) {
      pulses[key] *= 0.94;
      if (pulses[key] < 0.02) delete pulses[key];
    }
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
  return {
    hits,
    destroy() {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    },
  };
}

export function nearestFieldSoul(hits, x, y) {
  let best = null;
  let dist = 22;
  for (const hit of hits) {
    const d = Math.hypot(hit.x - x, hit.y - y);
    if (d < dist && d < hit.r + 8) {
      dist = d;
      best = hit;
    }
  }
  return best;
}
