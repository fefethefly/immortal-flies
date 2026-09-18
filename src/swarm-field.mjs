/**
 * 首页蝇群场：一只蝇 = 一个托管运行器 / 分片，不是一个官方神经元。
 * 画法与交易场 PitCanvas 同源。本文件不改 mesh 状态。
 */

const TAU = Math.PI * 2;

export const FIELD_LOCI = Object.freeze({
  "sensory.food": { x: 0.2, y: 0.3, r: 0.09, label: "FOOD" },
  "sensory.threat": { x: 0.46, y: 0.17, r: 0.09, label: "THREAT" },
  "sensory.light": { x: 0.78, y: 0.28, r: 0.09, label: "LIGHT" },
  "motor.left": { x: 0.22, y: 0.76, r: 0.09, label: "L-MOT" },
  "motor.right": { x: 0.8, y: 0.76, r: 0.09, label: "R-MOT" },
  "inter.core": { x: 0.52, y: 0.52, r: 0.2, label: "INTER" },
});

const LINKS = Object.freeze([
  ["sensory.food", "sensory.threat"],
  ["sensory.threat", "sensory.light"],
  ["sensory.food", "inter.core"],
  ["sensory.threat", "inter.core"],
  ["sensory.light", "inter.core"],
  ["motor.left", "inter.core"],
  ["motor.right", "inter.core"],
  ["motor.left", "sensory.food"],
  ["motor.right", "sensory.light"],
]);

function shardSeat(regionId, index, count) {
  const locus = FIELD_LOCI[regionId];
  if (!locus) return { ux: 0.5, uy: 0.5 };
  if (count <= 1) return { ux: locus.x, uy: locus.y };
  const a = -Math.PI / 2 + (index / count) * TAU;
  const spread = regionId === "inter.core" ? locus.r * 0.72 : locus.r * 0.55;
  return {
    ux: locus.x + Math.cos(a) * spread,
    uy: locus.y + Math.sin(a) * spread * 0.88,
  };
}

export function fieldBodies(view) {
  const byRegion = new Map();
  for (const shard of view.shards || []) {
    if (!byRegion.has(shard.regionId)) byRegion.set(shard.regionId, []);
    byRegion.get(shard.regionId).push(shard);
  }
  const bodies = [];
  for (const [regionId, shards] of byRegion) {
    shards.forEach((shard, index) => {
      const seat = shardSeat(regionId, index, shards.length);
      bodies.push({
        shardId: shard.id,
        regionId,
        nodeId: shard.assignedNode,
        status: shard.status,
        officialCount: shard.officialCount,
        ux: seat.ux,
        uy: seat.uy,
      });
    });
  }
  return bodies;
}

function drawFly(ctx, x, y, scale, heading, lit, you) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.scale(scale, scale);
  ctx.strokeStyle = you ? "#f0ead9" : lit ? "#e6d7b0" : "#8a8172";
  ctx.fillStyle = lit || you ? "#17140f" : "#12100d";
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.ellipse(-11, 0, 7, 16, -0.5, 0, TAU);
  ctx.ellipse(11, 0, 7, 16, 0.5, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 2, 4.2, 12, 0, 0, TAU);
  ctx.fillStyle = you ? "#a9c4bb" : lit ? "#f0ead9" : "#a89e8c";
  ctx.fill();
  ctx.restore();
}

