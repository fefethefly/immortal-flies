import { bookOf } from "../swarm.mjs";
import { createAdapters } from "./adapters.mjs";
import { CANON } from "./canon.mjs";
import { colonySnapshot, createColony, settleColony, tickColony } from "./colony.mjs";
import { applyOutcome, createOverlay, outcomeOf } from "./learn.mjs";
import { createPorts, decodePort } from "./ports.mjs";
import { createRegistry } from "./registry.mjs";
import {
  collectVenueFee,
  createTreasury,
  injectCapital,
  realizeSurplus,
  redeemCapital,
  tradeHive,
  treasurySnapshot,
} from "./treasury.mjs";
import { hash, ZERO_HASH } from "./codec.mjs";
import {
  buildGenesis,
  createLog,
  createQuorums,
  createRoster,
  createSchemas,
  genesisIdOf,
  validateRecord,
  FLYSWARM_POLICY,
} from "./flyswarm/index.mjs";

/**
 * One organism, one swarm protocol.
 * Registries are the only place new capability is added; MaleCNS identity never
 * forks when a port, adapter, learner, or flyswarm record type appears.
 *
 * flyswarm 命名空间 = 开放群体层（V8）：
 *   roster    灵魂名册（guest/bonded，一公钥一灵魂）
 *   log       era 分片全序日志（话语/记忆/感觉/聚合全部落账）
 *   quorums   话语 → 群体动作的规则注册表（默认 confidence-hold）
 *   genesis   创世母体（内容寻址，经 bindGenesis 显式绑定）
 */
export function createKernel(graph, { size = 5, seed = 43, stepsPerTick = 6, adapters, ports, learners, flyswarm = {} } = {}) {
  const colony = createColony(graph, { size, seed, stepsPerTick });
  const roster = createRoster(FLYSWARM_POLICY);
  colony.members.forEach((member, i) => {
    roster.register({ soulId: member.session.state.soulId, runnerPub: `paper:${i}`, tier: "bonded", tick: 0 });
  });
  return {
    schema: "iff.kernel/1",
    canon: CANON.dataset,
    adapters: adapters || createAdapters(),
    ports: ports || createPorts(),
    learners: learners || createRegistry("learner", [
      { id: "outcome-gain", version: "1", title: "结果增益", apply: applyOutcome },
    ]),
    colony,
    treasury: createTreasury(),
    enabledPorts: ["trade", "vault"],
    flyswarm: {
      enabled: flyswarm.enabled !== false,
      audit: "SIM",
      policy: FLYSWARM_POLICY,
      schemas: createSchemas(),
      quorums: createQuorums(),
      roster,
      log: createLog({ eraTicks: FLYSWARM_POLICY.eraTicks, audit: "SIM" }),
      genesis: null,
      genesisId: null,
      tickSeq: 0,
      soulPrev: new Map(), // soulId -> 上一话语/记忆哈希（逐魂哈希链）
      lastSenseHash: ZERO_HASH,
      lastQuorum: null,
    },
  };
}

/** 显式绑定创世母体：genesisId 一旦算出即对外发布，加入方凭它校验自己复制的是同一只母体。 */
export async function bindGenesis(kernel, { overlayHash, soulId = "genesis-0", seed = kernel.colony.seed, audit = "SIM" } = {}) {
  const overlay = overlayHash || (await hash(createOverlay()));
  const genesis = await buildGenesis({ graph: kernel.colony.graph, overlayHash: overlay, soulId, seed, audit });
  const genesisId = await genesisIdOf(genesis);
  kernel.flyswarm.genesis = genesis;
  kernel.flyswarm.genesisId = genesisId;
  return { genesis, genesisId };
}

/** 把一条记录编上本 tick 内的日志序号并落账（全序：tick 不降序、sequence 递增）。 */
function appendRecord(fs, entry) {
  fs.tickSeq += 1;
  entry.sequence = fs.tickSeq;
  validateRecord(fs.schemas, entry);
  fs.log.append(entry);
  return entry;
}

