import { CARD_H, CARD_W } from "./birth-card.mjs";
import {
  catalogSpriteAt,
  loadCatalogFly,
} from "./catalog-portrait.mjs";

const MONO =
  'IBM Plex Mono, "Apple Symbols", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-monospace, monospace';
const SERIF =
  '"Noto Serif SC", "Songti SC", "STSong", "Cormorant Garamond", Georgia, serif';

function hexRgb(hex) {
  const n = Number.parseInt(String(hex || "#f0b90b").replace("#", ""), 16);
  if (!Number.isFinite(n)) return { r: 240, g: 185, b: 11 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgb(c) {
  return `rgb(${c.r},${c.g},${c.b})`;
}

function mixRgb(a, b, t) {
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  };
}

function rounded(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, rad);
    return;
  }
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function fit(ctx, text, font, max) {
  ctx.font = font;
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}...`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}...`;
}

function grain(ctx, w, h, seed) {
  let x = (Number(seed) || 1) >>> 0 || 1;
  ctx.fillStyle = "rgba(240, 234, 217, 0.028)";
  for (let i = 0; i < 1800; i += 1) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const px = (x >>> 0) % w;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const py = (x >>> 0) % h;
    ctx.fillRect(px, py, 1, 1);
  }
}

function frameTicks(ctx, x, y, w, h, tick) {
  ctx.strokeStyle = "rgba(214, 179, 106, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const corners = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.moveTo(cx + sx * tick, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * tick);
  }
  ctx.stroke();
}

function drawDot(ctx, color, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  const hi = ctx.createRadialGradient(
    cx - r * 0.32,
    cy - r * 0.38,
    1,
    cx,
    cy,
    r,
  );
  hi.addColorStop(0, "rgba(255,255,255,0.62)");
  hi.addColorStop(0.42, "rgba(255,255,255,0)");
  hi.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = hi;
  ctx.fill();
  ctx.strokeStyle = "rgba(240, 234, 217, 0.22)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawTraitPair(ctx, rows, x, y, w) {
  if (!rows?.length) return y;
  const col = w / Math.max(rows.length, 1);
  const r = 11;
  rows.forEach((row, i) => {
    const left = x + i * col;
    const split = Boolean(row.color2);
    const cx = left + r;
    const cy = y + r + 2;
    if (split) {
      drawDot(ctx, row.color || "#8a6a2a", cx, cy, r);
      drawDot(ctx, row.color2, cx + r * 1.35, cy, r);
    } else {
      drawDot(ctx, row.color || "#8a6a2a", cx, cy, r);
    }
    const textX = left + (split ? r * 3.2 : r * 2) + 12;
    const max = col - (textX - left) - 18;
    ctx.textAlign = "left";
    ctx.fillStyle = "#cdc3ae";
    const font = `500 26px ${MONO}`;
    ctx.font = font;
    ctx.fillText(fit(ctx, row.text, font, max), textX, y + 4);
  });
  return y + 44;
}

function drawRarity(ctx, text, xRight, y) {
  if (!text) return;
  const font = `500 22px ${MONO}`;
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const pw = tw + 28;
  const ph = 36;
  const x = xRight - pw;
  rounded(ctx, x, y, pw, ph, ph / 2);
  ctx.strokeStyle = "rgba(240, 185, 11, 0.42)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#e8c877";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + pw / 2, y + ph / 2 + 1);
  ctx.textBaseline = "top";
}

