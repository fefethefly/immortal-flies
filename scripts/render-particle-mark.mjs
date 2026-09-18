import { writeFileSync } from "node:fs";
import { createFlyCloud } from "../src/observatory-art.mjs";

const SIZE = 1024;
const GOLD = "#f0b90b";
const BONE = "#f0ead9";
const EYE = "#c23a32";
const CANVAS = "#0a0907";
const yaw = 0.92;
const pitch = 0.38;
const cy = Math.cos(yaw),
  sy = Math.sin(yaw),
  cp = Math.cos(pitch),
  sp = Math.sin(pitch);

const projected = createFlyCloud().map((p) => {
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const y1 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  return { ...p, px: x1, py: y1, depth: z2 };
});
projected.sort((a, b) => a.depth - b.depth);

let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
for (const p of projected) {
  if (p.px < minX) minX = p.px;
  if (p.px > maxX) maxX = p.px;
  if (p.py < minY) minY = p.py;
  if (p.py > maxY) maxY = p.py;
}
const pad = 88;
const span = Math.max(maxX - minX, maxY - minY);
const scale = (SIZE - pad * 2) / span;
const ox = SIZE / 2 - ((minX + maxX) / 2) * scale;
const oy = SIZE / 2 - ((minY + maxY) / 2) * scale;

const dots = projected.map((p) => {
  const x = (ox + p.px * scale).toFixed(1);
  const y = (oy + p.py * scale).toFixed(1);
  const r =
    p.material === "eye" ? 1.7 : p.material === "wing" ? 1.05 : p.material === "vein" ? 0.85 : 1.25;
  const fill =
    p.material === "eye"
      ? EYE
      : p.material === "wing" || p.material === "vein" || p.material === "gold"
        ? GOLD
        : BONE;
  const op = p.material === "wing" ? 0.78 : p.material === "vein" ? 0.9 : 0.92;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${op}"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" role="img">
<title>IFS cloud</title>
<rect width="${SIZE}" height="${SIZE}" fill="${CANVAS}"/>
${dots.join("\n")}
</svg>
`;
const out = new URL("../public/mark/cloud.svg", import.meta.url);
writeFileSync(out, svg);
console.log(`wrote ${dots.length} points → ${out.pathname}`);
