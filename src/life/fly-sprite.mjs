import {
  ABDOMEN,
  ANTENNAE,
  HALTERES,
  LEGS,
  VEINS,
  WING_L,
  WING_L2,
  WING_R,
  WING_R2,
} from "../mark-paths.mjs";

const TAU = Math.PI * 2;
const cache = new Map();

function hexRgb(hex) {
  const n = Number.parseInt(String(hex || "#8a6a32").replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function shade(hex, amt) {
  const c = hexRgb(hex);
  return `rgb(${Math.min(255, Math.max(0, c.r + amt))},${Math.min(255, Math.max(0, c.g + amt))},${Math.min(255, Math.max(0, c.b + amt))})`;
}

function rgba(hex, a) {
  const c = hexRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

export function flyPhase(time, id = 0) {
  return Math.floor(Math.abs(time) * 18 + id * 2.17) & 3;
}

export function flyHeading(fly, shift = { x: 0, y: 0 }) {
  const dx = shift.x || 0;
  const dy = shift.y || 0;
  if (Math.hypot(dx, dy) > 0.006) return Math.atan2(dy, dx);
  const side = fly?.lastSide || "HOLD";
  return side === "SELL" ? 0.28 : side === "BUY" ? -0.22 : 0.06;
}

function paintWings(
  g,
  { flying, phase, tired, collapsed, alpha = 1, flip = false },
) {
  const down = collapsed
    ? false
    : !flying || tired
      ? true
      : Boolean(((phase + (flip ? 1 : 0)) & 1) === 1);
  const left = new Path2D(down ? WING_L2 : WING_L);
  const right = new Path2D(down ? WING_R2 : WING_R);
  const membrane =
    tired || collapsed ? "rgba(214,198,168,0.2)" : "rgba(255,244,214,0.5)";
  const edge =
    tired || collapsed ? "rgba(214,198,168,0.42)" : "rgba(255,248,226,0.85)";
  g.save();
  g.globalAlpha *= alpha;
  g.fillStyle = membrane;
  g.strokeStyle = edge;
  g.lineWidth = 1.6;
  g.fill(left);
  g.fill(right);
  g.stroke(left);
  g.stroke(right);
  g.strokeStyle =
    tired || collapsed ? "rgba(255,236,186,0.16)" : "rgba(255,244,210,0.55)";
  g.lineWidth = 1.1;
  g.stroke(new Path2D(VEINS));
  g.restore();
}

function paintFly(g, art, pose) {
  g.save();
  g.scale(0.94, 0.94);
  paintWings(g, pose);
  // Motion echo: the opposite wing pose at low alpha reads as wingbeat blur.
  if (pose.flying && !pose.tired && !pose.collapsed) {
    paintWings(g, { ...pose, flip: true, alpha: 0.28 });
  }
  g.restore();

  g.save();
  g.scale(1.08, 1.08);
  const body = art.body || "#8a6a32";
  const dark = shade(body, -42);
  g.strokeStyle = "#2a1c10";
  g.lineWidth = pose.tired || pose.collapsed ? 1.5 : 1.85;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.stroke(new Path2D(LEGS));
  g.lineWidth = 1.5;
  g.stroke(new Path2D(HALTERES));
  g.stroke(new Path2D(ANTENNAE));

  g.fillStyle = shade(body, 8);
  g.beginPath();
  g.ellipse(0, -6, 9.8, 16.2, 0, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(20,14,8,0.16)";
  g.beginPath();
  g.ellipse(0, -10, 5.6, 8, 0, 0, TAU);
  g.fill();

  const abdomen = g.createLinearGradient(-9, 8, 9, 50);
  abdomen.addColorStop(0, shade(body, 30));
  abdomen.addColorStop(0.55, body);
  abdomen.addColorStop(1, shade(body, -20));
  g.fillStyle = abdomen;
  g.fill(new Path2D(ABDOMEN));

  const stripes = art.stripes || 0;
  g.strokeStyle = "rgba(22,14,8,0.58)";
  g.lineWidth = 2.2;
  for (let i = 0; i < stripes; i += 1) {
    const y = 16 + i * (26 / Math.max(1, stripes));
    const half = 7.6 - i * 0.65;
    g.beginPath();
    g.moveTo(-half, y);
    g.lineTo(half, y);
    g.stroke();
  }
  if (art.mark === "bar") {
    g.fillStyle = dark;
    g.fillRect(-6.8, 24, 13.6, 3.4);
  }
  if (art.mark === "spots") {
    g.fillStyle = dark;
    g.beginPath();
    g.arc(-3.6, 28, 1.8, 0, TAU);
    g.arc(3.6, 28, 1.8, 0, TAU);
    g.fill();
  }

  g.fillStyle = shade(body, 14);
  g.beginPath();
  g.ellipse(0, -30, 12.2, 10, 0, 0, TAU);
  g.fill();

  const eye = art.eye || "#c23a32";
  g.fillStyle = eye;
  g.beginPath();
  g.ellipse(-10.6, -36.4, 8.4, 9.4, 0, 0, TAU);
  g.ellipse(10.6, -36.4, 8.4, 9.4, 0, 0, TAU);
  g.fill();
  if (!pose.tired && !pose.collapsed) {
    g.fillStyle = "rgba(255,236,220,0.72)";
    g.beginPath();
    g.arc(-8.6, -39.6, 1.9, 0, TAU);
    g.arc(12.4, -39.6, 1.9, 0, TAU);
    g.fill();
    g.fillStyle = rgba(eye, 0.28);
    g.beginPath();
    g.arc(-11.8, -33.6, 3.3, 0, TAU);
    g.arc(9.4, -33.6, 3.3, 0, TAU);
    g.fill();
  }
  g.restore();
  if (pose.collapsed) g.globalAlpha = 0.7;
}

export function flySprite(art = {}, opts = {}) {
  const flying = opts.flying !== false && !opts.tired && !opts.collapsed;
  const phase = (opts.phase ?? 0) & 3;
  const tired = Boolean(opts.tired);
  const collapsed = Boolean(opts.collapsed);
  const key = `${art.body}|${art.eye}|${art.stripes}|${art.mark}|${flying}|${phase}|${tired}|${collapsed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.translate(100, 100);
  g.rotate(Math.PI / 2);
  g.scale(1.16, 1.16);
  paintFly(g, art, { flying, phase, tired, collapsed });
  cache.set(key, canvas);
  return canvas;
}