export function createSwarmFieldRenderer(canvas, read) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { destroy() {}, hits: [] };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let width = 0;
  let height = 0;
  let raf = 0;
  let angle = 0;
  let lastLive = new Set();
  const arrivals = new Map();
  const hits = [];

  const resize = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    const d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = width * d;
    canvas.height = height * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  });
  resize.observe(canvas);

  function draw() {
    raf = requestAnimationFrame(draw);
    if (document.hidden || !width) return;
    const { view, focusId, guestNodeId } = read();
    if (!reduced) angle += 0.0042;
    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.5;
    const wash = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.max(width, height) * 0.62);
    wash.addColorStop(0, "rgba(240,185,11,0.06)");
    wash.addColorStop(1, "rgba(8,7,6,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    if (!reduced) {
      for (let i = 0; i < 36; i += 1) {
        const seed = (i * 97 + Math.floor(angle * 280)) % 997;
        ctx.fillStyle = i % 6 === 0 ? "rgba(240,185,11,.26)" : "rgba(147,161,129,.1)";
        ctx.fillRect((seed * 1.73) % width, (seed * 2.41 + i * 13) % height, 1.2, 1.2);
      }
    }

    ctx.strokeStyle = "rgba(47,42,31,0.9)";
    ctx.lineWidth = 1;
    for (const [a, b] of LINKS) {
      const A = FIELD_LOCI[a];
      const B = FIELD_LOCI[b];
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(A.x * width, A.y * height);
      ctx.lineTo(B.x * width, B.y * height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    for (const [id, locus] of Object.entries(FIELD_LOCI)) {
      const x = locus.x * width;
      const y = locus.y * height;
      ctx.strokeStyle = id === "inter.core" ? "rgba(240,185,11,0.28)" : "rgba(156,171,141,0.2)";
      ctx.beginPath();
      ctx.ellipse(x, y, locus.r * width, locus.r * height * 1.05, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "#7a7266";
      ctx.fillText(locus.label, x, y - locus.r * height - 8);
    }

    const bodies = fieldBodies(view);
    const liveNow = new Set(
      bodies.filter((row) => row.status === "LIVE" || row.status === "STALE").map((row) => row.shardId),
    );
    for (const id of liveNow) {
      if (!lastLive.has(id) && lastLive.size) {
        arrivals.set(id, 0);
      }
    }
    lastLive = liveNow;
    hits.length = 0;

    for (const body of bodies) {
      const seatX = body.ux * width;
      const seatY = body.uy * height;
      const orbit = reduced ? 0 : 7 + (body.officialCount % 5);
      const spin = angle * (body.status === "EMPTY" ? 0.2 : 1) + body.ux * 12;
      let x = seatX + Math.cos(spin) * orbit;
      let y = seatY + Math.sin(spin) * orbit * 0.72;
      let arrive = arrivals.get(body.shardId);
      if (arrive != null && arrive < 1) {
        arrive = Math.min(1, arrive + 0.035);
        arrivals.set(body.shardId, arrive);
        const t = 1 - (1 - arrive) ** 3;
        x = width * 1.08 * (1 - t) + x * t;
        y = height * 0.18 * (1 - t) + y * t;
      }
      const hosted = body.status === "LIVE" || body.status === "STALE";
      const you = body.nodeId && body.nodeId === guestNodeId;
      const lit = body.nodeId === focusId || you;
      hits.push({
        kind: hosted ? "fly" : "perch",
        shardId: body.shardId,
        nodeId: body.nodeId,
        regionId: body.regionId,
        x,
        y,
      });
      if (!hosted) {
        ctx.strokeStyle = "rgba(122,114,102,0.55)";
        ctx.beginPath();
        ctx.arc(seatX, seatY, 5, 0, TAU);
        ctx.stroke();
        continue;
      }
      const heading = spin + Math.PI / 2;
      drawFly(ctx, x, y, lit ? 1.08 : you ? 1 : 0.78, heading, lit, you);
      ctx.fillStyle = you ? "#fcd535" : "#7a7266";
      ctx.textAlign = "left";
      ctx.fillText(you ? "YOU" : body.shardId.replace("shard-", "#"), x + 12, y - 9);
    }
  }

  draw();
  return {
    hits,
    destroy() {
      cancelAnimationFrame(raf);
      resize.disconnect();
    },
  };
}

export function nearestFieldHit(hits, x, y, reach = 28) {
  let best = null;
  let dist = reach;
  for (const hit of hits) {
    const d = Math.hypot(hit.x - x, hit.y - y);
    if (d < dist) {
      dist = d;
      best = hit;
    }
  }
  return best;
}
