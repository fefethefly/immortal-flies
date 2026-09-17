import { createFlyCloud } from "./observatory-art.mjs";

// All positions are art geometry, not connectome anatomy or additional neurons.
export function createHeroParticles(compact = false) {
  const rows = [];
  const cloud = createFlyCloud();
  const material = { bone: 0, abdomen: 0, wing: 1, eye: 2, vein: 3, gold: 3 };
  const add = (x, y, z, kind, seed, group) =>
    rows.push(x, y, z, kind, seed, group);
  const stride = compact ? 2 : 1;
  for (let group = 0; group < 7; group++) {
    const step = group ? stride * 5 : stride;
    for (let i = 0; i < cloud.length; i += step) {
      const p = cloud[i];
      add(
        p.x / 145,
        -p.y / 145,
        p.z / 145,
        material[p.material] ?? 0,
        p.seed,
        group,
      );
    }
  }
  // A schematic 24-node neural core mirrors the local model's node count only.
  const nodes = Array.from({ length: 24 }, (_, i) => {
    const a = i * 2.399963;
    return [
      Math.cos(a) * (0.13 + (i % 3) * 0.07),
      0.38 + Math.sin(a) * 0.2,
      Math.sin(i * 1.7) * 0.16 + 0.1,
    ];
  });
  nodes.forEach((p, i) => {
    add(...p, 5, i / 24, 0);
    for (const target of [(i + 1) % 24, (i + 7) % 24]) {
      const q = nodes[target];
      for (let k = 0; k < 18; k++) {
        const t = k / 18;
        add(...p.map((v, axis) => v + (q[axis] - v) * t), 4, t + i / 24, 0);
      }
    }
  });
  // Paths carry an illustrative signal out to six independently drawn bodies.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.25;
    const end = [Math.cos(a) * 1.72, Math.sin(a) * 0.87, -0.12];
    for (let k = 0; k < 180; k++) {
      const t = k / 180;
      add(
        end[0] * t,
        end[1] * t + Math.sin(t * Math.PI) * 0.13,
        end[2],
        4,
        t,
        -1,
      );
    }
  }
  for (let i = 0; i < (compact ? 450 : 1000); i++) {
    const a = i * 2.399963;
    const r = Math.sqrt((i + 0.5) / 1000) * 2.7;
    add(
      Math.cos(a) * r,
      Math.sin(a) * r * 0.65,
      -0.5,
      6,
      (i * 0.618034) % 1,
      -1,
    );
  }
  return new Float32Array(rows);
}

export function localActivity(spikes = 0) {
  let bits = (spikes >>> 0) & 0xffffff,
    count = 0;
  while (bits) {
    bits &= bits - 1;
    count++;
  }
  return count;
}
