import { phenotypeOf } from "./brain/flyswarm/phenotype.mjs";
import { flyHeading, flyPhase, flySprite } from "./life/fly-sprite.mjs";
import { createNeuronFieldGL } from "./home-neuron-gl.mjs";
import { random32, summarize } from "./swarm.mjs";

const TAU = Math.PI * 2;
export const CROSS_MODES = Object.freeze(["neural", "society", "market"]);
const WASH = {
  BUY: [198, 164, 82],
  SELL: [176, 110, 88],
  HOLD: [126, 122, 110],
};
const LOBES = [
  { x: -0.62, y: 0.2, z: 0.12, sx: 0.15, sy: 0.26, sz: 0.13, n: 0.27 },
  { x: 0.62, y: 0.2, z: 0.12, sx: 0.15, sy: 0.26, sz: 0.13, n: 0.27 },
  { x: 0, y: 0.05, z: 0.02, sx: 0.2, sy: 0.14, sz: 0.18, n: 0.22 },
  { x: 0, y: 0.4, z: 0.18, sx: 0.1, sy: 0.07, sz: 0.09, n: 0.08 },
  { x: 0, y: -0.52, z: -0.1, sx: 0.055, sy: 0.24, sz: 0.055, n: 0.16 },
];
const TRANSMITTERS = [
  { hex: "#d2b15c", weight: 46 },
  { hex: "#c47a4a", weight: 16 },
  { hex: "#6aa8b4", weight: 26 },
  { hex: "#e0c27a", weight: 4 },
  { hex: "#8a9a6a", weight: 2 },
  { hex: "#b08968", weight: 2 },
  { hex: "#7a8aa0", weight: 2 },
  { hex: "#6a645a", weight: 2 },
];
export const CIRCUIT_OF = 165733;
export const CIRCUIT_SHOWN = 1400;
export const CIRCUIT_MANIFEST = "/data/malecns-circuit/manifest.json";
export const FIELD_TX = Object.freeze([
  { id: "excit", hex: "#d2b15c" },
  { id: "inhib", hex: "#6aa8b4" },
  { id: "food", hex: "#e8c56a" },
  { id: "threat", hex: "#c47a4a" },
  { id: "light", hex: "#d8d0b8" },
]);
const KIND_TX = Object.freeze({ food: 2, threat: 3, light: 4 });

function popcount(value) {
  let n = value >>> 0;
  let count = 0;
  while (n) {
    n &= n - 1;
    count += 1;
  }
  return count;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(random(), 1e-9);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
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

function buildVeins(neurons, k = 2) {
  const cells = new Map();
  const cellOf = (p) =>
    `${Math.floor((p.x + 2) * 5)}:${Math.floor((p.y + 2) * 5)}:${Math.floor((p.z + 2) * 5)}`;
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
            near.push({
              j,
              d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2,
            });
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

export function buildHeroField(count = 960) {
  const random = rng(20260916);
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
    schema: "ifs.field/2",
    source: "synthetic",
    shown: count,
    of: count,
    count,
    transmitters: TRANSMITTERS,
    neurons,
    edges: buildVeins(neurons, 2),
    groups: { food: [], threat: [], light: [] },
  };
}

export function downsampleField(field, keep) {
  if (!field?.neurons?.length) return field;
  const limit = Math.max(24, Math.min(keep, field.neurons.length));
  if (limit >= field.neurons.length) return field;
  const step = field.neurons.length / limit;
  const remap = new Map();
  const neurons = [];
  for (let i = 0; i < limit; i += 1) {
    const src = Math.min(field.neurons.length - 1, Math.floor(i * step));
    remap.set(src, i);
    neurons.push({ ...field.neurons[src], i });
  }
  const edges = [];
  for (const pair of field.edges || []) {
    const a = remap.get(pair[0]);
    const b = remap.get(pair[1]);
    if (a == null || b == null || a === b) continue;
    edges.push([a, b]);
  }
  const groups = {};
  for (const [kind, idxs] of Object.entries(field.groups || {})) {
    groups[kind] = (idxs || [])
      .map((i) => remap.get(i))
      .filter((i) => i != null);
  }
  return {
    ...field,
    count: neurons.length,
    shown: neurons.length,
    neurons,
    edges,
    groups,
  };
}

function hasPosition(node) {
  const p = node?.position;
  return (
    Array.isArray(p) &&
    p.length >= 3 &&
    p.every((n) => Number.isFinite(Number(n)))
  );
}

function fillPositions(nodes, graph) {
  const pos = nodes.map((node) =>
    hasPosition(node)
      ? [
          Number(node.position[0]),
          Number(node.position[1]),
          Number(node.position[2]),
        ]
      : null,
  );
  if (graph?.offsets && graph.targets) {
    for (let pass = 0; pass < 6; pass += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        if (hasPosition(nodes[i])) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        const start = graph.offsets[i];
        const end = graph.offsets[i + 1];
        if (start == null || end == null) continue;
        for (let e = start; e < end; e += 1) {
          const j = graph.targets[e];
          if (!pos[j]) continue;
          sx += pos[j][0];
          sy += pos[j][1];
          sz += pos[j][2];
          count += 1;
        }
        if (count) pos[i] = [sx / count, sy / count, sz / count];
      }
    }
  }
  for (let i = 0; i < nodes.length; i += 1) {
    if (pos[i]) continue;
    const seed = Number(nodes[i]?.id) || i + 1;
    pos[i] = [
      ((seed % 17) - 8) * 0.02,
      ((seed % 13) - 6) * 0.02,
      ((seed % 11) - 5) * 0.02,
    ];
  }
  const n = pos.length || 1;
  const c = [0, 0, 0];
  for (const p of pos) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  c[0] /= n;
  c[1] /= n;
  c[2] /= n;
  let maxR = 1e-6;
  const centered = pos.map((p) => {
    const q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    maxR = Math.max(maxR, Math.hypot(q[0], q[1], q[2]));
    return q;
  });
  const scale = 0.92 / maxR;
  return centered.map((p) => [
    Number((p[0] * scale).toFixed(4)),
    Number((p[1] * scale).toFixed(4)),
    Number((p[2] * scale).toFixed(4)),
  ]);
}

