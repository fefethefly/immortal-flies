/**
 * fly-chibi.mjs —— 矢量果蝇（Habitat / Field / Hero 同一套）。
 *
 * 做法跟栖息地一样：身体、翅、腿、复眼都是独立路径，振翅是绕翅基转
 * 几何，不会把图撕开。外形往图鉴插画靠：拉长腹、虹彩膜翅、金翅脉、
 * 大复眼、胸毛，颜色仍只来自 phenotype.art。
 */

const TAU = Math.PI * 2;

const WHITE = Object.freeze({ r: 255, g: 252, b: 244 });
const WARM_INK = Object.freeze({ r: 26, g: 16, b: 10 });
const ICE = Object.freeze({ r: 206, g: 238, b: 250 });
const ROSE = Object.freeze({ r: 246, g: 205, b: 231 });
const GOLD_WASH = Object.freeze({ r: 248, g: 226, b: 150 });

export function hexRgb(hex, fallback = { r: 201, g: 164, b: 74 }) {
  const raw = String(hex ?? "").trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(raw);
  if (short) {
    const [a, b, c] = short[1].split("");
    const n = Number.parseInt(`${a}${a}${b}${b}${c}${c}`, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const n = Number.parseInt(raw.replace("#", ""), 16);
  if (!Number.isFinite(n)) return { ...fallback };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

export function luma(c) {
  return c.r * 0.3 + c.g * 0.5 + c.b * 0.2;
}

/** 深色基因型也要能看清脸：把过暗的体色提亮到可读区间。 */
export function liftBody(c) {
  const L = luma(c);
  if (L >= 74) return c;
  const gain = (76 - L) / 76;
  return {
    r: Math.min(255, Math.round(c.r + 18 + gain * 46)),
    g: Math.min(255, Math.round(c.g + 22 + gain * 50)),
    b: Math.min(255, Math.round(c.b + 14 + gain * 32)),
  };
}

/** 把基因组色相拉开一点，避免全息场上全变成一层金雾。 */
export function punchHue(c, gain = 1.34) {
  const avg = (c.r + c.g + c.b) / 3;
  return {
    r: Math.max(0, Math.min(255, Math.round(avg + (c.r - avg) * gain))),
    g: Math.max(0, Math.min(255, Math.round(avg + (c.g - avg) * gain))),
    b: Math.max(0, Math.min(255, Math.round(avg + (c.b - avg) * gain))),
  };
}

export function flyPigment(art = {}) {
  return punchHue(liftBody(hexRgb(art.body, { r: 201, g: 164, b: 74 })));
}

export function rgbCss(c, a = 1) {
  const r = Math.max(0, Math.min(255, Math.round(c.r)));
  const g = Math.max(0, Math.min(255, Math.round(c.g)));
  const b = Math.max(0, Math.min(255, Math.round(c.b)));
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
}

export const CHIBI_VIEWS = Object.freeze(["portrait", "side", "dorsal"]);

export function normalizeView(view) {
  return view === "dorsal" || view === "side" ? view : "portrait";
}

/**
 * 从 NFT 表型读出整套果蝇配色。体色/眼色是基因组的直接函数，
 * 其余是同一色相的明暗与翅膀虹彩推导，不引入独立调色板。
 */
export function chibiPalette(art = {}) {
  const body = flyPigment(art);
  const eyeLeft = hexRgb(art.eyeLeft || art.eye, { r: 181, g: 118, b: 96 });
  const eyeRight = hexRgb(art.eyeRight || art.eye, eyeLeft);
  const gold = mix(hexRgb(art.gold, { r: 240, g: 185, b: 11 }), body, 0.4);
  const vein = mix(hexRgb(art.vein, { r: 230, g: 224, b: 207 }), body, 0.28);
  return {
    body,
    bodyLight: mix(body, WHITE, 0.38),
    bodyHigh: mix(body, WHITE, 0.62),
    bodyDeep: mix(body, WARM_INK, 0.42),
    bodyRim: mix(body, { r: 255, g: 246, b: 224 }, 0.5),
    bodyFuzz: mix(body, WHITE, 0.46),
    eye: eyeLeft,
    eyeLeft,
    eyeRight,
    eyeLight: mix(eyeLeft, WHITE, 0.4),
    eyeRim: mix(eyeLeft, WARM_INK, 0.64),
    vein,
    gold,
    wingRoot: mix(body, WHITE, 0.36),
    wingMid: mix(WHITE, gold, 0.22),
    wingTip: mix(WHITE, eyeLeft, 0.18),
    wingIce: mix(ICE, eyeLeft, 0.3),
    wingRose: mix(ROSE, eyeRight, 0.34),
    wingGold: mix(GOLD_WASH, mix(gold, body, 0.35), 0.42),
  };
}

/**
 * 姿态解析：卡片是静置像（不扇翅），飞行精灵按四帧扇动，
 * 虚弱/倒下时收翅并降透明。
 */
export function chibiPose(pose = {}) {
  const closed = Boolean(pose.collapsed);
  const tired = Boolean(pose.tired);
  const flying = Boolean(pose.flying) && !closed && !tired;
  const phase = (Number(pose.phase) || 0) & 3;
  const beat = flying ? [-1, 0.55, -0.35, 0.75][phase] : 0;
  const hologram = Boolean(pose.hologram);
  return {
    view: normalizeView(pose.view),
    flying,
    tired,
    closed,
    hologram,
    phase,
    beat,
    wingAlpha: closed ? 0.22 : tired ? 0.4 : hologram ? 0.82 : 0.94,
    bodyAlpha: closed ? 0.72 : 1,
    lift: flying ? -1.4 + Math.abs(beat) * 0.8 : 0,
  };
}

const PORTRAIT = Object.freeze({
  head: { x: 0, y: -18.2, rx: 12.2, ry: 11.1 },
  eye: { dx: 7.2, y: -19.2, rx: 5.45, ry: 7.15, rot: 0.3 },
  thorax: { x: 0, y: -4.6, rx: 11.4, ry: 9.7 },
  abdomen: { x: 0, y: 12.2, rx: 14.4, ry: 12.9 },
  wing: {
    fore: { x: 4.1, y: -7.8, rot: -0.3, len: 33.5, wid: 12.6, k: 1 },
    hind: { x: 3.4, y: -3.4, rot: -1.04, len: 25.5, wid: 10.4, k: 1.28 },
  },
  antenna: { x: 4.8, y: -27, cx: 9, cy: -32.6, tx: 13, ty: -33.8 },
});

const DORSAL = Object.freeze({
  head: { x: 0, y: -18.8, rx: 6.0, ry: 5.5 },
  eye: { dx: 4.7, y: -18.9, rx: 4.05, ry: 4.65, rot: 0.16 },
  thorax: { x: 0, y: -7.1, rx: 5.15, ry: 5.85 },
  abdomen: { x: 0, y: 13.6, rx: 4.35, ry: 18.6 },
  wing: {
    fore: { x: 2.05, y: -7.2, rot: 0.16, len: 33.2, wid: 11.6, k: 1 },
    hind: { x: 1.6, y: -3.0, rot: 0.8, len: 23.2, wid: 8.8, k: 1.22 },
  },
  antenna: { x: 2.55, y: -24.6, cx: 4.9, cy: -30.6, tx: 7.4, ty: -33.8 },
});

function plumpnessOf(art) {
  const scale = Number(art?.scale) || 1;
  return 0.8 + scale * 0.14;
}

function bodyGeom(geom, art) {
  const plump = plumpnessOf(art);
  const female = art?.sex !== "male";
  return {
    ...geom,
    art,
    head: geom.head,
    eye: geom.eye,
    thorax: {
      ...geom.thorax,
      rx: geom.thorax.rx * plump,
      ry: geom.thorax.ry * plump,
    },
    abdomen: {
      ...geom.abdomen,
      rx: geom.abdomen.rx * plump * (female ? 1.0 : 0.86),
      ry: geom.abdomen.ry * plump * (female ? 1.04 : 0.94),
    },
  };
}

/* ---------------------------------------------------------------- 基础笔刷 */

/** 光泽球体：顶部高光 → 体色 → 底部暗面，再补一道底缘反光。 */
function blob(
  g,
  {
    x,
    y,
    rx,
    ry,
    rot = 0,
    color,
    gloss = 0.6,
    alpha = 1,
    lightX = -0.4,
    lightY = -0.52,
    rim = 0.3,
    edge = 0.5,
    hologram = false,
  },
) {
  if (rx <= 0 || ry <= 0) return;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha *= alpha;
  const hx = lightX * rx * 0.5;
  const hy = lightY * ry * 0.5;
  const hi = mix(color, WHITE, hologram ? 0.18 + gloss * 0.28 : 0.24 + gloss * 0.5);
  const mid = mix(color, WHITE, hologram ? 0.04 + gloss * 0.08 : 0.06 + gloss * 0.12);
  const shade = hologram ? mix(color, WARM_INK, 0.18) : mix(color, WARM_INK, 0.36);
  const a0 = hologram ? 0.82 : 1;
  const a1 = hologram ? 0.7 : 1;
  const a2 = hologram ? 0.54 : 1;
  const a3 = hologram ? 0.3 : 1;
  const a4 = hologram ? 0.1 : 1;
  const grad = g.createRadialGradient(
    hx,
    hy,
    Math.max(0.6, rx * 0.08),
    hx * 0.24,
    hy * 0.2,
    rx * 1.16,
  );
  grad.addColorStop(0, rgbCss(hi, a0));
  grad.addColorStop(0.2, rgbCss(mid, a1));
  grad.addColorStop(0.56, rgbCss(color, a2));
  grad.addColorStop(0.86, rgbCss(shade, a3));
  grad.addColorStop(1, rgbCss(mix(color, WARM_INK, hologram ? 0.12 : edge), a4));
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  g.fill();
  if (rim > 0) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha *= rim * 0.5;
    const bounce = g.createRadialGradient(
      0,
      ry * 0.92,
      rx * 0.05,
      0,
      ry * 0.9,
      rx * 0.46,
    );
    bounce.addColorStop(0, rgbCss(mix(color, WHITE, 0.55)));
    bounce.addColorStop(1, rgbCss(color, 0));
    g.fillStyle = bounce;
    g.beginPath();
    g.ellipse(0, 0, rx, ry, 0, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** 绒感：沿椭圆的短绒毛，让胸腹像毛绒玩具而不是塑料球。 */
function fuzz(g, { x, y, rx, ry, rot = 0, color, count = 16, len = 3, alpha = 0.5, from = -2.5, to = 0.6 }) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.strokeStyle = rgbCss(color, alpha);
  g.lineWidth = 0.85;
  g.lineCap = "round";
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const a = from + (to - from) * t;
    const nx = Math.cos(a) * rx;
    const ny = Math.sin(a) * ry;
    const l = len * (0.62 + 0.38 * Math.sin(t * Math.PI));
    g.beginPath();
    g.moveTo(nx, ny);
    g.lineTo(nx + Math.cos(a) * l, ny + Math.sin(a) * l);
    g.stroke();
  }
  g.restore();
}

function wingPath(g, len, wid) {
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(
    len * 0.16,
    -wid * 0.82,
    len * 0.6,
    -wid * 0.94,
    len * 0.98,
    -wid * 0.06,
  );
  g.bezierCurveTo(
    len * 1.05,
    wid * 0.36,
    len * 0.54,
    wid * 0.86,
    len * 0.03,
    wid * 0.2,
  );
  g.closePath();
}

function wingMorph(art) {
  const shape = art?.wingShape || "typical";
  if (shape === "miniature") return { len: 0.62, wid: 0.7, rot: 0.04, alpha: 1 };
  if (shape === "curly") return { len: 0.9, wid: 0.88, rot: 0.52, alpha: 1 };
  if (shape === "vestigial") return { len: 0.28, wid: 0.4, rot: 0.1, alpha: 0.88 };
  return { len: 1, wid: 1, rot: 0, alpha: 1 };
}

function wingPattern(g, pal, art, len, wid) {
  const mark = art?.wingMark || "clear";
  const veins = art?.wingVein || "complete";
  if (mark === "apical") {
    g.fillStyle = rgbCss(mix(pal.bodyDeep, WARM_INK, 0.35), 0.55);
    g.beginPath();
    g.ellipse(len * 0.84, -wid * 0.06, len * 0.16, wid * 0.28, 0.2, 0, TAU);
    g.fill();
  } else if (mark === "banded") {
    g.fillStyle = rgbCss(mix(pal.bodyDeep, WARM_INK, 0.4), 0.42);
    g.fillRect(len * 0.42, -wid, len * 0.16, wid * 2.2);
  } else if (mark === "pictured") {
    g.fillStyle = rgbCss(mix(pal.bodyDeep, WARM_INK, 0.38), 0.4);
    g.beginPath();
    g.ellipse(len * 0.38, -wid * 0.18, len * 0.14, wid * 0.22, -0.2, 0, TAU);
    g.ellipse(len * 0.7, wid * 0.12, len * 0.12, wid * 0.2, 0.3, 0, TAU);
    g.fill();
  }
  g.strokeStyle = rgbCss(mix(pal.vein, pal.gold, 0.42), veins === "incomplete" ? 0.22 : 0.58);
  g.lineWidth = 0.55;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.46, -wid * 0.7, len * 0.96, -wid * 0.08);
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.4, -wid * 0.16, len * 0.9, -wid * 0.02);
  if (veins !== "incomplete") {
    g.moveTo(0, wid * 0.08);
    g.quadraticCurveTo(len * 0.38, wid * 0.34, len * 0.8, wid * 0.14);
    g.moveTo(len * 0.34, -wid * 0.42);
    g.lineTo(len * 0.36, wid * 0.08);
  }
  if (veins === "complete" || veins === "extra") {
    g.moveTo(len * 0.22, -wid * 0.28);
    g.quadraticCurveTo(len * 0.58, -wid * 0.62, len * 0.74, -wid * 0.58);
    g.moveTo(len * 0.52, -wid * 0.22);
    g.quadraticCurveTo(len * 0.62, wid * 0.04, len * 0.7, wid * 0.18);
  }
  if (veins === "extra") {
    g.moveTo(len * 0.44, -wid * 0.32);
    g.lineTo(len * 0.46, wid * 0.22);
  }
  g.stroke();
}

/** 单翼：半透明虹彩膜 + 高光 + 翅脉 + 亮点。 */
function drawWing(g, pal, spec, { beat = 0, alpha = 0.8, flying = false, art = {} }) {
  const morph = wingMorph(art);
  const { x, y, rot, k = 1 } = spec;
  const len = spec.len * morph.len;
  const wid = spec.wid * morph.wid;
  g.save();
  g.translate(x, y);
  g.rotate(rot + morph.rot + (flying ? beat * 0.42 * k : 0));
  g.globalAlpha *= alpha * morph.alpha;
  wingPath(g, len, wid);
  const wash = g.createLinearGradient(0, -wid * 0.5, len, wid * 0.5);
  wash.addColorStop(0, rgbCss(pal.wingRoot, 0.42));
  wash.addColorStop(0.32, rgbCss(pal.wingMid, 0.62));
  wash.addColorStop(0.68, rgbCss(pal.wingGold, 0.38));
  wash.addColorStop(1, rgbCss(pal.wingTip, 0.44));
  g.fillStyle = wash;
  g.fill();
  g.save();
  wingPath(g, len, wid);
  g.clip();
  g.globalCompositeOperation = "lighter";
  g.fillStyle = rgbCss(pal.wingIce, 0.22);
  g.beginPath();
  g.ellipse(len * 0.42, -wid * 0.32, len * 0.32, wid * 0.26, -0.14, 0, TAU);
  g.fill();
  g.fillStyle = rgbCss(pal.wingRose, 0.14);
  g.beginPath();
  g.ellipse(len * 0.7, wid * 0.16, len * 0.22, wid * 0.18, 0.22, 0, TAU);
  g.fill();
  g.fillStyle = rgbCss(WHITE, 0.28);
  g.beginPath();
  g.ellipse(len * 0.18, -wid * 0.1, len * 0.26, wid * 0.14, -0.08, 0, TAU);
  g.fill();
  g.globalCompositeOperation = "source-over";
  g.restore();
  wingPath(g, len, wid);
  g.save();
  g.clip();
  wingPattern(g, pal, art, len, wid);
  g.restore();
  wingPath(g, len, wid);
  g.strokeStyle = rgbCss(mix(pal.gold, WHITE, 0.35), 0.42);
  g.lineWidth = 0.7;
  g.stroke();
  g.restore();
}

/** 左右镜像地画扇形翅膀，保证两侧严格对称。 */
function wingFan(g, pal, geom, pose) {
  const { wing } = geom;
  const alpha = pose.wingAlpha;
  const close = pose.closed ? 0.5 : pose.tired ? 0.24 : 0;
  for (const mirror of [1, -1]) {
    g.save();
    g.scale(mirror, 1);
    for (const kind of ["hind", "fore"]) {
      const spec = wing[kind];
      drawWing(
        g,
        pal,
        { ...spec, rot: spec.rot + close * 0.7 },
        { beat: pose.beat, alpha, flying: pose.flying, art: geom.art },
      );
    }
    g.restore();
  }
}

function legs(g, pal, { y, spread, alpha = 0.8, count = 3, len = 7, art = {} }) {
  g.save();
  g.globalAlpha *= alpha;
  g.strokeStyle = rgbCss(mix(pal.bodyDeep, WARM_INK, 0.4), 0.9);
  g.lineWidth = 1.25;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const mirror of [1, -1]) {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : i / (count - 1);
      const rootX = mirror * (spread * (0.66 + t * 0.3));
      const rootY = y + t * 3.4;
      const kneeX = rootX + mirror * len * (0.5 + t * 0.2);
      const kneeY = rootY + len * (0.5 - t * 0.16);
      const footX = kneeX + mirror * len * 0.34;
      const footY = kneeY + len * 0.42;
      g.beginPath();
      g.moveTo(rootX, rootY);
      g.lineTo(kneeX, kneeY);
      g.lineTo(footX, footY);
      g.stroke();
      if (art?.sex === "male" && i === 0) {
        g.strokeStyle = rgbCss(mix(pal.bodyDeep, WARM_INK, 0.55), 0.95);
        g.lineWidth = 2.1;
        g.beginPath();
        g.moveTo(kneeX + mirror * 0.4, kneeY - 0.6);
        g.lineTo(kneeX + mirror * 2.4, kneeY + 0.8);
        g.stroke();
        g.strokeStyle = rgbCss(mix(pal.bodyDeep, WARM_INK, 0.4), 0.9);
        g.lineWidth = 1.25;
      }
      g.fillStyle = rgbCss(mix(pal.bodyDeep, WARM_INK, 0.35), 0.9);
      g.beginPath();
      g.arc(footX, footY, 0.85, 0, TAU);
      g.fill();
    }
  }
  g.restore();
}

