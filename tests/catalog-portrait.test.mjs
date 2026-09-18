import test from "node:test";
import assert from "node:assert/strict";
import {
  alphaFromLuma,
  catalogSpriteKey,
  isEyePigment,
  splitEyePixels,
  tintCatalogPixels,
} from "../src/life/catalog-portrait.mjs";
test("sprite keys follow body and split-eye pigments", () => {
  assert.equal(
    catalogSpriteKey({
      body: "#c99b45",
      eyeLeft: "#00ff00",
      eyeRight: "#0000ff",
    }),
    "#c99b45|#00ff00|#0000ff",
  );
  assert.equal(
    catalogSpriteKey({ body: "#aaa", eye: "#b00" }),
    "#aaa|#b00|#b00",
  );
});

function paint(width, height, plot) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [r, g, b] = plot(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

test("ruby facet pixels count as eyes; amber body does not", () => {
  assert.equal(isEyePigment(180, 40, 45), true);
  assert.equal(isEyePigment(126, 6, 6), true);
  assert.equal(isEyePigment(190, 150, 40), false);
  assert.equal(isEyePigment(156, 76, 0), false);
});

test("two red blobs split into far and near eyes and take different pigments", () => {
  const source = paint(24, 10, (x, y) => {
    if (y >= 3 && y <= 6 && x >= 2 && x <= 5) return [190, 30, 40];
    if (y >= 3 && y <= 6 && x >= 16 && x <= 20) return [190, 30, 40];
    return [180, 140, 50];
  });
  const { far, near } = splitEyePixels(source.width, source.data);
  assert.ok(far.length > 4);
  assert.ok(near.length > 4);
  assert.ok(
    Math.max(...far.map((row) => row.x)) <
      Math.min(...near.map((row) => row.x)),
  );
  const tinted = tintCatalogPixels(source, {
    body: "#808080",
    eyeLeft: "#00ff00",
    eyeRight: "#0000ff",
  });
  const farPx = far[0].p * 4;
  const nearPx = near[0].p * 4;
  assert.ok(
    tinted.data[farPx + 2] > tinted.data[farPx],
    "far/anatomical-right eye is bluer",
  );
  assert.ok(
    tinted.data[nearPx + 1] > tinted.data[nearPx],
    "near/anatomical-left eye is greener",
  );
});

test("opaque luma masks become alpha; transparent masks stay as-is", () => {
  const luma = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]),
  };
  const converted = alphaFromLuma(luma);
  assert.equal(converted.data[3], 255);
  assert.equal(converted.data[7], 0);
  const already = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([255, 255, 255, 200, 255, 255, 255, 0]),
  };
  assert.equal(alphaFromLuma(already), already);
});