export function strongestEdges(graph, k = 2) {
  if (!graph?.offsets || !graph.targets || !graph.weights) return [];
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < graph.n; i += 1) {
    const pairs = [];
    for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e += 1) {
      pairs.push([graph.targets[e], graph.weights[e]]);
    }
    pairs.sort((a, b) => b[1] - a[1]);
    for (let n = 0; n < k && n < pairs.length; n += 1) {
      const j = pairs[n][0];
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }
  return edges;
}

function txOfNode(i, node, food, threat, light) {
  if (food.has(i)) return KIND_TX.food;
  if (threat.has(i)) return KIND_TX.threat;
  if (light.has(i)) return KIND_TX.light;
  if (node.sign < 0) return 1;
  return 0;
}

export function fieldFromCircuit(graph, keep = CIRCUIT_SHOWN) {
  const nodes = graph?.metadata?.nodes || graph?.nodes || [];
  const groups = graph?.metadata?.groups || {};
  const food = new Set(groups.food || []);
  const threat = new Set(groups.threat || []);
  const light = new Set(groups.light || []);
  const xyz = fillPositions(nodes, graph);
  const neurons = nodes.map((node, i) => ({
    i,
    x: xyz[i][0],
    y: xyz[i][1],
    z: xyz[i][2],
    t: txOfNode(i, node, food, threat, light),
    sign: node.sign ?? 0,
    body: String(node.id || i),
  }));
  const edges = strongestEdges(graph, 2);
  const field = {
    schema: "ifs.field/2",
    source: "malecns-circuit",
    shown: neurons.length,
    of: CIRCUIT_OF,
    count: neurons.length,
    transmitters: FIELD_TX,
    neurons,
    edges: edges.length ? edges : buildVeins(neurons, 2),
    groups: {
      food: [...food],
      threat: [...threat],
      light: [...light],
    },
  };
  return downsampleField(field, keep);
}

export function groupIndex(field, kind) {
  const named = field?.groups?.[kind];
  if (named?.length) return named;
  if (!field?.neurons?.length) return [];
  if (kind === "food")
    return field.neurons
      .map((n, i) => (n.x < -0.22 || n.t === KIND_TX.food ? i : -1))
      .filter((i) => i >= 0)
      .slice(0, 80);
  if (kind === "threat")
    return field.neurons
      .map((n, i) => (n.x > 0.22 || n.t === KIND_TX.threat ? i : -1))
      .filter((i) => i >= 0)
      .slice(0, 80);
  return field.neurons
    .map((n, i) => (n.y > 0.18 || n.t === KIND_TX.light ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, 80);
}

export function inletKindOf(delta) {
  if (delta > 0) return "food";
  if (delta < 0) return "threat";
  return "light";
}

export function stimKindOfNeuron(neuron) {
  if (neuron?.t === KIND_TX.food) return "food";
  if (neuron?.t === KIND_TX.threat) return "threat";
  return "light";
}

export function groupCentroid(field, kind) {
  const idxs = groupIndex(field, kind);
  if (!idxs.length)
    return {
      x: kind === "food" ? -0.7 : kind === "threat" ? 0.7 : 0,
      y: 0,
      z: 0,
    };
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const i of idxs) {
    const neuron = field.neurons[i];
    if (!neuron) continue;
    x += neuron.x;
    y += neuron.y;
    z += neuron.z;
    n += 1;
  }
  if (!n) return { x: 0, y: 0, z: 0 };
  return { x: x / n, y: y / n, z: z / n };
}

export function nearestNeuron(hits, x, y, reach = 22) {
  let best = null;
  let dist = reach;
  for (const hit of hits || []) {
    const d = Math.hypot(hit.x - x, hit.y - y);
    if (d < dist) {
      dist = d;
      best = hit;
    }
  }
  return best;
}

export function truthLines({ field, swarm, census, locale = "en" }) {
  const zh = locale === "zh";
  const cap = census?.cap || 1024;
  const net = census?.live ? "MAINNET" : "TESTNET";
  const soul =
    census?.status === "off"
      ? zh
        ? "灵魂 未部署"
        : "SOUL UNDEPLOYED"
      : census?.status === "loading"
        ? zh
          ? "灵魂 …"
          : "SOUL …"
        : census?.unread && !census?.gen0
          ? `${zh ? "灵魂" : "SOUL"} · ${net}`
          : `${zh ? "灵魂" : "SOUL"} ${census?.gen0 ?? 0} / ${cap} GEN0 · ${net}`;
  const shown = field?.shown || field?.count || 0;
  const of = field?.of || CIRCUIT_OF;
  const source = !field
    ? "…"
    : field.source === "malecns-circuit"
      ? "MALECNS_CIRCUIT"
      : "SYNTHETIC";
  const alive = (swarm?.flies || []).filter(
    (row) => row.status === "alive",
  ).length;
  return [
    { id: "soul", live: census?.status === "live", text: soul },
    {
      id: "field",
      live: field?.source === "malecns-circuit",
      text: `${zh ? "场" : "FIELD"} ${shown.toLocaleString("en-US")} / ${of.toLocaleString("en-US")} · ${source}`,
    },
    {
      id: "swarm",
      paper: true,
      text: `${zh ? "蜂群" : "SWARM"} ${alive} · PAPER · 24-NODE`,
    },
    { id: "fill", paper: true, text: `${zh ? "成交" : "FILL"} SIM` },
  ];
}

export function crossModeOf(tick, locked = null) {
  if (locked && CROSS_MODES.includes(locked)) return locked;
  return CROSS_MODES[Math.floor(Math.max(0, tick) / 9) % CROSS_MODES.length];
}

