import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const COUNT = 4800;

export const TRANSMITTERS = Object.freeze([
  { id: "ach", en: "acetylcholine", zh: "乙酰胆碱", sign: "+", hex: "#d2b15c", weight: 46 },
  { id: "gaba", en: "GABA", zh: "GABA", sign: "-", hex: "#c47a4a", weight: 16 },
  { id: "glu", en: "glutamate", zh: "谷氨酸", sign: "+", hex: "#6aa8b4", weight: 26 },
  { id: "da", en: "dopamine", zh: "多巴胺", sign: "+", hex: "#e0c27a", weight: 4 },
  { id: "ser", en: "serotonin", zh: "血清素", sign: "+", hex: "#8a9a6a", weight: 2 },
  { id: "oa", en: "octopamine", zh: "章鱼胺", sign: "+", hex: "#b08968", weight: 2 },
  { id: "ha", en: "histamine", zh: "组胺", sign: "-", hex: "#7a8aa0", weight: 2 },
  { id: "unk", en: "other / unknown", zh: "其他 / 未知", sign: "·", hex: "#6a645a", weight: 2 },
]);

const LOBES = [
  { x: -0.62, y: 0.2, z: 0.12, sx: 0.15, sy: 0.26, sz: 0.13, n: 0.27 },
  { x: 0.62, y: 0.2, z: 0.12, sx: 0.15, sy: 0.26, sz: 0.13, n: 0.27 },
  { x: 0, y: 0.05, z: 0.02, sx: 0.2, sy: 0.14, sz: 0.18, n: 0.22 },
  { x: 0, y: 0.4, z: 0.18, sx: 0.1, sy: 0.07, sz: 0.09, n: 0.08 },
  { x: 0, y: -0.52, z: -0.1, sx: 0.055, sy: 0.24, sz: 0.055, n: 0.16 },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pickTransmitter(random) {
  const total = TRANSMITTERS.reduce((sum, row) => sum + row.weight, 0);
  let n = random() * total;
  for (let i = 0; i < TRANSMITTERS.length; i += 1) {
    n -= TRANSMITTERS[i].weight;
    if (n <= 0) return i;
  }
  return TRANSMITTERS.length - 1;
}

function gaussian(random) {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function buildVeins(neurons, k = 2) {
  const cells = new Map();
  const cellOf = (p) =>
    `${Math.floor((p.x + 2) * 6)}:${Math.floor((p.y + 2) * 6)}:${Math.floor((p.z + 2) * 6)}`;
  for (let i = 0; i < neurons.length; i += 1) {
    const key = cellOf(neurons[i]);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }
  const seen = new Set();
  const edges = [];
  for (let i = 0; i < neurons.length; i += 1) {
    const a = neurons[i];
    const [cx, cy, cz] = cellOf(a).split(":").map(Number);
    const near = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = cells.get(`${cx + dx}:${cy + dy}:${cz + dz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j === i) continue;
            const b = neurons[j];
            const d =
              (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
            near.push({ j, d });
          }
        }
      }
    }
    near.sort((p, q) => p.d - q.d);
    for (let n = 0; n < k && n < near.length; n += 1) {
      const j = near[n].j;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }
  return edges;
}

export function buildLifeField(count = COUNT, seed = 20260916) {
  const random = rng(seed);
  const neurons = [];
  for (let i = 0; i < count; i += 1) {
    let cursor = random();
    const lobe =
      LOBES.find((item) => {
        cursor -= item.n;
        return cursor <= 0;
      }) || LOBES[2];
    neurons.push({
      i,
      x: Number((lobe.x + gaussian(random) * lobe.sx).toFixed(4)),
      y: Number((lobe.y + gaussian(random) * lobe.sy).toFixed(4)),
      z: Number((lobe.z + gaussian(random) * lobe.sz).toFixed(4)),
      t: pickTransmitter(random),
    });
  }
  return {
    schema: "ifs.field/1",
    decoder: "synthetic-spectral/1",
    seed,
    count,
    note: "Deterministic stand-in for a public MaleCNS embedding. Veins are local k-nearest links, not another project's wiring.",
    transmitters: TRANSMITTERS,
    neurons,
    edges: buildVeins(neurons, 3),
  };
}

export function perchIndex(life, count) {
  const hex = String(life || "").replace(/^0x/i, "");
  if (!/^[0-9a-f]{64}$/i.test(hex) || count < 1) return 0;
  return Number(BigInt(`0x${hex}`) % BigInt(count));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const field = buildLifeField();
  const dir = path.join(root, "public/life-field");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "neurons.json"), JSON.stringify(field) + "\n");
  console.log(`wrote ${field.count} neurons · ${field.edges.length} veins`);
}
