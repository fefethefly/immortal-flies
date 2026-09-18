/** Placeholder pit clock. Decisions for the real spine live in src/brain/. This file is not MaleCNS. */
export const MODEL = "iff-swarm-lif-v1";
export const SWARM_STORE = "iff-swarm-v1";

export function loadStoredSwarm() {
  try {
    const raw = localStorage.getItem(SWARM_STORE);
    if (!raw) return createSwarm();
    const saved = JSON.parse(raw);
    if (saved?.model !== MODEL || !Array.isArray(saved.flies)) return createSwarm();
    return saved;
  } catch {
    return createSwarm();
  }
}

export function saveStoredSwarm(swarm) {
  try {
    localStorage.setItem(SWARM_STORE, JSON.stringify(swarm));
  } catch {
    /* private mode still runs the book */
  }
}

export const NEURONS = 24;
export const SUBTICKS = 6;
export const BNB_UNIT = 1_000_000_000;
export const TOKEN_UNIT = 10_000;
export const START_BNB = BNB_UNIT;
export const START_PRICE = 11_170;
export const TAX_BPS = 500;
export const SLIP_BPS = 200;
export const MIN_BNB = 100_000;
export const MIN_TOKEN = 1_000;
export const STIMULI = Object.freeze(["food", "threat", "light", "dark"]);
export { FINANCIAL_PORTS } from "./brain/ports.mjs";
export const LAYERS = Object.freeze([
  { id: "sensory", label: "SENSORY", from: 0, to: 8 },
  { id: "inter", label: "INTER", from: 8, to: 12 },
  { id: "wta", label: "L2 WTA", from: 12, to: 18 },
  { id: "modulatory", label: "MODULATORY", from: 18, to: 21 },
  { id: "motor", label: "MOTOR", from: 21, to: 24 },
]);
export { ACTION_TRADE, decodeTrade } from "./brain/finance.mjs";

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export function random32(value) {
  let x = value >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
export function formatBnb(atoms) {
  return (Number(atoms) / BNB_UNIT).toFixed(4);
}
export function formatToken(atoms) {
  return (Number(atoms) / TOKEN_UNIT).toFixed(1);
}
function trimFrac(text) {
  return text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
/** BNB per token as a plain decimal. Never scientific notation. */
export function formatPrice(price) {
  const value = Number(price) / BNB_UNIT;
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 0.01) return sign + trimFrac(abs.toFixed(4));
  const lead = Math.max(0, Math.ceil(-Math.log10(abs)) - 1);
  return sign + trimFrac(abs.toFixed(Math.min(12, lead + 4)));
}
export function equityOf(fly, price) {
  return fly.bnb + Math.trunc((fly.token * price) / TOKEN_UNIT);
}
export function roiOf(fly, price) {
  return Math.round(((equityOf(fly, price) - START_BNB) * 1000) / START_BNB);
}

function biasesFromSeed(seed) {
  let rng = seed >>> 0;
  const biases = [];
  for (let i = 0; i < 16; i++) {
    rng = random32(rng);
    biases.push(rng % 41);
  }
  return biases;
}

function inheritBiases(parent, childSeed) {
  const mutant = biasesFromSeed(childSeed);
  return parent.map((value, i) => (i % 2 === 0 ? value : mutant[i]));
}

function fingerprint(seed, biases) {
  let x = seed >>> 0;
  for (const bias of biases) x = random32(x ^ (bias >>> 0));
  return (x >>> 0).toString(16).padStart(8, "0");
}

function emptyStimulus() {
  return { food: 0, threat: 0, light: 0, dark: 0, untilTick: 0 };
}

function seedInventory(price = START_PRICE) {
  const reserved = Math.trunc((START_BNB * 35) / 100);
  const token = Math.trunc((reserved * TOKEN_UNIT) / price);
  const spent = Math.trunc((token * price) / TOKEN_UNIT);
  return { bnb: START_BNB - spent, token, costBnb: spent };
}

function createTrader({ id, seed, gen = 0, parent = null, bornTick = 0 }) {
  const biases = biasesFromSeed(seed);
  const bag = seedInventory();
  return {
    id,
    gen,
    parent,
    seed: seed >>> 0,
    fingerprint: fingerprint(seed, biases),
    status: "alive",
    bornTick,
    culledTick: null,
    bnb: bag.bnb,
    token: bag.token,
    costBnb: bag.costBnb,
    trades: 0,
    wins: 0,
    losses: 0,
    realized: 0,
    lastSide: "HOLD",
    lastConfidence: 0,
    lastRates: { left: 0, right: 0, buy: 0, sell: 0, hold: 0 },
    brain: {
      voltage: Array(NEURONS).fill(0),
      spikes: 0,
      biases,
    },
  };
}

export function createSwarm({
  seed = 0x1f1f1f1f,
  size = 5,
  cullEvery = 1800,
  cooldownTicks = 30,
} = {}) {
  const count = clamp(size | 0, 1, 32);
  let rng = seed >>> 0;
  const flies = [];
  for (let i = 0; i < count; i++) {
    rng = random32(rng);
    flies.push(createTrader({ id: i, seed: rng, bornTick: 0 }));
  }
  return {
    model: MODEL,
    seed: seed >>> 0,
    rng,
    tick: 0,
    size: count,
    flies,
    nextId: count,
    market: { price: START_PRICE, prev: START_PRICE, delta: 0 },
    prices: [START_PRICE],
    stimulus: emptyStimulus(),
    lastStimulusAt: -1_000_000,
    cooldownTicks,
    cullEvery,
    nextCullAt: cullEvery,
    trades: [],
    stimuliLog: [],
    lineage: [],
    audit: "SIM",
  };
}

function stepMarket(rng, price) {
  const shock = (rng % 161) - 80;
  const revert = Math.trunc((START_PRICE - price) * 3 / 100);
  return clamp(price + Math.trunc((price * shock) / 10_000) + revert, 1_200, 220_000);
}

function inject(currents, fly, swarm) {
  const { delta } = swarm.market;
  const { stimulus } = swarm;
  currents[0] += Math.max(0, delta);
  currents[1] += Math.max(0, -delta);
  currents[2] += 18;
  currents[3] += stimulus.food * 2;
  currents[4] += stimulus.threat * 2;
  currents[5] += stimulus.light;
  currents[6] += stimulus.dark;
  const equity = equityOf(fly, swarm.market.price);
  const held = Math.trunc((fly.token * swarm.market.price) / TOKEN_UNIT);
  const frac = equity > 0 ? held / equity : 0;
  currents[7] += Math.trunc(frac * 80);
  if (frac > 0.55) currents[19] += 36;
  if (frac < 0.18) currents[18] += 36;
  currents[20] += 12 + Math.trunc((stimulus.light + stimulus.food) / 8);
  for (let i = 0; i < 8; i++) currents[i] += fly.brain.biases[i];
}

function leakInto(currents, spikes, biases, stimulus) {
  const fired = (i) => (spikes >> i) & 1;
  for (let i = 0; i < 8; i++) {
    currents[8 + (i % 4)] += currents[i] + fired(i) * 14;
  }
  const leftDrive = currents[8] + currents[10] + currents[18] + biases[8] + stimulus.food;
  const rightDrive = currents[9] + currents[11] + currents[19] + biases[9] + stimulus.threat;
  currents[12] += leftDrive + 8 - fired(15) * 28 - fired(16) * 18;
  currents[13] += leftDrive - fired(16) * 22;
  currents[14] += Math.trunc(leftDrive / 2) - fired(17) * 16;
  currents[15] += rightDrive + 8 - fired(12) * 28 - fired(13) * 18;
  currents[16] += rightDrive - fired(13) * 22;
  currents[17] += Math.trunc(rightDrive / 2) - fired(14) * 16;
  currents[21] += fired(12) * 20 + fired(13) * 16 + biases[10];
  currents[22] += fired(15) * 20 + fired(16) * 16 + biases[11];
  currents[23] += 10 + fired(20) * 8 - Math.abs(fired(12) - fired(15)) * 6;
}

function integrate(fly, swarm) {
  const rates = { left: 0, right: 0, buy: 0, sell: 0, hold: 0 };
  let spikes = fly.brain.spikes;
  const voltage = fly.brain.voltage.slice();
  for (let step = 0; step < SUBTICKS; step++) {
    const currents = Array(NEURONS).fill(0);
    inject(currents, fly, swarm);
    leakInto(currents, spikes, fly.brain.biases, swarm.stimulus);
    let next = 0;
    for (let i = 0; i < NEURONS; i++) {
      const threshold = 86 + ((fly.seed >> (i % 16)) & 1) * 18;
      let v = Math.trunc((voltage[i] * 7) / 8) + Math.trunc(currents[i]);
      if (v >= threshold) {
        v -= threshold;
        next |= 1 << i;
      }
      voltage[i] = clamp(v, 0, 400);
    }
    spikes = next;
    rates.left += popcount(spikes & 0x7000);
    rates.right += popcount(spikes & 0x38000);
    rates.buy += (spikes >> 21) & 1;
    rates.sell += (spikes >> 22) & 1;
    rates.hold += (spikes >> 23) & 1;
  }
  fly.brain.voltage = voltage;
  fly.brain.spikes = spikes;
  fly.lastRates = rates;
  return rates;
}

function popcount(n) {
  let x = n >>> 0,
    count = 0;
  while (x) {
    count += x & 1;
    x >>>= 1;
  }
  return count;
}

function decide(fly, swarm) {
  const rates = integrate(fly, swarm);
  const approach = rates.left + rates.buy + Math.trunc(swarm.stimulus.food / 2);
  const retreat = rates.right + rates.sell + Math.trunc(swarm.stimulus.threat / 2);
  const quiet = rates.hold + Math.trunc(swarm.stimulus.dark / 4);
  const total = approach + retreat + quiet + 1;
  let side = "HOLD";
  let score = quiet;
  if (approach >= retreat && approach > quiet) {
    side = "BUY";
    score = approach;
  } else if (retreat > approach && retreat > quiet) {
    side = "SELL";
    score = retreat;
  }
  const confidence = clamp(Math.round((Math.abs(approach - retreat) * 100) / total), 0, 100);
  if (confidence < 12) side = "HOLD";
  fly.lastSide = side;
  fly.lastConfidence = confidence;
  return { side, confidence, score, rates };
}

function applyBuy(fly, price, spend) {
  const taxed = Math.trunc((spend * (10_000 - TAX_BPS)) / 10_000);
  const slipped = Math.max(1, Math.trunc((price * (10_000 + SLIP_BPS)) / 10_000));
  const tokens = Math.trunc((taxed * TOKEN_UNIT) / slipped);
  fly.bnb -= spend;
  fly.token += tokens;
  fly.costBnb += spend;
  return tokens;
}

function applySell(fly, price, tokens) {
  const slipped = Math.max(1, Math.trunc((price * (10_000 - SLIP_BPS)) / 10_000));
  const gross = Math.trunc((tokens * slipped) / TOKEN_UNIT);
  const received = Math.trunc((gross * (10_000 - TAX_BPS)) / 10_000);
  const basis = fly.token ? Math.trunc((fly.costBnb * tokens) / fly.token) : 0;
  fly.bnb += received;
  fly.token -= tokens;
  fly.costBnb = Math.max(0, fly.costBnb - basis);
  const pnl = received - basis;
  fly.realized += pnl;
  if (pnl >= 0) fly.wins += 1;
  else fly.losses += 1;
  return received;
}

function execute(fly, market, decision, tick) {
  if (decision.side === "HOLD") return null;
  if (decision.side === "BUY") {
    const spend = Math.max(
      MIN_BNB,
      Math.min(fly.bnb, Math.trunc((fly.bnb * decision.confidence * 8) / 1000)),
    );
    if (fly.bnb < spend || spend < MIN_BNB) return null;
    const tokens = applyBuy(fly, market.price, spend);
    if (!tokens) return null;
    fly.trades += 1;
    return {
      tick,
      flyId: fly.id,
      side: "BUY",
      amount: spend,
      contra: tokens,
      status: "confirmed",
      audit: "SIM",
    };
  }
  const tokens = Math.max(
    MIN_TOKEN,
    Math.min(fly.token, Math.trunc((fly.token * decision.confidence * 8) / 1000)),
  );
  if (fly.token < tokens || tokens < MIN_TOKEN) return null;
  const received = applySell(fly, market.price, tokens);
  fly.trades += 1;
  return {
    tick,
    flyId: fly.id,
    side: "SELL",
    amount: tokens,
    contra: received,
    status: "confirmed",
    audit: "SIM",
  };
}

function aliveFlies(swarm) {
  return swarm.flies.filter((fly) => fly.status === "alive");
}

export function settleBooks(swarm) {
  const next = structuredClone(swarm);
  const living = aliveFlies(next);
  if (living.length < 2) return next;
  const price = next.market.price;
  living.sort((a, b) => equityOf(a, price) - equityOf(b, price));
  const worst = living[0];
  const champ = living[living.length - 1];
  worst.status = "culled";
  worst.culledTick = next.tick;
  next.rng = random32(next.rng);
  const childSeed = (champ.seed ^ next.rng) >>> 0 || 1;
  const child = createTrader({
    id: next.nextId,
    seed: childSeed,
    gen: champ.gen + 1,
    parent: champ.id,
    bornTick: next.tick,
  });
  child.brain.biases = inheritBiases(champ.brain.biases, childSeed);
  child.fingerprint = fingerprint(childSeed, child.brain.biases);
  next.nextId += 1;
  next.flies.push(child);
  next.lineage.unshift({
    tick: next.tick,
    culled: worst.id,
    parent: champ.id,
    child: child.id,
    childSeed,
  });
  return next;
}

export function stimulate(swarm, kind, intensity = 0.6) {
  if (!STIMULI.includes(kind)) throw new Error("未知的刺激类型");
  if (swarm.tick - swarm.lastStimulusAt < swarm.cooldownTicks) {
    throw new Error(`刺激冷却中，还需 ${swarm.cooldownTicks - (swarm.tick - swarm.lastStimulusAt)} 秒`);
  }
  const level = clamp(Math.round(Number(intensity) * 100), 15, 100);
  const next = structuredClone(swarm);
  next.stimulus = {
    food: 0,
    threat: 0,
    light: 0,
    dark: 0,
    untilTick: next.tick + 12,
    [kind]: level,
  };
  next.lastStimulusAt = next.tick;
  next.stimuliLog = [{ kind, intensity: level, tick: next.tick }, ...next.stimuliLog].slice(0, 24);
  return next;
}

export function tickSwarm(swarm) {
  const next = structuredClone(swarm);
  next.tick += 1;
  next.rng = random32(next.rng);
  next.market.prev = next.market.price;
  next.market.price = stepMarket(next.rng, next.market.price);
  next.market.delta = Math.trunc(((next.market.price - next.market.prev) * 100) / next.market.prev);
  next.prices = [...next.prices, next.market.price].slice(-96);
  if (next.tick >= next.stimulus.untilTick) next.stimulus = emptyStimulus();
  const queue = [];
  for (const fly of next.flies) {
    if (fly.status !== "alive") continue;
    queue.push({ fly, decision: decide(fly, next) });
  }
  queue.sort((a, b) => b.decision.confidence - a.decision.confidence);
  for (const { fly, decision } of queue) {
    const trade = execute(fly, next.market, decision, next.tick);
    if (trade) next.trades.unshift(trade);
  }
  next.trades = next.trades.slice(0, 500);
  if (next.tick >= next.nextCullAt) {
    const settled = settleBooks(next);
    settled.nextCullAt = settled.tick + settled.cullEvery;
    return settled;
  }
  return next;
}

export function runSwarm(swarm, steps) {
  let current = swarm;
  for (let i = 0; i < steps; i++) current = tickSwarm(current);
  return current;
}

export function summarize(swarm) {
  const living = aliveFlies(swarm);
  const price = swarm.market.price;
  const buys = swarm.trades.filter((row) => row.side === "BUY").length;
  const sells = swarm.trades.filter((row) => row.side === "SELL").length;
  const bnb = living.reduce((sum, fly) => sum + fly.bnb, 0);
  const token = living.reduce((sum, fly) => sum + fly.token, 0);
  const board = swarm.flies
    .map((fly) => ({
      ...fly,
      equity: equityOf(fly, price),
      roi: roiOf(fly, price),
    }))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "alive" ? -1 : 1;
      return b.equity - a.equity;
    });
  return {
    alive: living.length,
    total: swarm.flies.length,
    tick: swarm.tick,
    trades: swarm.trades.length,
    buys,
    sells,
    bnb,
    token,
    price,
    audit: swarm.audit,
    nextCullIn: Math.max(0, swarm.nextCullAt - swarm.tick),
    board,
  };
}

