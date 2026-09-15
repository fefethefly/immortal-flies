/**
 * iff.explain/1 —— LLM 边界层（P1，浏览器侧，确定性本地实现）。
 *
 * 目标是先把 LLM 的位置钉死：解释、检索、候选计划、工具白名单与策略验证。
 * 当前没有接任何真实 LLM Provider：这里是一个确定性本地解释器，逐字段可复算。
 * 后端接入后只需替换 provider 实现，接口与「不得写入内核 / 不得签名」的边界不变。
 *
 * 边界（对应 docs/PRODUCT-LATEST.md §5.2）：
 * - 本层只读内核与世界，不写 Life Core 状态、不改边权、不伪造 Memory。
 * - 不持有私钥、不签名、不发送交易、不改余额、不提额度。
 * - 输出带来源：解释步骤引用事件 ID 与 tick；策略验证引用参数版本。
 * - LLM 缺席仍可运行：核心社会与交易风控不依赖本文件。
 */
import { FLYSWARM_POLICY } from "./membership.mjs";
import { TREASURY_POLICY } from "../treasury.mjs";
import { WORLD_POLICY, creditOf, replayChain, societyOf } from "./world.mjs";
import { formatBnb } from "../../swarm.mjs";

export const EXPLAINER = Object.freeze({
  schema: "iff.explain/1",
  id: "iff-explain-local",
  version: "1",
  provider: "local-deterministic",
  modelId: "iff-explain-local-v1",
  /** P1 退出条件：模型缺席，解释层降级但不消失。 */
  degraded: true,
});

/**
 * 工具白名单：只有白名单内的只读/候选工具可以被调用。
 * 任何 sign / write / budget 工具都不存在。
 */
export const TOOL_WHITELIST = Object.freeze([
  {
    id: "read-market",
    version: "1",
    titleKey: "tools.market.title",
    scopeKey: "tools.market.scope",
    sign: false,
    write: false,
    budget: false,
  },
  {
    id: "compute-risk",
    version: "1",
    titleKey: "tools.risk.title",
    scopeKey: "tools.risk.scope",
    sign: false,
    write: false,
    budget: false,
  },
  {
    id: "query-world",
    version: "1",
    titleKey: "tools.world.title",
    scopeKey: "tools.world.scope",
    sign: false,
    write: false,
    budget: false,
  },
  {
    id: "draft-report",
    version: "1",
    titleKey: "tools.report.title",
    scopeKey: "tools.report.scope",
    sign: false,
    write: false,
    budget: false,
  },
  {
    id: "propose-plan",
    version: "1",
    titleKey: "tools.plan.title",
    scopeKey: "tools.plan.scope",
    sign: false,
    write: false,
    budget: true,
  },
]);

/** 解释一只蝇「为什么这样动」：行为 → 因果 → 成交，步骤全部带证据引用。 */
export function explainFly(session, flyId) {
  const { kernel, world } = session;
  const colony = kernel.colony;
  const member = colony.members.find((m) => m.id === flyId);
  const steps = [];
  if (!member) {
    return {
      flyId,
      steps: [{ key: "explain.unknown", params: { id: flyId }, refs: [] }],
    };
  }
  const tick = colony.tick;
  const eth = member.ethology || {};
  const intent = member.intent || { side: "HOLD", confidence: 0 };

  // 1) 此刻的行为。
  steps.push({
    key: "explain.act",
    tick,
    params: {
      id: flyId,
      action: eth.action || "REST",
      side: intent.side,
      confidence: intent.confidence,
      left: eth.left || 0,
      right: eth.right || 0,
    },
    refs: world.events
      .filter((e) => e.kind === "act" && e.flyId === flyId)
      .slice(-1)
      .map((e) => e.id),
  });

  // 2) 最近的感觉（3 tick 内）。
  const senses = world.events
    .filter(
      (e) =>
        e.kind === "sense" && e.tick >= tick - WORLD_POLICY.causeWindowTicks,
    )
    .slice(-1);
  if (senses.length) {
    const s = senses[0];
    steps.push({
      key: "explain.sense",
      tick: s.tick,
      params: {
        by: s.payload.by,
        intensity: s.payload.intensity,
        food: s.payload.food,
        threat: s.payload.threat,
        light: s.payload.light,
      },
      refs: [s.id],
    });
  }

  // 3) 最近的成交。
  const fills = world.receipts.filter((r) => r.flyId === flyId).slice(-1);
  if (fills.length) {
    const f = fills[0];
    steps.push({
      key: "explain.fill",
      tick: f.tick,
      params: {
        side: f.side,
        amount: formatBnb(f.side === "BUY" ? f.amount : f.contra),
      },
      refs: [f.id, ...(f.cause ? [f.cause] : [])],
    });
  }

  // 4) 结论：运动方向被端口读成交易方向；置信度是证据强度不是概率。
  steps.push({
    key:
      intent.side === "BUY"
        ? "explain.whyBuy"
        : intent.side === "SELL"
          ? "explain.whySell"
          : "explain.whyHold",
    tick,
    params: { confidence: intent.confidence },
    refs: [],
  });
  return { flyId, steps };
}

