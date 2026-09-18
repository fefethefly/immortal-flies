import { paintChibi, spriteKey } from "./fly-chibi.mjs";

/**
 * fly-sprite.mjs —— 果蝇精灵的统一入口。
 *
 * 美术在 fly-chibi.mjs（矢量图鉴像）；这里只负责坐标系、缩放、
 * 四帧振翅相位与离屏缓存，保证调用方接口不变。
 */

const cache = new Map();
const CACHE_MAX = 320;

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

function poseOf(opts = {}) {
  const flying = opts.flying !== false && !opts.tired && !opts.collapsed;
  return {
    flying,
    phase: (opts.phase ?? 0) & 3,
    tired: Boolean(opts.tired),
    collapsed: Boolean(opts.collapsed),
    hologram: Boolean(opts.hologram),
    view: opts.view || "portrait",
  };
}

/**
 * 萌系果蝇的外接框（本地坐标，span=58 为基准）：
 * 左右翅尖 ±37.5，触角球到上缘 -39，接触影到下缘 +34。
 * 卡片与全息按这个框反推 span，避免裁掉触角或翅膀。
 */
export const FLY_BOX = Object.freeze({
  per: 58,
  halfW: 37.5,
  top: 39,
  bottom: 34,
});

export function fitSpan(width, height, { pad = 0.94 } = {}) {
  const w = Math.max(1, Number(width) || 0);
  const h = Math.max(1, Number(height) || 0);
  // 形体关于原点并不上下对称（触角比影长），按较大的一侧对称外接。
  const reach = Math.max(FLY_BOX.top, FLY_BOX.bottom);
  const byW = (w * pad) / ((FLY_BOX.halfW * 2) / FLY_BOX.per);
  const byH = (h * pad) / ((reach * 2) / FLY_BOX.per);
  return Math.max(16, Math.min(byW, byH));
}

/** 体型位点的温和体现：粗壮略大、偏小略小，但不会撑破外接框。 */
export function sizeFactor(art = {}) {
  const scale = Number(art?.scale) || 1;
  return Math.max(0.88, Math.min(1.12, 0.86 + scale * 0.14));
}

export function drawFlyArt(ctx, art = {}, x, y, span, opts = {}) {
  const sized = opts.ignoreScale ? 1 : art.scale || 1;
  const k = (span / FLY_BOX.per) * sized;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  paintChibi(ctx, art, poseOf(opts));
  ctx.restore();
}

export function flySprite(art = {}, opts = {}) {
  const key = spriteKey(art, opts);
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.translate(128, 128);
  g.scale(2.15, 2.15);
  paintChibi(g, art, poseOf({ ...opts, view: opts.view || "dorsal" }));
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, canvas);
  return canvas;
}