function antenna(g, pal, spec, alpha = 1) {
  const { x, y, cx, cy, tx, ty } = spec;
  for (const mirror of [1, -1]) {
    g.save();
    g.scale(mirror, 1);
    g.globalAlpha *= alpha;
    g.strokeStyle = rgbCss(mix(pal.bodyDeep, WARM_INK, 0.3), 0.88);
    g.lineWidth = 1.05;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(cx * 0.72, cy, tx, ty);
    g.stroke();
    g.strokeStyle = rgbCss(mix(pal.bodyDeep, WHITE, 0.12), 0.55);
    g.lineWidth = 0.55;
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(tx + 2.4, ty - 3.2);
    g.stroke();
    g.fillStyle = rgbCss(mix(pal.bodyLight, WHITE, 0.2), 0.9);
    g.beginPath();
    g.ellipse(tx, ty, 0.95, 0.8, -0.4, 0, TAU);
    g.fill();
    g.restore();
  }
}

/** 复眼：虹彩底 + 蜂窝小面 + 两处高光，正面像的记忆点。左右眼可不同色。 */
function compoundEye(g, pal, { x, y, rx, ry, rot, dim = false, color }) {
  const pigment = color || pal.eye;
  const base = dim ? mix(pigment, WARM_INK, 0.3) : pigment;
  const rim = mix(pigment, WARM_INK, 0.64);
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const grad = g.createRadialGradient(
    -rx * 0.34,
    -ry * 0.42,
    rx * 0.08,
    rx * 0.08,
    ry * 0.16,
    rx * 1.3,
  );
  grad.addColorStop(0, rgbCss(mix(base, WHITE, 0.52)));
  grad.addColorStop(0.34, rgbCss(mix(base, WHITE, 0.14)));
  grad.addColorStop(0.72, rgbCss(base));
  grad.addColorStop(1, rgbCss(mix(base, WARM_INK, 0.5)));
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  g.fill();
  g.save();
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  g.clip();
  const step = rx * 0.28;
  g.fillStyle = rgbCss(mix(base, WARM_INK, 0.6), dim ? 0.1 : 0.14);
  let row = 0;
  for (let cy = -ry; cy <= ry + step; cy += step * 0.86) {
    const off = (row % 2) * step * 0.5;
    for (let cx = -rx - step; cx <= rx + step; cx += step) {
      g.beginPath();
      g.arc(cx + off, cy, step * 0.31, 0, TAU);
      g.fill();
    }
    row += 1;
  }
  const belly = g.createLinearGradient(0, -ry, 0, ry);
  belly.addColorStop(0, "rgba(255,255,255,0)");
  belly.addColorStop(0.62, "rgba(18,8,6,0.06)");
  belly.addColorStop(1, "rgba(18,8,6,0.3)");
  g.fillStyle = belly;
  g.fillRect(-rx, -ry, rx * 2, ry * 2);
  if (!dim) {
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(255,253,246,0.5)";
    g.beginPath();
    g.ellipse(-rx * 0.3, -ry * 0.4, rx * 0.5, ry * 0.34, -0.5, 0, TAU);
    g.fill();
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.ellipse(-rx * 0.34, -ry * 0.44, rx * 0.22, ry * 0.16, -0.5, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.8)";
    g.beginPath();
    g.ellipse(-rx * 0.05, -ry * 0.12, rx * 0.09, ry * 0.07, 0, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.42)";
    g.beginPath();
    g.ellipse(rx * 0.36, ry * 0.34, rx * 0.16, ry * 0.1, 0.5, 0, TAU);
    g.fill();
  }
  g.restore();
  g.strokeStyle = rgbCss(rim, dim ? 0.25 : 0.42);
  g.lineWidth = 0.8;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  g.stroke();
  g.restore();
}

