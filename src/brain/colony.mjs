import { createState } from "./runtime.mjs";
import { BrainSession } from "./session.mjs";
import { makeInput } from "./adapters.mjs";
import { decodeEthology } from "./ethology.mjs";
import { decodeFinance } from "./finance.mjs";
import { CANON } from "./canon.mjs";
import { fillBook, seedBook } from "./book.mjs";
import { createOverlay, modulate } from "./learn.mjs";
import {
  START_PRICE,
  bookOf,
  createSwarm,
  equityOf,
  random32,
  tickSwarm,
} from "../swarm.mjs";

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
    members.push({
      id: i,
      gen: 0,
      parent: null,
      status: "alive",
      session: new BrainSession(graph, state),
      book: seedBook(),
      overlay: createOverlay(),
      ethology: null,
      intent: null,
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
    market: { price: START_PRICE, changeBps: 0 },
  };
}

export async function tickColony(colony, stimulus = {}, clock = 1_700_000_000_000) {
  const food = stimulus.food ?? 0;
  const threat = stimulus.threat ?? 0;
  const light = stimulus.light ?? 0;
  const changeBps = stimulus.changeBps ?? colony.market.changeBps;
  const now = clock + colony.tick * 1000;
  colony.tick += 1;
  colony.market.changeBps = changeBps;
  if (changeBps) {
    colony.market.price = Math.max(1200, colony.market.price + Math.trunc((colony.market.price * changeBps) / 10000));
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
    const trade = fillBook(member.book, colony.market.price, member.intent, colony.tick, member.id);
    if (trade) colony.trades.unshift(trade);
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
    book: seedBook(),
    overlay: inheritOverlay(champ.overlay),
    ethology: null,
    intent: null,
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
