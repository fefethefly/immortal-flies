/**
 * iff.paper-world/1 —— 交易纸面世界（L2 World 层，浏览器侧）。
 *
 * 交易世界是第一层「世界」，不是内核。它只读 L0/L1（MaleCNS 会话、蝇群协议）
 * 的每一步结果，把行为解释成金融形状：六类事件落场、因果条、蜂巢压力、
 * 成交回执、风险注解、金库快照、IFS 纸面面板与候选计划。
 *
 * 边界声明：
 * - 本文件是解释与观察层：绝不修改 kernel / colony / 会话状态，也不代替内核执行。
 * - 行情与账本来自现有纸面内核；audit = SIM。任何数字都不构成行情、收益或资金承诺。
 * - 候选计划只被校验、不被执行；真正执行路径仍是内核 quorum → vault 端口。
 * - 风控注解（CONCENTRATION / SOCIETY_SPLIT）是纸面审计标记，不撤回已发生的纸面成交。
 * - 用户金库未接入（见 docs/PRODUCT-LATEST.md §11），本视图只披露蜂巢金库纸面快照。
 * - 事件哈希链只保证本世界日志的追加顺序，不证明来源身份或成绩真实性。
 */
import { hash, ZERO_HASH } from "../codec.mjs";
import { FLYSWARM_POLICY } from "./membership.mjs";
import { surplusOf, treasurySnapshot } from "../treasury.mjs";
import { protocolView } from "./protocol.mjs";
import {
  SLIP_BPS,
  TAX_BPS,
  TOKEN_UNIT,
  clamp,
  equityOf,
  random32,
} from "../../swarm.mjs";

export const WORLD_SCHEMA = "iff.paper-world/1";

export const WORLD_POLICY = Object.freeze({
  id: "paper-world-1",
  version: "1",
  /** 活场的六类事件 */
  kinds: Object.freeze(["sense", "act", "memory", "trade", "society", "risk"]),
  maxEvents: 120,
  maxCausal: 64,
  maxReceipts: 120,
  maxPlans: 16,
  maxRejects: 40,
  maxBranches: 6,
  pressureWindow: 96,
  /** 因果链接的最远追溯窗口（tick） */
  causeWindowTicks: 3,
  /** 单蝇仓位占蜂巢权益上限（bps，纸面审计） */
  concentrationCapBps: 3500,
  /** 回撤警戒线（bps） */
  drawdownAlertBps: 1000,
  /** 每只蝇的免费观察额度（纸面信用） */
  creditFree: 1000,
  /** 已实现收益转 Earned Credit 的比例（bps） */
  creditProfitShareBps: 500,
  /** 纸面信用上限 */
  creditCap: 100_000,
});

/** 新建一个空的纸面世界状态。 */
export function createWorld(seed = 20260916) {
  return {
    schema: WORLD_SCHEMA,
    audit: "SIM",
    policy: `${WORLD_POLICY.id}@${WORLD_POLICY.version}`,
    seed: seed >>> 0,
    rng: seed >>> 0 || 1,
    seq: 0,
    lastHash: ZERO_HASH,
    events: [],
    causal: [],
    pressure: [],
    receipts: [],
    rejects: [],
    plans: [],
    branches: [],
    vaultHistory: [],
    prevIntent: {},
    prevDrawdownAlerted: false,
  };
}

/** 事件按追加顺序落账：id 含 tick/序号，哈希链只承诺顺序。 */
async function emit(
  world,
  { tick, kind, flyId = null, side = null, payload = {} },
) {
  world.seq += 1;
  const event = {
    schema: "iff.wevent/1",
    id: `wev-${tick}-${world.seq}`,
    tick,
    seq: world.seq,
    kind,
    flyId,
    side,
    payload,
    prevHash: world.lastHash,
    audit: world.audit,
  };
  event.hash = await hash(event);
  world.lastHash = event.hash;
  world.events.push(event);
  if (world.events.length > WORLD_POLICY.maxEvents) {
    const removed = world.events.slice(
      0,
      world.events.length - WORLD_POLICY.maxEvents,
    );
    const evicted = new Set(removed.map((e) => e.id));
    world.events = world.events.slice(-WORLD_POLICY.maxEvents);
    // 因果条不悬挂指向已被逐出窗口的事件。
    world.causal = world.causal.filter(
      (l) => !l.from.some((id) => evicted.has(id)) && !evicted.has(l.to),
    );
  }
  return event;
}

