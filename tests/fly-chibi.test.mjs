import test from "node:test";
import assert from "node:assert/strict";
import {
  CHIBI_VIEWS,
  chibiPalette,
  chibiPose,
  flyPigment,
  hexRgb,
  liftBody,
  luma,
  mix,
  normalizeView,
  paintChibi,
  punchHue,
  sparkleSet,
  spriteKey,
} from "../src/life/fly-chibi.mjs";

/** 记录调用的假 2D 上下文：在没有 canvas 的环境里跑通绘制分支。 */
function mockCtx() {
  const calls = [];
  const gradient = () => ({ addColorStop: () => {} });
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => {
        calls.push([prop, args.length]);
      };
    },
    set(target, prop, value) {
      calls.push([`set:${prop}`, value]);
      target[prop] = value;
      return true;
    },
  };
  return {
    calls,
    ctx: new Proxy(
      {
        createRadialGradient: gradient,
        createLinearGradient: gradient,
      },
      handler,
    ),
  };
}

const ART = Object.freeze({
  body: "#7fae66",
  eye: "#c23b2e",
  vein: "#e6e0cf",
  gold: "#f0b90b",
  scale: 1,
  stripes: 2,
  mark: "spots",
});

test("views stay inside the supported set", () => {
  assert.deepEqual(CHIBI_VIEWS, ["portrait", "side", "dorsal"]);
  assert.equal(normalizeView("dorsal"), "dorsal");
  assert.equal(normalizeView("side"), "side");
  assert.equal(normalizeView(undefined), "portrait");
  assert.equal(normalizeView("nonsense"), "portrait");
});

test("palette is derived from the genome colours only", () => {
  const pal = chibiPalette(ART);
  const body = hexRgb(ART.body);
  assert.deepEqual(
    chibiPalette(ART).body,
    pal.body,
    "same art yields the same palette",
  );
  for (const key of Object.keys(pal)) {
    for (const channel of ["r", "g", "b"]) {
      const value = pal[key][channel];
      assert.ok(
        Number.isFinite(value) && value >= 0 && value <= 255,
        `${key}.${channel} in range`,
      );
    }
  }
  assert.notDeepEqual(pal.bodyLight, pal.bodyDeep);
  assert.ok(luma(pal.body) > luma(hexRgb(ART.body)) - 1);
  const wine = chibiPalette({
    body: "#8a3040",
    eye: "#e4d9c4",
    eyeLeft: "#e4d9c4",
    eyeRight: "#6b4a32",
    gold: "#f0b90b",
    vein: "#e6e0cf",
  });
  assert.notDeepEqual(pal.body, wine.body);
  assert.notDeepEqual(pal.gold, wine.gold);
  assert.notDeepEqual(pal.wingIce, wine.wingIce);
  assert.notDeepEqual(pal.wingRose, wine.wingRose);
  const punched = punchHue({ r: 90, g: 140, b: 80 });
  assert.ok(punched.g - punched.r > 140 - 90);
  assert.deepEqual(flyPigment(ART), pal.body);
});

test("dark genotypes are lifted so the face stays readable", () => {
  const dark = hexRgb("#0d0b14");
  const lifted = liftBody(dark);
  assert.ok(luma(lifted) > luma(dark));
  assert.ok(luma(lifted) >= 60);
  const bright = hexRgb("#f2e6c8");
  assert.deepEqual(liftBody(bright), bright);
  const mixed = mix({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5);
  assert.deepEqual(mixed, { r: 128, g: 128, b: 128 });
});

test("card pose is static and flight pose flaps on four phases", () => {
  const still = chibiPose({ view: "portrait", flying: false });
  assert.equal(still.beat, 0);
  assert.equal(still.flying, false);
  const beats = [0, 1, 2, 3].map(
    (phase) => chibiPose({ view: "dorsal", flying: true, phase }).beat,
  );
  assert.equal(new Set(beats).size, 4);
  const tired = chibiPose({ view: "dorsal", flying: true, tired: true });
  assert.equal(tired.flying, false);
  assert.equal(tired.beat, 0);
  assert.ok(tired.wingAlpha < still.wingAlpha);
  const collapsed = chibiPose({ collapsed: true });
  assert.ok(collapsed.wingAlpha < tired.wingAlpha);
  assert.ok(collapsed.bodyAlpha < 1);
  const holo = chibiPose({ view: "dorsal", flying: true, hologram: true });
  assert.equal(holo.hologram, true);
  assert.ok(holo.wingAlpha < still.wingAlpha);
});

test("sparkles are deterministic per genome and per view", () => {
  const a = sparkleSet(ART, "portrait");
  const b = sparkleSet({ ...ART }, "portrait");
  assert.equal(a.length, 5);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, sparkleSet(ART, "dorsal"));
  assert.notDeepEqual(a, sparkleSet({ ...ART, body: "#b06ad0" }, "portrait"));
  for (const star of a) {
    assert.ok(star.x < -16 || star.x > 16, "sparkles sit off the body");
    assert.ok(star.r > 1 && star.r < 4);
  }
});

