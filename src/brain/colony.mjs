import { createState } from "./runtime.mjs";
import { BrainSession } from "./session.mjs";
import { makeInput } from "./adapters.mjs";
import { decodeEthology } from "./ethology.mjs";
import { decodeFinance } from "./finance.mjs";
import { CANON } from "./canon.mjs";
import { fillBook, seedBook } from "./book.mjs";
import { createOverlay, modulate } from "./learn.mjs";
import { buildGenome, mutateRootOf } from "./flyswarm/genome.mjs";
import { phenotypeOf } from "./flyswarm/phenotype.mjs";
import {
  admitFill,
  edgeBpsOf,
  edgeWindowOf,
  emptyPort,
  markFilled,
  updateIntentStreak,
} from "./fill-admit.mjs";
import {
  START_BNB,
  START_PRICE,
  TOKEN_UNIT,
  bookOf,
  createSwarm,
  equityOf,
  random32,
  tickSwarm,
} from "../swarm.mjs";
import { saneUsdAtoms } from "../venue-price.mjs";

/** One fly = one MaleCNS session + one paper book. The 24-node swarm is not used here. */
function datasetOf(graph) {
  return graph.metadata?.dataset || graph.manifest?.dataset || "";
}

export function createColony(graph, { size = 5, seed = 43, stepsPerTick = 6 } = {}) {
  const dataset = datasetOf(graph);
  if (dataset !== CANON.dataset) {
    throw new Error(`colony 只接受 ${CANON.dataset}`);
  }
  let rng = seed >>> 0 || 1;
  const members = [];
  for (let i = 0; i < size; i++) {
    rng = random32(rng) || 1;
    const state = createState(graph, { soulId: `colony-${i}`, branchId: "paper", seed: rng });
    const genome = buildGenome({ soulId: `colony-${i}`, seed: rng, generation: 0 });
    members.push({
      id: i,
      gen: 0,
      parent: null,
      status: "alive",
      session: new BrainSession(graph, state),
      book: seedBook(),
      overlay: createOverlay(),
      genome,
      ethology: null,
      intent: null,
      port: emptyPort(),
    });
  }
  return {
    canon: CANON.dataset,
    graph,
    seed,
    rng,
    tick: 0,
    stepsPerTick,
    members,
    trades: [],
    nextId: size,
    lineage: [],
    market: {
      price: START_PRICE,
      changeBps: 0,
      mark: "IFS",
      assetId: null,
      quote: "SIM",
      edgeWindow: [],
    },
  };
}

/** Paper SIM starts at $1000/fly. 20× is past skill; leftover IFS inventory blows past it. */
const BLOWN_EQUITY = START_BNB * 20;

function liveBooksBlown(colony, price) {
  const expected = Math.max(
    1,
    Math.trunc((START_BNB * 35 * TOKEN_UNIT) / 100 / price),
  );
  for (const member of colony.members) {
    if (member.status !== "alive") continue;
    const token = Number(member.book?.token) || 0;
    if (
      !Number.isSafeInteger(token) ||
      !Number.isSafeInteger(token * price) ||
      token > expected * 20
    ) {
      return true;
    }
    const equity = equityOf(member.book, price);
    if (!Number.isSafeInteger(equity) || equity > BLOWN_EQUITY || equity < 0) {
      return true;
    }
  }
  return false;
}

function reseedLiveBooks(colony, price) {
  for (const member of colony.members) {
    if (member.status !== "alive") continue;
    member.book = seedBook(price);
  }
  colony.trades = [];
}

/** Relays a $1000 paper book at the current mark. Does not reset neural state. */
export function resetSharedBook(colony) {
  const marked = colony?.market?.mark === "USD";
  const price = marked
    ? saneUsdAtoms(colony.market.price) || START_PRICE
    : Math.max(1, Math.trunc(Number(colony.market?.price) || START_PRICE));
  reseedLiveBooks(colony, price);
  for (const member of colony.members || []) {
    if (member.status === "alive") member.port = emptyPort();
  }
  if (colony.market) colony.market.edgeWindow = [];
  return { price, mark: colony.market?.mark || "IFS" };
}

