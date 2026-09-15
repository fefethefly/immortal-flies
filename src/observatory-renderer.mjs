import { createFlyCloud, colonyPosition } from "./observatory-art.mjs";

const TAU = Math.PI * 2;
const CLOUD = createFlyCloud();
const COLORS = { neural: "#a9c4bb", society: "#c9a25e", market: "#93a181" };
const countBits = (value) => {
  let n = value >>> 0,
    count = 0;
  while (n) {
    n &= n - 1;
    count++;
  }
  return count;
};

// All particles are artistic geometry. Membership, spikes and fill bursts come
// from read().swarm. This renderer never mutates the simulation.
export function createObservatoryRenderer(canvas, read) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { schedule() {}, destroy() {} };
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0,
    height = 0,
    raf = 0,
    visible = true,
    last = 0,
    time = 0;
  let seenTick = null,
    seenTrade = null,
    seenId = null,
    seenSpikes = 0;
  let bursts = [],
    ghosts = [];
  const pointer = { x: 0, y: 0 };
  const sprites = new Map();
  for (const color of [
    ...Object.values(COLORS),
    "#b57660",
    "#e6e0cf",
    "#d9a86a",
  ]) {
    const surface = document.createElement("canvas");
    surface.width = surface.height = 64;
    const brush = surface.getContext("2d"),
      gradient = brush.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "#f0ead9");
    gradient.addColorStop(0.12, color);
    gradient.addColorStop(0.34, `${color}88`);
    gradient.addColorStop(1, `${color}00`);
    brush.fillStyle = gradient;
    brush.fillRect(0, 0, 64, 64);
    sprites.set(color, surface);
  }
  function light(x, y, radius, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      sprites.get(color),
      x - radius,
      y - radius,
      radius * 2,
      radius * 2,
    );
    ctx.globalAlpha = 1;
  }
  function line(points, color, alpha = 1, size = 1) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function along(path, u) {
    const v = u * (path.length - 1),
      i = Math.min(path.length - 2, Math.floor(v)),
      f = v - i;
    return [
      path[i][0] + (path[i + 1][0] - path[i][0]) * f,
      path[i][1] + (path[i + 1][1] - path[i][1]) * f,
    ];
  }
  function packet(path, u, color, strength = 1) {
    const start = along(path, Math.max(0, u - 0.09)),
      end = along(path, u);
    line([start, end], color, 0.7 * strength, 1.5);
    light(...end, 10, color, 0.65 * strength);
    ctx.fillStyle = "#e6e0cf";
    ctx.fillRect(end[0] - 1.2, end[1] - 1.2, 2.4, 2.4);
  }
  function draw(now) {
    raf = 0;
    const { swarm, selectedId, mode, paused } = read();
    const reduced = media.matches,
      animate = !reduced && !paused;
    if (!visible || document.hidden || !width) {
      last = 0;
      return;
    }
    const frameBudget = width < 480 ? 32 : 20;
    if (animate && now - last < frameBudget) {
      raf = requestAnimationFrame(draw);
      return;
    }
    if (animate && last) time += Math.min((now - last) / 1000, 0.06);
    last = now;
    const t = reduced ? 0 : time,
      cx = width / 2,
      cy = height * 0.49,
      unit = Math.min(width / 620, height / 550);
    const color = COLORS[mode],
      fly = swarm.flies.find((f) => f.id === selectedId) || swarm.flies[0];
    const spikes = fly?.brain?.spikes || 0,
      spikeCount = countBits(spikes);
    const trade = swarm.trades[0],
      tradeKey = trade ? `${trade.tick}:${trade.flyId}:${trade.side}` : null;
    if (seenTick !== swarm.tick || seenId !== selectedId) {
      if (seenTick !== null && animate) {
        if (seenSpikes !== spikes || seenId !== selectedId)
          bursts.push({ at: t, type: "neural", power: spikeCount / 24, color });
        if (tradeKey && tradeKey !== seenTrade)
          bursts.push({
            at: t,
            type: "trade",
            power: 1,
            color: trade.side === "SELL" ? "#d9a86a" : COLORS.market,
          });
      }
      seenTick = swarm.tick;
      seenTrade = tradeKey;
      seenSpikes = spikes;
      seenId = selectedId;
    }
    bursts = bursts.filter((b) => t - b.at < 1.7).slice(-10);
    ctx.clearRect(0, 0, width, height);
    const aura = ctx.createRadialGradient(
      cx,
      cy - 45 * unit,
      0,
      cx,
      cy,
      width * 0.53,
    );
    aura.addColorStop(0, `${color}25`);
    aura.addColorStop(0.42, `${color}0e`);
    aura.addColorStop(1, `${color}00`);
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    // Counter-rotating scanner arcs and orbiting light heads.
    for (let i = 0; i < 4; i++) {
      const rx = width * (0.24 + i * 0.05),
        ry = height * (0.26 + i * 0.035),
        a = t * (i % 2 ? -0.25 : 0.19) + i * 1.5;
      ctx.lineWidth = i === 1 ? 1.1 : 0.6;
      ctx.strokeStyle = `${color}28`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `${color}${i % 2 ? "95" : "65"}`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, a, a + 0.8);
      ctx.stroke();
      light(
        cx + Math.cos(a + 0.8) * rx,
        cy + Math.sin(a + 0.8) * ry,
        8 * unit,
        color,
        0.65,
      );
    }
    ctx.setLineDash([2, 8]);
    line(
      [
        [cx, 24],
        [cx, height - 35],
      ],
      color,
      0.13,
    );
    line(
      [
        [12, cy],
        [width - 12, cy],
      ],
      color,
      0.13,
    );
    ctx.setLineDash([]);
    // A visible photon stream through each real agent link.
    const living = swarm.flies.filter((f) => f.status === "alive");
    living.forEach((f, i) => {
      const p = colonyPosition(i, living.length),
        x = (p.x * width) / 100,
        y = (p.y * height) / 100;
      const path = [
        [cx, cy - 24 * unit],
        [cx + (x - cx) * 0.56, cy + (y - cy) * 0.24],
        [x, y],
      ];
      const hot = f.id === selectedId || mode === "society";
      const activity = countBits(f.brain?.spikes || 0) / 24;
      line(path, color, hot ? 0.55 : 0.16, hot ? 1 : 0.6);
      if (!reduced) {
        for (let j = 0; j < (hot ? 3 : 1); j++)
          packet(
            path,
            (t * (0.44 + activity * 0.2) + i * 0.13 + j / 3) % 1,
            color,
            hot ? 0.9 : 0.35,
          );
        const ring = (t * 0.58 + i * 0.19) % 1;
        ctx.strokeStyle = color;
        ctx.globalAlpha = (1 - ring) * (hot ? 0.65 : 0.2);
        ctx.beginPath();
        ctx.arc(x, y, 7 + ring * 19, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1,
        row = i % 3;
      // The unconnected economic layer deliberately carries no activity packets.
      const hot =
        ["neural", "society", "society", "market", "market", null][i] === mode;
      const path = [
        [cx + side * width * 0.16, cy + (row - 1) * 55],
        [cx + side * width * 0.35, cy + (row - 1) * height * 0.31],
        [cx + side * width * 0.5, cy + (row - 1) * height * 0.31],
      ];
      line(path, color, hot ? 0.65 : 0.13);
      if (!reduced && hot)
        for (let j = 0; j < 2; j++)
          packet(path, (t * 0.72 + j / 2 + row * 0.14) % 1, color);
    }
    // Long curved particle trails create depth and acceleration without hiding anatomy.
    for (let i = 0; i < (width < 480 ? 80 : 155); i++) {
      const radius = 0.23 + (i % 19) / 43,
        a = i * 2.39996 + t * (0.08 + (i % 7) * 0.018);
      const x = cx + Math.cos(a) * width * radius,
        y = cy + Math.sin(a) * height * radius * 0.82;
      const len = reduced ? 0 : 0.014 + (i % 4) * 0.004;
      line(
        [
          [
            cx + Math.cos(a - len) * width * radius,
            cy + Math.sin(a - len) * height * radius * 0.82,
          ],
          [x, y],
        ],
        color,
        0.16 + (i % 3) * 0.1,
        0.8,
      );
      if (i % 9 === 0) light(x, y, 5 * unit, color, 0.7);
    }
    // Event rings and sparks originate only from observed spike/fill changes.
    if (!reduced)
      for (const burst of bursts) {
        const age = t - burst.at,
          fade = Math.max(0, 1 - age / 1.7),
          by = burst.type === "neural" ? cy - 100 * unit : cy;
        const radius = (22 + age * (burst.type === "trade" ? 200 : 120)) * unit;
        ctx.strokeStyle = burst.color;
        ctx.globalAlpha = fade * 0.4;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, by, radius, radius * 0.63, 0, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        for (let i = 0; i < 12 + burst.power * 10; i++) {
          const a = i * 2.399 + burst.at,
            r = (16 + age * (70 + (i % 5) * 18)) * unit;
          const x = cx + Math.cos(a) * r,
            y = by + Math.sin(a) * r * 0.7;
          line(
            [
              [x - Math.cos(a) * 9 * fade, y - Math.sin(a) * 6 * fade],
              [x, y],
            ],
            burst.color,
            fade * 0.6,
          );
          light(x, y, 6 * unit, burst.color, fade * 0.55);
        }
      }
    const yaw = 0.2 + Math.sin(t * 0.48) * 0.22 + pointer.x * 0.2,
      tilt = -0.16 + Math.sin(t * 0.7) * 0.04 + pointer.y * 0.1;
    const scale = unit * 1.55,
      bob = reduced ? 0 : Math.sin(t * 2.3) * 5 * unit;
    function project(x, y, z) {
      const xx = x * Math.cos(yaw) + z * Math.sin(yaw),
        zz = -x * Math.sin(yaw) + z * Math.cos(yaw);
      const yy = y * Math.cos(tilt) - zz * Math.sin(tilt),
        depth = y * Math.sin(tilt) + zz * Math.cos(tilt),
        perspective = 560 / (560 - depth);
      return {
        x: cx + xx * scale * perspective,
        y: cy + yy * scale * perspective + bob,
        z: depth,
      };
    }
    const flap = reduced ? 0 : Math.sin(t * TAU * 5.7);
    const sweep = reduced ? 0 : Math.sin(t * TAU * 5.7 + 0.65) * 0.29;
    const projected = CLOUD.map((p) => {
      let { x, y, z } = p;
      if (p.side) {
        // Rotate the entire wing (membrane, contour and veins) around its hinge.
        const u = Math.abs(x) - 18,
          v = y + 34;
        const folded = 0.25 + flap * 0.78;
        const u1 = u * Math.cos(sweep) + v * Math.sin(sweep),
          v1 = -u * Math.sin(sweep) + v * Math.cos(sweep);
        x = p.side * (18 + u1 * Math.cos(folded));
        y = -34 + v1;
        z = 14 + u1 * Math.sin(folded);
      }
      return { p, ...project(x, y, z) };
    });
    // Sparse previous wing poses give a soft, bounded motion blur.
    if (!reduced)
      for (let j = 0; j < ghosts.length; j++) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.055 + j * 0.035;
        for (const p of ghosts[j])
          ctx.fillRect(p.x, p.y, 1.4 * unit, 1.4 * unit);
      }
    ctx.globalAlpha = 1;
    if (animate) {
      ghosts.push(projected.filter((p, i) => p.p.side && i % 3 === 0));
      ghosts = ghosts.slice(-3);
    }
    projected.sort((a, b) => a.z - b.z);
    const scanY = ((t * 100) % 260) - 130;
    for (const { p, x, y, z } of projected) {
      const scan = reduced ? 0 : Math.max(0, 1 - Math.abs(p.y - scanY) / 23);
      const running = reduced
        ? 0
        : Math.pow(Math.max(0, Math.sin(t * 5 - p.y * 0.042 + p.seed * 3)), 8);
      let alpha = 0.4 + (z + 65) / 280 + scan * 0.55 + running * 0.3;
      const colorPoint =
        p.material === "eye"
          ? "#b57660"
          : p.material === "wing"
            ? color
            : p.material === "vein"
              ? "#e6e0cf"
              : "#c9a25e";
      if (p.material === "wing") alpha *= 0.65;
      if (p.material === "abdomen" && Math.sin(p.y * 0.29) > 0.3) alpha *= 0.35;
      ctx.globalAlpha = Math.min(0.95, alpha);
      ctx.fillStyle = colorPoint;
      const size =
        (p.material === "eye" ? 1.6 : p.material === "wing" ? 0.95 : 1.3) *
        unit;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
      if (p.material === "eye" && p.seed > 0.95)
        light(x, y, 9 * unit, "#b57660", 0.3);
      else if (p.seed > 0.87 && (scan > 0.5 || running > 0.6))
        light(
          x,
          y,
          (5 + scan * 4) * unit,
          p.material === "vein" ? "#e6e0cf" : color,
          0.28,
        );
    }
    ctx.globalAlpha = 1;
    // Travelling energy on the thorax and abdomen, presented as artistic light.
    if (!reduced)
      for (let i = 0; i < 20; i++) {
        const y = ((t * 78 + i * 11) % 170) - 80,
          a = i * 2.4 + t * 1.6,
          r =
            y > 0 ? 22 * Math.sqrt(Math.max(0, 1 - ((y - 45) / 65) ** 2)) : 20;
        const p = project(Math.cos(a) * r, y, Math.sin(a) * r + 10);
        light(p.x, p.y, 7 * unit, color, 0.65);
      }
    const neural = Array.from({ length: 24 }, (_, i) =>
      project(
        Math.cos(i * 2.4) * (4 + (i % 4) * 1.4),
        -67 + Math.sin(i * 2.4) * 8,
        25,
      ),
    );
    neural.forEach((p, i) => {
      const active = Boolean((spikes >>> i) & 1),
        next = neural[(i + 5) % 24];
      line(
        [
          [p.x, p.y],
          [next.x, next.y],
        ],
        color,
        active ? 0.8 : 0.15,
        active ? 1.2 : 0.6,
      );
      if (active) {
        light(p.x, p.y, 6 * unit, "#e6e0cf", 0.48);
        if (!reduced)
          packet(
            [
              [p.x, p.y],
              [next.x, next.y],
            ],
            (t * 0.8 + i * 0.14) % 1,
            color,
            0.16,
          );
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(p.x, p.y, unit, unit);
      }
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (animate) raf = requestAnimationFrame(draw);
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(draw);
  }
  const resize = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ghosts = [];
    schedule();
  });
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
  });
  const move = (e) => {
    if (media.matches || read().paused) return;
    const r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.width - 0.5;
    pointer.y = (e.clientY - r.top) / r.height - 0.5;
  };
  resize.observe(canvas);
  observer.observe(canvas);
  canvas.addEventListener("pointermove", move);
  document.addEventListener("visibilitychange", schedule);
  media.addEventListener("change", schedule);
  return {
    schedule,
    destroy() {
      cancelAnimationFrame(raf);
      resize.disconnect();
      observer.disconnect();
      canvas.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", schedule);
      media.removeEventListener("change", schedule);
      sprites.clear();
      bursts = [];
      ghosts = [];
    },
  };
}
