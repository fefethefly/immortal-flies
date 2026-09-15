// Deterministic art geometry, separate from the 24-node paper neural model.
const TAU = Math.PI * 2;
const fract = (v) => v - Math.floor(v);
export function createFlyCloud() {
  const points = [];
  function ellipsoid(cx, cy, cz, rx, ry, rz, count, material) {
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count;
      const r = Math.sqrt(1 - y * y),
        a = i * 2.399963;
      points.push({
        x: cx + rx * Math.cos(a) * r,
        y: cy + ry * y,
        z: cz + rz * Math.sin(a) * r,
        material,
        seed: fract(i * 0.618034),
      });
    }
  }
  function line(a, b, count, material = "bone") {
    for (let i = 0; i < count; i++) {
      const t = i / count;
      points.push({
        x: a[0] + (b[0] - a[0]) * t,
        y: a[1] + (b[1] - a[1]) * t,
        z: a[2] + (b[2] - a[2]) * t,
        material,
        seed: fract(i * 0.718),
        side: material === "vein" ? Math.sign(a[0]) : undefined,
      });
    }
  }
  ellipsoid(0, 46, 0, 27, 59, 22, 660, "abdomen");
  ellipsoid(0, -20, 7, 30, 34, 25, 480, "bone");
  ellipsoid(0, -67, 5, 25, 21, 19, 300, "bone");
  for (const side of [-1, 1]) {
    ellipsoid(side * 20, -71, 15, 13, 17, 14, 225, "eye");
    // Diptera: one pair of wings, attached at the thorax. Elliptic membranes,
    // a leading edge and radiating veins are all composed of points.
    for (let i = 0; i < 720; i++) {
      const a = i * 2.399963,
        radius = Math.sqrt((i + 0.5) / 720);
      const u = Math.cos(a) * radius * 39,
        v = Math.sin(a) * radius * 87;
      points.push({
        x: side * (63 + u * 0.84 + v * 0.54),
        y: 30 - u * 0.54 + v * 0.84,
        z: 14 + 7 * (1 - radius),
        material: "wing",
        side,
        seed: fract(i * 0.618034),
      });
    }
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * TAU,
        u = Math.cos(a) * 39,
        v = Math.sin(a) * 87;
      points.push({
        x: side * (63 + u * 0.84 + v * 0.54),
        y: 30 - u * 0.54 + v * 0.84,
        z: 14,
        material: "vein",
        side,
        seed: 0.8,
      });
    }
    for (const end of [
      [side * 115, 90, 14],
      [side * 92, 105, 14],
      [side * 57, 96, 14],
      [side * 94, 20, 14],
    ])
      line([side * 18, -34, 15], end, 60, "vein");
    // Six articulated legs, antennae and halteres.
    for (const [start, knee, end] of [
      [-37, -60, -106],
      [-12, 4, 32],
      [8, 63, 119],
    ]) {
      line([side * 20, start, -4], [side * 50, knee, -14], 32);
      line([side * 50, knee, -14], [side * 73, end, -19], 42);
      line([side * 73, end, -19], [side * 84, end + 6, -19], 14);
    }
    line([side * 8, -82, 9], [side * 16, -102, 14], 24);
    line([side * 16, -102, 14], [side * 28, -110, 18], 16);
    ellipsoid(side * 34, 5, -8, 4, 5, 4, 35, "gold");
  }
  return points;
}

export function colonyPosition(index, count) {
  const angle = -Math.PI / 2 + ((index + 0.5) / Math.max(count, 1)) * TAU;
  return {
    x: Math.sin(angle) > 0.92 ? 76 : 50 + Math.cos(angle) * 40,
    y: 49 + Math.sin(angle) * 31,
  };
}
