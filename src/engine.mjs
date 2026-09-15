/** Deterministic, bounded fly-inspired model. Not a measured connectome. */
export const MODEL = "iff-neural-16-v1";
export const NODES = 16;
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export function random32(value) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
export function createFly(seed = 3700127, bornAt = new Date().toISOString()) {
  return {
    model: MODEL,
    id: 1,
    dna: seed >>> 0,
    bornAt,
    brain: {
      rng: seed >>> 0,
      ticks: 0,
      learning: [360, 280, 320],
      potential: Array(16).fill(0),
      energy: 1000,
      spikes: 0,
      incarnation: 1,
      dormant: false,
    },
    achievements: [],
  };
}
export function tick(fly, stimulus = 3) {
  if (fly.brain.dormant || fly.brain.energy === 0) return structuredClone(fly);
  const next = structuredClone(fly),
    b = next.brain,
    oldSpikes = b.spikes;
  b.spikes = 0;
  for (let i = 0; i < 16; i++) {
    b.rng = random32(b.rng);
    const input =
      (b.rng % 23) +
      (i % 3 === stimulus ? 40 : 0) +
      Math.floor(b.learning[i % 3] / 25) +
      ((oldSpikes >> (i + 15) % 16) & 1) * 12;
    let voltage = Math.floor((b.potential[i] * 7) / 8) + input;
    const threshold = 150 + ((next.dna >> i) & 1) * 20;
    if (voltage >= threshold) {
      voltage -= threshold;
      b.spikes |= 1 << i;
    }
    b.potential[i] = voltage;
  }
  b.ticks += 1;
  b.energy -= 1;
  if (b.energy === 0) b.dormant = true;
  return next;
}
export function train(fly, channel) {
  if (![0, 1, 2].includes(channel)) throw new Error("未知的训练信号");
  if (fly.brain.dormant || fly.brain.energy < 32)
    throw new Error("请先唤醒或转生，再进行训练");
  let next = structuredClone(fly);
  next.brain.learning[channel] = Math.min(
    1000,
    next.brain.learning[channel] + 40,
  );
  for (let i = 0; i < 32; i++) next = tick(next, channel);
  return next;
}
export function sleep(fly) {
  const next = structuredClone(fly);
  next.brain.dormant = true;
  return next;
}
export function wake(fly) {
  const next = structuredClone(fly);
  if (next.brain.energy === 0) throw new Error("此生体力已耗尽，请转生继续");
  next.brain.dormant = false;
  return next;
}
export function rebirth(fly) {
  const next = structuredClone(fly);
  next.brain.energy = 1000;
  next.brain.dormant = false;
  next.brain.incarnation += 1;
  return next;
}
export function validateFly(fly) {
  const integer = (x, a, b) => Number.isSafeInteger(x) && x >= a && x <= b;
  if (
    !fly ||
    fly.model !== MODEL ||
    fly.id !== 1 ||
    !integer(fly.dna, 1, 0xffffffff) ||
    typeof fly.bornAt !== "string" ||
    !Number.isFinite(Date.parse(fly.bornAt))
  )
    throw new Error("不支持的果蝇档案");
  const b = fly.brain;
  if (
    !b ||
    !integer(b.rng, 1, 0xffffffff) ||
    !integer(b.ticks, 0, Number.MAX_SAFE_INTEGER - 1024) ||
    !integer(b.energy, 0, 1000) ||
    !integer(b.spikes, 0, 65535) ||
    !integer(b.incarnation, 1, 0xffffffff - 1) ||
    typeof b.dormant !== "boolean"
  )
    throw new Error("档案状态无效");
  if (
    !Array.isArray(b.learning) ||
    b.learning.length !== 3 ||
    !b.learning.every((v) => integer(v, 0, 1000))
  )
    throw new Error("学习参数无效");
  if (
    !Array.isArray(b.potential) ||
    b.potential.length !== 16 ||
    !b.potential.every((v) => integer(v, 0, 400))
  )
    throw new Error("神经状态无效");
  if (
    !Array.isArray(fly.achievements) ||
    fly.achievements.length > 32 ||
    !fly.achievements.every((a) => typeof a === "string" && a.length <= 80)
  )
    throw new Error("成就记录无效");
  if (b.energy === 0 && !b.dormant) throw new Error("休眠状态不一致");
  return structuredClone(fly);
}
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function hashState(value) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(value)),
  );
  return Array.from(new Uint8Array(result), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function checkpoint(fly) {
  const state = validateFly(fly);
  return {
    format: "immortal-checkpoint",
    version: 1,
    savedAt: new Date().toISOString(),
    state,
    sha256: await hashState(state),
  };
}
export function validateCheckpointEnvelope(data) {
  if (
    !data ||
    data.format !== "immortal-checkpoint" ||
    data.version !== 1 ||
    typeof data.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.sha256) ||
    typeof data.savedAt !== "string" ||
    !Number.isFinite(Date.parse(data.savedAt))
  )
    throw new Error("不是有效的 IMMORTAL 记忆档案");
  return {
    format: data.format,
    version: data.version,
    savedAt: data.savedAt,
    state: validateFly(data.state),
    sha256: data.sha256,
  };
}
export async function restoreCheckpoint(data) {
  const { state, sha256 } = validateCheckpointEnvelope(data);
  if ((await hashState(state)) !== sha256)
    throw new Error("档案校验失败：数据已被修改或损坏");
  return state;
}
export async function proveContinuity(fly) {
  const snapshot = await checkpoint(fly);
  let reference = structuredClone(fly),
    restored = await restoreCheckpoint(JSON.parse(JSON.stringify(snapshot)));
  // Use the same defined external input sequence, including waking if needed.
  if (reference.brain.energy < 64) {
    reference = rebirth(reference);
    restored = rebirth(restored);
  } else {
    reference = wake(reference);
    restored = wake(restored);
  }
  for (let i = 0; i < 64; i++) {
    reference = tick(reference, i % 4);
    restored = tick(restored, i % 4);
  }
  const [a, b] = await Promise.all([hashState(reference), hashState(restored)]);
  return {
    equal: a === b,
    originalHash: snapshot.sha256,
    referenceHash: a,
    restoredHash: b,
    steps: 64,
  };
}
export const MAZE = [
  "111111111111111",
  "100000100000001",
  "101110101110101",
  "101000001000101",
  "101011111010101",
  "100010001010001",
  "111010101011101",
  "100000100000001",
  "111111111111111",
];
const neighbors = (x, y) =>
  [
    [x + 1, y],
    [x, y + 1],
    [x - 1, y],
    [x, y - 1],
  ].filter(([a, b]) => MAZE[b]?.[a] === "0");