function addCausal(world, { tick, kind, from, to, note = "" }) {
  if (!from.length || !to) return null;
  world.causal.push({
    schema: "iff.wcausal/1",
    id: `cau-${tick}-${world.causal.length + 1}`,
    tick,
    kind,
    from,
    to,
    note,
    audit: world.audit,
  });
  if (world.causal.length > WORLD_POLICY.maxCausal) {
    world.causal = world.causal.slice(-WORLD_POLICY.maxCausal);
  }
  return world.causal[world.causal.length - 1];
}

/** 最近 N 个 tick 内、指定类别的事件（升序）。 */
export function recentEvents(
  world,
  tick,
  window = WORLD_POLICY.causeWindowTicks,
) {
  return world.events.filter((e) => e.tick >= tick - window && e.tick <= tick);
}

/**
 * 推进纸面世界一步。只读内核：kernel 与本函数互不写入。
 * @param session {kernel, aux, world}
 * @param inputs {stimulus, settled} 本 tick 注入的感觉与结算结果（由 stepPit 提供）
 */
export async function stepWorld(
  session,
  { stimulus = {}, settled = null } = {},
) {
  const { kernel, world } = session;
  const colony = kernel.colony;
  const fs = kernel.flyswarm;
  const tick = colony.tick;
  const price = colony.market.price;
  const window = WORLD_POLICY.causeWindowTicks;
  const fresh = [];
  const windowEvents = recentEvents(world, tick, window + 1);

  // 1) SENSE：外部刺激落场（来源、强度入事件，不进内核语义）。
  const food = stimulus.food || 0;
  const threat = stimulus.threat || 0;
  const light = stimulus.light || 0;
  if (food || threat || light) {
    fresh.push(
      await emit(world, {
        tick,
        kind: "sense",
        payload: {
          by: stimulus.by || "paper:pit",
          intensity: stimulus.intensity ?? 60,
          food,
          threat,
          light,
        },
      }),
    );
  }

  // 2) ACT：行为话语落场（只落「转向」：动作或倾向明显变化，否则场太吵）。
  for (const member of colony.members) {
    if (member.status !== "alive") continue;
    const prev = world.prevIntent[member.id];
    const eth = member.ethology || {};
    const intent = member.intent || { side: "HOLD", confidence: 0 };
    const changed =
      !prev ||
      prev.action !== eth.action ||
      prev.side !== intent.side ||
      Math.abs(prev.confidence - intent.confidence) >= 15;
    if (!changed) continue;
    // 归一化存储：新生/恢复成员的 ethology 可能为 null，undefined 会污染后续事件哈希链。
    world.prevIntent[member.id] = {
      action: eth.action || "REST",
      side: intent.side || "HOLD",
      confidence: intent.confidence || 0,
    };
    const act = await emit(world, {
      tick,
      kind: "act",
      flyId: member.id,
      side: intent.side,
      payload: {
        action: eth.action || "REST",
        confidence: intent.confidence,
        left: eth.left || 0,
        right: eth.right || 0,
        from: prev
          ? { action: prev.action || "REST", side: prev.side || "HOLD" }
          : null,
      },
    });
    fresh.push(act);
    // 转向因果：最近的感觉或该蝇上一笔成交 → 本次行为变化。
    const cause = windowEvents
      .filter((e) => e.tick >= tick - window && e.tick < tick)
      .filter(
        (e) =>
          e.kind === "sense" || (e.kind === "trade" && e.flyId === member.id),
      )
      .slice(-1);
    if (cause.length)
      addCausal(world, {
        tick,
        kind: "act-turn",
        from: [cause[0].id],
        to: act.id,
      });
  }

  // 3) MEMORY：检查点事件（协议每 memoryEveryTicks 写一次经历）。
  if (tick > 0 && tick % FLYSWARM_POLICY.memoryEveryTicks === 0) {
    fresh.push(
      await emit(world, {
        tick,
        kind: "memory",
        payload: { everyTicks: FLYSWARM_POLICY.memoryEveryTicks },
      }),
    );
  }

  // 4) TRADE：本 tick 的纸面成交 → 回执 + 落场。风控注解只标记、不撤回。
  const alive = colony.members.filter((m) => m.status === "alive");
  const hiveEquity =
    alive.reduce((sum, m) => sum + equityOf(m.book, price), 0) || 1;
  let receiptNo = 0;
  for (const trade of colony.trades) {
    if (trade.tick !== tick) break;
    receiptNo += 1;
    const isBuy = trade.side === "BUY";
    const notional = isBuy
      ? trade.amount
      : Math.trunc((trade.contra * 10000) / (10000 - TAX_BPS));
    const taxPaid = isBuy
      ? Math.trunc((trade.amount * TAX_BPS) / 10000)
      : notional - trade.contra;
    const member = colony.members.find((m) => m.id === trade.flyId) || null;
    let verdict = "PASS";
    let verdictNote = "";
    if (member) {
      const value = Math.trunc((member.book.token * price) / TOKEN_UNIT);
      if (value * 10000 > hiveEquity * WORLD_POLICY.concentrationCapBps) {
        verdict = "FLAG";
        verdictNote = "CONCENTRATION";
      }
    }
    const quorum = fs.lastQuorum;
    if (quorum && quorum.tick === tick && quorum.split) {
      verdict = "FLAG";
      verdictNote = "SOCIETY_SPLIT";
    }
    // 因果：行为话语（或感觉）→ 成交。
    const cause = windowEvents
      .filter((e) => e.tick >= tick - window)
      .filter(
        (e) =>
          (e.kind === "act" && e.flyId === trade.flyId) || e.kind === "sense",
      )
      .slice(-1);
    const event = await emit(world, {
      tick,
      kind: "trade",
      flyId: trade.flyId,
      side: trade.side,
      payload: {
        amount: trade.amount,
        contra: trade.contra,
        verdict,
        verdictNote,
      },
    });
    fresh.push(event);
    if (cause.length)
      addCausal(world, {
        tick,
        kind: "fill",
        from: [cause[0].id],
        to: event.id,
      });
    world.receipts.push({
      schema: "iff.receipt/1",
      id: `rcpt-${tick}-${receiptNo}`,
      tick,
      flyId: trade.flyId,
      side: trade.side,
      amount: trade.amount,
      contra: trade.contra,
      notionalBnb: notional,
      slippageBps: SLIP_BPS,
      taxBps: TAX_BPS,
      taxPaid,
      status: "confirmed",
      verdict,
      verdictNote,
      cause: cause.length ? cause[0].id : null,
      audit: world.audit,
    });
    if (world.receipts.length > WORLD_POLICY.maxReceipts) {
      world.receipts = world.receipts.slice(-WORLD_POLICY.maxReceipts);
    }
  }

  // 5) SOCIETY：quorum 聚合结果落场（分裂是特征，不是故障）。
  const quorum = fs.lastQuorum;
  if (quorum && quorum.tick === tick) {
    const qv = interpretQuorum(quorum);
    const society = await emit(world, {
      tick,
      kind: "society",
      side: qv.side,
      payload: {
        quorum: quorum.quorum,
        quorumVersion: quorum.quorumVersion,
        side: qv.side,
        split: quorum.split,
        buyWeight: qv.buyWeight,
        sellWeight: qv.sellWeight,
        holdWeight: qv.holdWeight,
        totalWeight: qv.totalWeight,
      },
    });
    fresh.push(society);
    const votes = world.events
      .filter((e) => e.kind === "act" && e.tick === tick)
      .map((e) => e.id);
    if (votes.length)
      addCausal(world, { tick, kind: "quorum", from: votes, to: society.id });
  }
  if (settled) {
    const spawn = await emit(world, {
      tick,
      kind: "society",
      payload: {
        event: "spawn",
        parent: settled.champ?.id ?? null,
        child: settled.child?.id ?? null,
        culled: settled.worst?.id ?? null,
      },
    });
    fresh.push(spawn);
    // 结算因果：最近的成交（财富重排）→ 繁衍。
    const cause = world.events
      .filter((e) => e.kind === "trade" && e.tick >= tick - window)
      .slice(-1);
    if (cause.length)
      addCausal(world, {
        tick,
        kind: "settle",
        from: [cause[0].id],
        to: spawn.id,
      });
  }

  // 6) 蜂巢压力：quorum 权重压入历史，gauge 只表达压力方向。
  const qv2 = quorum && quorum.tick === tick ? interpretQuorum(quorum) : null;
  const buy = qv2 ? qv2.buyWeight : 0;
  const sell = qv2 ? qv2.sellWeight : 0;
  const hold = qv2 ? qv2.holdWeight : 0;
  const totalW = buy + sell + hold;
  const gauge =
    totalW === 0
      ? 50
      : 50 + clamp(Math.round(((buy - sell) * 50) / totalW), -50, 50);
  world.pressure.push({ tick, buy, sell, hold, gauge });
  if (world.pressure.length > WORLD_POLICY.pressureWindow) {
    world.pressure = world.pressure.slice(-WORLD_POLICY.pressureWindow);
  }

  // 7) RISK：回撤警戒与候选计划校验（计划由 explain 层提出，这里只裁决）。
  const snapshot = treasurySnapshot(kernel.treasury, price);
  const highWater = snapshot.highWater;
  const nav = snapshot.nav;
  const drawdownBps =
    highWater > 0 ? Math.trunc(((highWater - nav) * 10000) / highWater) : 0;
  world.vaultHistory.push({
    tick,
    nav,
    highWater,
    surplus: snapshot.surplus,
    drawdownBps,
  });
  if (world.vaultHistory.length > WORLD_POLICY.pressureWindow) {
    world.vaultHistory = world.vaultHistory.slice(-WORLD_POLICY.pressureWindow);
  }
  if (
    drawdownBps >= WORLD_POLICY.drawdownAlertBps &&
    !world.prevDrawdownAlerted
  ) {
    world.prevDrawdownAlerted = true;
    const alert = await emit(world, {
      tick,
      kind: "risk",
      payload: { alert: "DRAWDOWN", drawdownBps, highWater, nav },
    });
    fresh.push(alert);
    const cause = world.events
      .filter((e) => e.kind === "trade" && e.tick >= tick - window)
      .slice(-2);
    if (cause.length)
      addCausal(world, {
        tick,
        kind: "drawdown",
        from: cause.map((e) => e.id),
        to: alert.id,
      });
    world.rejects.push({
      schema: "iff.reject/1",
      tick,
      kind: "drawdown",
      drawdownBps,
      audit: world.audit,
    });
    if (world.rejects.length > WORLD_POLICY.maxRejects) {
      world.rejects = world.rejects.slice(-WORLD_POLICY.maxRejects);
    }
  } else if (drawdownBps < WORLD_POLICY.drawdownAlertBps) {
    world.prevDrawdownAlerted = false;
  }

  // 8) 候选计划（本地确定性生成器顶替 LLM；校验即拒绝/放行，不执行）。
  validatePlans(session, proposePlans(session));

  return world;
}