export function perchOfFly(fly, count) {
  if (!count) return 0;
  return random32((fly?.seed ?? 1) ^ ((fly?.id ?? 0) * 0x9e3779b9)) % count;
}

export function actOfSide(side, spikes = 0) {
  if (side === "BUY") return "FORAGE";
  if (side === "SELL") return "AVOID";
  return popcount(spikes) >= 10 ? "EXPLORE" : "REST";
}

export function cameraRegister(mode) {
  if (mode === "neural")
    return { yaw: 0.38, pitch: 0.6, zoom: 1.58, ribbon: 0.16, spin: 0.0024 };
  if (mode === "market")
    return { yaw: 1.08, pitch: 0.14, zoom: 0.8, ribbon: 1, spin: 0.00035 };
  return { yaw: 0.7, pitch: 0.33, zoom: 1.05, ribbon: 0.4, spin: 0.00095 };
}

export function behaviorShift(fly, time, mode = "society") {
  const gain = mode === "neural" ? 0.2 : mode === "market" ? 0.62 : 1;
  const side = fly?.lastSide || "HOLD";
  const phase = time * 0.9 + (fly?.id ?? 0) * 1.73;
  if (side === "BUY")
    return {
      x: 0.16 * gain,
      y: (0.03 + Math.sin(phase) * 0.03) * gain,
      z: 0.07 * gain,
    };
  if (side === "SELL")
    return {
      x: Math.cos(phase) * 0.28 * gain,
      y: -0.05 * gain,
      z: Math.sin(phase) * 0.24 * gain,
    };
  return {
    x: Math.sin(phase) * 0.02 * gain,
    y: Math.cos(phase * 0.8) * 0.016 * gain,
    z: Math.sin(phase * 0.5) * 0.012 * gain,
  };
}

// Freeze → dart → settle, the signature fruit-fly move. Deterministic per
// fly id and burst index so replays match; zero when motion is reduced.
export function saccadeShift(fly, time, mode = "society", reduced = false) {
  if (reduced) return { x: 0, y: 0, z: 0 };
  const id = fly?.id ?? 0;
  const gain = mode === "neural" ? 0.3 : mode === "market" ? 0.8 : 1;
  const seed = ((id + 1) * 0.6180339887) % 1;
  const period = 2.8 + seed * 3.6;
  const burstLen = 0.18 + ((id * 0.37) % 1) * 0.12;
  const phase = (((time / period + seed) % 1) + 1) % 1;
  const t = phase / burstLen;
  if (t >= 1) return { x: 0, y: 0, z: 0 };
  const burstIndex = Math.floor(time / period + seed);
  const angle =
    ((random32((id + 1) ^ Math.imul(burstIndex + 1, 0x9e3779b9)) % 10000) /
      10000) *
    TAU;
  const amp = (0.035 + ((id % 5) / 5) * 0.03) * gain;
  const d =
    t < 0.3 ? Math.pow(t / 0.3, 2.2) : Math.pow(1 - (t - 0.3) / 0.7, 1.6);
  return {
    x: Math.cos(angle) * amp * d,
    y: Math.sin(angle) * 0.42 * amp * d,
    z: Math.sin(angle * 1.7) * 0.5 * amp * d,
  };
}

export function causalState(swarm, fly) {
  const last = swarm?.trades?.[0];
  const subject =
    fly ||
    swarm?.flies?.find((row) => row.id === last?.flyId) ||
    swarm?.flies?.[0];
  const side = last?.side || subject?.lastSide || "HOLD";
  const living = (swarm?.flies || []).filter((row) => row.status === "alive");
  const sides = { BUY: 0, HOLD: 0, SELL: 0 };
  for (const row of living)
    sides[row.lastSide] = (sides[row.lastSide] || 0) + 1;
  return {
    id: subject?.id ?? 0,
    act: actOfSide(side, subject?.brain?.spikes || 0),
    side,
    price: swarm?.market?.price ?? 0,
    tick: swarm?.tick ?? 0,
    fill: Boolean(last),
    buy: sides.BUY,
    hold: sides.HOLD,
    sell: sides.SELL,
  };
}

export function colonyReadout(swarm, fly, locale = "en") {
  const stats = summarize(
    swarm || { flies: [], trades: [], market: {}, tick: 0 },
  );
  const living = (swarm?.flies || []).filter((row) => row.status === "alive");
  const sides = { BUY: 0, HOLD: 0, SELL: 0 };
  let colonySpikes = 0;
  for (const row of living) {
    sides[row.lastSide] = (sides[row.lastSide] || 0) + 1;
    colonySpikes += popcount(row.brain?.spikes || 0);
  }
  const pheno = fly ? phenotypeOf(fly) : null;
  const lang = locale === "zh" ? "zh" : "en";
  return {
    alive: stats.alive,
    total: stats.total,
    tick: stats.tick,
    fills: stats.trades,
    buys: stats.buys,
    sells: stats.sells,
    bnb: stats.bnb,
    price: stats.price,
    lineage: swarm?.lineage?.length || 0,
    sides,
    colonySpikes,
    spikeCap: Math.max(24, living.length * 24),
    flyId: fly?.id ?? 0,
    flySide: fly?.lastSide || "HOLD",
    flyAct: actOfSide(fly?.lastSide, fly?.brain?.spikes || 0),
    flySpikes: popcount(fly?.brain?.spikes || 0),
    hue: pheno ? pheno.hue[lang] : "",
    look: pheno ? pheno.summary[lang] : "",
    lastFills: (swarm?.trades || []).slice(0, 3),
  };
}

