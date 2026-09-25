import { hexRgb } from "./fly-chibi.mjs";

export const COLONY_BODY_SRC = "/assets/colony-body-v4.png";
export const PORTRAIT_SIZE = 640;
const plates = new Map();
const bodyCaches = new WeakMap();

// Calibrated to the v4 collectible plate; near = left, far = right.
export const COLONY_EYES = Object.freeze({
  near: { cx: 0.673, cy: 0.511, rx: 0.124, ry: 0.132 },
  far: { cx: 0.915, cy: 0.503, rx: 0.051, ry: 0.11 },
});

function rgbChannels(hex) {
  const { r, g, b } = hexRgb(hex);
  return [r, g, b];
}

// Every visual trait participates in the cache; siblings need not share looks.
export function colonyPortraitKey(art = {}) {
  return JSON.stringify([
    art.body,
    art.eyeLeft || art.eye,
    art.eyeRight || art.eye,
    art.scale,
    art.stripes,
    art.mark,
    art.wingShape,
    art.wingMark,
    art.wingVein,
    art.sex,
  ]);
}

export function loadColonyPlate(resolution = PORTRAIT_SIZE) {
  const side = Math.max(
    PORTRAIT_SIZE,
    Math.min(1280, Math.round(Number(resolution) || PORTRAIT_SIZE)),
  );
  if (!plates.has(side)) {
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = side;
          const g = canvas.getContext("2d", { willReadFrequently: true });
          g.imageSmoothingQuality = "high";
          g.drawImage(img, 0, 0, side, side);
          resolve(g.getImageData(0, 0, side, side));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("Colony portrait unavailable"));
      img.src = COLONY_BODY_SRC;
    }).catch((error) => {
      plates.delete(side);
      throw error;
    });
    plates.set(side, promise);
  }
  return plates.get(side);
}

// Preserve alpha, facet texture and neutral highlights. Pigments retain their
// actual brightness, so dark/light alleles do not collapse to the same sprite.
export function tintColonyBody(source, art = {}) {
  const data = new Uint8ClampedArray(source.data);
  const body = rgbChannels(art.body || "#c99b45");
  const near = rgbChannels(art.eyeLeft || art.eye || "#c23a32");
  const far = rgbChannels(art.eyeRight || art.eye || "#c23a32");
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = source.data[i],
      g = source.data[i + 1],
      b = source.data[i + 2];
    const x = ((i / 4) % source.width) / source.width;
    const y = Math.floor(i / 4 / source.width) / source.height;
    const inNear =
      ((x - COLONY_EYES.near.cx) / COLONY_EYES.near.rx) ** 2 +
        ((y - COLONY_EYES.near.cy) / COLONY_EYES.near.ry) ** 2 <
      1;
    const inFar =
      ((x - COLONY_EYES.far.cx) / COLONY_EYES.far.rx) ** 2 +
        ((y - COLONY_EYES.far.cy) / COLONY_EYES.far.ry) ** 2 <
      1;
    // The plate's facets include pink reflections, not just dark red pigment.
    // Keep these in the eye mask while excluding the amber cuticle/rim.
    const eye = (inNear || inFar) && r > 35 && g < r * 0.85 && b >= g * 0.65;
    const target = eye ? (x < 0.79 ? near : far) : body;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const pigment = Math.min(1, (max - min) / 50);
    const light = Math.pow(max / 255, 0.85);
    const highlight = Math.pow(min / 255, 3) * 0.85;
    for (let j = 0; j < 3; j++) {
      const shaded = Math.min(255, target[j] * 1.2 + 12) * light;
      data[i + j] =
        source.data[i + j] * (1 - pigment) +
        (shaded * (1 - highlight) + 255 * highlight) * pigment;
    }
  }
  return { data, width: source.width, height: source.height };
}

