/**
 * iff.quorum/confidence-hold/1 —— 把话语聚合成群体动作的公开规则。
 *
 * 长期原则：
 * 1. 纯函数：同一 roster + 同一批 utterance + 同一 tick，任何机器得到逐位相同的结果。
 * 2. 可复算，不叫最优：Condorcet 陪审团定理要求成员独立；同创世同输入会破坏独立性，
 *    所以买压卖压同时越线时必须停手（HOLD）并记下反对票 —— 分裂不是 bug，是特征。
 * 3. 票权有成本：guest 旁听（默认 0 票），bonded 按置信封顶 + 每运行器合计封顶。
 * 4. 规则只能换版本，不能暗改；默认规则写死在这里，新 quorum = 注册新版本。
 */
import { createRegistry } from "../registry.mjs";
import { integer, requireValue } from "../codec.mjs";
import { DATASET_CANON } from "./schemas.mjs";
import { FLYSWARM_POLICY, utteranceWeight } from "./membership.mjs";

/** 话语 side（产品层）→ 压力池。REST/EXPLORE 与 HOLD 是弃权：零置信不加权重。 */
const POOL = Object.freeze({ BUY: "buy", SELL: "sell", HOLD: "hold" });

export const QUORUM_CONFIDENCE_HOLD = Object.freeze({
  id: "confidence-hold",
  version: "1",
  title: "置信封顶多数，分裂即观望",
  /**
   * @param roster    createRoster() 的实例
   * @param utterances 本 tick 的 iff.utterance/1 记录（可含历史，按 tick 过滤）
   * @param tick      聚合哪一步
   * @param policy    可调参数（默认 FLYSWARM_POLICY）
   * @param era       日志 era 编号（写入记录，便于分片检索）
   * @returns iff.quorum/1 记录
   */
  run({
    roster,
    utterances,
    tick,
    policy = FLYSWARM_POLICY,
    era = 0,
    audit = "SIM",
  }) {
    integer(tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    requireValue(roster && typeof roster.get === "function", "QUORUM_ROSTER");
    requireValue(Array.isArray(utterances), "QUORUM_UTTERANCES");

    // 1) 只计本步、官方 dataset、在册活跃成员；排序固定逐位重放的聚合顺序。
    const valid = utterances
      .filter((u) => u.tick === tick && u.dataset === DATASET_CANON)
      .sort((a, b) =>
        a.soulId === b.soulId
          ? a.sequence - b.sequence
          : a.soulId < b.soulId
            ? -1
            : 1,
      );

    // 2) 票权：置信封顶（单票）+ 运行器封顶（合计）+ guest 折扣。
    const runnerSums = new Map();
    const votes = [];
    for (const u of valid) {
      const base = utteranceWeight(roster, u, policy);
      if (base <= 0) continue;
      const used = runnerSums.get(u.runnerPub) || 0;
      const capped = Math.min(
        base,
        Math.max(0, policy.voteCapPerRunner - used),
      );
      runnerSums.set(u.runnerPub, used + capped);
      votes.push({ soulId: u.soulId, side: u.side, weight: capped });
    }

    // 3) 压池：弃权（HOLD / 0 置信）不计入总权重，天然弃权。
    let buy = 0,
      sell = 0,
      hold = 0;
    for (const v of votes) {
      if (v.weight <= 0) continue;
      if (POOL[v.side] === "buy") buy += v.weight;
      else if (POOL[v.side] === "sell") sell += v.weight;
      else hold += v.weight;
    }
    const total = buy + sell + hold;

    // 4) 分裂门：买压与卖压同时超过总权重 threshold，停手并记反对票。
    let side = "HOLD";
    let split = false;
    const dissents = [];
    if (total > 0) {
      const buyOver = buy * 10000 > policy.splitThresholdBps * total;
      const sellOver = sell * 10000 > policy.splitThresholdBps * total;
      if (buyOver && sellOver) {
        split = true;
        dissents.push(
          ...votes.map((v) => ({
            soulId: v.soulId,
            side: v.side,
            weight: v.weight,
          })),
        );
      } else if (buy > sell && buy > hold) {
        side = "BUY";
        dissents.push(
          ...votes
            .filter((v) => v.side !== "BUY")
            .map((v) => ({ soulId: v.soulId, side: v.side, weight: v.weight })),
        );
      } else if (sell > buy && sell > hold) {
        side = "SELL";
        dissents.push(
          ...votes
            .filter((v) => v.side !== "SELL")
            .map((v) => ({ soulId: v.soulId, side: v.side, weight: v.weight })),
        );
      } else {
        side = "HOLD";
        dissents.push(
          ...votes.map((v) => ({
            soulId: v.soulId,
            side: v.side,
            weight: v.weight,
          })),
        );
      }
    }

    return {
      schema: "iff.quorum/1",
      audit,
      quorum: QUORUM_CONFIDENCE_HOLD.id,
      quorumVersion: QUORUM_CONFIDENCE_HOLD.version,
      tick,
      era,
      buyWeight: buy,
      sellWeight: sell,
      holdWeight: hold,
      totalWeight: total,
      side,
      split,
      dissents,
    };
  },
});

/**
 * QUORUM_CONFIDENCE_HOLD_V2 —— 行为聚合（当前版）。
 * 与 v1 的区别：输入话语只含原生 ethology，按趋近（left）/退避（right）压池，
 * 票权 = 行为强度（left+right）封顶；聚合结果不含 BUY/SELL/HOLD。
 * 金融方向由 TradePort 在聚合之后解释，不在协议层出现。
 */
export const QUORUM_CONFIDENCE_HOLD_V2 = Object.freeze({
  id: "confidence-hold",
  version: "2",
  title: "行为强度封顶多数，分裂即观望",
  run({
    roster,
    utterances,
    tick,
    policy = FLYSWARM_POLICY,
    era = 0,
    audit = "SIM",
  }) {
    integer(tick, 0, Number.MAX_SAFE_INTEGER, "tick");
    requireValue(roster && typeof roster.get === "function", "QUORUM_ROSTER");
    requireValue(Array.isArray(utterances), "QUORUM_UTTERANCES");

    const valid = utterances
      .filter(
        (u) =>
          u.tick === tick &&
          u.dataset === DATASET_CANON &&
          u.schema === "iff.utterance/2",
      )
      .sort((a, b) =>
        a.soulId === b.soulId
          ? a.sequence - b.sequence
          : a.soulId < b.soulId
            ? -1
            : 1,
      );

    const runnerSums = new Map();
    const votes = [];
    for (const u of valid) {
      const base = utteranceWeight(roster, u, policy);
      if (base <= 0) continue;
      const used = runnerSums.get(u.runnerPub) || 0;
      const capped = Math.min(
        base,
        Math.max(0, policy.voteCapPerRunner - used),
      );
      runnerSums.set(u.runnerPub, used + capped);
      const left = u.ethology.left || 0;
      const right = u.ethology.right || 0;
      const direction =
        left > right ? "approach" : right > left ? "retreat" : "still";
      votes.push({ soulId: u.soulId, direction, weight: capped });
    }

    let approach = 0;
    let retreat = 0;
    let still = 0;
    for (const v of votes) {
      if (v.weight <= 0) continue;
      if (v.direction === "approach") approach += v.weight;
      else if (v.direction === "retreat") retreat += v.weight;
      else still += v.weight;
    }
    const total = approach + retreat + still;

    let split = false;
    const dissents = [];
    if (total > 0) {
      const approachOver = approach * 10000 > policy.splitThresholdBps * total;
      const retreatOver = retreat * 10000 > policy.splitThresholdBps * total;
      if (approachOver && retreatOver) {
        split = true;
        dissents.push(
          ...votes.map((v) => ({
            soulId: v.soulId,
            direction: v.direction,
            weight: v.weight,
          })),
        );
      } else if (approach > retreat) {
        dissents.push(
          ...votes
            .filter((v) => v.direction !== "approach")
            .map((v) => ({
              soulId: v.soulId,
              direction: v.direction,
              weight: v.weight,
            })),
        );
      } else if (retreat > approach) {
        dissents.push(
          ...votes
            .filter((v) => v.direction !== "retreat")
            .map((v) => ({
              soulId: v.soulId,
              direction: v.direction,
              weight: v.weight,
            })),
        );
      }
    }

    return {
      schema: "iff.quorum/2",
      audit,
      quorum: QUORUM_CONFIDENCE_HOLD_V2.id,
      quorumVersion: QUORUM_CONFIDENCE_HOLD_V2.version,
      tick,
      era,
      approachWeight: approach,
      retreatWeight: retreat,
      stillWeight: still,
      totalWeight: total,
      split,
      dissents,
    };
  },
});

export function createQuorums(additional = []) {
  return createRegistry("quorum", [
    QUORUM_CONFIDENCE_HOLD,
    QUORUM_CONFIDENCE_HOLD_V2,
    ...additional,
  ]);
}