/** 腹部条纹与斑型：正面看是横向弧带，俯视看是横向环带。 */
function abdomenMarks(g, pal, art, { rx, ry, view }) {
  const stripes = Math.max(0, Math.min(4, Number(art.stripes) || 0));
  g.save();
  if (stripes) {
    g.fillStyle = rgbCss(mix(pal.body, WARM_INK, 0.5), 0.24);
    for (let i = 0; i < stripes; i += 1) {
      const t = (i + 1) / (stripes + 1);
      const y = ry * (t * 1.5 - 0.62);
      const half = rx * Math.sqrt(Math.max(0.04, 1 - (y / ry) ** 2)) * 0.92;
      g.beginPath();
      if (view === "dorsal") {
        g.ellipse(0, y, half, ry * 0.1, 0, 0, TAU);
      } else {
        g.ellipse(0, y, half, ry * 0.11, 0, Math.PI, TAU);
      }
      g.fill();
    }
  }
  if (art.mark === "bar") {
    g.fillStyle = rgbCss(pal.gold, 0.5);
    g.beginPath();
    g.ellipse(0, -ry * 0.24, rx * 0.5, ry * 0.13, 0, 0, TAU);
    g.fill();
  }
  if (art.mark === "spots") {
    g.fillStyle = rgbCss(mix(pal.body, WARM_INK, 0.55), 0.42);
    g.beginPath();
    g.arc(-rx * 0.32, -ry * 0.1, rx * 0.13, 0, TAU);
    g.arc(rx * 0.32, -ry * 0.1, rx * 0.13, 0, TAU);
    g.fill();
  }
  g.restore();
}

