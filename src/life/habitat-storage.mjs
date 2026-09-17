import { createHabitat, hungerOf } from "./habitat-sim.mjs";

const SCHEMA = "ifs.habitat-local/1";
const MAX_BYTES = 4 * 1024 * 1024;
const MODES = new Set(["fly", "down", "takeoff", "land", "walk", "hover"]);

export function habitatStorageKey(deployment) {
  if (!deployment?.address || !deployment.chainId) return null;
  return `${SCHEMA}:${deployment.chainId}:${deployment.address.toLowerCase()}`;
}

// Local, editable simulation only. Never restores ownership or chain authority.
export function encodeHabitat(world, souls, seen = new Map()) {
  const lives = new Map(souls.map((soul) => [soul.tokenId, soul.life]));
  return JSON.stringify({
    schema: SCHEMA,
    tick: world.tick,
    bodies: world.bodies.map((body) => ({ ...body, life: lives.get(body.tokenId), dragged: false })),
    seen: [...seen],
  });
}

export function restoreHabitat(raw, souls) {
  const world = createHabitat(souls);
  const seen = new Map();
  if (!raw) return { world, seen, status: "new" };
  try {
    if (raw.length > MAX_BYTES) throw new Error("Archive too large");
    const data = JSON.parse(raw);
    if (data.schema !== SCHEMA || !Array.isArray(data.bodies) || !Array.isArray(data.seen)) {
      throw new Error("Invalid local archive");
    }
    if (!Number.isFinite(data.tick) || data.tick < 0 || data.tick > 1e12) throw new Error("Invalid tick");
    world.tick = data.tick;
    const saved = new Map(data.bodies.map((body) => [body.life, body]));
    for (let i = 0; i < souls.length; i += 1) {
      const body = world.bodies[i];
      const previous = saved.get(souls[i].life);
      if (!previous || previous.seed !== body.seed) continue;
      // Only known simulation fields; identity and owner come from current chain reads.
      for (const [key, initial] of Object.entries(body)) {
        if (["tokenId", "owner", "seed", "dragged", "hunger"].includes(key)) continue;
        const value = previous[key];
        if (typeof initial === "number" && Number.isFinite(value) && Math.abs(value) <= 1e12) body[key] = value;
        if (key === "mode" && MODES.has(value)) body.mode = value;
      }
      body.energy = Math.max(0, Math.min(1000, body.energy));
      body.x = Math.max(0.07, Math.min(0.93, body.x));
      body.y = Math.max(0.11, Math.min(0.87, body.y));
      body.alt = Math.max(0, Math.min(1, body.alt));
      body.hunger = hungerOf(body.energy);
    }
    const lives = new Set(souls.map((soul) => soul.life));
    for (const entry of data.seen) {
      if (Array.isArray(entry) && lives.has(entry[0]) && Number.isSafeInteger(entry[1]) && entry[1] >= 0) seen.set(entry[0], entry[1]);
    }
    return { world, seen, status: "restored" };
  } catch {
    return { world: createHabitat(souls), seen, status: "invalid" };
  }
}

export function loadHabitat(storage, key, souls) {
  try {
    return restoreHabitat(storage.getItem(key), souls);
  } catch {
    return { world: createHabitat(souls), seen: new Map(), status: "unavailable" };
  }
}

export function saveHabitat(storage, key, world, souls, seen) {
  try {
    const raw = encodeHabitat(world, souls, seen);
    if (raw.length > MAX_BYTES) return false;
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
