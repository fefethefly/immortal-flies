import { hexRgb } from "./fly-chibi.mjs";

/**
 * 群体页插画是固定的 3/4 正面：两只复眼都露在画面上。
 * 朝右时，近眼（画面右侧）= 解剖左眼 eyeLeft；远眼 = 解剖右眼 eyeRight。
 * 椭圆是这张 catalog-fly-amber 的位点，不随 seed 变。
 */
export const CATALOG_EYES = Object.freeze({
  far: { cx: 0.768, cy: 0.448, rx: 0.048, ry: 0.055 },
  near: { cx: 0.842, cy: 0.475, rx: 0.078, ry: 0.095 },
});

export const CATALOG_RASTER = 420;
export const CATALOG_SRC = "/assets/catalog-fly-amber.png";

/** 420 画布上的左右翅基，对齐 catalog-fly-amber 的膜根。 */
export const CATALOG_WING_HINGES = Object.freeze({
  left: { x: 246, y: 176 },
  far: { x: 286, y: 146 },
});

let catalogFlyPromise = null;
let catalogFlyFailed = false;
let catalogFlyData = null;
let catalogFlyImage = null;
const spriteCache = new Map();
const SPRITE_MAX = 64;
const CATALOG_NATIVE = 1254;

/** 底图 420×420 ImageData。加载失败后记住，调用方走回退。 */
export function loadCatalogFly() {
  if (catalogFlyFailed) return Promise.reject(new Error("Portrait unavailable"));
  if (!catalogFlyPromise)
    catalogFlyPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        catalogFlyImage = image;
        const buffer = document.createElement("canvas");
        buffer.width = buffer.height = CATALOG_RASTER;
        const ctx = buffer.getContext("2d", { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, CATALOG_RASTER, CATALOG_RASTER);
        catalogFlyData = ctx.getImageData(0, 0, CATALOG_RASTER, CATALOG_RASTER);
        resolve(catalogFlyData);
      };
      image.onerror = () => {
        catalogFlyFailed = true;
        catalogFlyPromise = null;
        catalogFlyData = null;
        catalogFlyImage = null;
        reject(new Error("Portrait unavailable"));
      };
      image.src = CATALOG_SRC;
    });
  return catalogFlyPromise.then((data) => {
    catalogFlyData = data;
    return data;
  });
}

export function catalogFlyFailedNow() {
  return catalogFlyFailed;
}

export function catalogPlateNow() {
  return catalogFlyData;
}

export function catalogSpriteKey(art = {}) {
  return [
    art.body || "",
    art.eyeLeft || art.eye || "",
    art.eyeRight || art.eye || "",
  ].join("|");
}

/**
 * Colony 同款上色插画的离屏精灵。底图未就绪时返回 null。
 * 整张贴，不要再打成粒子。
 */
export function catalogSprite(art = {}) {
  if (!catalogFlyData) return null;
  const key = catalogSpriteKey(art);
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const tinted = tintCatalogPixels(catalogFlyData, art);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = CATALOG_RASTER;
  const g = canvas.getContext("2d");
  g.putImageData(
    new ImageData(tinted.data, CATALOG_RASTER, CATALOG_RASTER),
    0,
    0,
  );
  if (spriteCache.size >= SPRITE_MAX) spriteCache.clear();
  spriteCache.set(key, canvas);
  return canvas;
}

/**
 * 出生卡等比放大：从原图上色，避免 420 栅格再拉大发糊。
 * 超过原图像素边长时仍停在原图，不凭空插值。
 */