function sparkle(g, { x, y, r, rot = 0, color, alpha = 0.8 }) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha *= alpha;
  g.fillStyle = rgbCss(color, 0.9);
  g.beginPath();
  g.moveTo(0, -r);
  g.quadraticCurveTo(r * 0.16, -r * 0.16, r, 0);
  g.quadraticCurveTo(r * 0.16, r * 0.16, 0, r);
  g.quadraticCurveTo(-r * 0.16, r * 0.16, -r, 0);
  g.quadraticCurveTo(-r * 0.16, -r * 0.16, 0, -r);
  g.fill();
  g.restore();
}

/** 星点位置由体色推导，同一 NFT 每次生成一致。 */
export function sparkleSet(art = {}, view = "portrait") {
  const pal = chibiPalette(art);
  let seed = (pal.body.r << 16) ^ (pal.body.g << 8) ^ pal.body.b ^ 0x9e3779b9;
  if (view === "dorsal") seed ^= 0x5bf03635;
  const out = [];
  for (let i = 0; i < 5; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const u = ((seed >>> 0) % 1000) / 1000;
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const v = ((seed >>> 0) % 1000) / 1000;
    const side = u < 0.5 ? -1 : 1;
    out.push({
      x: side * (24 + v * 12),
      y: -26 + ((i * 37) % 52) + u * -6,
      r: 1.3 + ((i * 7) % 5) * 0.42,
      rot: v * 1.6,
      alpha: 0.42 + ((i * 3) % 4) * 0.13,
      gold: i % 3 === 0,
    });
  }
  return out;
}

