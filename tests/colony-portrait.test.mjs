import test from "node:test";
import assert from "node:assert/strict";
import {
  colonyPortraitKey,
  morphColonyBody,
  loadColonyPlate,
  tintColonyBody,
} from "../src/life/colony-portrait.mjs";

function fixture() {
  const data = new Uint8ClampedArray(100 * 100 * 4);
  const set = (x, y, rgba) => data.set(rgba, (y * 100 + x) * 4);
  set(65, 49, [180, 24, 28, 255]);
  set(88, 49, [180, 24, 28, 255]);
  // A red-orange reflection outside the eyes must still be body pigment.
  set(30, 50, [180, 24, 28, 127]);
  set(40, 50, [255, 255, 255, 255]);
  return { data, width: 100, height: 100 };
}
const pixel = (image, x, y) => [
  ...image.data.slice((y * 100 + x) * 4, (y * 100 + x) * 4 + 4),
];

test("body and anatomical eye pigments remain independent without losing alpha or highlights", () => {
  const source = fixture();
  const before = new Uint8ClampedArray(source.data);
  const tinted = tintColonyBody(source, {
    body: "#0000aa",
    eyeLeft: "#00aa00",
    eyeRight: "#aa0000",
  });
  assert.ok(pixel(tinted, 65, 49)[1] > pixel(tinted, 65, 49)[0]);
  assert.ok(pixel(tinted, 88, 49)[0] > pixel(tinted, 88, 49)[1]);
  assert.ok(pixel(tinted, 30, 50)[2] > pixel(tinted, 30, 50)[0]);
  assert.equal(pixel(tinted, 30, 50)[3], 127);
  assert.deepEqual(pixel(tinted, 40, 50), [255, 255, 255, 255]);
  assert.deepEqual(pixel(tinted, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(source.data, before);
});

test("lightness alleles stay distinct and rendering is deterministic", () => {
  const source = fixture();
  const dark = tintColonyBody(source, { body: "#332211" });
  const light = tintColonyBody(source, { body: "#cc8844" });
  assert.ok(pixel(light, 30, 50)[0] > pixel(dark, 30, 50)[0]);
  assert.deepEqual(tintColonyBody(source, { body: "#332211" }).data, dark.data);
});

test("pink eye facets follow their eye pigment rather than the body", () => {
  const source = fixture();
  // Pink facet regressions, positioned inside the v4 anatomical eye masks.
  source.data.set([248, 176, 185, 253], (40 * 100 + 67) * 4);
  source.data.set([252, 118, 144, 252], (44 * 100 + 89) * 4);
  const art = { eyeLeft: "#00aa00", eyeRight: "#aa0000" };
  const blue = tintColonyBody(source, { ...art, body: "#0000aa" });
  const gold = tintColonyBody(source, { ...art, body: "#ccaa33" });
  assert.deepEqual(pixel(blue, 67, 40), pixel(gold, 67, 40));
  assert.deepEqual(pixel(blue, 89, 44), pixel(gold, 89, 44));
  assert.ok(pixel(blue, 67, 40)[1] > pixel(blue, 67, 40)[0]);
  assert.ok(pixel(blue, 89, 44)[0] > pixel(blue, 89, 44)[1]);
  assert.equal(pixel(blue, 67, 40)[3], 253);
});

test("morphology cannot collide in the portrait cache", () => {
  const base = { body: "#aa8822", eye: "#bb2222" };
  for (const variant of [
    { stripes: 3 },
    { mark: "spots" },
    { wingShape: "curly" },
    { wingMark: "pictured" },
    { wingVein: "extra" },
    { scale: 0.88 },
    { eyeRight: "#eeeeee" },
    { sex: "male" },
  ]) {
    assert.notEqual(
      colonyPortraitKey(base),
      colonyPortraitKey({ ...base, ...variant }),
    );
  }
});

test("abdominal dimorphism preserves eyes, feet, color and the source pixels", () => {
  const source = fixture();
  for (let y = 43; y <= 60; y++) {
    for (let x = 12; x <= 38; x++) {
      source.data.set([170, 90, 30, 255], (y * 100 + x) * 4);
    }
  }
  source.data.set([220, 120, 50, 128], (80 * 100 + 20) * 4);
  const original = new Uint8ClampedArray(source.data);
  const male = morphColonyBody(source, "male");
  const female = morphColonyBody(source, "female");
  const posterior = (image) => {
    for (let x = 0; x < 45; x++) if (pixel(image, x, 52)[3] > 100) return x;
  };
  assert.ok(posterior(male) > posterior(female), "male abdomen is shorter");
  assert.notDeepEqual(male.data, female.data);
  for (const shaped of [male, female]) {
    assert.deepEqual(pixel(shaped, 65, 49), pixel(source, 65, 49));
    assert.deepEqual(pixel(shaped, 88, 49), pixel(source, 88, 49));
    assert.deepEqual(pixel(shaped, 20, 80), pixel(source, 20, 80));
    assert.deepEqual(pixel(shaped, 25, 52).slice(0, 3), [170, 90, 30]);
  }
  assert.deepEqual(source.data, original);
  assert.deepEqual(morphColonyBody(source, "male").data, male.data);
  assert.equal(morphColonyBody(source, undefined), source);
});

test("plate loading retries failures and caches each export resolution separately", async (t) => {
  const oldImage = globalThis.Image;
  const oldDocument = globalThis.document;
  t.after(() => {
    if (oldImage === undefined) delete globalThis.Image;
    else globalThis.Image = oldImage;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  });
  let attempts = 0;
  globalThis.Image = class {
    set src(value) {
      const fail = ++attempts === 1;
      queueMicrotask(() => (fail ? this.onerror() : this.onload()));
    }
  };
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData: (x, y, width, height) => ({
          width,
          height,
          data: new Uint8ClampedArray(width * height * 4),
        }),
      }),
    }),
  };
  await assert.rejects(loadColonyPlate(), /unavailable/);
  const [a, b] = await Promise.all([loadColonyPlate(), loadColonyPlate()]);
  assert.equal(a, b);
  assert.equal(a.width, 640);
  const large = await loadColonyPlate(1280);
  assert.equal(large.width, 1280);
  assert.notEqual(a, large);
  assert.equal(attempts, 3);
});
