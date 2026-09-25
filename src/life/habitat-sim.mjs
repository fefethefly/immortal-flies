const TAU = Math.PI * 2;

/** One `stepHabitat` unit is 1/60s of dish time. Local vitality only — not MiningHub medium. */
export const HABITAT_ENERGY = Object.freeze({
  max: 1000,
  collapse: 1,
  faint: 140,
  hungry: 320,
  sated: 720,
  wake: 160,
  takeoff: 340,
  restCeiling: 560,
  flyDrain: 0.018,
  thrustDrain: 0.008,
  walkRecover: 0.035,
  downRecover: 0.028,
  gustDrain: 0.12,
});

function hash32(text) {
  let h = 2166136261;
  const raw = String(text || "");
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function hungerOf(energy) {
  const n = Number(energy) || 0;
  if (n <= HABITAT_ENERGY.collapse) return "collapsed";
  if (n < HABITAT_ENERGY.faint) return "faint";
  if (n < HABITAT_ENERGY.hungry) return "hungry";
  if (n < HABITAT_ENERGY.sated) return "sated";
  return "full";
}

export function thoughtOf(soul, locale = "en", body) {
  const hunger = body ? hungerOf(body.energy) : "sated";
  const hue = soul.phenotype?.hue?.[locale] || soul.phenotype?.hue?.en || "amber";
  const eye = soul.phenotype?.eye?.[locale] || soul.phenotype?.eye?.en || "wild";
  const eyeZh = eye.endsWith("眼") ? eye : `${eye}眼`;
  if (locale === "zh") {
    if (hunger === "collapsed")
      return "它歇下了。歇一会儿会自己起来。投食能快一点。链上的灵魂还在。";
    if (hunger === "faint") return `${hue}躯体已经很轻。它还走得动，但飞不起来。`;
    if (hunger === "hungry") return `${hue}躯体，${eyeZh}。它在找地上的食物。`;
    return `${hue}躯体，${eyeZh}。动作是本地演算；链上只记刺激与所有权。`;
  }
  if (hunger === "collapsed") {
    return "It is resting. A short rest wakes it. Food is faster. The soul is still on-chain.";
  }
  if (hunger === "faint") {
    return `${hue} body, almost empty. It can walk. It cannot fly.`;
  }
  if (hunger === "hungry") {
    return `${hue} body, ${eye} eyes. It is hunting crumbs on the ground.`;
  }
  return `${hue} body, ${eye} eyes. Motion here is local. The chain keeps ownership and stimuli.`;
}

function traitsOf(seed) {
  return {
    gap: 16 + (seed % 26),
    flick: 0.48 + ((seed >>> 8) % 70) / 100,
    cruise: 0.00148 + ((seed >>> 16) % 80) / 120000,
    linger: ((seed >>> 24) & 255) / 255,
    shy: 0.4 + ((seed >>> 5) % 45) / 100,
  };
}

function noise01(tick, seed, salt) {
  return (hash32(`${salt}-${Math.floor(tick)}-${seed}`) % 1000) / 1000;
}

function startSaccade(body, turn, frames = 6) {
  if (body.saccade > 0) return;
  body.saccade = frames;
  body.saccadeTurn = Math.max(-1.2, Math.min(1.2, turn));
}

function bodyOf(soul) {
  const h = hash32(soul.life);
  const energy = 380 + (h % 220);
  const heading = ((h % 360) * TAU) / 360;
  const traits = traitsOf(h);
  return {
    tokenId: soul.tokenId,
    owner: soul.owner,
    seed: h,
    x: ((h % 8000) / 8000) * 0.34 + 0.33,
    y: ((((h / 8000) | 0) % 8000) / 8000) * 0.26 + 0.38,
    heading,
    energy,
    hunger: hungerOf(energy),
    vx: Math.cos(heading) * traits.cruise,
    vy: Math.sin(heading) * traits.cruise,
    vz: 0,
    thrust: 0.55,
    bank: 0,
    pitch: 0,
    alt: 0.02,
    dart: 0,
    flap: 0,
    saccade: 0,
    saccadeTurn: 0,
    nextSaccade: 8 + (h % 18),
    gait: 0,
    takeoff: 0,
    mode: "fly",
    dragged: false,
  };
}

export function createHabitat(souls = []) {
  return {
    food: [],
    gusts: [],
    rate: 1,
    dust: Array.from({ length: 28 }, (_, i) => ({
      x: ((i * 37) % 100) / 100,
      y: ((i * 53) % 100) / 100,
      r: 0.6 + (i % 4) * 0.25,
    })),
    tick: 0,
    bodies: souls.map(bodyOf),
  };
}

export function syncHabitat(state, souls) {
  const have = new Map(state.bodies.map((body) => [body.tokenId, body]));
  for (const soul of souls) {
    const body = have.get(soul.tokenId);
    if (body) {
      if (body.owner.toLowerCase() !== soul.owner.toLowerCase()) {
        body.dragged = false;
      }
      body.owner = soul.owner;
      continue;
    }
    const added = bodyOf(soul);
    state.bodies.push(added);
    have.set(soul.tokenId, added);
  }
  const living = new Set(souls.map((soul) => soul.tokenId));
  state.bodies = state.bodies.filter((body) => living.has(body.tokenId));
  return state;
}

export function dropFood(state, x, y) {
  state.food.push({ x, y, life: 1, r: 0.012 });
  return state;
}

export function dropGust(state, x, y) {
  state.gusts = state.gusts || [];
  state.gusts.push({ x, y, r: 0.09, life: 1 });
  return state;
}

export function feedBody(state, tokenId, amount = 220) {
  const body = state.bodies.find((item) => item.tokenId === tokenId);
  if (!body) return state;
  const collapsed = hungerOf(body.energy) === "collapsed";
  body.energy = Math.min(HABITAT_ENERGY.max, body.energy + amount);
  if (collapsed) body.energy = Math.max(body.energy, 260);
  if (collapsed) {
    body.mode = "takeoff";
    body.takeoff = 14;
    body.vz = 0.006;
  }
  body.hunger = hungerOf(body.energy);
  return state;
}

/** Look-at the dish centre at the farthest zoom the page allows. */
export const HABITAT_VIEW = Object.freeze({ x: 0.5, y: 0.5, zoom: 0.5 });

export function resetCamera(camera = {}) {
  camera.x = HABITAT_VIEW.x;
  camera.y = HABITAT_VIEW.y;
  camera.zoom = HABITAT_VIEW.zoom;
  return camera;
}

export function projectHabitat(wx, wy, camera, w, h, alt = 0) {
  return {
    x: (wx - camera.x) * w * camera.zoom + w * 0.5,
    y: (wy - alt - camera.y) * h * camera.zoom + h * 0.5,
  };
}

export function unprojectHabitat(sx, sy, camera, w, h) {
  return {
    x: (sx / w - 0.5) / camera.zoom + camera.x,
    y: (sy / h - 0.5) / camera.zoom + camera.y,
  };
}

export function focusCamera(camera, body, zoom = 1.08) {
  if (!body) return resetCamera(camera);
  camera.x = body.x;
  camera.y = body.y;
  camera.zoom = zoom;
  return camera;
}

export function fitCamera(camera, bodies, pad = 0.22) {
  if (!bodies.length) return resetCamera(camera);
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const body of bodies) {
    minX = Math.min(minX, body.x);
    maxX = Math.max(maxX, body.x);
    minY = Math.min(minY, body.y);
    maxY = Math.max(maxY, body.y);
  }
  const span = Math.max(maxX - minX + pad, maxY - minY + pad, 0.78);
  camera.x = (minX + maxX) / 2;
  camera.y = (minY + maxY) / 2;
  camera.zoom = Math.min(1.28, Math.max(0.62, 0.8 / span));
  return camera;
}