export function utteranceTape(swarm, fly) {
  const spikes = fly?.brain?.spikes || 0;
  const side = fly?.lastSide || "HOLD";
  const rows = [
    {
      kind: "SENSE",
      key: "home.crossSense",
      vars: { id: fly?.id ?? 0, n: popcount(spikes) },
    },
    {
      kind: "ACT",
      key: "home.crossAct",
      vars: { id: fly?.id ?? 0, act: actOfSide(side, spikes), side },
    },
  ];
  const fills = swarm?.trades?.slice(0, 3) || [];
  if (!fills.length) {
    rows.push({
      kind: "MEMORY",
      key: "home.crossMemoryWait",
      vars: { id: fly?.id ?? 0, side: "HOLD", tick: swarm?.tick ?? 0 },
    });
    return rows;
  }
  for (const trade of fills) {
    rows.push({
      kind: "FILL",
      audit: "SIM",
      key: "home.crossMemoryFill",
      vars: { id: trade.flyId, side: trade.side, tick: trade.tick },
    });
  }
  return rows;
}

export function nearestCrossFly(hits, x, y, reach = 28) {
  let best = null;
  let dist = reach;
  for (const hit of hits) {
    const d = Math.hypot(hit.x - x, hit.y - y);
    if (d < dist && d < (hit.r || 18) + 10) {
      dist = d;
      best = hit;
    }
  }
  return best;
}