function aura(g, pal, { y, r, alpha = 0.3 }) {
  const glow = g.createRadialGradient(0, y * 0.4, r * 0.12, 0, y * 0.5, r);
  glow.addColorStop(0, rgbCss(pal.body, alpha));
  glow.addColorStop(0.42, rgbCss(pal.body, alpha * 0.34));
  glow.addColorStop(1, rgbCss(pal.body, 0));
  g.fillStyle = glow;
  g.beginPath();
  g.arc(0, y * 0.5, r, 0, TAU);
  g.fill();
}

function hologramVeil(g, pal, pose) {
  g.save();
  g.globalCompositeOperation = "source-atop";
  const shift = ((pose.phase || 0) & 3) * 0.65;
  g.fillStyle = rgbCss(mix(pal.bodyHigh, WHITE, 0.35), 0.12);
  for (let y = -40 + shift; y < 42; y += 2.5) {
    g.fillRect(-44, y, 88, 0.8);
  }
  g.globalCompositeOperation = "lighter";
  const sheen = g.createLinearGradient(-10, -26, 12, 28);
  sheen.addColorStop(0, rgbCss(pal.wingIce, 0.08));
  sheen.addColorStop(0.38, rgbCss(pal.body, 0.22));
  sheen.addColorStop(0.68, rgbCss(pal.gold, 0.12));
  sheen.addColorStop(1, rgbCss(pal.eyeLight, 0.06));
  g.fillStyle = sheen;
  g.beginPath();
  g.ellipse(0, 4, 6.2, 24.5, 0.03, 0, TAU);
  g.fill();
  g.strokeStyle = rgbCss(pal.bodyHigh, 0.3);
  g.lineWidth = 0.7;
  g.beginPath();
  g.ellipse(0, 4.2, 5.15, 22.6, 0.02, 0, TAU);
  g.stroke();
  g.restore();
}

