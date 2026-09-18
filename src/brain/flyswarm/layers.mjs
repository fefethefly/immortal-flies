/**
 * iff.paper-layers/1 —— P2 交易纸面世界分层视图（只读）。
 *
 * Colony / Intent / Risk / Execution 分开，避免把原生行为说成下单。
 * 基线是买持（起始现金+库存按现价计价），不是收益承诺。
 */
import { equityOf, SLIP_BPS, START_PRICE, TAX_BPS, TOKEN_UNIT } from "../../swarm.mjs";
import { marketView } from "./market.mjs";
import { worldView } from "./world.mjs";

export const LAYERS_SCHEMA = "iff.paper-layers/1";
export const LAYER_IDS = Object.freeze(["colony", "intent", "risk", "execution", "market", "baseline"]);

export function snapshotBaseline(kernel) {
  const price = kernel.colony.market.price || START_PRICE;
  const alive = kernel.colony.members.filter((m) => m.status === "alive");
  return {
    schema: "iff.baseline/1",
    kind: "buy-and-hold",
    tick: kernel.colony.tick,
    startPrice: price,
    startCash: alive.reduce((sum, m) => sum + m.book.bnb, 0),
    startToken: alive.reduce((sum, m) => sum + m.book.token, 0),
    startEquity: alive.reduce((sum, m) => sum + equityOf(m.book, price), 0),
  };
}

export function compareBaseline(session) {
  const { kernel, aux } = session;
  const view = worldView(session);
  const seed = aux.baseline || snapshotBaseline(kernel);
  const price = kernel.colony.market.price;
  const holdEquity = seed.startCash + Math.trunc((seed.startToken * price) / TOKEN_UNIT);
  const colonyEquity = view.risk.aggregate.equity;
  const delta = colonyEquity - holdEquity;
  const deltaBps = holdEquity ? Math.trunc((delta * 10000) / holdEquity) : 0;
  return {
    schema: "iff.baseline/1",
    kind: seed.kind,
    audit: "SIM",
    start: seed,
    now: {
      tick: kernel.colony.tick,
      price,
      colonyEquity,
      holdEquity,
      delta,
      deltaBps,
    },
    note: "Buy-and-hold values starting cash+inventory at the current paper price. Not a return promise.",
  };
}

export function transparencyOf(session) {
  const view = worldView(session);
  const baseline = compareBaseline(session);
  const stats = view.execution.stats;
  const slipPaid = Math.trunc(((stats.buyVol + stats.sellVol) * SLIP_BPS) / 10000);
  const taxPaid = stats.taxIn;
  return {
    schema: "iff.transparency/1",
    audit: "SIM",
    netCost: {
      taxPaid,
      slipEstimate: slipPaid,
      total: taxPaid + slipPaid,
      taxBps: TAX_BPS,
      slippageBps: SLIP_BPS,
    },
    failures: {
      planRejects: view.risk.rejects.filter((r) => r.kind === "plan").length,
      flaggedFills: stats.flagged,
      riskAlerts: view.risk.rejects.filter((r) => r.kind !== "plan").length,
    },
    drawdown: view.risk.drawdown,
    vsBaseline: {
      kind: baseline.kind,
      delta: baseline.now.delta,
      deltaBps: baseline.now.deltaBps,
    },
  };
}

/** 完整 P2 视图。纯读。 */
export function paperLayers(session, { venue = null } = {}) {
  const view = worldView(session);
  const market = marketView(session.aux.market, { ...session, venue });
  const baseline = compareBaseline(session);
  return {
    schema: LAYERS_SCHEMA,
    audit: "SIM",
    quote: market.quote,
    fill: "SIM",
    tick: view.tick,
    seed: view.seed,
    colony: {
      society: view.society,
      pressure: view.pressure,
      pressureHistory: view.pressureHistory,
      influence: view.influence,
      events: view.events,
      causal: view.causal,
    },
    intent: {
      intents: view.intents,
      plans: view.plans,
      note: "Trade-port interpretation of ACT. Native language stays REST/FORAGE/AVOID/EXPLORE.",
    },
    risk: view.risk,
    execution: {
      ...view.execution,
      quote: market.quote,
      fill: "SIM",
      note: market.quote === "LIVE"
        ? "Quotes from KyberSwap; fills remain paper SIM."
        : view.execution.note || "Paper fills marked SIM.",
    },
    market,
    baseline,
    transparency: transparencyOf(session),
    vault: view.vault,
    ifs: view.ifs,
  };
}

export function paperLayer(session, layer, opts = {}) {
  const id = String(layer || "");
  if (!LAYER_IDS.includes(id)) return null;
  const all = paperLayers(session, opts);
  return { schema: LAYERS_SCHEMA, layer: id, audit: "SIM", tick: all.tick, [id]: all[id] };
}