/**
 * Kyber USD 进场：第一次换标，或旧纸面库存/非法价把净值撑爆时，重铺 $1000 账本。
 * 之后只更新标价，保留持仓。
 * @returns {boolean} 是否重铺了账本
 */
export function applyLiveMark(colony, usdAtoms, { assetId = "WBNB" } = {}) {
  const price = saneUsdAtoms(usdAtoms);
  if (!price) return false;
  const first = colony.market.mark !== "USD";
  const blown = liveBooksBlown(colony, price);
  colony.market.price = price;
  colony.market.mark = "USD";
  colony.market.quote = "LIVE";
  colony.market.assetId = assetId || colony.market.assetId || "WBNB";
  if (!first && !blown) return false;
  reseedLiveBooks(colony, price);
  return true;
}

/** Restore / boot: drop wei-scale marks and leftover IFS inventory marked as USD. */
export function repairLiveBooks(colony) {
  if (!colony?.market) return false;
  if (colony.market.mark !== "USD") {
    if (colony.market.price > 220_000) {
      colony.market.price = START_PRICE;
      reseedLiveBooks(colony, START_PRICE);
      return true;
    }
    return false;
  }
  const price = saneUsdAtoms(colony.market.price);
  if (!price) {
    colony.market.mark = "IFS";
    colony.market.quote = "SIM";
    colony.market.assetId = null;
    colony.market.price = START_PRICE;
    reseedLiveBooks(colony, START_PRICE);
    return true;
  }
  return applyLiveMark(colony, price, { assetId: colony.market.assetId });
}

export async function tickColony(colony, stimulus = {}, clock = 1_700_000_000_000) {
  const food = stimulus.food ?? 0;
  const threat = stimulus.threat ?? 0;
  const light = stimulus.light ?? 0;
  const changeBps = stimulus.changeBps ?? colony.market.changeBps;
  const now = clock + colony.tick * 1000;
  colony.tick += 1;
  colony.market.changeBps = changeBps;
  colony.market.edgeWindow = edgeWindowOf(colony.market.edgeWindow, changeBps);
  const edgeBps = edgeBpsOf(colony.market.edgeWindow);
  const usdAtoms = saneUsdAtoms(stimulus.usdAtoms);
  if (usdAtoms) {
    applyLiveMark(colony, usdAtoms, {
      assetId: stimulus.assetId || colony.market.assetId,
    });
  } else if (changeBps && colony.market.mark !== "USD") {
    colony.market.price = Math.max(
      1200,
      colony.market.price + Math.trunc((colony.market.price * changeBps) / 10000),
    );
  }
  for (const member of colony.members) {
    if (member.status !== "alive") continue;
    const session = member.session;
    // Market is a product encoding onto the same three official groups, not a fourth organ.
    const marketFood = Math.max(0, Math.trunc(changeBps / 10));
    const marketThreat = Math.min(1000, Math.abs(Math.trunc(changeBps / 10)));
    const driven = modulate(
      {
        food: Math.min(1000, food + marketFood),
        threat: Math.min(1000, threat + marketThreat),
        light,
      },
      member.overlay,
    );
    await session.dispatch({
      type: "input",
      frame: makeInput(session.state, "environment", driven, { now }),
      acceptedAt: now,
    });
    await session.dispatch({ type: "step", count: colony.stepsPerTick });
    member.ethology = decodeEthology(session.state, colony.graph);
    member.intent = decodeFinance(member.ethology, bookOf({ ...member.book }, colony.market.price));
    if (stimulus.assetId) {
      member.intent = {
        ...member.intent,
        assetId: stimulus.assetId,
        mid: stimulus.mid ?? null,
        quoteSource: stimulus.quoteSource || "paper",
        quote: stimulus.quote || "SIM",
      };
    }
    const port = updateIntentStreak(member, member.intent.side);
    const admit = admitFill(member.intent, port, {
      edgeBps,
      tick: colony.tick,
    });
    member.intent = {
      ...member.intent,
      hold: admit.hold,
      fill: null,
    };
    if (!admit.ok) continue;
    const trade = fillBook(member.book, colony.market.price, member.intent, colony.tick, member.id, {
      assetId: stimulus.assetId || null,
      mid: stimulus.mid ?? null,
      quoteSource: stimulus.quoteSource || "paper",
      quote: stimulus.quote || "SIM",
    });
    if (trade) {
      member.intent = { ...member.intent, hold: null, fill: "SIM" };
      markFilled(member, colony.tick);
      colony.trades.unshift(trade);
    }
  }
  colony.trades = colony.trades.slice(0, 500);
  return colony;
}