export function selectedRates(fly) {
  return fly?.lastRates || { left: 0, right: 0, buy: 0, sell: 0, hold: 0 };
}

export function bookOf(fly, price) {
  const equity = equityOf(fly, price);
  const inventory = Math.trunc((fly.token * price) / TOKEN_UNIT);
  return {
    equity,
    cash: fly.bnb,
    inventory,
    cashShare: equity ? Math.round((fly.bnb * 100) / equity) : 0,
    inventoryShare: equity ? Math.round((inventory * 100) / equity) : 0,
  };
}

export function reflexOf(fly) {
  const rates = selectedRates(fly);
  const approach = rates.left + rates.buy;
  const retreat = rates.right + rates.sell;
  const total = approach + retreat + rates.hold + 1;
  const side = fly?.lastSide || "HOLD";
  return {
    approach,
    retreat,
    hold: rates.hold,
    lean: (approach - retreat) / total,
    side,
    confidence: fly?.lastConfidence || 0,
    why: side === "BUY" ? "pit.whyBuy" : side === "SELL" ? "pit.whySell" : "pit.whyHold",
  };
}

export function layerFires(spikes) {
  return LAYERS.map((layer) => {
    let count = 0;
    for (let i = layer.from; i < layer.to; i++) count += (spikes >> i) & 1;
    return { ...layer, count, size: layer.to - layer.from };
  });
}
