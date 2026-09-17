import { createFlyCloud } from "../observatory-art.mjs";

const CLOUD = createFlyCloud();

export function hexRgb(hex) {
  const n = Number.parseInt(String(hex || "#f0b90b").replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgba({ r, g, b }, a) {
  return `rgba(${r},${g},${b},${a})`;
}

export function liftRgb(hex) {
  const c = hexRgb(hex);
  const max = Math.max(c.r, c.g, c.b, 1);
  const lift = max < 140 ? 140 / max : 1;
  return {
    r: Math.min(255, Math.round(c.r * lift + 36)),
    g: Math.min(255, Math.round(c.g * lift + 24)),
    b: Math.min(255, Math.round(c.b * lift + 14)),
  };
}

function colorOf(material, body, eye) {
  if (material === "eye") return eye;
  if (material === "wing") return { r: 236, g: 226, b: 190 };
  if (material === "vein") return { r: 240, g: 234, b: 217 };
  if (material === "gold") return body;
  return body;
}

function posedPoint(p, flap, sweep) {
  let { x, y, z } = p;
  if (p.side) {
    const u = Math.abs(x) - 18;
    const v = y + 34;
    const folded = 0.22 + flap * 0.78;
    const u1 = u * Math.cos(sweep) + v * Math.sin(sweep);
    const v1 = -u * Math.sin(sweep) + v * Math.cos(sweep);
    x = p.side * (18 + u1 * Math.cos(folded));
    y = -34 + v1;
    z = 14 + u1 * Math.sin(folded);
  }
  return { x, y, z };
}

export function projectDorsal(x, y, z) {
  return {
    x: -y,
    y: x * 0.86 - z * 0.48,
    z: x * 0.48 + z * 0.86,
  };
}

export function projectFlyCloud(art, { flap = 0, sweep = 0, project }) {
  const body = liftRgb(art.body);
  const eye = hexRgb(art.eye);
  const stripes = art.stripes || 0;
  const out = [];
  for (const raw of CLOUD) {
    const posed = posedPoint(raw, flap, sweep);
    const q = project(posed.x, posed.y, posed.z);
    let shade = 1;
    if (raw.material === "abdomen" && stripes) {
      const band = Math.abs(Math.sin(posed.y * (0.16 + stripes * 0.07)));
      if (band > 0.62) shade = 0.28;
    }
    if (art.mark === "bar" && raw.material === "abdomen" && posed.y > 28 && posed.y < 54) {
      shade *= 0.38;
    }
    if (art.mark === "spots" && raw.material === "abdomen") {
      const da = (posed.x + 8) ** 2 + (posed.y - 36) ** 2;
      const db = (posed.x - 8) ** 2 + (posed.y - 52) ** 2;
      if (da < 70 || db < 70) shade *= 0.32;
    }
    out.push({
      x: q.x,
      y: q.y,
      z: q.z,
      rgb: colorOf(raw.material, body, eye),
      material: raw.material,
      shade,
    });
  }
  out.sort((a, b) => a.z - b.z);
  return out;
}

export function stampCloud(ctx, pts, { dim = 1, px = 1 } = {}) {
  for (const p of pts) {
    let a = (0.4 + (p.z + 80) / 280) * dim * p.shade;
    if (p.material === "wing") a *= 0.5;
    if (p.material === "vein") a *= 0.82;
    ctx.fillStyle = `rgba(${p.rgb.r},${p.rgb.g},${p.rgb.b},${Math.min(0.94, a)})`;
    const r =
      (p.material === "eye"
        ? 1.7
        : p.material === "wing"
          ? 0.82
          : p.material === "abdomen" || p.material === "bone"
            ? 1.42
            : 1.15) * px;
    ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
  }
}

export function flapFromPhase(flying, phase, tired) {
  if (!flying) return { flap: tired ? 0.05 : 0.16, sweep: 0 };
  return {
    flap: [0.22, 0.62, 1, 0.48][phase] || 0.4,
    sweep: [-0.1, 0.16, -0.06, 0.2][phase] || 0,
  };
}