/** 纸面信用：免费额度 + 已实现收益份额，减去负债（纸面恒为 0）。SIM。 */
export function creditOf(member) {
  const free = WORLD_POLICY.creditFree;
  const earned = Math.trunc(
    (Math.max(0, member.book.realized) * WORLD_POLICY.creditProfitShareBps) /
      10000,
  );
  const usable = clamp(free + earned, 0, WORLD_POLICY.creditCap);
  return { free, earned, debt: 0, usable };
}

/** 生成候选计划：hive 计划（quorum 方向）+ 最高置信单蝇计划。仅候选，不执行。 */
export function proposePlans(session) {
  const { kernel, world } = session;
  const colony = kernel.colony;
  const fs = kernel.flyswarm;
  const tick = colony.tick;
  const quorum = fs.lastQuorum;
  const qv3 = quorum && quorum.tick === tick ? interpretQuorum(quorum) : null;
  const plans = [];
  if (qv3 && qv3.side !== "HOLD") {
    const cash = kernel.treasury.book.bnb;
    plans.push({
      schema: "iff.plan/1",
      id: `plan-${tick}-hive`,
      tick,
      kind: "hive",
      flyId: null,
      side: qv3.side,
      budget: Math.trunc(cash / 4),
      confidence: Math.trunc(
        (100 * (qv3.side === "BUY" ? qv3.buyWeight : qv3.sellWeight)) /
          Math.max(1, qv3.totalWeight),
      ),
      source: "quorum",
    });
  }
  const alive = colony.members.filter((m) => m.status === "alive");
  const top = alive
    .filter((m) => (m.intent?.confidence || 0) >= 25)
    .sort(
      (a, b) => (b.intent?.confidence || 0) - (a.intent?.confidence || 0),
    )[0];
  if (top) {
    const intent = top.intent;
    plans.push({
      schema: "iff.plan/1",
      id: `plan-${tick}-fly`,
      tick,
      kind: "fly",
      flyId: top.id,
      side: intent.side,
      budget:
        intent.side === "BUY"
          ? Math.trunc((top.book.bnb * intent.confidence * 8) / 1000)
          : Math.trunc((top.book.token * intent.confidence * 8) / 1000),
      confidence: intent.confidence,
      source: "utterance",
    });
  }
  return plans;
}

