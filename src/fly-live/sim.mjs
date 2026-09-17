export const ACTS = ["REST", "FORAGE", "AVOID", "EXPLORE"];
export const MOTORS = [
  "WALK",
  "SETTLE",
  "GROOM",
  "FEED",
  "DRINK",
  "SEARCH",
  "REST",
  "TAKEOFF",
  "FLY",
  "LAND",
  "AVOID",
];
export const WORLD = { width: 5600, height: 4000, margin: 140 };
export const GROUNDED = new Set(["WALK", "SETTLE", "GROOM", "FEED", "DRINK", "SEARCH", "REST"]);
export const MAPS = {
  kitchen: { id: "kitchen", title: "厨房", hint: "飞向发光窗口可以出门" },
  garden: { id: "garden", title: "后院", hint: "窗口回家，小路去市集" },
  market: { id: "market", title: "市集", hint: "沿路飞回去就是后院" },
};

const TAU = Math.PI * 2;
const FRUIT_KINDS = ["peach", "amber", "rot", "apple", "citrus", "grape", "melon"];

function wrap(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

function hypot2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function nearest(list, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const item of list) {
    const d = hypot2(x, y, item.x, item.y);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return { item: best, dist: Math.sqrt(bestD) };
}

export function fruitScore(x, y, fruit) {
  const dx = (x - fruit.x) / fruit.rx;
  const dy = (y - fruit.y) / fruit.ry;
  return dx * dx + dy * dy;
}

function separateFruits(fruits) {
  for (let pass = 0; pass < 5; pass += 1) {
    for (let i = 0; i < fruits.length; i += 1) {
      for (let j = i + 1; j < fruits.length; j += 1) {
        const a = fruits[i];
        const b = fruits[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = (a.rx + b.rx) * 0.8;
        const d = Math.hypot(dx, dy);
        if (d < 1) {
          b.x += 14;
          continue;
        }
        if (d >= min) continue;
        const push = (min - d) * 0.52;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
  }
}

export function surfaceAt(x, y, fruits) {
  let hit = null;
  let best = Infinity;
  for (const fruit of fruits) {
    const score = fruitScore(x, y, fruit);
    if (score < best) {
      best = score;
      hit = fruit;
    }
  }
  if (!hit || best > 1) return { fruit: null, z: 4, score: best };
  const dome = Math.max(0, 1 - best);
  return { fruit: hit, z: 5 + dome * hit.rx * 0.22, score: best };
}

function turnToward(heading, desired, rate) {
  return heading + wrap(desired - heading) * rate;
}

function rand(state) {
  state.rng = (Math.imul(state.rng || 1, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

function holdFor(motor, state) {
  const n = 40 + rand(state) * 90;
  if (motor === "GROOM") return n * 1.8;
  if (motor === "REST") return n * 2.2;
  if (motor === "FEED" || motor === "DRINK") return n * 1.4;
  if (motor === "SETTLE") return 18 + rand(state) * 22;
  if (motor === "TAKEOFF") return 16 + rand(state) * 10;
  if (motor === "LAND") return 36 + rand(state) * 24;
  if (motor === "AVOID") return n * 0.4;
  if (motor === "WALK" || motor === "SEARCH") return n * 1.35;
  return n;
}

function clampWorld(x, y) {
  return {
    x: Math.min(WORLD.width - WORLD.margin, Math.max(WORLD.margin, x)),
    y: Math.min(WORLD.height - WORLD.margin, Math.max(WORLD.margin, y)),
  };
}

function keepOnFruit(fly, fruits) {
  const ground = surfaceAt(fly.x, fly.y, fruits);
  if (!ground.fruit || ground.score <= 0.93) return ground;
  const a = Math.atan2(fly.y - ground.fruit.y, fly.x - ground.fruit.x);
  fly.x = ground.fruit.x + Math.cos(a) * ground.fruit.rx * 0.9;
  fly.y = ground.fruit.y + Math.sin(a) * ground.fruit.ry * 0.9;
  return surfaceAt(fly.x, fly.y, fruits);
}

function threatIsUrgent(state) {
  if (state.forced === "REST") return false;
  const threat = nearest(state.threats, state.fly.x, state.fly.y);
  if (!threat.item) return false;
  const settling = GROUNDED.has(state.fly.motor) && state.fly.motor !== "SEARCH";
  const radius = threat.item.r * (settling ? 0.32 : 0.9);
  return threat.dist < radius;
}

function pickMotor(state) {
  const fly = state.fly;
  const food = nearest(state.food, fly.x, fly.y);
  const drop = nearest(state.drops, fly.x, fly.y);
  const roll = rand(state);

  if (state.forced === "AVOID" || threatIsUrgent(state)) return "AVOID";
  if (fly.airborne) {
    if (state.forced === "REST") return "LAND";
    if (state.forced === "FORAGE" && food.dist < 240) return "LAND";
    if (state.forced === "EXPLORE") return "FLY";
    if (roll < 0.55) return "LAND";
    return "FLY";
  }
  if (state.forced === "FORAGE") {
    if (food.item && food.dist < 22) return "FEED";
    if (drop.item && drop.dist < 16) return "DRINK";
    return "WALK";
  }
  if (state.forced === "REST") return roll < 0.62 ? "GROOM" : "REST";
  if (state.forced === "EXPLORE") return roll < 0.38 ? "TAKEOFF" : roll < 0.78 ? "WALK" : "SEARCH";
  if (food.item && food.dist < 20 && roll < 0.42) return "FEED";
  if (drop.item && drop.dist < 14 && roll < 0.18) return "DRINK";
  if (roll < 0.32) return "WALK";
  if (roll < 0.46) return "SEARCH";
  if (roll < 0.7) return "GROOM";
  if (roll < 0.86) return "REST";
  if (roll < 0.93) return "TAKEOFF";
  return "FEED";
}

function beginMotor(state, motor) {
  const fly = state.fly;
  fly.motor = motor;
  fly.hold = holdFor(motor, state);
  fly.saccade = 0;
  fly.saccadeTurn = 0;
  if (motor === "TAKEOFF" || motor === "FLY" || motor === "AVOID") fly.airborne = true;
  if (GROUNDED.has(motor)) fly.airborne = false;
}

function scatterAround(state, x, y, spreadX, spreadY) {
  return {
    x: x + (rand(state) - 0.5) * spreadX,
    y: y + (rand(state) - 0.5) * spreadY,
  };
}

function applyMapContent(state, content) {
  state.fruits = content.fruits;
  state.food = content.food;
  state.threats = content.threats;
  state.stains = content.stains;
  state.props = content.props;
  state.juices = content.juices;
  state.drops = content.drops;
  state.lights = content.lights;
  state.rings = content.rings;
  state.portals = content.portals;
}

export function enterMap(state, mapId, spawn) {
  if (!MAPS[mapId]) return state;
  state.mapId = mapId;
  state.mapEpoch = (state.mapEpoch || 0) + 1;
  state.travel = 1;
  state.gateLock = 70;
  state.rng = ((state.seed + mapId.length * 131 + mapId.charCodeAt(0) * 17) >>> 0) || 1;
  applyMapContent(state, makeMap(state, mapId));
  const home = state.fruits[0];
  const dest = spawn || { x: home.x - 18, y: home.y + 8, heading: state.fly.heading };
  state.fly.x = dest.x;
  state.fly.y = dest.y;
  state.fly.heading = dest.heading ?? state.fly.heading;
  state.fly.z = 52;
  state.fly.airborne = true;
  beginMotor(state, "FLY");
  return state;
}

function makeMap(state, mapId) {
  if (mapId === "garden") return makeGarden(state);
  if (mapId === "market") return makeMarket(state);
  return makeKitchen(state);
}

function emptyBags() {
  return { fruits: [], food: [], threats: [], stains: [], props: [], juices: [], drops: [], lights: [], rings: [], portals: [] };
}

function makeKitchen(state) {
  const fruits = [];
  const food = [];
  const threats = [];
  const stains = [];
  const props = [];
  const juices = [];
  const drops = [];
  const lights = [];
  const rings = [];
  let id = 0;

  const addProp = (kind, x, y, extra = {}) => {
    props.push({
      kind,
      x,
      y,
      rot: extra.rot ?? (rand(state) - 0.5) * 0.8,
      scale: extra.scale ?? 0.8 + rand(state) * 0.7,
    });
  };

  const placeFruit = (x, y, scale = 1, forcedKind) => {
    const kind = forcedKind || FRUIT_KINDS[Math.floor(rand(state) * FRUIT_KINDS.length)];
    const fat = kind === "grape" ? 0.42 : kind === "melon" ? 1.15 : kind === "citrus" ? 0.78 : 1;
    const rx = (88 + rand(state) * 96) * scale * fat;
    const ry = rx * (kind === "grape" ? 0.82 : 0.58 + rand(state) * 0.16);
    const fruit = { id: id++, x, y, rx, ry, kind };
    fruits.push(fruit);
    const crumbs = 3 + Math.floor(rand(state) * 5);
    for (let c = 0; c < crumbs; c += 1) {
      const a = rand(state) * TAU;
      food.push({
        x: x + Math.cos(a) * rx * (0.15 + rand(state) * 0.55),
        y: y + Math.sin(a) * ry * (0.15 + rand(state) * 0.55),
        life: 1,
      });
    }
    if (rand(state) < 0.72) {
      juices.push({
        x: x + (rand(state) - 0.5) * rx * 0.4,
        y: y + ry * 0.55,
        tx: x + (rand(state) - 0.5) * 220,
        ty: y + ry * 0.7 + 70 + rand(state) * 160,
      });
    }
    return fruit;
  };

  const placeIsland = (cx, cy, hero = false) => {
    const tight = hero ? 0.62 : 1;
    lights.push({ x: cx, y: cy - 30, rx: 420 / tight, ry: 240 / tight, a: hero ? 0.1 : 0.07 });
    addProp("cloth", cx + 20, cy + 90, { rot: -0.08, scale: hero ? 1.7 : 1.35 });
    addProp("board", cx - 130, cy + 20, { rot: -0.1, scale: hero ? 1.45 : 1.15 });
    addProp("plate", cx + 120, cy - 10, { rot: 0.06, scale: hero ? 1.25 : 1.05 });
    addProp("napkin", cx + 180, cy + 70, { rot: 0.35, scale: 1 });
    addProp("paper", cx + 40, cy + 130, { rot: 0.1, scale: 1.05 });
    const pile = hero ? 11 : 6 + Math.floor(rand(state) * 3);
    const mix = ["peach", "apple", "citrus", "grape", "rot", "melon", "amber"];
    for (let i = 0; i < pile; i += 1) {
      const p = scatterAround(state, cx, cy, hero ? 210 : 240, hero ? 150 : 170);
      placeFruit(p.x, p.y, (hero ? 0.5 : 0.68) + rand(state) * 0.32, mix[i % mix.length]);
    }
    placeFruit(cx - 90, cy + 16, 0.58, "citrus");
    placeFruit(cx + 80, cy - 24, 0.56, "apple");
    placeFruit(cx + 16, cy + 52, 0.4, "grape");
    addProp("banana", cx + 70, cy + 48, { rot: -0.95, scale: 1.15 });
    addProp("lemon", cx - 55, cy + 28, { rot: rand(state), scale: 1 });
    addProp("grapes", cx + 18, cy - 48, { rot: 0.15, scale: 1.2 });
    addProp("cheese", cx + 145, cy + 18, { rot: 0.25, scale: 0.95 });
    addProp("core", cx - 95, cy + 52, { rot: rand(state), scale: 0.9 });
    addProp("cup", cx - 175, cy - 8, { rot: 0, scale: 1.05 });
    addProp("bottle", cx + 200, cy - 50, { rot: 0.04, scale: 1 });
    addProp("glass", cx - 150, cy + 70, { rot: 0.06, scale: 1 });
    addProp("fork", cx + 95, cy + 88, { rot: 1.05, scale: 0.95 });
    addProp("spoon", cx + 125, cy + 98, { rot: 0.85, scale: 0.9 });
    addProp("knife", cx - 100, cy + 78, { rot: -0.5, scale: 1 });
    rings.push({ x: cx - 175, y: cy, r: 34 + rand(state) * 12 });
    rings.push({ x: cx + 120, y: cy + 6, r: 58 + rand(state) * 14 });
    for (let i = 0; i < (hero ? 14 : 8); i += 1) {
      const p = scatterAround(state, cx, cy, 280, 200);
      stains.push({ x: p.x, y: p.y, r: 16 + rand(state) * 48, rot: rand(state) * TAU });
    }
    for (let i = 0; i < (hero ? 36 : 16); i += 1) {
      const p = scatterAround(state, cx, cy, 260, 190);
      drops.push({ x: p.x, y: p.y, r: 2 + rand(state) * 4 });
    }
    for (let i = 0; i < (hero ? 22 : 12); i += 1) {
      const kinds = ["leaf", "peel", "pit", "seed", "shard", "cork", "mold"];
      const p = scatterAround(state, cx, cy, 280, 200);
      addProp(kinds[Math.floor(rand(state) * kinds.length)], p.x, p.y, {
        rot: rand(state) * TAU,
        scale: 0.5 + rand(state) * 0.9,
      });
    }
  };

  const islands = [
    [980, 920],
    [2480, 1080],
    [4020, 880],
    [1320, 2280],
    [2860, 2460],
    [4380, 2320],
    [2100, 3400],
    [3600, 3380],
  ];
  islands.forEach(([x, y], index) => placeIsland(x, y, index === 0));

  for (let i = 0; i < 12; i += 1) {
    placeFruit(420 + rand(state) * (WORLD.width - 840), 360 + rand(state) * (WORLD.height - 720), 0.65 + rand(state) * 0.5);
  }

  for (let i = 0; i < 40; i += 1) {
    const kinds = ["leaf", "peel", "pit", "seed", "shard", "cork", "mold"];
    addProp(kinds[Math.floor(rand(state) * kinds.length)], 180 + rand(state) * (WORLD.width - 360), 180 + rand(state) * (WORLD.height - 360), {
      rot: rand(state) * TAU,
      scale: 0.5 + rand(state) * 0.9,
    });
  }

  threats.push({ x: 1180, y: 1080, r: 46 });
  threats.push({ x: 2680, y: 2620, r: 52 });
  threats.push({ x: 4220, y: 980, r: 48 });
  lights.push({ x: WORLD.width * 0.5, y: 420, rx: 1600, ry: 420, a: 0.05 });
  const portals = [
    { id: "window", to: "garden", x: 760, y: 430, r: 280, spawn: { x: 2860, y: 3040, heading: -1.15 } },
  ];

  separateFruits(fruits);
  return { fruits, food, threats, stains, props, juices, drops, lights, rings, portals };
}

function makeGarden(state) {
  const bags = emptyBags();
  const { fruits, food, threats, stains, props, juices, drops, lights, rings, portals } = bags;
  let id = 0;
  const addProp = (kind, x, y, extra = {}) => {
    props.push({ kind, x, y, rot: extra.rot ?? rand(state) * TAU, scale: extra.scale ?? 0.8 + rand(state) * 0.8 });
  };
  const placeFruit = (x, y, scale = 1, forcedKind) => {
    const kind = forcedKind || FRUIT_KINDS[Math.floor(rand(state) * FRUIT_KINDS.length)];
    const rx = (70 + rand(state) * 80) * scale;
    const ry = rx * (0.6 + rand(state) * 0.14);
    const fruit = { id: id++, x, y, rx, ry, kind };
    fruits.push(fruit);
    for (let c = 0; c < 3; c += 1) {
      const a = rand(state) * TAU;
      food.push({ x: x + Math.cos(a) * rx * 0.4, y: y + Math.sin(a) * ry * 0.4, life: 1 });
    }
    return fruit;
  };
  const patches = [
    [980, 900],
    [2400, 1100],
    [4000, 860],
    [1400, 2200],
    [2860, 2400],
    [4300, 2280],
    [2100, 3300],
    [3600, 3200],
  ];
  for (const [cx, cy] of patches) {
    lights.push({ x: cx, y: cy, rx: 380, ry: 240, a: 0.06 });
    addProp("tree", cx - 80, cy - 40, { scale: 1.3 });
    addProp("bush", cx + 90, cy + 30, { scale: 1.1 });
    addProp("pot", cx + 20, cy + 70, { scale: 0.9 });
    for (let i = 0; i < 6; i += 1) {
      const p = scatterAround(state, cx, cy, 220, 160);
      placeFruit(p.x, p.y, 0.55 + rand(state) * 0.35);
    }
    for (let i = 0; i < 10; i += 1) {
      const p = scatterAround(state, cx, cy, 260, 180);
      addProp("leaf", p.x, p.y, { rot: rand(state) * TAU, scale: 0.7 + rand(state) * 0.6 });
    }
    for (let i = 0; i < 8; i += 1) {
      const p = scatterAround(state, cx, cy, 240, 170);
      drops.push({ x: p.x, y: p.y, r: 2 + rand(state) * 4 });
    }
  }
  addProp("compost", 1680, 1680, { scale: 1.4 });
  threats.push({ x: 1680, y: 1680, r: 50 });
  portals.push({ id: "house", to: "kitchen", x: 2860, y: 3480, r: 260, spawn: { x: 820, y: 560, heading: 1.1 } });
  portals.push({ id: "path", to: "market", x: 4580, y: 720, r: 280, spawn: { x: 920, y: 3180, heading: 0.15 } });
  separateFruits(fruits);
  return bags;
}

function makeMarket(state) {
  const bags = emptyBags();
  const { fruits, food, threats, stains, props, juices, drops, lights, rings, portals } = bags;
  let id = 0;
  const addProp = (kind, x, y, extra = {}) => {
    props.push({ kind, x, y, rot: extra.rot ?? (rand(state) - 0.5) * 0.4, scale: extra.scale ?? 0.9 + rand(state) * 0.5 });
  };
  const placeFruit = (x, y, scale = 1, forcedKind) => {
    const kind = forcedKind || FRUIT_KINDS[Math.floor(rand(state) * FRUIT_KINDS.length)];
    const rx = (78 + rand(state) * 88) * scale;
    const ry = rx * (0.58 + rand(state) * 0.14);
    const fruit = { id: id++, x, y, rx, ry, kind };
    fruits.push(fruit);
    for (let c = 0; c < 4; c += 1) {
      const a = rand(state) * TAU;
      food.push({ x: x + Math.cos(a) * rx * 0.35, y: y + Math.sin(a) * ry * 0.35, life: 1 });
    }
    if (rand(state) < 0.5) {
      juices.push({ x, y: y + ry * 0.4, tx: x + (rand(state) - 0.5) * 160, ty: y + 90 });
    }
    return fruit;
  };
  const stalls = [
    [1100, 1000],
    [2500, 960],
    [4000, 1080],
    [1400, 2300],
    [2900, 2360],
    [4300, 2280],
    [2000, 3300],
    [3600, 3280],
  ];
  for (const [cx, cy] of stalls) {
    lights.push({ x: cx, y: cy, rx: 360, ry: 220, a: 0.08 });
    addProp("crate", cx - 70, cy + 20, { scale: 1.2 });
    addProp("crate", cx + 80, cy - 10, { scale: 1 });
    addProp("awning", cx, cy - 40, { scale: 1.3 });
    const mix = ["peach", "apple", "citrus", "grape", "melon", "amber"];
    for (let i = 0; i < 7; i += 1) {
      const p = scatterAround(state, cx, cy, 180, 130);
      placeFruit(p.x, p.y, 0.5 + rand(state) * 0.3, mix[i % mix.length]);
    }
    for (let i = 0; i < 6; i += 1) {
      const p = scatterAround(state, cx, cy, 220, 160);
      stains.push({ x: p.x, y: p.y, r: 18 + rand(state) * 40, rot: rand(state) * TAU });
    }
  }
  threats.push({ x: 2500, y: 960, r: 44 });
  portals.push({ id: "road", to: "garden", x: 820, y: 3380, r: 280, spawn: { x: 4380, y: 900, heading: 3.0 } });
  separateFruits(fruits);
  return bags;
}

export function createLiveSim(seed = 7) {
  const state = { seed, rng: (seed >>> 0) || 1 };
  const orchard = makeKitchen(state);
  const home = orchard.fruits[0];
  const pose = surfaceAt(home.x - 18, home.y + 8, orchard.fruits);
  return {
    ...state,
    tick: 0,
    paused: false,
    forced: null,
    drive: null,
    view: "chase",
    mapId: "kitchen",
    mapEpoch: 1,
    travel: 0,
    gateLock: 0,
    fruits: orchard.fruits,
    food: orchard.food,
    threats: orchard.threats,
    stains: orchard.stains,
    props: orchard.props,
    juices: orchard.juices,
    drops: orchard.drops,
    lights: orchard.lights,
    rings: orchard.rings,
    portals: orchard.portals,
    fly: {
      x: home.x - 18,
      y: home.y + 8,
      z: pose.z,
      heading: 0.35,
      vx: 0,
      vy: 0,
      flap: 0,
      gait: 0,
      groom: 0,
      act: "REST",
      motor: "GROOM",
      hold: 90,
      airborne: false,
      saccade: 0,
      saccadeTurn: 0,
      perch: home.id,
    },
  };
}

export function setLivePaused(state, paused) {
  state.paused = Boolean(paused);
  return state;
}

export function setLiveView(state, view) {
  state.view = view === "pilot" ? "pilot" : "chase";
  return state;
}

export function setLiveAct(state, act) {
  if (!ACTS.includes(act)) return state;
  state.forced = act;
  state.fly.act = act;
  if (act === "AVOID") beginMotor(state, "AVOID");
  else if (act === "REST") beginMotor(state, state.fly.airborne ? "LAND" : "GROOM");
  else if (act === "FORAGE") {
    const food = nearest(state.food, state.fly.x, state.fly.y);
    if (state.fly.airborne || food.dist > 90) beginMotor(state, state.fly.airborne ? "FLY" : "TAKEOFF");
    else beginMotor(state, "WALK");
  } else beginMotor(state, state.fly.airborne ? "FLY" : "TAKEOFF");
  return state;
}

export function clearLiveAct(state) {
  state.forced = null;
  return state;
}

/** Later: Life Core writes { act } or finer turn/thrust here. Game only reads it. */
export function applyFlyDrive(state, drive) {
  state.drive = drive || null;
  if (drive?.act && ACTS.includes(drive.act)) {
    state.fly.act = drive.act;
    setLiveAct(state, drive.act);
  }
  return state;
}

export function dropLiveFood(state, x, y) {
  const point = clampWorld(x, y);
  state.food.push({ ...point, life: 1 });
  if (state.food.length > 64) state.food.shift();
  return state;
}

export function stepLiveSim(state, dt = 1) {
  const step = Math.min(2.5, Math.max(0, dt));
  if (step <= 0 || state.paused) return state;
  state.tick += step;
  const fly = state.fly;
  fly.hold -= step;
  if (fly.hold <= 0 && !state.drive?.act) {
    if (fly.motor === "LAND" && fly.airborne) beginMotor(state, "LAND");
    else if (fly.motor === "SETTLE") beginMotor(state, "GROOM");
    else beginMotor(state, pickMotor(state));
  }

  const food = nearest(state.food, fly.x, fly.y);
  const threat = nearest(state.threats, fly.x, fly.y);
  const drop = nearest(state.drops, fly.x, fly.y);
  let ground = surfaceAt(fly.x, fly.y, state.fruits);
  let desired = fly.heading;
  let speed = 0;
  let targetZ = ground.z;
  let flapRate = 0.1;
  let turnRate = 0.08;

  if (fly.motor === "FLY") {
    const gate = nearest(state.portals || [], fly.x, fly.y);
    if (state.forced === "FORAGE" && food.item) desired = Math.atan2(food.item.y - fly.y, food.item.x - fly.x);
    else if ((state.forced === "EXPLORE" || !state.forced) && gate.item && gate.dist < 1600) {
      desired = Math.atan2(gate.item.y - fly.y, gate.item.x - fly.x);
    } else if (nearest(state.fruits, fly.x, fly.y).item) {
      const next = nearest(state.fruits, fly.x, fly.y).item;
      desired = Math.atan2(next.y - fly.y, next.x - fly.x) + Math.sin(state.tick * 0.03) * 0.35;
    }
    speed = 2.6;
    targetZ = 48 + Math.sin(state.tick * 0.05) * 6;
    flapRate = 1;
    fly.airborne = true;
  } else if (fly.motor === "TAKEOFF") {
    desired = fly.heading + (rand(state) - 0.5) * 0.2;
    speed = 1.4 + Math.max(0, 18 - fly.hold) * 0.1;
    targetZ = 42;
    flapRate = 1.25;
    fly.airborne = true;
    if (fly.z > 30) beginMotor(state, "FLY");
  } else if (fly.motor === "LAND") {
    const pad = nearest(state.fruits, fly.x, fly.y).item;
    if (pad) desired = Math.atan2(pad.y - fly.y, pad.x - fly.x);
    speed = 1.15;
    targetZ = ground.fruit ? ground.z : 14;
    flapRate = 0.42;
    const onPad = Boolean(ground.fruit) || (pad && fruitScore(fly.x, fly.y, pad) < 1.08);
    if (fly.z <= targetZ + 7 && onPad) {
      fly.airborne = false;
      fly.z = ground.fruit ? ground.z : 8;
      beginMotor(state, "SETTLE");
    } else {
      fly.airborne = true;
    }
  } else if (fly.motor === "AVOID") {
    if (threat.item) desired = Math.atan2(fly.y - threat.item.y, fly.x - threat.item.x);
    speed = 4.1;
    targetZ = 52;
    flapRate = 1.25;
    turnRate = 0.22;
    fly.airborne = true;
  } else if (fly.motor === "WALK" || fly.motor === "SEARCH" || fly.motor === "SETTLE") {
    fly.airborne = false;
    ground = keepOnFruit(fly, state.fruits);
    if (fly.saccade > 0) {
      fly.saccade -= step;
      desired = fly.heading + fly.saccadeTurn;
      speed = 0.05;
    } else {
      if (fly.motor === "WALK" && state.forced === "FORAGE" && food.item) {
        desired = Math.atan2(food.item.y - fly.y, food.item.x - fly.x);
      } else if (fly.motor === "SEARCH" && food.item) {
        desired = Math.atan2(food.item.y - fly.y, food.item.x - fly.x) + Math.sin(state.tick * 0.18) * 1.1;
      } else if (ground.fruit) {
        const rim = Math.atan2(fly.y - ground.fruit.y, fly.x - ground.fruit.x) + (fly.motor === "SETTLE" ? 1.05 : 0.75);
        desired = ground.score > 0.55 ? rim : fly.heading + Math.sin(state.tick * 0.045 + fly.gait) * 0.22;
      } else {
        const next = nearest(state.fruits, fly.x, fly.y).item;
        if (next) desired = Math.atan2(next.y - fly.y, next.x - fly.x);
      }
      speed = fly.motor === "SETTLE" ? 0.42 : fly.motor === "SEARCH" ? 0.55 : 0.48;
      if (rand(state) < 0.034) {
        fly.saccade = 5 + rand(state) * 3;
        fly.saccadeTurn = (rand(state) - 0.5) * 0.55;
      }
    }
    targetZ = ground.z;
    flapRate = 0.05;
    turnRate = 0.22;
    if (state.forced === "FORAGE" && food.dist < 18) beginMotor(state, "FEED");
  } else if (fly.motor === "FEED") {
    fly.airborne = false;
    ground = keepOnFruit(fly, state.fruits);
    if (food.item) desired = Math.atan2(food.item.y - fly.y, food.item.x - fly.x);
    speed = food.dist > 14 ? 0.28 : 0.015;
    targetZ = ground.z;
    flapRate = 0.04;
    if (food.item && food.dist < 16) food.item.life = 0.35 + 0.4 * Math.sin(state.tick * 0.22);
  } else if (fly.motor === "DRINK") {
    fly.airborne = false;
    if (drop.item) desired = Math.atan2(drop.item.y - fly.y, drop.item.x - fly.x);
    speed = drop.dist > 10 ? 0.22 : 0.01;
    targetZ = ground.z;
    flapRate = 0.03;
  } else if (fly.motor === "GROOM") {
    fly.airborne = false;
    ground = keepOnFruit(fly, state.fruits);
    speed = 0.012;
    targetZ = ground.z;
    flapRate = 0.03;
    fly.groom += step;
    desired = fly.heading + Math.sin(fly.groom * 0.28) * 0.03;
  } else {
    fly.airborne = false;
    ground = keepOnFruit(fly, state.fruits);
    speed = 0.006;
    targetZ = ground.z;
    flapRate = 0.02;
    desired = fly.heading;
  }

  if (state.drive?.turn != null) desired = fly.heading + state.drive.turn;
  if (state.drive?.thrust != null) speed = state.drive.thrust;

  fly.heading = turnToward(fly.heading, desired, turnRate);
  const grip = fly.airborne ? 0.2 : 0.46;
  fly.vx += (Math.cos(fly.heading) * speed - fly.vx) * grip;
  fly.vy += (Math.sin(fly.heading) * speed - fly.vy) * grip;
  fly.x += fly.vx * step;
  fly.y += fly.vy * step;
  if (!fly.airborne) ground = keepOnFruit(fly, state.fruits);
  fly.z += (targetZ - fly.z) * ((fly.motor === "LAND" ? 0.18 : 0.12) * step);
  fly.flap += flapRate * step;
  fly.gait += (fly.airborne ? 0.15 : speed > 0.15 ? 0.7 : 0.1) * step;
  if (ground.fruit) fly.perch = ground.fruit.id;
  else if (!fly.airborne) fly.perch = null;

  const boxed = clampWorld(fly.x, fly.y);
  fly.x = boxed.x;
  fly.y = boxed.y;
  fly.z = Math.min(96, Math.max(3, fly.z));
  if (state.travel > 0) state.travel = Math.max(0, state.travel - step * 0.035);
  if (state.gateLock > 0) state.gateLock -= step;
  else if (fly.airborne && fly.z > 24) {
    const gate = nearest(state.portals || [], fly.x, fly.y);
    if (gate.item && gate.dist < gate.item.r) enterMap(state, gate.item.to, gate.item.spawn);
  }
  if (!fly.airborne) {
    fly.act = state.forced || (fly.motor === "FEED" || fly.motor === "DRINK" ? "FORAGE" : "REST");
  } else {
    fly.act = state.forced || (fly.motor === "AVOID" ? "AVOID" : fly.motor === "LAND" ? "REST" : "EXPLORE");
  }
  return state;
}