export function runMaze(fly) {
  if (fly.brain.dormant || fly.brain.energy < 64)
    throw new Error("请先唤醒或转生，再进入迷宫");
  const goal = [13, 7],
    distances = { "13,7": 0 },
    queue = [goal];
  for (let j = 0; j < queue.length; j++) {
    const [x, y] = queue[j];
    for (const [a, b] of neighbors(x, y))
      if (distances[`${a},${b}`] === undefined) {
        distances[`${a},${b}`] = distances[`${x},${y}`] + 1;
        queue.push([a, b]);
      }
  }
  let x = 1,
    y = 1,
    rng = fly.brain.rng,
    path = [[x, y]],
    visits = { "1,1": 1 };
  for (let step = 0; step < 120 && (x !== 13 || y !== 7); step++) {
    const options = neighbors(x, y)
      .map(([a, b]) => {
        rng = random32(rng);
        const exploration =
          ((rng % 100) / 100) * (1.8 - fly.brain.learning[0] / 1000);
        return {
          a,
          b,
          cost:
            distances[`${a},${b}`] * (0.5 + fly.brain.learning[0] / 1000) +
            (visits[`${a},${b}`] || 0) * (1 + fly.brain.learning[2] / 500) +
            exploration,
        };
      })
      .sort((a, b) => a.cost - b.cost);
    x = options[0].a;
    y = options[0].b;
    visits[`${x},${y}`] = (visits[`${x},${y}`] || 0) + 1;
    path.push([x, y]);
  }
  let next = structuredClone(fly);
  for (let i = 0; i < 64; i++) next = tick(next, 0);
  const success = x === 13 && y === 7;
  if (success && !next.achievements.includes("FIRST_FORAGER"))
    next.achievements.push("FIRST_FORAGER");
  return {
    state: next,
    path,
    success,
    steps: path.length - 1,
    score: success ? Math.max(100, 1000 - (path.length - 1) * 10) : 0,
  };
}