function smoothstep(from, to, value) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/** Local abdominal dimorphism; head, eyes, feet and wing hinges stay fixed. */
export function morphColonyBody(source, sex) {
  if (sex !== "male" && sex !== "female") return source;
  const { width, height, data: src } = source;
  const data = new Uint8ClampedArray(src);
  for (let y = Math.floor(height * 0.28); y < height * 0.73; y++) {
    const ny = y / height;
    const vertical =
      smoothstep(0.28, 0.37, ny) * (1 - smoothstep(0.64, 0.73, ny));
    for (let x = Math.floor(width * 0.05); x < width * 0.48; x++) {
      const nx = x / width;
      const weight = vertical * (1 - smoothstep(0.37, 0.48, nx));
      if (!weight) continue;
      const tip = 1 - smoothstep(0.16, 0.36, nx);
      const length = sex === "male" ? 1 - 0.16 * weight : 1;
      const depth = 1 + (sex === "male" ? 0.07 : -0.12) * tip * weight;
      const axis = 0.54 + (0.36 - nx) * 0.22;
      const sx = Math.max(
        0,
        Math.min(width - 1, (0.48 + (nx - 0.48) / length) * width),
      );
      const sy = Math.max(
        0,
        Math.min(height - 1, (axis + (ny - axis) / depth) * height),
      );
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy);
      const fx = sx - x0,
        fy = sy - y0;
      const x1 = Math.min(width - 1, x0 + 1),
        y1 = Math.min(height - 1, y0 + 1);
      const i00 = (y0 * width + x0) * 4,
        i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4,
        i11 = (y1 * width + x1) * 4;
      const a00 = src[i00 + 3] * (1 - fx) * (1 - fy),
        a10 = src[i10 + 3] * fx * (1 - fy);
      const a01 = src[i01 + 3] * (1 - fx) * fy,
        a11 = src[i11 + 3] * fx * fy;
      const dest = (y * width + x) * 4;
      const alpha = a00 + a10 + a01 + a11;
      data[dest + 3] = alpha;
      // Interpolate premultiplied RGB to preserve clean transparent bristles.
      for (let channel = 0; channel < 3; channel++) {
        data[dest + channel] = alpha
          ? (src[i00 + channel] * a00 +
              src[i10 + channel] * a10 +
              src[i01 + channel] * a01 +
              src[i11 + channel] * a11) /
            alpha
          : 0;
      }
    }
  }
  return { data, width, height };
}