export function catalogSpriteAt(art = {}, size = CATALOG_RASTER) {
  const want = Math.max(
    CATALOG_RASTER,
    Math.min(CATALOG_NATIVE, Math.round(Number(size) || CATALOG_RASTER)),
  );
  if (want === CATALOG_RASTER || !catalogFlyImage) return catalogSprite(art);
  const key = `${catalogSpriteKey(art)}@${want}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = want;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(catalogFlyImage, 0, 0, want, want);
  const tinted = tintCatalogPixels(g.getImageData(0, 0, want, want), art);
  g.putImageData(new ImageData(tinted.data, want, want), 0, 0);
  if (spriteCache.size >= SPRITE_MAX) spriteCache.clear();
  spriteCache.set(key, canvas);
  return canvas;
}

/**
 * destination-in 只用源像素 alpha。黑底白翅的亮度遮罩必须先把亮度写进 alpha，
 * 否则整张不透明，纹理会漏到身体和背景。
 */
export function alphaFromLuma(source) {
  const src = source.data;
  const n = src.length / 4;
  let opaque = 0;
  for (let i = 3; i < src.length; i += 4) if (src[i] > 250) opaque += 1;
  if (opaque < n * 0.97) return source;
  const data = new Uint8ClampedArray(src);
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    data[i] = data[i + 1] = data[i + 2] = 255;
  }
  return { data, width: source.width, height: source.height || source.width };
}

function rngOf(soul) {
  let seed = Number(soul?.seed ?? soul?.tokenId ?? 1) >>> 0 || 1;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** 从左右翅基扇出细脉和星点；裁进翅膜由调用方 destination-in。 */
export function paintCatalogWingTexture(tg, soul = {}) {
  const random = rngOf(soul);
  const stripes = Number(soul?.phenotype?.stripes?.count || 0);
  tg.globalCompositeOperation = "source-over";
  tg.strokeStyle = `rgba(255, ${170 + Math.floor(random() * 75)}, 110, 0.55)`;
  const fans = [
    {
      origin: CATALOG_WING_HINGES.left,
      count: 7 + stripes * 2,
      width: 1.4 + random() * 1.8,
      cx: -140,
      cy: -80,
      cw: 160,
      ch: 120,
      tx: -220,
      ty: -90,
      tw: 180,
      th: 110,
    },
    {
      origin: CATALOG_WING_HINGES.far,
      count: 4 + stripes,
      width: 1.1 + random() * 1.4,
      cx: -20,
      cy: -70,
      cw: 70,
      ch: 50,
      tx: -10,
      ty: -110,
      tw: 50,
      th: 70,
    },
  ];
  for (const fan of fans) {
    tg.lineWidth = fan.width;
    for (let n = 0; n < fan.count; n += 1) {
      tg.beginPath();
      tg.moveTo(fan.origin.x + random() * 10, fan.origin.y + random() * 14);
      tg.quadraticCurveTo(
        fan.origin.x + fan.cx + random() * fan.cw,
        fan.origin.y + fan.cy + random() * fan.ch,
        fan.origin.x + fan.tx + random() * fan.tw,
        fan.origin.y + fan.ty + random() * fan.th,
      );
      tg.stroke();
    }
  }
  const motes = [
    { x: 24, y: 48, w: 220, h: 140, n: 11 },
    { x: 248, y: 22, w: 80, h: 120, n: 7 },
  ];
  for (const box of motes) {
    for (let n = 0; n < box.n; n += 1) {
      tg.fillStyle = `rgba(255, 220, 155, ${0.28 + random() * 0.45})`;
      tg.beginPath();
      tg.arc(
        box.x + random() * box.w,
        box.y + random() * box.h,
        1 + random() * 2.4,
        0,
        Math.PI * 2,
      );
      tg.fill();
    }
  }
}

export function isEyePigment(r, g, b) {
  return r >= 50 && g * 100 < r * 38 && b * 100 < r * 50;
}

function isGlobePigment(r, g, b) {
  return r >= 40 && g * 100 < r * 52 && b * 100 < r * 62;
}

function ellipseDist(nx, ny, eye) {
  const dx = (nx - eye.cx) / eye.rx;
  const dy = (ny - eye.cy) / eye.ry;
  return dx * dx + dy * dy;
}

function assignCatalogEye(nx, ny) {
  const far = ellipseDist(nx, ny, CATALOG_EYES.far);
  const near = ellipseDist(nx, ny, CATALOG_EYES.near);
  if (far > 1 && near > 1) return null;
  return far <= near ? "far" : "near";
}

export function splitEyePixels(width, data, height = width) {
  if (width >= 80) {
    const far = [];
    const near = [];
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      if (data[i + 3] < 16) continue;
      if (!isGlobePigment(data[i], data[i + 1], data[i + 2])) continue;
      const which = assignCatalogEye(
        (p % width) / width,
        Math.floor(p / width) / height,
      );
      if (which === "far") far.push({ p, x: p % width });
      else if (which === "near") near.push({ p, x: p % width });
    }
    return { far, near };
  }
  const points = [];
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    if (data[i + 3] < 16) continue;
    if (!isEyePigment(data[i], data[i + 1], data[i + 2])) continue;
    points.push({ p, x: p % width });
  }
  if (points.length < 8) return { far: [], near: points };
  const xs = points.map((row) => row.x).sort((a, b) => a - b);
  let bestGap = 0;
  let cut = xs[Math.floor(xs.length / 2)];
  const lo = Math.floor(xs.length * 0.12);
  const hi = Math.ceil(xs.length * 0.88);
  for (let n = lo + 1; n < hi; n += 1) {
    const gap = xs[n] - xs[n - 1];
    if (gap >= bestGap) {
      bestGap = gap;
      cut = (xs[n] + xs[n - 1]) / 2;
    }
  }
  return {
    far: points.filter((row) => row.x < cut),
    near: points.filter((row) => row.x >= cut),
  };
}

function paintPigment(source, dest, i, target) {
  const r = source[i];
  const g = source[i + 1];
  const b = source[i + 2];
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const weight = Math.min(1, chroma / 75);
  const light = Math.pow(Math.max(r, g, b) / 255, 0.72);
  const white = Math.pow(Math.min(r, g, b) / 255, 2) * 0.75;
  const peak = Math.max(target.r, target.g, target.b, 1);
  dest[i] =
    source[i] * (1 - weight) +
    (((target.r / peak) * 210 + 28) * light * (1 - white) + 255 * white) *
      weight;
  dest[i + 1] =
    source[i + 1] * (1 - weight) +
    (((target.g / peak) * 210 + 28) * light * (1 - white) + 255 * white) *
      weight;
  dest[i + 2] =
    source[i + 2] * (1 - weight) +
    (((target.b / peak) * 210 + 28) * light * (1 - white) + 255 * white) *
      weight;
}

/** 体色铺满有色区域；两只复眼按解剖左右分别上色。 */
export function tintCatalogPixels(source, art = {}) {
  const width = source.width;
  const height = source.height || width;
  const src = source.data;
  const data = new Uint8ClampedArray(src);
  const body = hexRgb(art.body || "#c99b45");
  const eyeLeft = hexRgb(art.eyeLeft || art.eye || "#aa2537");
  const eyeRight = hexRgb(art.eyeRight || art.eye || "#aa2537");
  const { far, near } = splitEyePixels(width, src, height);
  const eyeAt = new Map();
  for (const row of far) eyeAt.set(row.p, eyeRight);
  for (const row of near) eyeAt.set(row.p, eyeLeft);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma < 18 || r < 20) continue;
    paintPigment(src, data, i, eyeAt.get(p) || body);
  }
  return { data, width, height };
}
