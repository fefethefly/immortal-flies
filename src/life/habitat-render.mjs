import { hungerOf, projectHabitat } from "./habitat-sim.mjs";
import { labelOf } from "./names.mjs";
import { flySprite } from "./fly-sprite.mjs";

const TAU = Math.PI * 2;

function hexRgb(hex) {
  const n = Number.parseInt(String(hex || "#f0b90b").replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba({ r, g, b }, a) {
  return `rgba(${r},${g},${b},${a})`;
}

function liftRgb(hex) {
  const c = hexRgb(hex);
  const max = Math.max(c.r, c.g, c.b, 1);
  const lift = max < 140 ? 140 / max : 1;
  return {
    r: Math.min(255, Math.round(c.r * lift + 36)),
    g: Math.min(255, Math.round(c.g * lift + 24)),
    b: Math.min(255, Math.round(c.b * lift + 14)),
  };
}

function drawFloor(ctx, w, h, camera) {
  ctx.fillStyle = "#090806";
  ctx.fillRect(0, 0, w, h);

  const to = (x, y) => projectHabitat(x, y, camera, w, h);
  const step = camera.zoom < 0.7 ? 0.2 : 0.1;
  ctx.strokeStyle = "rgba(28, 24, 16, 0.55)";
  ctx.lineWidth = 1;
  for (let t = 0; t <= 1.001; t += step) {
    const a = to(t, 0);
    const b = to(t, 1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const c = to(0, t);
    const d = to(1, t);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }
  const nw = to(0, 0);
  const se = to(1, 1);
  ctx.strokeStyle = "rgba(240, 185, 11, 0.22)";
  ctx.strokeRect(nw.x, nw.y, se.x - nw.x, se.y - nw.y);
}

export function drawHabitatWorld(
  ctx,
  w,
  h,
  { world, souls, selected, wallet, camera, reduced, hoverId, locale },
) {
  drawFloor(ctx, w, h, camera);

  const toX = (x) => projectHabitat(x, 0.5, camera, w, h).x;
  const toY = (y) => projectHabitat(0.5, y, camera, w, h).y;

  ctx.fillStyle = "rgba(232, 214, 170, 0.14)";
  for (const mote of world.dust || []) {
    const twinkle =
      0.45 + 0.55 * Math.sin((world.tick || 0) * 0.04 + mote.x * 20);
    ctx.globalAlpha = reduced ? 0.08 : 0.05 + twinkle * 0.08;
    ctx.beginPath();
    ctx.arc(toX(mote.x), toY(mote.y), mote.r * camera.zoom * 1.8, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const gust of world.gusts || []) {
    const x = toX(gust.x);
    const y = toY(gust.y);
    ctx.fillStyle = `rgba(196, 90, 74, ${0.12 * gust.life})`;
    ctx.beginPath();
    ctx.arc(x, y, 36 * gust.life * camera.zoom, 0, TAU);
    ctx.fill();
  }

  for (const crumb of world.food) {
    const x = toX(crumb.x);
    const y = toY(crumb.y);
    ctx.fillStyle = "rgba(232, 196, 110, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(232, 196, 110, 0.2)";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.stroke();
  }

  const drawn = world.bodies
    .map((body) => ({
      body,
      soul: souls.find((item) => item.tokenId === body.tokenId),
    }))
    .filter((row) => row.soul)
    .sort((a, b) => a.body.y - b.body.y);

  for (const { body, soul } of drawn) {
    drawFly(ctx, toX(body.x), toY(body.y), body, soul, {
      selected: selected?.tokenId === body.tokenId,
      hover: hoverId === body.tokenId,
      mine: Boolean(
        wallet && body.owner.toLowerCase() === wallet.toLowerCase(),
      ),
      zoom: camera.zoom,
      locale,
    });
  }
}

export function drawFly(
  ctx,
  x,
  y,
  body,
  soul,
  { selected, hover, mine, zoom, locale } = {},
) {
  const art = soul.phenotype.art;
  const hunger = body.hunger || hungerOf(body.energy);
  const collapsed = hunger === "collapsed";
  const tired = hunger === "faint" || collapsed;
  const airborne =
    body.mode === "fly" || body.mode === "hover" || body.mode === "takeoff";
  const flying = airborne && !tired;
  const phase = flying
    ? Math.floor(((body.flap || 0) + 1) * 2) % 4
    : Math.floor(Math.abs(body.x + body.y) * 40) % 2;
  const size =
    90 *
    (art.scale || 1) *
    (collapsed ? 0.8 : tired ? 0.9 : 1) *
    (0.86 + 0.22 * Math.min(1.15, Math.max(0.7, zoom || 1)));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(8, 6, 4, 0.22)";
  ctx.beginPath();
  ctx.ellipse(0, 11, 11, 3.2, 0, 0, TAU);
  ctx.fill();
  if (mine) {
    const pulse = 0.5 + 0.5 * Math.sin((body.flap || 0) * 3 + body.tokenId);
    ctx.globalAlpha = 0.16 + pulse * 0.12;
    ctx.fillStyle = rgba(liftRgb(art.body), 1);
    ctx.beginPath();
    ctx.arc(0, 0, 18 + pulse * 3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = "#f0d27a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, TAU);
    ctx.stroke();
  }
  if (collapsed) {
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "rgba(196, 90, 74, 0.85)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (selected || hover) {
    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = selected
      ? "rgba(240,234,217,0.82)"
      : "rgba(240,185,11,0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = collapsed ? 0.7 : 1;
  ctx.rotate(body.heading);
  const tile = flySprite(art, { flying, phase, tired, collapsed });
  ctx.drawImage(tile, -size / 2, -size / 2, size, size);
  ctx.restore();

  const showLabel = selected || hover || mine || (zoom || 1) >= 1.25;
  if (showLabel) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = collapsed ? "#c45a4a" : "#e6dcc4";
    ctx.font = "11px IBM Plex Mono, monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `#${soul.tokenId} ${labelOf(soul, locale || "en")}`,
      x + 16,
      y - 2,
    );
  }
  if (selected || hover) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#2b2515";
    ctx.fillRect(x + 16, y + 8, 40, 3);
    ctx.fillStyle =
      hunger === "full" || hunger === "sated"
        ? "#f0b90b"
        : hunger === "hungry"
          ? "#c98f1e"
          : "#c45a4a";
    ctx.fillRect(x + 16, y + 8, 40 * Math.min(1, body.energy / 1000), 3);
  }
}