export async function tickKernel(kernel, stimulus = {}, clock = 1_700_000_000_000) {
  const before = kernel.colony.members.map((member) => member.book.realized);
  await tickColony(kernel.colony, stimulus, clock);
  const price = kernel.colony.market.price;
  const learner = kernel.learners.get("outcome-gain", "1");
  kernel.colony.members.forEach((member, i) => {
    const trade = kernel.colony.trades.find((row) => row.tick === kernel.colony.tick && row.flyId === member.id);
    const pnl = outcomeOf(trade, before[i], member.book.realized);
    if (learner && pnl) member.overlay = learner.apply(member.overlay, { action: member.ethology?.action, pnl });
  });

  const fs = kernel.flyswarm;
  const tick = kernel.colony.tick;
  if (fs.enabled) {
    fs.tickSeq = 0;

    // 1) 感觉注入进日志：带来源身份，永不直接下单。
    const keys = ["food", "threat", "light"];
    if (keys.some((k) => (stimulus[k] || 0) !== 0)) {
      const sense = appendRecord(fs, {
        schema: "iff.sense/1",
        audit: fs.audit,
        sourceId: stimulus.sourceId || "environment",
        adapter: stimulus.adapter || "environment",
        adapterVersion: "1",
        by: stimulus.by || "paper:operator",
        intensity: stimulus.intensity ?? 60,
        tick,
        sequence: 0,
        observedAt: clock + tick * 1000,
        expiresAt: clock + tick * 1000 + 60_000,
        payload: {
          food: stimulus.food || 0,
          threat: stimulus.threat || 0,
          light: stimulus.light || 0,
        },
      });
      fs.lastSenseHash = await hash(sense);
    }

    // 2) 每只在册成员发一条行为话语（ethology + 产品层 side/confidence）。
    for (const member of kernel.colony.members) {
      if (member.status !== "alive") continue;
      const soulId = member.session.state.soulId;
      const rosterEntry = fs.roster.get(soulId);
      const utterance = appendRecord(fs, {
        schema: "iff.utterance/1",
        audit: fs.audit,
        soulId,
        runnerPub: rosterEntry?.runnerPub || `paper:${member.id}`,
        tick,
        sequence: 0,
        dataset: CANON.dataset,
        ethology: {
          schema: "iff.ethology/1",
          action: member.ethology?.action || "REST",
          food: member.ethology?.food || 0,
          threat: member.ethology?.threat || 0,
          light: member.ethology?.light || 0,
          left: member.ethology?.left || 0,
          right: member.ethology?.right || 0,
        },
        side: member.intent?.side || "HOLD",
        confidence: member.intent?.confidence || 0,
        prevHash: fs.soulPrev.get(soulId) || ZERO_HASH,
      });
      fs.soulPrev.set(soulId, await hash(utterance));
    }

    // 3) 记忆：每 memoryEveryTicks 写一条经历（检查点 + 根哈希，可下载重放）。
    if (tick > 0 && tick % fs.policy.memoryEveryTicks === 0) {
      for (const member of kernel.colony.members) {
        if (member.status !== "alive") continue;
        const soulId = member.session.state.soulId;
        const rosterEntry = fs.roster.get(soulId);
        const experience = appendRecord(fs, {
          schema: "iff.experience/1",
          audit: fs.audit,
          soulId,
          runnerPub: rosterEntry?.runnerPub || `paper:${member.id}`,
          tick,
          sequence: 0,
          checkpointHash: await hash(member.session.state),
          eventRoot: member.session.state.historyRoot,
          overlayHash: await hash(member.overlay),
          inputBatchRoot: fs.lastSenseHash,
          prevHash: fs.soulPrev.get(soulId) || ZERO_HASH,
        });
        fs.soulPrev.set(soulId, await hash(experience));
      }
    }

    // 4) 聚合：confidence-hold 把本 tick 话语聚成群体动作，结果同样落账。
    const quorum = fs.quorums.require("confidence-hold", "1");
    const record = quorum.run({
      roster: fs.roster,
      utterances: fs.log.windowEntries(tick),
      tick,
      policy: fs.policy,
      era: fs.log.current().id,
      audit: fs.audit,
    });
    appendRecord(fs, record);
    fs.lastQuorum = record;

    // 5) 蜂巢账本按公开规则下单：quorum side 回读成聚合 ethology，仍走 vault 端口。
    if (kernel.enabledPorts.includes("vault")) {
      const q = record;
      const aggregate = {
        schema: "iff.ethology/1",
        action: q.side === "BUY" ? "FORAGE" : q.side === "SELL" ? "AVOID" : "REST",
        food: q.buyWeight,
        threat: q.sellWeight,
        light: 0,
        left: q.buyWeight,
        right: q.sellWeight,
        dataset: CANON.dataset,
      };
      const intent = decodePort(kernel.ports, "vault", "1", aggregate, {
        book: bookOf({ ...kernel.treasury.book }, price),
      });
      const hiveTrade = tradeHive(kernel.treasury, intent, price, tick);
      if (hiveTrade) kernel.colony.trades.unshift({ ...hiveTrade, flyId: "hive", quorumSide: q.side, split: q.split });
    }

    // 6) era 边界封口：把当前分片铸成哈希根，历史可独立归档镜像。
    if (tick > 0 && tick % fs.policy.eraTicks === 0) await fs.log.sealEra();
  }

  return kernel;
}

