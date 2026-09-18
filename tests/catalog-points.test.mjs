import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogHinge,
  colorCatalogPoints,
  flapWeightAt,
  sampleCatalogPoints,
  splitCatalogLayers,
} from "../src/life/catalog-points.mjs";
import { tintCatalogPixels } from "../src/life/catalog-portrait.mjs";

function paint(width, plot) {
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = plot(x / width, y / width);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height: width };
}

test("flap weight stays on the upper-left membrane, not the body or head", () => {
  assert.equal(flapWeightAt(0.586, 0.419), 0);
  assert.ok(flapWeightAt(0.28, 0.22) > 0.7, "far wing membrane flaps");
  assert.ok(flapWeightAt(0.84, 0.47) < 0.08, "near eye stays put");
  assert.ok(flapWeightAt(0.32, 0.62) < 0.08, "abdomen stays put");
  const hinge = catalogHinge();
  assert.ok(Math.abs(hinge[0] - (0.586 - 0.5)) < 0.01);
});

test("sampling skips transparent pixels and keeps source coverage", () => {
  const source = paint(24, (nx, ny) => {
    const on = nx > 0.35 && nx < 0.8 && ny > 0.35 && ny < 0.8;
    return on ? [200, 140, 40, 255] : [0, 0, 0, 0];
  });
  const points = sampleCatalogPoints(source, 80);
  assert.equal(points.count, 80);
  for (let n = 0; n < points.count; n += 1) {
    assert.ok(Math.abs(points.local[n * 2]) < 0.45);
    assert.ok(Math.abs(points.local[n * 2 + 1]) < 0.45);
    assert.ok(points.opacity[n] > 0.5);
  }
});

test("tinted particles keep body and split-eye colours", () => {
  const source = paint(32, (nx, ny) => {
    if (ny > 0.35 && ny < 0.55 && nx > 0.2 && nx < 0.35) return [190, 30, 40, 255];
    if (ny > 0.35 && ny < 0.55 && nx > 0.7 && nx < 0.88) return [190, 30, 40, 255];
    if (nx > 0.2 && nx < 0.88 && ny > 0.28 && ny < 0.8) return [180, 140, 50, 255];
    return [0, 0, 0, 0];
  });
  const base = sampleCatalogPoints(source, 120);
  const tinted = tintCatalogPixels(source, {
    body: "#404040",
    eyeLeft: "#00ff00",
    eyeRight: "#0000ff",
  });
  const colored = colorCatalogPoints(base, tinted);
  assert.equal(colored.count, base.count);
  assert.equal(colored.colors.length, base.count * 3);
  const greens = [];
  const blues = [];
  for (let n = 0; n < colored.count; n += 1) {
    const r = colored.colors[n * 3];
    const g = colored.colors[n * 3 + 1];
    const b = colored.colors[n * 3 + 2];
    if (g > r + 0.05 && g > b) greens.push(n);
    if (b > r + 0.05 && b > g) blues.push(n);
  }
  assert.ok(greens.length > 2);
  assert.ok(blues.length > 2);
});

test("split layers put membrane on wings and eyes on the body", () => {
  const source = paint(40, () => [200, 140, 40, 255]);
  const { body, wings } = splitCatalogLayers(source);
  const at = (nx, ny) => {
    const x = Math.min(39, Math.floor(nx * 40));
    const y = Math.min(39, Math.floor(ny * 40));
    return (y * 40 + x) * 4 + 3;
  };
  assert.ok(wings.data[at(0.28, 0.22)] > 120, "upper-left membrane is a wing");
  assert.ok(body.data[at(0.28, 0.22)] < 40, "membrane is not glued to the body");
  assert.ok(body.data[at(0.84, 0.47)] > 200, "near eye stays on the body");
  assert.equal(wings.data[at(0.84, 0.47)], 0);
  assert.ok(body.data[at(0.32, 0.62)] > 200, "abdomen stays on the body");
});