function contactShadow(g, { y, rx, ry, alpha = 0.24 }) {
  const shade = g.createRadialGradient(0, y, rx * 0.1, 0, y, rx);
  shade.addColorStop(0, `rgba(8,6,4,${alpha})`);
  shade.addColorStop(1, "rgba(8,6,4,0)");
  g.fillStyle = shade;
  g.beginPath();
  g.ellipse(0, y, rx, ry, 0, 0, TAU);
  g.fill();
}

/* ------------------------------------------------------------------ 三种视角 */

function paintPortrait(g, pal, art, pose) {
  const geom = bodyGeom(PORTRAIT, art);
  const dim = pose.tired || pose.closed;
  g.save();
  g.globalAlpha *= pose.bodyAlpha;
  aura(g, pal, { y: 8, r: 50, alpha: dim ? 0.14 : 0.28 });
  contactShadow(g, { y: 26.5, rx: 25, ry: 5.4, alpha: dim ? 0.18 : 0.26 });
  g.translate(0, pose.lift);
  wingFan(g, pal, geom, pose);
  legs(g, pal, { y: 14.5, spread: 16.4, alpha: dim ? 0.5 : 0.85, len: 8, art });

  const { abdomen, thorax, head, eye } = geom;
  blob(g, {
    ...abdomen,
    rot: 0,
    color: pal.body,
    gloss: 0.66,
    lightX: -0.2,
    lightY: -0.62,
    rim: 0.22,
  });
  g.save();
  g.translate(abdomen.x, abdomen.y);
  abdomenMarks(g, pal, art, { rx: abdomen.rx, ry: abdomen.ry, view: "portrait" });
  g.restore();
  fuzz(g, {
    x: abdomen.x,
    y: abdomen.y,
    rx: abdomen.rx * 0.98,
    ry: abdomen.ry * 0.98,
    color: pal.bodyFuzz,
    count: 18,
    len: 2.6,
    alpha: 0.32,
    from: -2.85,
    to: -0.3,
  });
  blob(g, {
    ...thorax,
    rot: 0,
    color: mix(pal.body, WHITE, 0.06),
    gloss: 0.62,
    lightX: -0.22,
    lightY: -0.6,
    rim: 0.28,
  });
  fuzz(g, {
    x: thorax.x,
    y: thorax.y,
    rx: thorax.rx * 0.96,
    ry: thorax.ry * 0.96,
    color: pal.bodyFuzz,
    count: 14,
    len: 2.4,
    alpha: 0.36,
    from: -2.7,
    to: -0.45,
  });
  // 胸腹之间的绒毛领：让两节身体分得开，而不是糊成一个球。
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha *= dim ? 0.12 : 0.3;
  const collar = g.createRadialGradient(0, 3.2, 0.6, 0, 3.2, 9.6);
  collar.addColorStop(0, rgbCss(pal.bodyHigh, 0.85));
  collar.addColorStop(1, rgbCss(pal.bodyHigh, 0));
  g.fillStyle = collar;
  g.beginPath();
  g.ellipse(0, 3.2, 9.6, 3.4, 0, 0, TAU);
  g.fill();
  g.restore();
  blob(g, {
    ...head,
    rot: 0,
    color: mix(pal.body, WHITE, 0.12),
    gloss: 0.6,
    lightX: -0.24,
    lightY: -0.58,
    rim: 0.24,
  });
  // 脸颊暖光：只提亮体色，不引入新色相。
  g.save();
  g.globalCompositeOperation = "lighter";
  g.globalAlpha *= 0.22;
  for (const mirror of [1, -1]) {
    const blobGrad = g.createRadialGradient(
      mirror * 8.4,
      -13.4,
      0.5,
      mirror * 8.4,
      -13.4,
      4.6,
    );
    blobGrad.addColorStop(0, rgbCss(pal.bodyHigh, 0.9));
    blobGrad.addColorStop(1, rgbCss(pal.bodyHigh, 0));
    g.fillStyle = blobGrad;
    g.beginPath();
    g.arc(mirror * 8.4, -13.4, 4.6, 0, TAU);
    g.fill();
  }
  g.restore();
  compoundEye(g, pal, {
    x: -eye.dx,
    y: eye.y,
    rx: eye.rx,
    ry: eye.ry,
    rot: -eye.rot,
    dim,
    color: pal.eyeRight,
  });
  compoundEye(g, pal, {
    x: eye.dx,
    y: eye.y,
    rx: eye.rx,
    ry: eye.ry,
    rot: eye.rot,
    dim,
    color: pal.eyeLeft,
  });
  antenna(g, pal, PORTRAIT.antenna, dim ? 0.5 : 1);
  g.restore();

  const stars = sparkleSet(art, "portrait");
  for (const star of stars) {
    sparkle(g, {
      x: star.x,
      y: star.y + pose.lift,
      r: star.r,
      rot: star.rot,
      color: star.gold ? pal.gold : pal.bodyHigh,
      alpha: dim ? star.alpha * 0.4 : star.alpha,
    });
  }
}