/** 检索：确定性匹配事件类别/果蝇/方向。后端可替换为向量检索，接口不变。 */
export function retrieveEvents(
  world,
  { kind = null, flyId = null, tick = null } = {},
) {
  const scored = world.events
    .map((e) => {
      let score = 0;
      if (kind && e.kind === kind) score += 3;
      if (flyId != null && e.flyId === flyId) score += 2;
      if (tick != null && e.tick >= tick - 6 && e.tick <= tick) score += 1;
      return { event: e, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.event.tick - a.event.tick || b.score - a.score)
    .slice(0, 12);
  return scored;
}

/** 策略验证的公开参数（版本化；UI 与重放引用同一组数字）。 */
export function policyCard() {
  return {
    explainer: EXPLAINER,
    society: {
      voteCapPerUtterance: FLYSWARM_POLICY.voteCapPerUtterance,
      voteCapPerRunner: FLYSWARM_POLICY.voteCapPerRunner,
      splitThresholdBps: FLYSWARM_POLICY.splitThresholdBps,
    },
    world: {
      concentrationCapBps: WORLD_POLICY.concentrationCapBps,
      drawdownAlertBps: WORLD_POLICY.drawdownAlertBps,
      creditFree: WORLD_POLICY.creditFree,
      creditProfitShareBps: WORLD_POLICY.creditProfitShareBps,
      creditCap: WORLD_POLICY.creditCap,
    },
    treasury: {
      feeBps: TREASURY_POLICY.feeBps,
      vaultBps: TREASURY_POLICY.vaultBps,
      reserveBps: TREASURY_POLICY.reserveBps,
      buybackBps: TREASURY_POLICY.buybackBps,
    },
  };
}

/** ask 通道的固定问题目录。答案由 answerQuestion 确定性生成，无 LLM。 */
export const QUESTIONS = Object.freeze([
  { id: "q-society", kind: "society" },
  { id: "q-fly", kind: "fly" },
  { id: "q-influence", kind: "influence" },
  { id: "q-flow", kind: "flow" },
  { id: "q-surplus", kind: "surplus" },
  { id: "q-risk", kind: "risk" },
  { id: "q-credit", kind: "credit" },
]);

/**
 * 确定性问答：返回 {key, params, refs}，由 UI 按语言渲染。
 * 不生成结论以外的数字；所有参数都来自当前世界快照。
 */
export function answerQuestion(session, questionId) {
  const { kernel, world } = session;
  const colony = kernel.colony;
  const tick = colony.tick;
  const society = societyOf(kernel);
  const pressure = world.pressure[world.pressure.length - 1] || {
    buy: 0,
    sell: 0,
    hold: 0,
    gauge: 50,
  };
  const receipts = world.receipts;

  if (questionId === "q-society") {
    return {
      key: society.split
        ? "ask.society.split"
        : society.status === "CONSENSUS"
          ? "ask.society.consensus"
          : "ask.society.quiet",
      params: {
        side: society.side,
        status: society.status,
        buy: society.buyWeight,
        sell: society.sellWeight,
        hold: society.holdWeight,
        gauge: pressure.gauge,
      },
      refs: world.events
        .filter((e) => e.kind === "society")
        .slice(-1)
        .map((e) => e.id),
    };
  }

  if (questionId === "q-fly") {
    const alive = colony.members.filter((m) => m.status === "alive");
    const top = alive.sort(
      (a, b) => (b.intent?.confidence || 0) - (a.intent?.confidence || 0),
    )[0];
    if (!top) return { key: "ask.fly.none", params: {}, refs: [] };
    const chain = replayChain(
      world,
      world.events
        .filter((e) => e.kind === "act" && e.flyId === top.id)
        .slice(-1)[0]?.id || "",
    );
    return {
      key: "ask.fly",
      params: {
        id: top.id,
        action: top.ethology?.action || "REST",
        side: top.intent?.side || "HOLD",
        confidence: top.intent?.confidence || 0,
        chain: chain.nodes.length,
      },
      refs: chain.nodes.map((n) => n.id),
    };
  }

  if (questionId === "q-influence") {
    const edges = world.causal.slice(-8);
    return {
      key: edges.length ? "ask.influence" : "ask.influence.none",
      params: { n: edges.length },
      refs: edges.map((l) => l.id),
    };
  }

  if (questionId === "q-flow") {
    const window = world.receipts.filter(
      (r) => r.tick >= tick - WORLD_POLICY.pressureWindow,
    );
    const buys = window.filter((r) => r.side === "BUY").length;
    const sells = window.filter((r) => r.side === "SELL").length;
    const vol = window.reduce((sum, r) => sum + r.notionalBnb, 0);
    return {
      key: "ask.flow",
      params: {
        buys,
        sells,
        vol: formatBnb(vol),
        window: WORLD_POLICY.pressureWindow,
      },
      refs: window.slice(-3).map((r) => r.id),
    };
  }

  if (questionId === "q-surplus") {
    const history = world.vaultHistory[world.vaultHistory.length - 1];
    const ready = Boolean(history && history.surplus > 0);
    return {
      key: ready ? "ask.surplus.ready" : "ask.surplus.idle",
      params: {
        surplus: history ? formatBnb(history.surplus) : "0.0000",
        highWater: history ? formatBnb(history.highWater) : "0.0000",
        nav: history ? formatBnb(history.nav) : "0.0000",
      },
      refs: [],
    };
  }

  if (questionId === "q-risk") {
    const rejects = world.rejects.slice(-8);
    return {
      key: rejects.length ? "ask.risk" : "ask.risk.none",
      params: { n: rejects.length },
      refs: rejects.map((r) => r.planId || `tick:${r.tick}`),
    };
  }

  if (questionId === "q-credit") {
    const alive = colony.members.filter((m) => m.status === "alive");
    const best = alive
      .map((m) => ({ id: m.id, credit: creditOf(m) }))
      .sort((a, b) => b.credit.usable - a.credit.usable)[0];
    if (!best) return { key: "ask.credit.none", params: {}, refs: [] };
    return {
      key: "ask.credit",
      params: {
        id: best.id,
        usable: best.credit.usable,
        free: best.credit.free,
        earned: best.credit.earned,
      },
      refs: [],
    };
  }

  return { key: "ask.unknown", params: {}, refs: [] };
}