test("sprite key separates view, phase and condition", () => {
  const base = spriteKey(ART, { view: "dorsal", flying: true, phase: 1 });
  assert.equal(base, spriteKey(ART, { view: "dorsal", flying: true, phase: 1 }));
  assert.notEqual(base, spriteKey(ART, { view: "portrait", flying: true, phase: 1 }));
  assert.notEqual(base, spriteKey(ART, { view: "dorsal", flying: true, phase: 2 }));
  assert.notEqual(base, spriteKey(ART, { view: "dorsal", flying: true, phase: 1, tired: true }));
  assert.notEqual(base, spriteKey(ART, { view: "dorsal", flying: true, phase: 1, hologram: true }));
  assert.notEqual(base, spriteKey({ ...ART, eye: "#e4d9c4" }, { view: "dorsal", flying: true, phase: 1 }));
  assert.notEqual(
    base,
    spriteKey(
      { ...ART, eyeRight: "#e4d9c4" },
      { view: "dorsal", flying: true, phase: 1 },
    ),
  );
});

test("every view paints without missing canvas ops", () => {
  for (const view of CHIBI_VIEWS) {
    for (const pose of [
      { view, flying: false },
      { view, flying: true, phase: 1, hologram: true },
      { view, tired: true },
      { view, collapsed: true },
    ]) {
      const { ctx, calls } = mockCtx();
      paintChibi(ctx, ART, pose);
      assert.ok(calls.length > 40, `${view} draws real geometry`);
      const names = new Set(calls.map(([name]) => name));
      assert.ok(names.has("fill"));
      assert.ok(names.has("stroke"));
      assert.ok(names.has("set:fillStyle"));
    }
  }
});

test("painting is a pure function of genome and pose", () => {
  const run = () => {
    const { ctx, calls } = mockCtx();
    paintChibi(ctx, ART, { view: "portrait", flying: false });
    return JSON.stringify(calls);
  };
  assert.equal(run(), run());
});

test("fit span keeps the whole fly inside a box", async () => {
  const { FLY_BOX, fitSpan, sizeFactor } = await import(
    "../src/life/fly-sprite.mjs"
  );
  for (const [w, h] of [
    [246, 172],
    [600, 220],
    [180, 60],
    [40, 40],
  ]) {
    const span = fitSpan(w, h, { pad: 0.96 });
    const width = (FLY_BOX.halfW * 2 * span) / FLY_BOX.per;
    const reach = Math.max(FLY_BOX.top, FLY_BOX.bottom);
    const above = (FLY_BOX.top * span) / FLY_BOX.per;
    const below = (FLY_BOX.bottom * span) / FLY_BOX.per;
    assert.ok(width <= w + 1e-6, `width ${width} <= ${w}`);
    assert.ok(above <= h / 2 + 1e-6, `top ${above} inside half box ${h / 2}`);
    assert.ok(below <= h / 2 + 1e-6, `bottom ${below} inside half box ${h / 2}`);
    assert.ok((reach * 2 * span) / FLY_BOX.per <= h + 1e-6);
  }
  assert.ok(fitSpan(0, 0) >= 16);
});

test("size locus nudges the portrait without leaving the box", async () => {
  const { sizeFactor } = await import("../src/life/fly-sprite.mjs");
  assert.ok(sizeFactor({ scale: 1.12 }) > sizeFactor({ scale: 1 }));
  assert.ok(sizeFactor({ scale: 1 }) > sizeFactor({ scale: 0.88 }));
  assert.ok(sizeFactor({ scale: 1.12 }) <= 1.12);
  assert.ok(sizeFactor({ scale: 0.88 }) >= 0.88);
  assert.equal(sizeFactor({}), sizeFactor({ scale: 1 }));
});