function wing(g, art, x, y, angle, scale) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  const shape = art.wingShape || "typical";
  const size = shape === "vestigial" ? 0.34 : shape === "miniature" ? 0.62 : 1;
  g.scale(scale * size, scale * size);
  const outline = new Path2D();
  outline.moveTo(0, 0);
  if (shape === "curly") {
    outline.bezierCurveTo(-71, -9, -219, -53, -239, -129);
    outline.bezierCurveTo(-263, -217, -127, -234, -131, -170);
    outline.bezierCurveTo(-137, -128, -196, -151, -177, -174);
    outline.bezierCurveTo(-115, -160, -49, -47, 0, 0);
  } else if (shape === "vestigial") {
    outline.bezierCurveTo(-60, -10, -195, -38, -239, -111);
    outline.bezierCurveTo(-262, -153, -215, -176, -193, -151);
    outline.bezierCurveTo(-192, -199, -132, -171, -109, -130);
    outline.bezierCurveTo(-58, -93, -28, -35, 0, 0);
  } else {
    outline.bezierCurveTo(-60, -12, -199, -45, -252, -128);
    outline.bezierCurveTo(-302, -209, -192, -222, -107, -136);
    outline.bezierCurveTo(-59, -92, -29, -39, 0, 0);
  }
  outline.closePath();
  const membrane = g.createLinearGradient(-220, -205, -55, 12);
  membrane.addColorStop(0, "rgba(247,222,237,.62)");
  membrane.addColorStop(0.25, "rgba(190,221,241,.38)");
  membrane.addColorStop(0.52, "rgba(249,219,200,.5)");
  membrane.addColorStop(0.76, "rgba(210,193,237,.3)");
  membrane.addColorStop(1, "rgba(255,235,189,.18)");
  g.fillStyle = membrane;
  g.fill(outline);
  g.strokeStyle = "rgba(248,227,195,.84)";
  g.lineWidth = 1.65 / Math.sqrt(size);
  g.stroke(outline);
  g.clip(outline);
  // Longitudinal veins fan into the membrane; crossveins join them locally.
  // Sparse / extra vein alleles change the same network, not a generic grid.
  const veins = [
    [-91, -91, -187, -208, -251, -174],
    [-94, -64, -213, -180, -270, -157],
    [-89, -43, -212, -136, -267, -133],
    [-80, -24, -195, -83, -239, -96],
    [-52, -9, -147, -45, -187, -58],
  ];
  g.lineWidth = 1.2 / Math.sqrt(size);
  g.strokeStyle = "rgba(255,237,207,.76)";
  for (const [n, curve] of veins.entries()) {
    if (art.wingVein === "incomplete" && (n === 1 || n === 3)) continue;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(...curve);
    g.stroke();
  }
  const cross = [
    [-127, -115, -143, -100, -149, -87],
    [-183, -149, -193, -127, -196, -112],
  ];
  if (art.wingVein === "extra")
    cross.push(
      [-84, -65, -95, -52, -102, -40],
      [-213, -163, -228, -144, -232, -126],
    );
  for (const [x1, y1, cx, cy, x2, y2] of art.wingVein === "incomplete"
    ? []
    : cross) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.quadraticCurveTo(cx, cy, x2, y2);
    g.stroke();
  }
  // A fine secondary edge catches light without making the membrane opaque.
  g.beginPath();
  g.moveTo(-14, -13);
  g.bezierCurveTo(-106, -151, -210, -226, -262, -163);
  g.strokeStyle = "rgba(255,246,218,.5)";
  g.lineWidth = 0.7 / Math.sqrt(size);
  g.stroke();
  g.fillStyle = "rgba(58,34,33,.46)";
  if (art.wingMark === "apical") {
    g.beginPath();
    g.ellipse(-249, -159, 44, 49, -0.4, 0, Math.PI * 2);
    g.fill();
  } else if (art.wingMark === "banded") {
    g.save();
    g.rotate(-0.5);
    g.fillRect(-155, -245, 27, 235);
    g.restore();
  } else if (art.wingMark === "pictured") {
    for (const [px, py, r] of [
      [-230, -160, 19],
      [-174, -122, 15],
      [-176, -84, 12],
      [-112, -75, 10],
    ]) {
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

export function drawColonyPortrait(
  g,
  plate,
  art = {},
  resolution = PORTRAIT_SIZE,
) {
  const key = colonyPortraitKey(art);
  let cache = bodyCaches.get(plate);
  if (!cache) {
    cache = new Map();
    bodyCaches.set(plate, cache);
  }
  let body = cache.get(key);
  if (!body) {
    const pixels = tintColonyBody(plate, art);
    body = document.createElement("canvas");
    body.width = plate.width;
    body.height = plate.height;
    const bg = body.getContext("2d");
    bg.putImageData(
      new ImageData(pixels.data, pixels.width, pixels.height),
      0,
      0,
    );
    bg.save();
    bg.scale(plate.width / PORTRAIT_SIZE, plate.height / PORTRAIT_SIZE);
    // Clip abdominal markings to the abdomen silhouette, not the legs or head.
    bg.save();
    bg.globalCompositeOperation = "source-atop";
    bg.beginPath();
    bg.ellipse(194, 340, 116, 77, -0.32, 0, Math.PI * 2);
    bg.clip();
    const pigment = bg.createLinearGradient(0, 265, 0, 414);
    pigment.addColorStop(0, "rgba(27,18,15,.12)");
    pigment.addColorStop(0.35, "rgba(27,18,15,.5)");
    pigment.addColorStop(0.72, "rgba(27,18,15,.43)");
    pigment.addColorStop(1, "rgba(27,18,15,.08)");
    bg.strokeStyle = pigment;
    bg.lineWidth = 9;
    for (let n = 0; n < (Number(art.stripes) || 0); n++) {
      const x = 118 + n * 35;
      bg.beginPath();
      bg.moveTo(x, 253);
      bg.quadraticCurveTo(x + 49, 335, x + 20, 426);
      bg.stroke();
    }
    bg.fillStyle = "rgba(30,19,13,.48)";
    if (art.mark === "bar") {
      bg.beginPath();
      bg.moveTo(189, 290);
      bg.bezierCurveTo(211, 278, 244, 279, 264, 286);
      bg.bezierCurveTo(244, 290, 214, 287, 193, 299);
      bg.closePath();
      bg.fill();
    }
    if (art.mark === "spots") {
      for (const x of [213, 243]) {
        bg.beginPath();
        bg.ellipse(x, 308, 10, 7, 0, 0, Math.PI * 2);
        bg.fill();
      }
    }
    bg.restore();
    bg.restore();
    if (art.sex === "male" || art.sex === "female") {
      const shaped = morphColonyBody(
        bg.getImageData(0, 0, plate.width, plate.height),
        art.sex,
      );
      bg.putImageData(
        new ImageData(shaped.data, shaped.width, shaped.height),
        0,
        0,
      );
    }
    if (cache.size >= (plate.width > PORTRAIT_SIZE ? 8 : 64)) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, body);
  }
  g.clearRect(0, 0, resolution, resolution);
  g.save();
  g.scale(resolution / PORTRAIT_SIZE, resolution / PORTRAIT_SIZE);
  const size = Math.max(0.75, Math.min(1.15, Number(art.scale) || 1)) * 0.9;
  g.translate(320, 335);
  g.scale(size, size);
  g.translate(-320, -320);
  // Anchor to the upper thorax: short wings must project beyond the body too.
  wing(g, art, 325, 251, 0.32, 0.94);
  wing(g, art, 326, 255, -0.22, 1.03);
  g.drawImage(body, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  g.restore();
}

/** Shared raster export for birth cards; the same geometry as card thumbnails. */
export function colonyPortraitCanvas(plate, art, resolution = PORTRAIT_SIZE) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = resolution;
  drawColonyPortrait(canvas.getContext("2d"), plate, art, resolution);
  return canvas;
}