function paintDorsal(g, pal, art, pose) {
  const geom = bodyGeom(DORSAL, art);
  const dim = pose.tired || pose.closed;
  const holo = pose.hologram;
  g.save();
  g.globalAlpha *= pose.bodyAlpha;
  aura(g, pal, { y: 6, r: holo ? 20 : 24, alpha: dim ? 0.08 : holo ? 0.07 : 0.12 });
  if (!holo) contactShadow(g, { y: 26, rx: 11, ry: 2.8, alpha: dim ? 0.14 : 0.2 });
  g.translate(0, pose.lift * 0.6);
  wingFan(g, pal, geom, pose);
  legs(g, pal, {
    y: 4.8,
    spread: 6.6,
    alpha: dim ? 0.45 : holo ? 0.38 : 0.82,
    len: 5.6,
    art,
  });
  const { abdomen, thorax, head, eye } = geom;
  blob(g, {
    ...abdomen,
    color: pal.body,
    gloss: holo ? 0.72 : 0.48,
    lightX: -0.18,
    lightY: -0.58,
    rim: holo ? 0.28 : 0.22,
    hologram: holo,
  });
  g.save();
  g.translate(abdomen.x, abdomen.y);
  abdomenMarks(g, pal, art, { rx: abdomen.rx, ry: abdomen.ry, view: "dorsal" });
  g.restore();
  fuzz(g, {
    x: abdomen.x,
    y: abdomen.y,
    rx: abdomen.rx * 0.96,
    ry: abdomen.ry * 0.96,
    color: pal.bodyFuzz,
    count: 16,
    len: 1.7,
    alpha: holo ? 0.14 : 0.22,
    from: 0.08,
    to: 3.02,
  });
  blob(g, {
    ...thorax,
    color: mix(pal.body, WHITE, 0.04),
    gloss: holo ? 0.7 : 0.5,
    lightX: -0.2,
    lightY: -0.56,
    rim: holo ? 0.26 : 0.2,
    hologram: holo,
  });
  fuzz(g, {
    x: thorax.x,
    y: thorax.y,
    rx: thorax.rx * 0.94,
    ry: thorax.ry * 0.94,
    color: pal.bodyFuzz,
    count: 22,
    len: 2.1,
    alpha: holo ? 0.2 : 0.34,
    from: -2.8,
    to: -0.2,
  });
  blob(g, {
    ...head,
    color: mix(pal.body, WHITE, 0.08),
    gloss: holo ? 0.68 : 0.5,
    lightX: -0.22,
    lightY: -0.54,
    rim: holo ? 0.24 : 0.18,
    hologram: holo,
  });
  compoundEye(g, pal, {
    x: -eye.dx,
    y: eye.y,
    rx: eye.rx,
    ry: eye.ry,
    rot: -eye.rot,
    dim,
    color: pal.eyeRight,
  });
  compoundEye(g, pal, {
    x: eye.dx,
    y: eye.y,
    rx: eye.rx,
    ry: eye.ry,
    rot: eye.rot,
    dim,
    color: pal.eyeLeft,
  });
  antenna(g, pal, DORSAL.antenna, dim ? 0.5 : holo ? 0.72 : 1);
  if (holo) hologramVeil(g, pal, pose);
  g.restore();
}