/** 确定性风控裁决：白名单、额度、分裂门、信用。校验结果写回 world.plans。 */
export function validatePlans(session, plans) {
  const { kernel, world } = session;
  const colony = kernel.colony;
  const fs = kernel.flyswarm;
  const tick = colony.tick;
  const price = colony.market.price;
  const quorum = fs.lastQuorum;
  const alive = colony.members.filter((m) => m.status === "alive");
  const hiveEquity =
    alive.reduce((sum, m) => sum + equityOf(m.book, price), 0) || 1;
  const rows = [];
  for (const plan of plans) {
    const reasons = [];
    const limits = {};
    if (quorum && quorum.tick === tick && quorum.split) {
      reasons.push("SOCIETY_SPLIT");
    }
    if (plan.side !== "BUY" && plan.side !== "SELL") {
      reasons.push("NO_DIRECTION");
    }
    if (plan.kind === "fly") {
      const member = colony.members.find((m) => m.id === plan.flyId);
      if (!member) {
        reasons.push("UNKNOWN_FLY");
      } else {
        const credit = creditOf(member);
        limits.creditUsable = credit.usable;
        limits.cash =
          plan.side === "BUY"
            ? member.book.bnb
            : Math.trunc((member.book.token * price) / TOKEN_UNIT);
        if (plan.budget > limits.cash) reasons.push("CASH_SHORT");
        if (credit.usable <= 0) reasons.push("CREDIT_EMPTY");
        const projected =
          plan.side === "BUY"
            ? Math.trunc(
                ((member.book.token +
                  Math.trunc((plan.budget * TOKEN_UNIT) / price)) *
                  price) /
                  TOKEN_UNIT,
              )
            : Math.trunc((member.book.token * price) / TOKEN_UNIT);
        limits.concentrationBps = Math.trunc((projected * 10000) / hiveEquity);
        if (limits.concentrationBps > WORLD_POLICY.concentrationCapBps)
          reasons.push("CONCENTRATION");
      }
    }
    const status = reasons.length ? "REJECT" : "PASS";
    rows.push({
      ...plan,
      status,
      reasons,
      limits,
      validatedBy: `${WORLD_POLICY.id}@${WORLD_POLICY.version}`,
    });
    if (reasons.length) {
      world.rejects.push({
        schema: "iff.reject/1",
        tick,
        kind: "plan",
        planId: plan.id,
        side: plan.side,
        reasons,
        audit: world.audit,
      });
      if (world.rejects.length > WORLD_POLICY.maxRejects) {
        world.rejects = world.rejects.slice(-WORLD_POLICY.maxRejects);
      }
    }
  }
  world.plans = [...rows, ...world.plans].slice(0, WORLD_POLICY.maxPlans);
  return rows;
}

