import {
  CATALOG_RASTER,
  CATALOG_WING_HINGES,
  catalogFlyFailedNow,
  catalogPlateNow,
  catalogSpriteKey,
  loadCatalogFly,
  tintCatalogPixels,
} from "./catalog-portrait.mjs";

/**
 * catalog-points.mjs —— 图鉴插画的飞行拆分。
 *
 * 上色与 colony 图鉴同源。躯体层钉住，只有翅膜绕翅基转，
 * 这样外观接近卡片，动作仍是原来的振翅飞行。
 */

const POINT_TARGET = 2400;
const HINGE = Object.freeze([
  CATALOG_WING_HINGES.left.x / CATALOG_RASTER,
  CATALOG_WING_HINGES.left.y / CATALOG_RASTER,
]);
const WING_DIR = (() => {
  const x = -0.52;
  const y = -0.44;
  const len = Math.hypot(x, y);
  return [x / len, y / len];
})();

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 扇翅权重：只有朝左上、离翅基足够远的膜才动。 */
export function flapWeightAt(nx, ny) {
  const dx = nx - HINGE[0];
  const dy = ny - HINGE[1];
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) return 0;
  const root = smoothstep(0.16, 0.34, dist);
  const align = (dx * WING_DIR[0] + dy * WING_DIR[1]) / dist;
  const sector = smoothstep(0.62, 0.88, align);
  return root * sector;
}

export function catalogHinge() {
  return [HINGE[0] - 0.5, HINGE[1] - 0.5];
}

/**
 * 从底图采样：只收有覆盖的像素。位置是归一化本地坐标（+y 向下）。
 */
export function sampleCatalogPoints(source, target = POINT_TARGET) {
  const { width: W, height: H, data } = source;
  const covered = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 22) covered.push(i);
  }
  const want = Math.min(Math.max(32, target), covered.length);
  const stride = covered.length / want;
  let seed = 0x9e3779b9;
  const jitter = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 4294967296 - 0.5) * 0.7;
  };
  const local = new Float32Array(want * 2);
  const weight = new Float32Array(want);
  const opacity = new Float32Array(want);
  const pixels = new Uint32Array(want);
  for (let n = 0; n < want; n += 1) {
    const byte = covered[Math.min(covered.length - 1, Math.floor(n * stride))];
    const p = byte / 4;
    const px = p % W;
    const py = Math.floor(p / W);
    const jx = jitter();
    const jy = jitter();
    const nx = (px + jx) / W;
    const ny = (py + jy) / H;
    local[n * 2] = nx - 0.5;
    local[n * 2 + 1] = ny - 0.5;
    weight[n] = flapWeightAt(nx, ny);
    opacity[n] = data[byte + 3] / 255;
    pixels[n] = byte;
  }
  return {
    count: want,
    local,
    weight,
    opacity,
    pixels,
    hinge: catalogHinge(),
  };
}

export function colorCatalogPoints(base, tinted) {
  const colors = new Float32Array(base.count * 3);
  const opacity = new Float32Array(base.count);
  const src = tinted.data || tinted;
  for (let n = 0; n < base.count; n += 1) {
    const i = base.pixels[n];
    colors[n * 3] = src[i] / 255;
    colors[n * 3 + 1] = src[i + 1] / 255;
    colors[n * 3 + 2] = src[i + 2] / 255;
    opacity[n] = src[i + 3] / 255;
  }
  return {
    count: base.count,
    local: base.local,
    weight: base.weight,
    opacity,
    colors,
    hinge: base.hinge,
  };
}

let sourceNow = null;
let basePoints = null;

function sampleBase(source) {
  if (basePoints) return basePoints;
  basePoints = sampleCatalogPoints(source);
  return basePoints;
}

const paletteCache = new Map();

function paletteKey(art = {}) {
  return `${art.body || ""}|${art.eyeLeft || art.eye || ""}|${art.eyeRight || art.eye || ""}`;
}

function buildParticles(source, art) {
  return colorCatalogPoints(sampleBase(source), tintCatalogPixels(source, art));
}

/** 预热底图，避免第一帧先画矢量再跳到图鉴。 */
export function warmCatalog() {
  if (catalogFlyFailedNow()) return;
  loadCatalogFly()
    .then((source) => {
      sourceNow = source;
    })
    .catch(() => {});
}

/**
 * 图鉴插画粒子集：按表型色板缓存。底图就绪前返回 null，
 * 调用方该帧先用原有精灵，下一帧自动换成粒子。
 */
export function catalogParticles(art = {}) {
  const key = paletteKey(art);
  if (paletteCache.has(key)) return paletteCache.get(key);
  if (catalogFlyFailedNow()) return null;
  if (!sourceNow) {
    warmCatalog();
    return null;
  }
  const points = buildParticles(sourceNow, art);
  paletteCache.set(key, points);
  return points;
}

export function catalogUnavailable() {
  return catalogFlyFailedNow();
}

const BODY_KEEP = 0.28;
const WING_TAKE = 0.08;

/**
 * 把上色插画拆成躯体层和翅膜层。翅根交叠，铰链转动时不裂开。
 */
export function splitCatalogLayers(source) {
  const W = source.width;
  const H = source.height || W;
  const src = source.data;
  const body = new Uint8ClampedArray(src.length);
  const wings = new Uint8ClampedArray(src.length);
  for (let i = 0, p = 0; i < src.length; i += 4, p += 1) {
    const a = src[i + 3];
    if (a < 8) continue;
    const nx = (p % W + 0.5) / W;
    const ny = (Math.floor(p / W) + 0.5) / H;
    const w = flapWeightAt(nx, ny);
    if (w < BODY_KEEP) {
      body[i] = src[i];
      body[i + 1] = src[i + 1];
      body[i + 2] = src[i + 2];
      body[i + 3] = a;
    }
    if (w > WING_TAKE) {
      wings[i] = src[i];
      wings[i + 1] = src[i + 1];
      wings[i + 2] = src[i + 2];
      const fade =
        w >= BODY_KEEP ? 1 : (w - WING_TAKE) / (BODY_KEEP - WING_TAKE);
      wings[i + 3] = Math.round(a * fade);
    }
  }
  return {
    body: { data: body, width: W, height: H },
    wings: { data: wings, width: W, height: H },
  };
}

function layerCanvas(layer) {
  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  canvas.getContext("2d").putImageData(
    new ImageData(layer.data, layer.width, layer.height),
    0,
    0,
  );
  return canvas;
}

const rigCache = new Map();
const RIG_MAX = 64;

/**
 * 可飞的图鉴：躯体不动，翅膜绕翅基转。底图未就绪时返回 null。
 */
export function catalogRig(art = {}) {
  const plate = catalogPlateNow();
  if (!plate) {
    warmCatalog();
    return null;
  }
  const key = catalogSpriteKey(art);
  const hit = rigCache.get(key);
  if (hit) return hit;
  const layers = splitCatalogLayers(tintCatalogPixels(plate, art));
  const rig = {
    body: layerCanvas(layers.body),
    wings: layerCanvas(layers.wings),
    hinge: catalogHinge(),
  };
  if (rigCache.size >= RIG_MAX) rigCache.clear();
  rigCache.set(key, rig);
  return rig;
}