export function recordVenue(kernel, notional) {
  return collectVenueFee(kernel.treasury, notional);
}

export function admitCapital(kernel, amount, owner) {
  return injectCapital(kernel.treasury, amount, owner, kernel.colony.market.price);
}

export function withdrawCapital(kernel, shares, owner) {
  return redeemCapital(kernel.treasury, shares, owner, kernel.colony.market.price);
}

export function harvestSurplus(kernel) {
  return realizeSurplus(kernel.treasury, kernel.colony.market.price);
}

/**
 * 结算：最弱退役（灵魂不删，名册追加 Retired）、冠军繁衍（子代从检查点分叉）。
 * 同步名册并把 iff.spawn/1 写进日志 —— 繁殖是协议事件，不是 UI 按钮。
 */
export async function settleKernelColony(kernel) {
  const result = settleColony(kernel.colony);
  if (!result) return null;
  const fs = kernel.flyswarm;
  fs.roster.retire(result.worst.session.state.soulId, kernel.colony.tick);
  fs.roster.register({
    soulId: result.child.session.state.soulId,
    runnerPub: `paper:${result.child.id}`,
    tier: "bonded",
    tick: kernel.colony.tick,
  });
  const spawn = appendRecord(fs, {
    schema: "iff.spawn/1",
    audit: fs.audit,
    tick: kernel.colony.tick,
    parentSoul: result.champ.session.state.soulId,
    parentCheckpoint: await hash(result.champ.session.state),
    childSoul: result.child.session.state.soulId,
    childSeed: result.childSeed,
    inheritBias: true,
    mutateRoot: await hash({ childSeed: result.childSeed, parentSeed: result.champ.session.state.rng }),
    spawnedAt: kernel.colony.tick,
  });
  return { ...result, spawn };
}

export function kernelSnapshot(kernel) {
  const fs = kernel.flyswarm;
  return {
    schema: kernel.schema,
    canon: kernel.canon,
    ports: kernel.ports.keys(),
    adapters: [...kernel.adapters.keys()],
    learners: kernel.learners.keys(),
    enabledPorts: kernel.enabledPorts,
    colony: colonySnapshot(kernel.colony),
    treasury: treasurySnapshot(kernel.treasury, kernel.colony.market.price),
    overlays: kernel.colony.members.map((member) => ({
      id: member.id,
      updates: member.overlay?.updates || 0,
      food: member.overlay?.food || 100,
      threat: member.overlay?.threat || 100,
    })),
    flyswarm: {
      enabled: fs.enabled,
      audit: fs.audit,
      policy: `${fs.policy.id}@${fs.policy.version}`,
      genesisId: fs.genesisId,
      roster: fs.roster.snapshot(),
      log: fs.log.snapshot(),
      lastQuorum: fs.lastQuorum,
      soulHashes: Object.fromEntries(fs.soulPrev),
    },
  };
}