function paintSide(g, pal, art, pose) {
  const geom = bodyGeom(PORTRAIT, art);
  const dim = pose.tired || pose.closed;
  const plump = plumpnessOf(art);
  g.save();
  g.globalAlpha *= pose.bodyAlpha;
  aura(g, pal, { y: 6, r: 46, alpha: dim ? 0.12 : 0.24 });
  contactShadow(g, { y: 22, rx: 24, ry: 5, alpha: dim ? 0.16 : 0.22 });
  g.translate(0, pose.lift * 0.8);
  g.save();
  g.translate(-4, -2);
  g.rotate(-0.34 - pose.beat * 0.12);
  drawWing(g, pal, { x: 2, y: -8, rot: 0, len: 30, wid: 11.4 }, {
    beat: 0,
    alpha: pose.wingAlpha,
    flying: false,
    art,
  });
  g.restore();
  legs(g, pal, { y: 10, spread: 10, alpha: dim ? 0.5 : 0.85, art });
  const abdomen = {
    x: 12,
    y: 4.4,
    rx: 15.2 * plump,
    ry: 11.6 * plump,
  };
  blob(g, {
    ...abdomen,
    rot: 0.16,
    color: pal.body,
    gloss: 0.64,
    lightX: -0.3,
    lightY: -0.6,
    rim: 0.32,
  });
  g.save();
  g.translate(abdomen.x, abdomen.y);
  g.rotate(0.16);
  abdomenMarks(g, pal, art, { rx: abdomen.rx, ry: abdomen.ry, view: "side" });
  g.restore();
  fuzz(g, {
    x: abdomen.x,
    y: abdomen.y,
    rx: abdomen.rx * 0.96,
    ry: abdomen.ry * 0.96,
    color: pal.bodyFuzz,
    count: 14,
    len: 2.4,
    alpha: 0.3,
    from: -0.5,
    to: -2.6,
  });
  blob(g, {
    x: -2.4,
    y: -3.4,
    rx: 11 * plump,
    ry: 9.8 * plump,
    color: mix(pal.body, WHITE, 0.06),
    gloss: 0.6,
    lightX: -0.28,
    lightY: -0.58,
    rim: 0.26,
  });
  blob(g, {
    x: -14.6,
    y: -7.4,
    rx: 10.6,
    ry: 9.8,
    color: mix(pal.body, WHITE, 0.12),
    gloss: 0.58,
    lightX: -0.3,
    lightY: -0.56,
    rim: 0.22,
  });
  compoundEye(g, pal, {
    x: -16.6,
    y: -8.6,
    rx: 6.4,
    ry: 7.4,
    rot: -0.24,
    dim,
    color: pal.eyeLeft,
  });
  antenna(
    g,
    pal,
    { x: -18, y: -16.4, cx: -22.6, cy: -21.4, tx: -26, ty: -22.6 },
    dim ? 0.5 : 1,
  );
  g.restore();
  const stars = sparkleSet(art, "side");
  for (const star of stars) {
    sparkle(g, {
      x: star.x,
      y: star.y * 0.9,
      r: star.r * 0.9,
      rot: star.rot,
      color: star.gold ? pal.gold : pal.bodyHigh,
      alpha: dim ? star.alpha * 0.36 : star.alpha * 0.7,
    });
  }
}

export function paintChibi(g, art = {}, pose = {}) {
  const pal = chibiPalette(art);
  const p = { ...chibiPose(pose) };
  if (p.view === "dorsal") paintDorsal(g, pal, art || {}, p);
  else if (p.view === "side") paintSide(g, pal, art || {}, p);
  else paintPortrait(g, pal, art || {}, p);
}

/** 精灵缓存键：同表型同姿态复用离屏位图。 */
export function spriteKey(art = {}, opts = {}) {
  return [
    art.body,
    art.eye,
    art.eyeLeft || art.eye,
    art.eyeRight || art.eye,
    art.stripes,
    art.mark,
    art.scale,
    art.wingMark,
    art.wingShape,
    art.wingVein,
    art.sex,
    opts.flying !== false,
    (opts.phase ?? 0) & 3,
    Boolean(opts.tired),
    Boolean(opts.collapsed),
    Boolean(opts.hologram),
    normalizeView(opts.view || "dorsal"),
  ].join("|");
}
