import { chipFill } from "../brain/flyswarm/phenotype.mjs";
import { CARD_H, CARD_W } from "./birth-card.mjs";
import { drawFlyArt, fitSpan, sizeFactor } from "./fly-sprite.mjs";

const MONO =
  'IBM Plex Mono, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", ui-monospace, monospace';
const SERIF =
  'Cormorant Garamond, "Songti SC", "STSong", "Noto Serif CJK SC", Times, serif';

function hexRgb(hex) {
  const n = Number.parseInt(String(hex || "#f0b90b").replace("#", ""), 16);
  if (!Number.isFinite(n)) return { r: 240, g: 185, b: 11 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** 出生卡上的主角：与图鉴、我的果蝇同一套正面萌系形象。 */
function drawFly(ctx, soul, cx, cy, span) {
  if (!soul?.phenotype?.art) {
    ctx.strokeStyle = "rgba(240, 185, 11, 0.18)";
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  const body = hexRgb(soul.phenotype.art.body);
  const glow = ctx.createRadialGradient(cx, cy + 20, 12, cx, cy, span * 0.72);
  glow.addColorStop(0, `rgba(${body.r},${body.g},${body.b},0.24)`);
  glow.addColorStop(0.44, `rgba(${body.r},${body.g},${body.b},0.07)`);
  glow.addColorStop(1, "rgba(10, 9, 7, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy + 10, span * 0.72, 0, Math.PI * 2);
  ctx.fill();
  drawFlyArt(ctx, soul.phenotype.art, cx, cy, span, {
    flying: false,
    view: "portrait",
    ignoreScale: true,
  });
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

/** 两行带色点的性状：色点就是这一只的实际体色与眼色。 */
function drawTraitRows(ctx, rows, x, y, max) {
  if (!rows?.length) return y;
  const step = 48;
  let top = y;
  for (const row of rows) {
    ctx.fillStyle = row.color || "#8a6a2a";
    ctx.beginPath();
    ctx.arc(x + 11, top + 11, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(240, 234, 217, 0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "#e6dcc4";
    const font = `500 27px ${MONO}`;
    ctx.font = font;
    ctx.fillText(fit(ctx, row.text, font, max - 40), x + 36, top);
    if (row.detail) {
      const label = ctx.measureText(fit(ctx, row.text, font, max - 40)).width;
      ctx.fillStyle = "#7d7565";
      ctx.font = `22px ${MONO}`;
      ctx.fillText(
        fit(ctx, row.detail, ctx.font, max - 60 - label),
        x + 58 + label,
        top + 4,
      );
    }
    top += step;
  }
  return top;
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
    h * 0.38,
    20,
    w * 0.5,
    h * 0.4,
    w * 0.5,
  );
  wash.addColorStop(0, `rgba(${body.r},${body.g},${body.b},0.11)`);
  wash.addColorStop(1, "rgba(10, 9, 7, 0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  const vignette = ctx.createRadialGradient(
    w * 0.5,
    h * 0.46,
    w * 0.24,
    w * 0.5,
    h * 0.5,
    w * 0.74,
  );
  vignette.addColorStop(0, "rgba(10, 9, 7, 0)");
  vignette.addColorStop(1, "rgba(10, 9, 7, 0.44)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  grain(ctx, w, h, card.soul?.seed || card.soul?.tokenId || 1);
  frame(ctx, inset, inset, w - inset * 2, h - inset * 2, 22);

  ctx.textBaseline = "top";
  ctx.fillStyle = "#9c8a56";
  ctx.font = `500 17px ${MONO}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0.16em";
  ctx.textAlign = "left";
  ctx.fillText(
    fit(ctx, card.series || card.header, ctx.font, inner * 0.56),
    pad,
    pad + 6,
  );
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

  // 图鉴编号：左上角四位数铭牌。
  ctx.textAlign = "left";
  ctx.fillStyle = "#c9a44a";
  ctx.font = `500 30px ${MONO}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0.14em";
  ctx.fillText(card.plateIndex || card.tokenMark || "", pad, pad + 52);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";

  // 形象区：页眉/编号之下、名字之上。按外接框反推 span，粗壮体型也不出框。
  const art = card.soul?.phenotype?.art;
  const flyTop = pad + 100;
  const flyBottom = h * 0.575;
  const flySpan =
    fitSpan(inner * 0.9, (flyBottom - flyTop) * 0.98) * sizeFactor(art);
  drawFly(ctx, card.soul, w * 0.5, (flyTop + flyBottom) / 2, flySpan);

  const nameFont = `500 ${Math.round(h * 0.058)}px ${SERIF}`;
  const textTop = h * 0.6;
  ctx.textAlign = "left";
  ctx.fillStyle = "#f0ead9";
  ctx.font = nameFont;
  ctx.fillText(
    fit(ctx, card.plateName || card.childTitle, nameFont, inner),
    pad,
    textTop,
  );

  const afterTraits = drawTraitRows(
    ctx,
    card.traitRows,
    pad,
    textTop + h * 0.078,
    inner,
  );

  let top = afterTraits + 10;
  ctx.textAlign = "left";
  ctx.fillStyle = "#c9a44a";
  ctx.font = `500 24px ${MONO}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0.08em";
  ctx.fillText(
    fit(ctx, card.vitalLine || card.accession, ctx.font, inner),
    pad,
    top,
  );
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = "0px";
  top += 46;

  const lines = [
    [card.accession, "#9c8a56", `21px ${MONO}`],
    [card.formLine || card.traits, "#9c8a56", `20px ${MONO}`],
    [card.finishLine, "#8a8172", `20px ${MONO}`],
    [card.bred ? card.parentLine : "", "#8a8172", `17px ${MONO}`],
  ];
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
  ctx.textAlign = "left";
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