/** 因果链重放：给定事件，双向收集所有相连因果节点与边，按 tick 排序。 */
export function replayChain(world, eventId) {
  const index = new Map(world.events.map((e) => [e.id, e]));
  if (!index.has(eventId)) return { nodes: [], links: [] };
  const nodeIds = new Set([eventId]);
  const links = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const link of world.causal) {
      const touches =
        link.from.some((id) => nodeIds.has(id)) || nodeIds.has(link.to);
      if (!touches) continue;
      for (const id of [...link.from, link.to]) {
        if (!nodeIds.has(id)) {
          nodeIds.add(id);
          grew = true;
        }
      }
    }
  }
  const nodes = [...nodeIds]
    .map((id) => index.get(id))
    .filter(Boolean)
    .sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  return {
    nodes,
    links: world.causal
      .filter((l) => l.from.every((id) => nodeIds.has(id)) && nodeIds.has(l.to))
      .sort((a, b) => a.tick - b.tick),
  };
}

/** 社会状态：quorum 结果 + 分裂判定，缺席与无 quorum 分开。 */

/**
 * 产品层解释：把 iff.quorum/2 的行为分布读成金融方向。
 * BUY/SELL/HOLD 只在这里出现（TradePort 语义），协议层只表达 approach/retreat/still。
 */