export function colonySnapshot(colony) {
  return {
    canon: colony.canon,
    tick: colony.tick,
    price: colony.market.price,
    members: colony.members.map((member) => ({
      id: member.id,
      status: member.status,
      action: member.ethology?.action || member.session.state.lastAction,
      side: member.intent?.side || "HOLD",
      left: member.ethology?.left || 0,
      right: member.ethology?.right || 0,
      equity: equityOf(member.book, colony.market.price),
      ticks: member.session.state.ticks,
      soulId: member.session.state.soulId,
      seed: member.genome?.seed || member.session.state.rng,
      phenotype: phenotypeOf(member.genome || member.session.state),
    })),
    trades: colony.trades.slice(0, 20),
  };
}

/** Temporary host for the pit UI until it reads colonySnapshot. Not the brain. */
export function placeholderSwarm(seed) {
  return createSwarm({ seed, size: 5 });
}

export function stepPlaceholder(swarm) {
  return tickSwarm(swarm);
}

/**
 * 结算：最弱退役、冠军繁衍 —— 但不是「淘汰」。
 * 退役成员状态改为 retired，会话与账本保留（灵魂条目由名册层追加 Retired）。
 * 子代从冠军检查点分叉：新种子 = 冠军种子 XOR 群随机数，
 * overlay 每一项向中性值 100 回拉一半（继承一半性格），账本全新。
 */
export function inheritOverlay(parent) {
  const base = parent || createOverlay();
  return {
    schema: "iff.overlay/1",
    learner: base.learner || "outcome-gain/1",
    food: Math.round((base.food + 100) / 2),
    threat: Math.round((base.threat + 100) / 2),
    light: Math.round((base.light + 100) / 2),
    updates: 0,
  };
}

export function settleColony(colony, price = colony.market.price, tick = colony.tick) {
  const living = colony.members.filter((member) => member.status === "alive");
  if (living.length < 2) return null;
  living.sort((a, b) => equityOf(a.book, price) - equityOf(b.book, price));
  const worst = living[0];
  const champ = living[living.length - 1];
  worst.status = "retired";
  colony.rng = random32(colony.rng);
  const childSeed = ((champ.session.state.rng ^ colony.rng) >>> 0) || 1;
  const id = colony.nextId;
  const childState = createState(colony.graph, { soulId: `colony-${id}`, branchId: "paper", seed: childSeed });
  const child = {
    id,
    gen: champ.gen + 1,
    parent: champ.id,
    status: "alive",
    session: new BrainSession(colony.graph, childState),
    book: seedBook(price),
    overlay: inheritOverlay(champ.overlay),
    genome: buildGenome({
      soulId: `colony-${id}`,
      seed: childSeed,
      generation: champ.gen + 1,
      parentSouls: [champ.session.state.soulId],
      inheritBias: true,
      mutateRoot: mutateRootOf(champ.genome?.seed || champ.session.state.rng, childSeed),
    }),
    ethology: null,
    intent: null,
    port: emptyPort(),
  };
  colony.nextId += 1;
  colony.members.push(child);
  colony.lineage.unshift({
    tick,
    culled: worst.id,
    parent: champ.id,
    child: child.id,
    childSeed,
  });
  return { worst, champ, child, childSeed };
}