/** Colony 同款上色插画：3/4 正面立绘，贴进收藏卡画井。 */
function drawCatalog(ctx, soul, x, y, w, h) {
  rounded(ctx, x, y, w, h, 18);
  ctx.save();
  ctx.clip();
  const body = hexRgb(soul?.phenotype?.art?.body);
  ctx.fillStyle = "#050403";
  ctx.fillRect(x, y, w, h);
  const wash = ctx.createRadialGradient(
    x + w * 0.5,
    y + h * 0.58,
    12,
    x + w * 0.5,
    y + h * 0.55,
    Math.max(w, h) * 0.55,
  );
  wash.addColorStop(0, `rgba(${body.r},${body.g},${body.b},0.18)`);
  wash.addColorStop(0.55, "rgba(240, 234, 217, 0.05)");
  wash.addColorStop(1, "rgba(5, 4, 3, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);
  const sprite = catalogSpriteAt(soul?.phenotype?.art || {}, Math.round(h));
  if (sprite) {
    const size = Math.min(w, h) * 0.9;
    const dx = x + (w - size) / 2;
    const dy = y + (h - size) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.shadowColor = "rgba(227, 185, 96, 0.22)";
    ctx.shadowBlur = 22;
    ctx.drawImage(sprite, dx, dy, size, size);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
  rounded(ctx, x, y, w, h, 18);
  ctx.strokeStyle = "rgba(180, 148, 84, 0.32)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export function drawBirthCard(ctx, card, w = CARD_W, h = CARD_H) {
  const inset = 28;
  const pad = 52;
  const inner = w - pad * 2;
  const textH = card.bred && card.mixLine ? 340 : 300;
  const body = hexRgb(card.soul?.phenotype?.art?.body);
  const cream = { r: 255, g: 240, b: 216 };
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  rounded(ctx, 0, 0, w, h, 22);
  ctx.clip();
  ctx.fillStyle = "#0a0a08";
  ctx.fillRect(0, 0, w, h);
  const plate = ctx.createLinearGradient(0, 0, w * 0.2, h);
  plate.addColorStop(0, "#17130a");
  plate.addColorStop(0.78, "#0a0a08");
  ctx.fillStyle = plate;
  ctx.fillRect(0, 0, w, h);
  const wash = ctx.createRadialGradient(
    w * 0.5,
    h * 0.26,
    20,
    w * 0.5,
    h * 0.22,
    w * 0.62,
  );
  wash.addColorStop(0, `rgba(${body.r},${body.g},${body.b},0.16)`);
  wash.addColorStop(1, "rgba(10, 10, 8, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  grain(ctx, w, h, card.soul?.seed || card.soul?.tokenId || 1);

  ctx.strokeStyle = "rgba(154, 122, 63, 0.42)";
  ctx.lineWidth = 2;
  rounded(ctx, 1, 1, w - 2, h - 2, 20);
  ctx.stroke();
  ctx.strokeStyle = "rgba(245, 216, 148, 0.08)";
  ctx.lineWidth = 1;
  rounded(ctx, 3, 3, w - 6, h - 6, 18);
  ctx.stroke();
  frameTicks(ctx, inset, inset, w - inset * 2, h - inset * 2, 18);

  ctx.textBaseline = "top";
  ctx.fillStyle = "#bba271";
  ctx.font = `500 16px ${MONO}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0.28em";
  ctx.textAlign = "left";
  ctx.fillText(
    fit(ctx, card.series || card.header, ctx.font, inner * 0.7),
    pad,
    pad + 2,
  );
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";

  ctx.fillStyle = "#cfb67f";
  ctx.font = `500 28px ${MONO}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0.08em";
  ctx.fillText(card.plateIndex || card.tokenMark || "", pad, pad + 36);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";
  drawRarity(ctx, card.rarityLine, w - pad, pad + 32);

  const wellY = pad + 88;
  const wellH = h - pad - textH - wellY;
  drawCatalog(ctx, card.soul, pad, wellY, inner, Math.max(320, wellH));

  const nameY = wellY + Math.max(320, wellH) + 18;
  const nameFont = `600 ${Math.round(h * 0.048)}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.fillStyle = rgb(mixRgb(body, cream, 0.62));
  ctx.font = nameFont;
  ctx.fillText(
    fit(ctx, card.plateName || card.childTitle, nameFont, inner * 0.92),
    w * 0.5,
    nameY,
  );

  const afterTraits = drawTraitPair(
    ctx,
    card.traitRows,
    pad + Math.max(0, (inner - Math.min(inner, 820)) / 2),
    nameY + Math.round(h * 0.058),
    Math.min(inner, 820),
  );

  const look = [card.formLine, card.finishLine].filter(Boolean).join(" · ");
  let top = afterTraits + 10;
  ctx.textAlign = "center";
  if (look) {
    ctx.fillStyle = "#8a8172";
    ctx.font = `20px ${MONO}`;
    ctx.fillText(fit(ctx, look, ctx.font, inner), w * 0.5, top);
    top += 34;
  }

  const gen = (card.vitalLine || "").split("·")[0].trim();
  const alive = card.locale === "zh" ? "存活" : "alive";
  const hatch = card.bred ? "" : card.locale === "zh" ? "孵化" : "hatched";
  const vitalParts = [
    [gen, "#bba87d"],
    [" · ", "#bba87d"],
    [alive, "#91bd84"],
  ];
  if (hatch) vitalParts.push([" · ", "#bba87d"], [hatch, "#bba87d"]);
  ctx.font = `500 22px ${MONO}`;
  const vitalW = vitalParts.reduce(
    (sum, [text]) => sum + ctx.measureText(text).width,
    0,
  );
  let vitalX = w * 0.5 - vitalW / 2;
  ctx.textAlign = "left";
  for (const [text, color] of vitalParts) {
    ctx.fillStyle = color;
    ctx.fillText(text, vitalX, top);
    vitalX += ctx.measureText(text).width;
  }
  top += 34;

  if (card.bred) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#9c8a56";
    ctx.font = `500 20px ${MONO}`;
    ctx.fillText(
      fit(ctx, card.parentLine || card.accession || "", ctx.font, inner),
      w * 0.5,
      top,
    );
    top += 30;
    if (card.mixLine) {
      ctx.fillStyle = "#8a8172";
      ctx.font = `18px ${MONO}`;
      ctx.fillText(fit(ctx, card.mixLine, ctx.font, inner), w * 0.5, top);
    }
  }

  const barY = h - pad - 22;
  ctx.fillStyle = "#6f6758";
  ctx.font = `16px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText(
    fit(ctx, card.footer || "", ctx.font, inner),
    w * 0.5,
    barY,
  );
  ctx.restore();
}

export async function renderBirthPng(card, canvas) {
  const node =
    canvas ||
    (typeof document !== "undefined" ? document.createElement("canvas") : null);
  if (!node) throw new Error("canvas");
  node.width = CARD_W;
  node.height = CARD_H;
  const ctx = node.getContext("2d");
  if (typeof document !== "undefined") {
    await Promise.all([
      document.fonts
        ? Promise.all([
            document.fonts.load(`600 76px ${SERIF}`),
            document.fonts.load(`13px ${MONO}`),
            document.fonts.ready,
          ]).catch(() => {})
        : Promise.resolve(),
      loadCatalogFly().catch(() => {}),
    ]);
  }
  drawBirthCard(ctx, card, CARD_W, CARD_H);
  return node;
}

function blobFromDataUrl(canvas) {
  const data = canvas.toDataURL("image/png");
  const raw = atob(data.split(",")[1] || "");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

export function canvasToBlob(canvas) {
  return Promise.resolve(blobFromDataUrl(canvas));
}