export function interpretQuorum(q) {
  if (!q) return { status: "STALE", side: "HOLD", split: false };
  if (q.schema === "iff.quorum/2") {
    return {
      ...q,
      side:
        q.approachWeight > q.retreatWeight
          ? "BUY"
          : q.retreatWeight > q.approachWeight
            ? "SELL"
            : "HOLD",
      buyWeight: q.approachWeight,
      sellWeight: q.retreatWeight,
      holdWeight: q.stillWeight,
    };
  }
  return { ...q }; // 旧版 /1 已含 side/buyWeight（仅重放路径）
}

export function societyOf(kernel) {
  const fs = kernel.flyswarm;
  const q = fs.lastQuorum;
  const tick = kernel.colony.tick;
  if (!q || q.tick !== tick)
    return { status: "STALE", side: "HOLD", split: false };
  const interpreted = interpretQuorum(q);
  if (interpreted.split) return { status: "SPLIT", ...interpreted };
  if (interpreted.totalWeight === 0)
    return { status: "NO_QUORUM", ...interpreted };
  return { status: "CONSENSUS", ...interpreted };
}

/** 影响边：因果链 + 结算/繁衍事件 → 「谁影响谁」。 */
export function influenceEdges(world, colony) {
  const index = new Map(world.events.map((e) => [e.id, e]));
  const edges = [];
  const seen = new Set();
  for (const link of world.causal) {
    for (const fromId of link.from) {
      const fromEvent = index.get(fromId);
      const toEvent = index.get(link.to);
      if (!fromEvent || !toEvent) continue;
      const fromFly = fromEvent.flyId ?? "world";
      const toFly = toEvent.flyId ?? "hive";
      if (fromFly === toFly) continue;
      const key = `${fromFly}->${toFly}:${link.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: fromFly,
        to: toFly,
        kind: link.kind,
        tick: link.tick,
      });
    }
  }
  return edges.slice(-24);
}

/** 纸面世界 → UI 形状。纯读，无副作用。 */
export function worldView({ kernel, aux, world, protocol }) {
  const colony = kernel.colony;
  const fs = kernel.flyswarm;
  const price = colony.market.price;
  const tick = colony.tick;
  const alive = colony.members.filter((m) => m.status === "alive");
  const hiveEquity =
    alive.reduce((sum, m) => sum + equityOf(m.book, price), 0) || 1;
  const snapshot = treasurySnapshot(kernel.treasury, price);

  const society = societyOf(kernel);
  const pressure = world.pressure[world.pressure.length - 1] || {
    tick,
    buy: 0,
    sell: 0,
    hold: 0,
    gauge: 50,
  };

  const positions = colony.members.map((member) => {
    const equity = equityOf(member.book, price);
    const value = Math.trunc((member.book.token * price) / TOKEN_UNIT);
    return {
      flyId: member.id,
      soulId: member.session.state.soulId,
      gen: member.gen,
      status: member.status,
      bnb: member.book.bnb,
      token: member.book.token,
      costBnb: member.book.costBnb,
      equity,
      value,
      shareBps: Math.trunc((value * 10000) / hiveEquity),
      realized: member.book.realized,
      trades: member.book.trades,
      wins: member.book.wins,
      losses: member.book.losses,
      credit: creditOf(member),
    };
  });

  const intents = alive.map((member) => {
    const prev = world.prevIntent[member.id] || null;
    const eth = member.ethology || {};
    return {
      flyId: member.id,
      soulId: member.session.state.soulId,
      action: eth.action || "REST",
      left: eth.left || 0,
      right: eth.right || 0,
      food: eth.food || 0,
      threat: eth.threat || 0,
      light: eth.light || 0,
      side: member.intent?.side || "HOLD",
      confidence: member.intent?.confidence || 0,
      prevSide: prev?.side || null,
      changed: !prev || prev.side !== (member.intent?.side || "HOLD"),
    };
  });

  const concentration = positions
    .filter((p) => p.status === "alive")
    .sort((a, b) => b.shareBps - a.shareBps);

  const receipts = world.receipts.slice(-60).reverse();
  const stats = {
    fills: world.receipts.length,
    buys: world.receipts.filter((r) => r.side === "BUY").length,
    sells: world.receipts.filter((r) => r.side === "SELL").length,
    buyVol: world.receipts
      .filter((r) => r.side === "BUY")
      .reduce((sum, r) => sum + r.notionalBnb, 0),
    sellVol: world.receipts
      .filter((r) => r.side === "SELL")
      .reduce((sum, r) => sum + r.notionalBnb, 0),
    taxIn: world.receipts.reduce((sum, r) => sum + r.taxPaid, 0),
    flagged: world.receipts.filter((r) => r.verdict !== "PASS").length,
  };

  return {
    schema: WORLD_SCHEMA,
    audit: world.audit,
    policy: world.policy,
    tick,
    seed: world.seed,
    society,
    pressure,
    pressureHistory: world.pressure.slice(-96),
    events: world.events.slice(-60).reverse(),
    causal: world.causal.slice(-24).reverse(),
    influence: influenceEdges(world, colony),
    intents,
    risk: {
      aggregate: {
        equity: hiveEquity,
        cash: alive.reduce((sum, m) => sum + m.book.bnb, 0),
        inventory: Math.trunc(
          (alive.reduce((sum, m) => sum + m.book.token, 0) * price) /
            TOKEN_UNIT,
        ),
      },
      positions,
      concentration,
      concentrationCapBps: WORLD_POLICY.concentrationCapBps,
      liquidityBps: hiveEquity
        ? Math.trunc(
            (alive.reduce((sum, m) => sum + m.book.bnb, 0) * 10000) /
              hiveEquity,
          )
        : 0,
      drawdown: {
        currentBps:
          world.vaultHistory[world.vaultHistory.length - 1]?.drawdownBps ?? 0,
        alertBps: WORLD_POLICY.drawdownAlertBps,
        highWater: snapshot.highWater,
        nav: snapshot.nav,
      },
      rejects: world.rejects.slice(-24).reverse(),
    },
    execution: {
      receipts,
      stats,
      slippageBps: SLIP_BPS,
      taxBps: TAX_BPS,
    },
    vault: {
      user: { connected: false, principal: 0, shares: 0, exits: [] },
      hive: snapshot,
      history: world.vaultHistory.slice(-96),
      policy: {
        feeBps: kernel.treasury.policy.feeBps,
        vaultBps: kernel.treasury.policy.vaultBps,
        reserveBps: kernel.treasury.policy.reserveBps,
        buybackBps: kernel.treasury.policy.buybackBps,
      },
    },
    ifs: {
      paperLocked: 0,
      bondedStakeMin: FLYSWARM_POLICY.bondedStakeMin,
      bondedUnlockTicks: FLYSWARM_POLICY.bondedUnlockTicks,
      venueFeesIn: snapshot.feesIn,
      reserve: snapshot.reserve,
      buyback: {
        budget: snapshot.buybackBudget,
        surplus: snapshot.surplus,
        triggered: snapshot.surplus > 0,
        spent: 0,
      },
    },
    plans: world.plans,
    branches: world.branches,
    protocol: protocol ? protocolView(protocol) : null,
  };
}

/** 状态级快照（localStorage）。世界随 pit session 一起保存。 */
export function saveWorld(world) {
  return structuredClone(world);
}

/** 从快照恢复；老快照没有 world 时由调用方新建。 */
export function restoreWorld(saved) {
  if (!saved || saved.schema !== WORLD_SCHEMA) return null;
  return structuredClone(saved);
}

/** 个人实验分支：复制当前世界与群体账本，不改变主线，也不增加投票权。 */
export function createBranch(session, label = "") {
  const { kernel, world } = session;
  const colony = kernel.colony;
  const branch = {
    schema: "iff.branch/1",
    id: `branch-${colony.tick}-${world.branches.length + 1}`,
    tick: colony.tick,
    label: label || `T${colony.tick}`,
    audit: world.audit,
    snapshot: {
      world: saveWorld(world),
      colony: {
        tick: colony.tick,
        price: colony.market.price,
        members: colony.members.map((m) => ({
          id: m.id,
          status: m.status,
          gen: m.gen,
          book: structuredClone(m.book),
        })),
      },
    },
  };
  world.branches.push(branch);
  if (world.branches.length > WORLD_POLICY.maxBranches) {
    world.branches = world.branches.slice(-WORLD_POLICY.maxBranches);
  }
  return branch;
}

/** 生成器的随机步进（分支、标签等界面用途；不用它驱动内核）。 */
export function worldRandom(world) {
  world.rng = random32(world.rng);
  return world.rng;
}