function hexRgb(hex) {
  const n = Number.parseInt(String(hex || "#f0b90b").replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function projectInto(point, camera, width, height, out) {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const x1 = point.x * cy + point.z * sy;
  const z1 = -point.x * sy + point.z * cy;
  const y2 = point.y * cp - z1 * sp;
  const z2 = point.y * sp + z1 * cp;
  const persp = 1 / Math.max(0.42, 1.26 - z2 * 0.28);
  const scale = Math.min(width * 0.44, height * 0.54) * camera.zoom;
  out.x = width * 0.5 + x1 * scale * persp;
  out.y = height * 0.5 - y2 * scale * persp;
  out.depth = z2;
  out.persp = persp;
  out.r = Math.max(1.15, 2.05 * persp);
  return out;
}

function project(point, camera, width, height) {
  return projectInto(point, camera, width, height, {
    x: 0,
    y: 0,
    depth: 0,
    persp: 1,
    r: 1,
  });
}

export function createCrossSectionRenderer(canvas, read) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { hits: [], schedule() {}, destroy() {} };
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const hits = [];
  const trails = new Map();
  const pulses = [];
  const comets = [];
  const inlets = [];
  const sparks = [];
  let shimmer = new Float32Array(0);
  let fieldNow = null;
  let glField = null;
  let glForField = null;
  let glDead = false;
  const cam = { yaw: 0.7, pitch: 0.33, zoom: 1.05, ribbon: 0.4 };
  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let visible = true;
  let last = 0;
  let time = 0;
  let seenTrade = "";
  let seenTick = -1;
  let seenPrice = null;
  let seenPoke = 0;
  let seenBirth = 0;
  let lastKind = "light";
  let lastInlet = -10;
  let adj = [];
  let adjSrc = null;

  // Pre-rendered glow sprites: one soft radial tile per transmitter colour.
  const glowTiles = new Map();
  function glowTile(hex) {
    let tile = glowTiles.get(hex);
    if (tile) return tile;
    tile = document.createElement("canvas");
    tile.width = 32;
    tile.height = 32;
    const g = tile.getContext("2d");
    const rgb = hexRgb(hex);
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,252,240,0.95)");
    grad.addColorStop(0.18, `rgba(${rgb.r},${rgb.g},${rgb.b},0.85)`);
    grad.addColorStop(0.55, `rgba(${rgb.r},${rgb.g},${rgb.b},0.26)`);
    grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    glowTiles.set(hex, tile);
    return tile;
  }
  let dustSprite = null;
  function dustTile() {
    if (dustSprite) return dustSprite;
    dustSprite = document.createElement("canvas");
    dustSprite.width = 16;
    dustSprite.height = 16;
    const g = dustSprite.getContext("2d");
    const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, "rgba(233,222,196,0.85)");
    grad.addColorStop(0.5, "rgba(214,198,168,0.2)");
    grad.addColorStop(1, "rgba(214,198,168,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
    return dustSprite;
  }

  // Soft wash-coloured landing glow per side: beds each fly into the field.
  const washTiles = new Map();
  function washTile(side) {
    let tile = washTiles.get(side);
    if (tile) return tile;
    const rgb = WASH[side] || WASH.HOLD;
    tile = document.createElement("canvas");
    tile.width = 64;
    tile.height = 64;
    const g = tile.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`);
    grad.addColorStop(0.4, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.16)`);
    grad.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    washTiles.set(side, tile);
    return tile;
  }

  // Ambient dust: depth-sorted motes with parallax drift and twinkle.
  const dust = [];
  function seedDust() {
    dust.length = 0;
    const count = width < 720 ? 70 : 160;
    for (let i = 0; i < count; i += 1) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        z: 0.2 + Math.random() * 0.8,
        r: 0.7 + Math.random() * 1.6,
        drift: 0.004 + Math.random() * 0.012,
        sway: Math.random() * TAU,
        tw: 0.4 + Math.random() * 1.2,
        ph: Math.random() * TAU,
      });
    }
    dust.sort((a, b) => a.z - b.z);
  }

  // Static full-screen gradients are rebuilt only on resize.
  let bgOre = null;
  let bgVeil = null;
  let bgKey = "";
  function cacheBackground() {
    const key = `${width}x${height}`;
    if (key === bgKey && bgOre && bgVeil) return;
    bgKey = key;
    bgOre = ctx.createRadialGradient(
      width * 0.46,
      height * 0.5,
      20,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72,
    );
    bgOre.addColorStop(0, "rgba(58, 42, 16, 0.55)");
    bgOre.addColorStop(0.42, "rgba(18, 14, 8, 0.78)");
    bgOre.addColorStop(1, "rgba(8, 7, 5, 0.98)");
    bgVeil = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.3,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.64,
    );
    bgVeil.addColorStop(0, "rgba(8,7,5,0)");
    bgVeil.addColorStop(1, "rgba(8,7,5,0.48)");
  }

  // Per-frame arrays live across frames; no per-draw allocation.
  let projected = [];
  let order = [];
  let inletGrad = null;
  let inletGradKey = "";

  // WebGL point-sprite field for dense fields (>2k neurons). The offscreen
  // GL canvas is stamped into the 2D frame with one drawImage.
  function fieldGL(field) {
    if (glDead) return null;
    if (glField && glForField === field) return glField;
    glForField = field;
    try {
      const count = field.count;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const rare = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        const n = field.neurons[i];
        positions[i * 3] = n.x;
        positions[i * 3 + 1] = n.y;
        positions[i * 3 + 2] = n.z;
        const tx = field.transmitters[n.t] || TRANSMITTERS[0];
        const rgb = hexRgb(tx.hex);
        colors[i * 3] = rgb.r / 255;
        colors[i * 3 + 1] = rgb.g / 255;
        colors[i * 3 + 2] = rgb.b / 255;
        rare[i] = n.t > 2 ? 1 : 0;
      }
      glField = createNeuronFieldGL(
        { positions, colors, rare, count },
        { width: canvas.width, height: canvas.height },
      );
      canvas.dataset.fieldGL = "webgl";
      return glField;
    } catch {
      glField = null;
      glDead = true;
      canvas.dataset.fieldGL = "2d";
      return null;
    }
  }

  // Last-resort 2D path when WebGL is unavailable for a dense field:
  // stride-sample down to a drawable budget.
  function drawNeuronsSampled(dim, occupied) {
    const n = fieldNow.neurons.length;
    const step = Math.max(1, Math.ceil(n / 1500));
    for (let i = 0; i < n; i += step) {
      const neuron = fieldNow.neurons[i];
      const p = projected[i];
      if (occupied.has(i)) continue;
      shimmer[i] *= 0.96;
      const pulse = shimmer[i];
      const transmitter = fieldNow.transmitters[neuron.t] || TRANSMITTERS[0];
      const depth = (p.depth + 1.15) / 2.3;
      const rare = neuron.t > 2;
      const size = p.r * (rare ? 3.3 : 2.5) * (1 + pulse * 0.7);
      const breath =
        0.86 + 0.14 * Math.sin(time * 0.6 + (neuron.x + neuron.y) * 9);
      ctx.globalAlpha = Math.min(
        1,
        (0.34 + depth * 0.58 + pulse * 0.7 + (rare ? 0.1 : 0)) * dim * breath,
      );
      const tile = glowTile(transmitter.hex);
      ctx.drawImage(tile, p.x - size, p.y - size, size * 2, size * 2);
      if (pulse > 0.32) {
        ctx.globalAlpha = pulse * 0.2 * dim;
        ctx.drawImage(
          tile,
          p.x - size * 2.5,
          p.y - size * 2.5,
          size * 5,
          size * 5,
        );
      }
    }
    ctx.globalAlpha = 1;
  }

  function neuronAt(x, y) {
    let best = null;
    let dist = 22;
    for (let i = 0; i < projected.length; i += 1) {
      const p = projected[i];
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < dist) {
        dist = d;
        best = i;
      }
    }
    return best;
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    const raw = window.devicePixelRatio || 1;
    width = box.width;
    height = box.height;
    // Area-based DPR cap: full-screen gradient fills dominate the frame
    // budget, so large canvases step down before they hit fill-rate walls.
    dpr = raw;
    if (width * height > 900000) {
      dpr = Math.min(dpr, Math.sqrt(3.2e6 / Math.max(1, width * height)));
    }
    for (const step of [2, 1.75, 1.5, 1.25, 1]) {
      if (step <= dpr) {
        dpr = step;
        break;
      }
    }
    dpr = Math.min(2, Math.max(1, dpr));
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bgKey = "";
    inletGradKey = "";
    seedDust();
    glField?.resize(canvas.width, canvas.height);
  }

  function neighbors(field) {
    if (adjSrc === field.edges) return;
    adjSrc = field.edges;
    adj = Array.from({ length: field.neurons.length }, () => []);
    for (const [a, b] of field.edges || []) {
      adj[a]?.push(b);
      adj[b]?.push(a);
    }
  }

  function washOf(kind) {
    if (kind === "food" || kind === "BUY") return WASH.BUY;
    if (kind === "threat" || kind === "SELL") return WASH.SELL;
    return WASH.HOLD;
  }

  function spawnInlet(kind, field, projected, targetIdx) {
    const origin = groupCentroid(field, kind);
    const from = project(
      { x: origin.x - 0.42, y: origin.y, z: origin.z },
      cam,
      width,
      height,
    );
    const dest = projected[targetIdx] || project(origin, cam, width, height);
    inlets.push({
      kind,
      x: from.x,
      y: from.y,
      tx: dest.x,
      ty: dest.y,
      born: time,
    });
    const wash = groupIndex(field, kind).slice(0, 10);
    for (const i of wash) shimmer[i] = Math.max(shimmer[i] || 0, 0.72);
    if (targetIdx != null) {
      shimmer[targetIdx] = 1;
      for (const n of adj[targetIdx] || [])
        shimmer[n] = Math.max(shimmer[n] || 0, 0.55);
    }
    lastKind = kind;
    if (inlets.length > 10) inlets.splice(0, inlets.length - 10);
  }

  function drawInletRail() {
    const rgb = washOf(lastKind);
    const x = width * 0.055;
    const key = `${lastKind}:${width}`;
    if (key !== inletGradKey) {
      inletGradKey = key;
      inletGrad = ctx.createLinearGradient(x - 18, 0, x + 28, 0);
      inletGrad.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      inletGrad.addColorStop(0.45, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.16)`);
      inletGrad.addColorStop(1, "rgba(8,7,5,0)");
    }
    ctx.fillStyle = inletGrad;
    ctx.fillRect(0, height * 0.18, width * 0.16, height * 0.64);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(x, height * 0.22, 2, height * 0.56);
    ctx.globalAlpha = 1;
  }

  function drawRibbon(values, alpha) {
    if (values.length < 2 || alpha < 0.04) return;
    const low = Math.min(...values);
    const span = Math.max(1, Math.max(...values) - low);
    const left = width * 0.78;
    const top = height * 0.22;
    const w = width * 0.16;
    const h = height * 0.38;
    ctx.beginPath();
    values.forEach((n, i) => {
      const x = left + (i / (values.length - 1)) * w;
      const y = top + h - ((n - low) / span) * h;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = `rgba(147,161,129,${0.22 + alpha * 0.7})`;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(240,185,11,${0.35 + alpha * 0.5})`;
    ctx.setLineDash([10, 28]);
    ctx.lineDashOffset = -time * 28;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawDust(dt, animate, pointerX) {
    if (!dust.length) return;
    const tile = dustTile();
    ctx.globalCompositeOperation = "lighter";
    for (const m of dust) {
      if (animate) {
        m.y -= m.drift * dt * (0.25 + m.z);
        m.x += Math.sin(time * 0.3 + m.ph) * 0.00005;
        if (m.y < -0.03) {
          m.y = 1.03;
          m.x = Math.random();
        }
        if (m.x < -0.03) m.x += 1.06;
        if (m.x > 1.03) m.x -= 1.06;
      }
      const px = ((((m.x + pointerX * m.z * 0.05) % 1) + 1) % 1) * width;
      const py = m.y * height;
      const size = m.r * (1.6 + m.z * 2.6);
      const twinkle = 0.55 + 0.45 * Math.sin(time * m.tw + m.ph);
      ctx.globalAlpha = (0.045 + 0.05 * m.z) * (animate ? twinkle : 1);
      ctx.drawImage(tile, px - size / 2, py - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function draw(now) {
    raf = 0;
    const {
      field,
      swarm,
      selectedId,
      mode,
      paused,
      hoverId,
      pointer,
      poke,
      birth,
    } = read();
    const reduced = media.matches;
    const animate = !reduced && !paused && visible && !document.hidden;
    if (!width) return;
    if (animate && now - last < (width < 720 ? 32 : 20)) {
      raf = requestAnimationFrame(draw);
      return;
    }
    const dt = animate && last ? Math.min((now - last) / 1000, 0.05) : 0;
    if (animate && last) time += dt;
    last = now;
    const target = cameraRegister(mode);
    const follow = reduced || paused ? 1 : 0.055;
    cam.yaw += (target.yaw + (pointer?.x || 0) * 0.22 - cam.yaw) * follow;
    cam.pitch += (target.pitch + (pointer?.y || 0) * 0.1 - cam.pitch) * follow;
    cam.zoom += (target.zoom - cam.zoom) * follow;
    cam.ribbon += (target.ribbon - cam.ribbon) * follow;
    if (animate) cam.yaw += target.spin;

    ctx.clearRect(0, 0, width, height);
    cacheBackground();
    ctx.fillStyle = bgOre;
    ctx.fillRect(0, 0, width, height);
    drawDust(dt, animate, pointer?.x || 0);
    if (!field?.neurons?.length) {
      if (animate) raf = requestAnimationFrame(draw);
      return;
    }
    neighbors(field);
    fieldNow = field;
    if (shimmer.length !== field.neurons.length) {
      shimmer = new Float32Array(field.neurons.length);
    }

    const living = (swarm?.flies || []).filter((row) => row.status === "alive");
    const perchOf = new Map(
      living.map((fly) => [fly.id, perchOfFly(fly, field.count)]),
    );
    const occupied = new Set(perchOf.values());
    const camera = cam;
    if (projected.length !== field.neurons.length) {
      projected.length = field.neurons.length;
      for (let i = 0; i < projected.length; i += 1) {
        projected[i] = { x: 0, y: 0, depth: 0, persp: 1, r: 1 };
      }
    }
    for (let i = 0; i < field.neurons.length; i += 1) {
      projectInto(field.neurons[i], camera, width, height, projected[i]);
    }
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
      24,
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      Math.max(maxX - minX, maxY - minY) * 0.55,
    );
    mass.addColorStop(0, "rgba(88, 62, 22, 0.32)");
    mass.addColorStop(0.55, "rgba(36, 24, 10, 0.16)");
    mass.addColorStop(1, "rgba(10, 8, 5, 0)");
    ctx.fillStyle = mass;
    ctx.beginPath();
    ctx.ellipse(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (maxX - minX) * 0.4,
      (maxY - minY) * 0.46,
      0,
      0,
      TAU,
    );
    ctx.fill();
    drawInletRail();

    if (field.edges?.length) {
      const hot = new Path2D();
      for (const [a, b] of field.edges) {
        if (shimmer[a] + shimmer[b] < 0.72) continue;
        hot.moveTo(projected[a].x, projected[a].y);
        hot.lineTo(projected[b].x, projected[b].y);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(240,185,11,0.32)";
      ctx.stroke(hot);
    }

    const dim = mode === "market" ? 0.42 : mode === "society" ? 0.78 : 1;
    if (field.count > 2000) {
      const gl = fieldGL(field);
      if (gl) {
        for (let i = 0; i < shimmer.length; i += 1) shimmer[i] *= 0.96;
        // Perched neurons become lit landing pads, not dark holes: the fly
        // visibly belongs to its node.
        for (const idx of occupied) {
          shimmer[idx] = 1;
          for (const n of adj[idx] || [])
            shimmer[n] = Math.max(shimmer[n], 0.5);
        }
        const rate = mode === "neural" ? 0.0012 : 0.0005;
        const flicker = Math.ceil(shimmer.length * rate);
        for (let k = 0; k < flicker; k += 1) {
          const i = (Math.random() * shimmer.length) | 0;
          if (shimmer[i] < 0) continue;
          shimmer[i] = Math.max(shimmer[i], 0.5 + Math.random() * 0.4);
        }
        gl.draw(shimmer, {
          yaw: cam.yaw,
          pitch: cam.pitch,
          zoom: cam.zoom,
          dim,
          time,
          width,
          height,
          dpr,
        });
        ctx.drawImage(gl.canvas, 0, 0, width, height);
      } else {
        drawNeuronsSampled(dim, occupied);
      }
    } else {
      if (order.length !== field.neurons.length) {
        order = Array.from({ length: field.neurons.length }, (_, i) => i);
      } else {
        for (let i = 0; i < order.length; i += 1) order[i] = i;
      }
      order.sort((a, b) => projected[a].depth - projected[b].depth);
      for (const i of order) {
        if (occupied.has(i)) continue;
        const neuron = field.neurons[i];
        const p = projected[i];
        const transmitter = field.transmitters[neuron.t] || TRANSMITTERS[0];
        if (animate && Math.random() < (mode === "neural" ? 0.0012 : 0.0005))
          shimmer[i] = 0.5 + Math.random() * 0.4;
        shimmer[i] *= 0.96;
        const pulse = shimmer[i];
        const depth = (p.depth + 1.15) / 2.3;
        const rare = neuron.t > 2;
        const size = p.r * (rare ? 3.3 : 2.5) * (1 + pulse * 0.7);
        const breath =
          0.86 + 0.14 * Math.sin(time * 0.6 + (neuron.x + neuron.y) * 9);
        ctx.globalAlpha = Math.min(
          1,
          (0.34 + depth * 0.58 + pulse * 0.7 + (rare ? 0.1 : 0)) * dim * breath,
        );
        const tile = glowTile(transmitter.hex);
        ctx.drawImage(tile, p.x - size, p.y - size, size * 2, size * 2);
        if (pulse > 0.32) {
          ctx.globalAlpha = pulse * 0.2 * dim;
          ctx.drawImage(
            tile,
            p.x - size * 2.5,
            p.y - size * 2.5,
            size * 5,
            size * 5,
          );
        }
      }
    }

    hits.length = 0;
    const food = project({ x: 0.22, y: 0.04, z: 0.08 }, camera, width, height);
    if (mode === "society") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#f0b90b";
      ctx.beginPath();
      ctx.arc(food.x, food.y, 16 + Math.sin(time * 2.2) * 3, 0, TAU);
      ctx.fill();
    }

    const trade = swarm?.trades?.[0];
    const tradeKey = trade ? `${trade.tick}:${trade.flyId}:${trade.side}` : "";
    if (tradeKey && tradeKey !== seenTrade && seenTick >= 0 && animate) {
      const origin = living.find((row) => row.id === trade.flyId);
      const perch = origin ? perchOf.get(origin.id) : 0;
      const from = projected[perch] || food;
      comets.push({
        x: from.x,
        y: from.y,
        tx: width * 0.86,
        ty: height * 0.28,
        born: time,
        side: trade.side,
      });
      pulses.push({ x: from.x, y: from.y, born: time, side: trade.side });
      for (const n of adj[perch] || []) shimmer[n] = 0.9;
      shimmer[perch] = 1;
    }
    if (swarm?.tick !== seenTick) {
      if (seenTick >= 0 && animate) {
        for (const fly of living) {
          const perch = perchOf.get(fly.id);
          if (popcount(fly.brain?.spikes || 0) < 4) continue;
          shimmer[perch] = Math.max(shimmer[perch], 0.55);
          for (const n of adj[perch] || [])
            shimmer[n] = Math.max(shimmer[n], 0.32);
        }
      }
      seenTick = swarm?.tick ?? seenTick;
    }
    seenTrade = tradeKey;
    const price = swarm?.market?.price;
    const delta = swarm?.market?.delta ?? 0;
    if (
      seenPrice != null &&
      price !== seenPrice &&
      animate &&
      time - lastInlet > 1.15
    ) {
      const kind = inletKindOf(delta);
      const target =
        perchOf.get(selectedId) ??
        perchOf.get(living[0]?.id) ??
        groupIndex(field, kind)[0];
      spawnInlet(kind, field, projected, target);
      lastInlet = time;
    }
    seenPrice = price ?? seenPrice;
    if (poke?.id && poke.id !== seenPoke) {
      seenPoke = poke.id;
      const kind = poke.kind || "light";
      const target = poke.neuron ?? perchOf.get(selectedId);
      if (animate) spawnInlet(kind, field, projected, target);
      else {
        lastKind = kind;
        if (target != null) shimmer[target] = 1;
      }
    }
    if (birth?.id && birth.id !== seenBirth) {
      seenBirth = birth.id;
      const perch =
        birth.perch ??
        perchOfFly({ id: birth.tokenId, seed: birth.seed }, field.count);
      shimmer[perch] = 1;
      for (const n of adj[perch] || [])
        shimmer[n] = Math.max(shimmer[n] || 0, 0.7);
      const at = projected[perch] || food;
      pulses.push({ x: at.x, y: at.y, born: time, side: "BUY" });
    }
    if (mode === "society" && living.length > 1) {
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      for (let a = 0; a < living.length; a += 1) {
        const ia = perchOf.get(living[a].id);
        const pa = projected[ia];
        if (!pa) continue;
        for (let b = a + 1; b < living.length; b += 1) {
          const ib = perchOf.get(living[b].id);
          const pb = projected[ib];
          if (!pb) continue;
          const linked = adj[ia]?.includes(ib);
          const na = field.neurons[ia];
          const nb = field.neurons[ib];
          if (!na || !nb) continue;
          const near = Math.hypot(na.x - nb.x, na.y - nb.y, na.z - nb.z) < 0.16;
          if (!linked && !near) continue;
          const split = living[a].lastSide !== living[b].lastSide;
          ctx.strokeStyle = split
            ? "rgba(198,164,82,0.55)"
            : "rgba(147,161,129,0.28)";
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
          if (split && animate && Math.random() < 0.04) {
            sparks.push({
              x: pa.x,
              y: pa.y,
              tx: pb.x,
              ty: pb.y,
              born: time,
            });
          }
        }
      }
      ctx.globalAlpha = 1;
    }
    if (comets.length > 12) comets.splice(0, comets.length - 12);
    if (pulses.length > 8) pulses.splice(0, pulses.length - 8);
    if (sparks.length > 16) sparks.splice(0, sparks.length - 16);

    for (const fly of living) {
      const perch = perchOf.get(fly.id);
      const neuron = field.neurons[perch];
      if (!neuron) continue;
      const shift = behaviorShift(fly, time, mode);
      const dart = saccadeShift(fly, time, mode, reduced);
      const bob = Math.sin(time * 1.4 + fly.id * 1.9) * 0.02;
      const p = project(
        {
          x: neuron.x + shift.x + dart.x,
          y: neuron.y + shift.y + dart.y,
          z: neuron.z + shift.z + dart.z + bob,
        },
        camera,
        width,
        height,
      );
      const picked = fly.id === selectedId || fly.id === hoverId;
      const art = phenotypeOf(fly).art;
      const wash = WASH[fly.lastSide] || WASH.HOLD;
      const trail = trails.get(fly.id) || [];
      if (animate) {
        trail.push({ x: p.x, y: p.y });
        if (trail.length > 10) trail.shift();
        trails.set(fly.id, trail);
      }
      // Trails glow with the field: additive, faded toward the head.
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgb(${wash[0]},${wash[1]},${wash[2]})`;
      for (let i = 1; i < trail.length; i += 1) {
        const f = i / trail.length;
        ctx.globalAlpha = (picked ? 0.3 : 0.08) * f;
        ctx.lineWidth = (picked ? 2.2 : 1.3) * f + 0.2;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      const k = (0.92 + ((p.depth + 1) / 2) * 0.28) * (picked ? 1.45 : 1);
      const tile = flySprite(art, {
        flying: true,
        phase: reduced ? 0 : flyPhase(time, fly.id),
      });
      const sz = (picked ? 66 : 48) * k * (art.scale || 1);
      // Landing glow: the fly sits inside a soft wash halo instead of
      // reading as a sticker pasted onto the field.
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = picked ? 0.34 : 0.16;
      const hr = sz * 1.15;
      ctx.drawImage(
        washTile(fly.lastSide || "HOLD"),
        p.x - hr,
        p.y - hr,
        hr * 2,
        hr * 2,
      );
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.globalAlpha = mode === "neural" && !picked ? 0.72 : 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(flyHeading(fly, shift));
      ctx.drawImage(tile, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
      if (picked || mode !== "neural") {
        ctx.globalAlpha = picked ? 0.92 : 0.62;
        ctx.fillStyle = "#e6dcc4";
        ctx.font = `${picked ? 11 : 9}px IBM Plex Mono, monospace`;
        ctx.textAlign = "left";
        ctx.fillText(
          `#${String(fly.id).padStart(3, "0")}`,
          p.x + sz * 0.38,
          p.y - 2,
        );
        ctx.fillStyle = `rgb(${wash[0]},${wash[1]},${wash[2]})`;
        ctx.fillText(fly.lastSide, p.x + sz * 0.38, p.y + 10);
      }
      hits.push({ x: p.x, y: p.y, r: sz * 0.6, id: fly.id });
    }

    ctx.globalCompositeOperation = "lighter";
    for (const burst of pulses) {
      const age = time - burst.born;
      if (age > 1.2) continue;
      const fade = 1 - age / 1.2;
      const rgb = WASH[burst.side] || WASH.HOLD;
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${fade * 0.55})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.ellipse(
        burst.x,
        burst.y,
        10 + age * 70,
        (10 + age * 70) * 0.62,
        0,
        0,
        TAU,
      );
      ctx.stroke();
    }
    for (const comet of comets) {
      const age = Math.min(1, (time - comet.born) / 0.7);
      const rgb = WASH[comet.side] || WASH.HOLD;
      const x = comet.x + (comet.tx - comet.x) * age;
      const y = comet.y + (comet.ty - comet.y) * age;
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${1 - age})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(
        x - (comet.tx - comet.x) * 0.08,
        y - (comet.ty - comet.y) * 0.08,
      );
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(240,185,11,${1 - age})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, TAU);
      ctx.fill();
    }
    for (const inlet of inlets) {
      const age = Math.min(1, (time - inlet.born) / 0.85);
      const rgb = washOf(inlet.kind);
      const x = inlet.x + (inlet.tx - inlet.x) * age;
      const y = inlet.y + (inlet.ty - inlet.y) * age;
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${1.05 - age})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(
        x - (inlet.tx - inlet.x) * 0.14,
        y - (inlet.ty - inlet.y) * 0.14,
      );
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = `rgba(240,185,11,${1 - age})`;
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, TAU);
      ctx.fill();
    }
    for (const spark of sparks) {
      const age = Math.min(1, (time - spark.born) / 0.5);
      const x = spark.x + (spark.tx - spark.x) * age;
      const y = spark.y + (spark.ty - spark.y) * age;
      ctx.fillStyle = `rgba(240,185,11,${1 - age})`;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, TAU);
      ctx.fill();
    }
    drawRibbon(swarm?.prices?.slice(-60) || [], cam.ribbon);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = bgVeil;
    ctx.fillRect(0, 0, width, height);
    if (animate) raf = requestAnimationFrame(draw);
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(draw);
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
  });
  const box = new ResizeObserver(() => {
    resize();
    schedule();
  });
  box.observe(canvas);
  observer.observe(canvas);
  document.addEventListener("visibilitychange", schedule);
  media.addEventListener("change", schedule);
  resize();
  schedule();
  return {
    hits,
    neuronAt,
    schedule,
    destroy() {
      cancelAnimationFrame(raf);
      box.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
      media.removeEventListener("change", schedule);
      glField?.destroy();
      glField = null;
    },
  };
}
