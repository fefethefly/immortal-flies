import * as THREE from "three";

function canvas(size) {
  const node = document.createElement("canvas");
  node.width = size;
  node.height = size;
  const ctx = node.getContext("2d");
  return { node, ctx, size };
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function toTexture(node, { repeat = 1, color = true, wrap = true } = {}) {
  const tex = new THREE.CanvasTexture(node);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function heightToNormal(heightNode, strength = 3.2) {
  const { size } = { size: heightNode.width };
  const src = heightNode.getContext("2d").getImageData(0, 0, size, size).data;
  const { node, ctx } = canvas(size);
  const out = ctx.createImageData(size, size);
  const at = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = (dx * inv * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return toTexture(node, { color: false, repeat: 1 });
}

export function makeWoodMaps(repeat = 4) {
  const { node, ctx, size } = canvas(1024);
  const pixels = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    const wave = Math.sin(y * 0.035) * 18 + Math.sin(y * 0.11) * 6;
    for (let x = 0; x < size; x += 1) {
      const n = hash(x * 0.08, y * 0.2) * 0.18 + hash(x * 0.4, y * 0.7) * 0.08;
      const ring = Math.sin((x + wave) * 0.045 + n * 8);
      const tone = 62 + ring * 34 + n * 36;
      const i = (y * size + x) * 4;
      pixels.data[i] = tone + 14;
      pixels.data[i + 1] = tone - 12;
      pixels.data[i + 2] = tone - 28;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#1a0e06";
  ctx.beginPath();
  ctx.ellipse(220, 300, 50, 28, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(760, 640, 40, 22, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  const map = toTexture(node, { repeat });
  const normal = heightToNormal(node, 2.4);
  normal.repeat.set(repeat, repeat);
  return { map, normal };
}

export function makePlaster() {
  const { node, ctx, size } = canvas(512);
  ctx.fillStyle = "#d8c8b0";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i += 1) {
    const n = hash(i, i * 3);
    ctx.fillStyle = `rgba(90,70,50,${0.04 + n * 0.08})`;
    ctx.fillRect((i * 47) % size, (i * 91) % size, 2, 2);
  }
  return toTexture(node, { repeat: 3 });
}

export function makeFruitMaps(kind) {
  const palettes = {
    peach: ["#c45a32", "#e8a060", "#8a3218"],
    amber: ["#c48a28", "#efc46a", "#6a4210"],
    rot: ["#5a3a22", "#7a6232", "#2a1c10"],
    apple: ["#9a2218", "#d45a3a", "#4a1008"],
    citrus: ["#e0a014", "#f6d45a", "#8a5a10"],
    grape: ["#4a2048", "#7a3a6a", "#1a0c18"],
    melon: ["#3a6a22", "#c45a38", "#f0d8a0"],
  };
  const [deep, lite, pit] = palettes[kind] || palettes.peach;
  const { node, ctx, size } = canvas(512);
  const g = ctx.createRadialGradient(200, 180, 20, 256, 256, 280);
  g.addColorStop(0, lite);
  g.addColorStop(0.35, deep);
  g.addColorStop(0.78, deep);
  g.addColorStop(1, pit);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  if (kind === "melon") {
    for (let i = 0; i < 9; i += 1) {
      ctx.fillStyle = i % 2 ? "rgba(30,70,20,0.35)" : "rgba(240,220,160,0.12)";
      ctx.fillRect(i * 58, 0, 28, size);
    }
  }
  for (let i = 0; i < 220; i += 1) {
    ctx.fillStyle = `rgba(20,10,6,${kind === "rot" ? 0.22 : 0.08})`;
    ctx.beginPath();
    ctx.arc(hash(i, 2) * size, hash(i, 5) * size, 1 + hash(i, 9) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === "rot") {
    ctx.fillStyle = "rgba(70,90,30,0.35)";
    ctx.beginPath();
    ctx.arc(340, 300, 48, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,220,160,0.16)";
  ctx.beginPath();
  ctx.ellipse(170, 150, 70, 36, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(20,8,4,0.28)";
  ctx.beginPath();
  ctx.ellipse(360, 340, 40, 22, 0.4, 0, Math.PI * 2);
  ctx.fill();
  const map = toTexture(node, { wrap: true, repeat: 1 });
  const normal = heightToNormal(node, kind === "citrus" ? 4.2 : 2.6);
  return { map, normal };
}

export function makeLeather() {
  const { node, ctx, size } = canvas(256);
  ctx.fillStyle = "#6a2a1c";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 800; i += 1) {
    ctx.fillStyle = `rgba(20,8,6,${0.05 + hash(i, 1) * 0.1})`;
    ctx.fillRect(hash(i, 2) * size, hash(i, 3) * size, 3, 3);
  }
  return toTexture(node, { repeat: 2 });
}

export function makePaper() {
  const { node, ctx, size } = canvas(256);
  ctx.fillStyle = "#e6d6b4";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(40,30,20,0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i += 1) {
    ctx.beginPath();
    ctx.moveTo(16, 24 + i * 22);
    ctx.lineTo(240, 20 + i * 22);
    ctx.stroke();
  }
  return toTexture(node, { wrap: false });
}
