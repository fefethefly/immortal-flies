import { chipFill } from "../brain/flyswarm/phenotype.mjs";
import { projectFlyCloud } from "./fly-cloud.mjs";
import { CARD_H, CARD_W } from "./birth-card.mjs";

const MONO =
  'IBM Plex Mono, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-monospace, monospace';
const SERIF =
  'Cormorant Garamond, "Songti SC", "STSong", "Noto Serif CJK SC", Times, serif';

/** Head −Y, up +Z, side ±X. Side-oblique, head to the right. */
function projectPlate(x, y, z) {
  return {
    x: -y + x * 0.16,
    y: -z * 0.7 + x * 0.46,
    z: x * 0.82 + z * 0.28,
  };
}

function stampPlateCloud(ctx, pts, px) {
  for (const p of pts) {
    const depth = 0.5 + (p.z + 90) / 220;
    let a = depth * p.shade;
    if (p.material === "wing") a *= 0.62;
    if (p.material === "vein") a *= 0.9;
    if (p.material === "eye") a = Math.min(0.98, a + 0.3);
    const r =
      (p.material === "eye"
        ? 2.4
        : p.material === "wing"
          ? 1.15
          : p.material === "abdomen" || p.material === "bone"
            ? 2.05
            : 1.65) * px;
    ctx.fillStyle = `rgba(${p.rgb.r},${p.rgb.g},${p.rgb.b},${Math.min(0.95, a)})`;
    ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
  }
}

function hexRgb(hex) {
  const n = Number.parseInt(String(hex || "#f0b90b").replace("#", ""), 16);
  if (!Number.isFinite(n)) return { r: 240, g: 185, b: 11 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function drawFly(ctx, soul, cx, cy, span) {
  if (!soul?.phenotype?.art) {
    ctx.strokeStyle = "rgba(240, 185, 11, 0.18)";
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const body = hexRgb(soul.phenotype.art.body);
  const glow = ctx.createRadialGradient(cx, cy + 10, 8, cx, cy, span * 0.62);
  glow.addColorStop(0, `rgba(${body.r},${body.g},${body.b},0.2)`);
  glow.addColorStop(0.42, `rgba(${body.r},${body.g},${body.b},0.05)`);
  glow.addColorStop(1, "rgba(10, 9, 7, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy + 6, span * 0.62, 0, Math.PI * 2);
  ctx.fill();

  const pts = projectFlyCloud(soul.phenotype.art, {
    flap: 0.08,
    sweep: 0.04,
    project: projectPlate,
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const k = span / Math.max(bw, bh * 1.15);
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  for (const p of pts) {
    p.x = cx + (p.x - mx) * k;
    p.y = cy - (p.y - my) * k;
  }
  stampPlateCloud(ctx, pts, Math.max(1.15, Math.min(2.15, k * 0.62)));
}

function fit(ctx, text, font, max) {
  ctx.font = font;
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function grain(ctx, w, h, seed) {
  let x = (Number(seed) || 1) >>> 0 || 1;
  ctx.fillStyle = "rgba(240, 234, 217, 0.028)";
  for (let i = 0; i < 2400; i += 1) {
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

function frame(ctx, x, y, w, h, tick) {
  ctx.strokeStyle = "rgba(240, 185, 11, 0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.strokeStyle = "rgba(240, 185, 11, 0.55)";
  ctx.lineWidth = 1.25;
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

function drawChips(ctx, phenotype, x, y, w, h) {
  const chips = phenotype?.chips;
  if (!chips?.length) {
    ctx.fillStyle = "#1a160e";
    ctx.fillRect(x, y, w, h);
    return;
  }
  const n = chips.length;
  const gap = 1;
  const cw = (w - gap * (n - 1)) / n;
  chips.forEach((chip, i) => {
    ctx.fillStyle = chipFill(chip, phenotype);
    ctx.fillRect(x + i * (cw + gap), y, Math.max(1, cw), h);
  });
}

export function drawBirthCard(ctx, card, w = CARD_W, h = CARD_H) {
  const inset = Math.round(Math.min(w, h) * 0.04);
  const pad = inset + 36;
  const inner = w - pad * 2;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0907";
  ctx.fillRect(0, 0, w, h);

  const body = hexRgb(card.soul?.phenotype?.art?.body);
  const wash = ctx.createRadialGradient(
    w * 0.5,
    h * 0.4,
    20,
    w * 0.5,
    h * 0.42,
    w * 0.48,
  );
  wash.addColorStop(0, `rgba(${body.r},${body.g},${body.b},0.1)`);
  wash.addColorStop(1, "rgba(10, 9, 7, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(
    w * 0.5,
    h * 0.48,
    w * 0.22,
    w * 0.5,
    h * 0.5,
    w * 0.72,
  );
  vignette.addColorStop(0, "rgba(10, 9, 7, 0)");
  vignette.addColorStop(1, "rgba(10, 9, 7, 0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  grain(ctx, w, h, card.soul?.seed || card.soul?.tokenId || 1);
  frame(ctx, inset, inset, w - inset * 2, h - inset * 2, 22);

  ctx.textBaseline = "top";
  ctx.fillStyle = "#9c8a56";
  ctx.font = `500 17px ${MONO}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0.16em";
  ctx.textAlign = "left";
  ctx.fillText(fit(ctx, card.series || card.header, ctx.font, inner * 0.56), pad, pad + 6);
  ctx.textAlign = "right";
  ctx.fillText(
    fit(
      ctx,
      [card.tokenMark, card.badge].filter(Boolean).join(" · "),
      ctx.font,
      inner * 0.42,
    ),
    w - pad,
    pad + 6,
  );
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";

  const scale = card.soul?.phenotype?.art?.scale || 1;
  drawFly(ctx, card.soul, w * 0.5, h * 0.4, Math.min(w, h) * 0.46 * scale);

  const nameFont = `500 ${Math.round(h * 0.058)}px ${SERIF}`;
  const textTop = h * 0.705;
  ctx.textAlign = "left";
  ctx.fillStyle = "#f0ead9";
  ctx.font = nameFont;
  ctx.fillText(fit(ctx, card.plateName || card.childTitle, nameFont, inner), pad, textTop);

  const lines = [
    [card.accession, "#c9a44a", `21px ${MONO}`],
    [card.formLine || card.traits, "#9c8a56", `20px ${MONO}`],
    [card.finishLine, "#8a8172", `20px ${MONO}`],
    [card.bred ? card.parentLine : "", "#8a8172", `17px ${MONO}`],
  ];
  let top = textTop + h * 0.072;
  for (const [text, color, font] of lines) {
    if (!text) continue;
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.fillText(fit(ctx, text, font, inner), pad, top);
    top += 34;
  }

  const barY = h - pad - 42;
  drawChips(ctx, card.soul?.phenotype, pad, barY, inner, 7);
  ctx.fillStyle = "#6f6758";
  ctx.font = `14px ${MONO}`;
  ctx.fillText(
    fit(ctx, card.footer || card.mixLine, ctx.font, inner),
    pad,
    barY + 16,
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
  if (typeof document !== "undefined" && document.fonts) {
    await Promise.all([
      document.fonts.load(`500 76px ${SERIF}`),
      document.fonts.load(`13px ${MONO}`),
      document.fonts.ready,
    ]).catch(() => {});
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