export function stepHabitat(state, dt = 1, onEvent) {
  const total = Math.max(0, dt * (state.rate || 1));
  if (total <= 0) return state;
  const slices = total > 1.25 ? Math.min(24, Math.ceil(total)) : 1;
  const step = total / slices;
  for (let i = 0; i < slices; i += 1) tickHabitat(state, step, onEvent);
  return state;
}

function tickHabitat(state, step, onEvent) {
  state.tick = (state.tick || 0) + step;
  const living = state.bodies.filter((body) => !body.dragged && hungerOf(body.energy) !== "collapsed").length;
  const crumbCap = living === 0 ? 0 : Math.max(0, Math.ceil(living / 16));
  if (crumbCap && state.food.length < crumbCap && state.tick % 88 < step && hash32(`crumb-${state.tick}`) % 100 < 28) {
    const h = hash32(`crumb-${state.tick}`);
    state.food.push({
      x: ((h % 8000) / 8000) * 0.7 + 0.15,
      y: ((((h / 8000) | 0) % 8000) / 8000) * 0.58 + 0.2,
      life: 1,
      r: 0.01,
    });
  }
  for (const crumb of state.food) crumb.life -= 0.0022 * step;
  state.food = state.food.filter((crumb) => crumb.life > 0);
  for (const gust of state.gusts || []) gust.life -= 0.012 * step;
  state.gusts = (state.gusts || []).filter((gust) => gust.life > 0);

  for (const body of state.bodies) {
    body.hunger = hungerOf(body.energy);
    if (body.dragged) continue;
    if (body.hunger === "collapsed") {
      body.mode = "down";
      body.thrust = 0;
      body.vx = 0;
      body.vy = 0;
      body.vz = 0;
      body.alt = 0;
      body.flap = 0;
      body.saccade = 0;
      body.bank *= 0.8;
      body.pitch *= 0.8;
      body.energy = Math.min(
        HABITAT_ENERGY.restCeiling,
        body.energy + HABITAT_ENERGY.downRecover * step,
      );
      body.hunger = hungerOf(body.energy);
      if (body.energy >= HABITAT_ENERGY.wake) body.mode = "walk";
      continue;
    }

    const traits = traitsOf(body.seed);
    const hungry = body.hunger === "hungry" || body.hunger === "faint";
    const tired = body.hunger === "faint";
    const grounded =
      body.mode === "walk" || body.mode === "land" || body.mode === "down";
    const resting = tired || (grounded && body.energy < HABITAT_ENERGY.takeoff);
    const crumb = hungry
      ? state.food.reduce((best, item) => {
          if (item.life <= 0) return best;
          if (!best) return item;
          return Math.hypot(item.x - body.x, item.y - body.y) <
            Math.hypot(best.x - body.x, best.y - body.y)
            ? item
            : best;
        }, null)
      : null;
    const crumbDist = crumb ? Math.hypot(crumb.x - body.x, crumb.y - body.y) : 9;
    const inward = Math.atan2(0.5 - body.y, 0.5 - body.x);
    const edgeX = body.x < 0.16 ? 0.16 - body.x : body.x > 0.84 ? 0.84 - body.x : 0;
    const edgeY = body.y < 0.18 ? 0.18 - body.y : body.y > 0.82 ? 0.82 - body.y : 0;
    const onEdge = Math.hypot(edgeX, edgeY) > 0.012;

    let foe = 0;
    let away = 0;
    for (const other of state.bodies) {
      if (other === body) continue;
      const d = Math.hypot(other.x - body.x, other.y - body.y);
      if (d < 0.055 && d > 0) {
        foe = Math.max(foe, 0.055 - d);
        away = Math.atan2(body.y - other.y, body.x - other.x);
      }
    }
    for (const gust of state.gusts || []) {
      if (Math.hypot(gust.x - body.x, gust.y - body.y) < gust.r) {
        startSaccade(body, wrapAngle(inward + (noise01(state.tick, body.seed, "gust") - 0.5) * 2), 8);
        body.vz += 0.003 * step;
        body.energy = Math.max(0, body.energy - HABITAT_ENERGY.gustDrain * step);
      }
    }

    if (resting) {
      body.mode = body.alt > 0.008 ? "land" : "walk";
    } else if (body.mode === "takeoff") {
      body.takeoff = Math.max(0, (body.takeoff || 0) - step);
      if (body.takeoff <= 0) body.mode = "fly";
    } else if (body.mode === "land") {
      if (body.alt <= 0.006) body.mode = "walk";
    } else if (body.mode === "walk" && body.energy > HABITAT_ENERGY.takeoff) {
      body.mode = "takeoff";
      body.takeoff = 12;
      body.vz = 0.005;
    } else if (crumb && crumbDist < 0.048) {
      body.mode = "hover";
    } else if (body.mode === "hover" && (crumbDist > 0.07 || noise01(state.tick, body.seed, "leave") > 0.82 + traits.linger * 0.12)) {
      body.mode = "fly";
    } else if (body.mode !== "hover") {
      body.mode = "fly";
    }

    const airborne = body.mode === "fly" || body.mode === "hover" || body.mode === "takeoff";
    body.dart = Math.max(0, (body.dart || 0) - step);
    if (airborne && body.dart <= 0 && !tired && noise01(state.tick, body.seed, "burst") > 0.987) {
      body.dart = 10 + (body.seed % 8);
    }

    body.nextSaccade = (body.nextSaccade ?? traits.gap) - step;
    if (airborne && body.saccade <= 0 && (body.nextSaccade <= 0 || onEdge || foe > 0.012)) {
      let flick = (noise01(state.tick, body.seed, "yaw") - 0.5) * 2 * traits.flick;
      if (crumb && crumbDist > 0.05) {
        flick = wrapAngle(Math.atan2(crumb.y - body.y, crumb.x - body.x) - body.heading) * 0.7 + flick * 0.3;
      }
      if (foe > 0.012) flick = wrapAngle(away - body.heading) * traits.shy;
      if (onEdge) flick = wrapAngle(inward - body.heading);
      startSaccade(body, flick, onEdge || foe > 0.012 ? 7 : 5 + (body.seed % 4));
      body.nextSaccade = traits.gap * (0.65 + noise01(state.tick, body.seed, "gap") * 0.7);
    }

    const prevHeading = body.heading;
    if (body.saccade > 0) {
      body.heading = wrapAngle(body.heading + body.saccadeTurn * 0.24 * step);
      body.saccadeTurn *= Math.pow(0.82, step);
      body.saccade = Math.max(0, body.saccade - step);
    } else if (body.mode === "walk") {
      body.gait = (body.gait || 0) + 0.34 * step;
      const pause = Math.sin(body.gait * 0.45 + body.seed) > 0.62;
      if (!pause) body.heading = wrapAngle(body.heading + Math.sin(body.gait) * 0.09 * step);
      if (onEdge) body.heading = wrapAngle(body.heading + wrapAngle(inward - body.heading) * 0.12 * step);
    } else {
      body.heading = wrapAngle(body.heading + Math.sin(state.tick * 0.04 + body.seed) * 0.01 * step);
    }

    const yawRate = wrapAngle(body.heading - prevHeading);
    body.bank += (Math.max(-0.7, Math.min(0.7, yawRate * 9)) - body.bank) * 0.22 * step;

    const wantThrust = tired
      ? 0.12
      : body.mode === "hover"
        ? 0.38 + 0.08 * Math.sin(state.tick * 0.33 + body.seed)
        : body.dart > 0
          ? 1.18
          : body.saccade > 0
            ? 0.42
            : 0.72 + 0.16 * Math.sin(state.tick * 0.05 + body.seed);
    body.thrust += (wantThrust - (body.thrust || 0)) * 0.18 * step;

    const walkPause = body.mode === "walk" && Math.sin((body.gait || 0) * 0.45 + body.seed) > 0.62;
    const wantSpeed = walkPause
      ? 0
      : body.mode === "walk"
        ? 0.0004
        : body.mode === "hover"
          ? traits.cruise * 0.28
          : body.saccade > 0
            ? traits.cruise * 0.5
            : traits.cruise * (0.85 + body.thrust * 0.4);
    const follow = body.mode === "hover" ? 0.1 : body.saccade > 0 ? 0.16 : body.mode === "walk" ? 0.32 : 0.24;
    const tx = Math.cos(body.heading) * wantSpeed;
    const ty = Math.sin(body.heading) * wantSpeed;
    body.vx += (tx - (body.vx || 0)) * follow * step;
    body.vy += (ty - (body.vy || 0)) * follow * step;
    body.x += (body.vx || 0) * step;
    body.y += (body.vy || 0) * step;

    const wantAlt =
      body.mode === "walk" || body.mode === "down"
        ? 0
        : body.mode === "land"
          ? 0.003
          : body.mode === "hover"
            ? 0.015 + Math.sin(state.tick * 0.28 + body.seed) * 0.004
            : body.mode === "takeoff"
              ? 0.036
              : 0.02 + body.thrust * 0.012 + Math.sin(state.tick * 0.19 + body.seed) * 0.005;
    body.vz = (body.vz || 0) + (wantAlt - (body.alt || 0)) * 0.09 * step;
    body.vz *= Math.pow(0.86, step);
    body.alt = Math.max(0, (body.alt || 0) + body.vz * step);
    body.pitch += (body.vz * 22 - (body.pitch || 0)) * 0.2 * step;

    body.flap = airborne
      ? Math.sin(state.tick * (0.9 + body.thrust * 0.85) + body.seed)
      : 0;

    if (crumb && crumbDist < 0.028) {
      const before = body.energy;
      body.energy = Math.min(HABITAT_ENERGY.max, body.energy + 90);
      crumb.life = 0;
      onEvent?.({ kind: "ate", tokenId: body.tokenId, amount: Math.round(body.energy - before) });
    }
    if (airborne) {
      body.energy = Math.max(
        0,
        body.energy -
          (HABITAT_ENERGY.flyDrain + body.thrust * HABITAT_ENERGY.thrustDrain) *
            step,
      );
    } else if (body.energy < HABITAT_ENERGY.restCeiling) {
      body.energy = Math.min(
        HABITAT_ENERGY.restCeiling,
        body.energy + HABITAT_ENERGY.walkRecover * step,
      );
    }
    body.hunger = hungerOf(body.energy);

    if (body.x < 0.07) {
      body.x = 0.07;
      body.vx = Math.abs(body.vx || 0) * 0.25;
    } else if (body.x > 0.93) {
      body.x = 0.93;
      body.vx = -Math.abs(body.vx || 0) * 0.25;
    }
    if (body.y < 0.11) {
      body.y = 0.11;
      body.vy = Math.abs(body.vy || 0) * 0.25;
    } else if (body.y > 0.87) {
      body.y = 0.87;
      body.vy = -Math.abs(body.vy || 0) * 0.25;
    }
  }
  return state;
}

export function applyStimulus(state, tokenId, kind, intensity = 640) {
  const body = state.bodies.find((item) => item.tokenId === tokenId);
  if (!body) return state;
  const scale = Math.max(0.2, Math.min(1, (Number(intensity) || 640) / 1000));
  if (kind === 0) {
    dropFood(state, body.x + 0.018, body.y + 0.01);
    feedBody(state, tokenId, Math.round(160 * scale + 70));
  } else if (kind === 1) {
    dropGust(state, body.x, body.y);
    body.energy = Math.max(0, body.energy - 80 * scale);
    body.dart = 24;
    startSaccade(body, 1.15, 8);
    body.vz = 0.008;
  } else if (kind === 2) {
    body.dart = 34;
    body.energy = Math.min(HABITAT_ENERGY.max, body.energy + 36 * scale);
    body.mode = "takeoff";
    body.takeoff = 10;
    body.vz = 0.01;
    body.alt = Math.max(body.alt || 0, 0.03);
  }
  body.hunger = hungerOf(body.energy);
  return state;
}
