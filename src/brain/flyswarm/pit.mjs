/**
 * 交易场的 MaleCNS 数据桥（浏览器侧）。
 *
 * 交易场不再跑 24 节点占位反射：这里加载已入库的真实 MaleCNS 感官-运动子图
 * （public/data/malecns-circuit，12,000 节点，同一套 body ID），建内核、绑创世、
 * 逐 tick 走蝇群协议（话语/记忆/聚合），并把内核状态映射成交易场 UI 的形状。
 *
 * 边界声明：
 * - 行情默认纸面游走；可注入只读观测（iff.market-feed/1），audit = SIM。
 * - 会话事件日志每 400 tick 压缩一次（状态与历史根链保持连续，SIM 层允许）。
 * - 持久化只存状态级快照（localStorage），不是完整可重放档案——那是档案功能的事。
 */
import { loadGraph } from "../graph.mjs";
import {
  bindGenesis,
  createKernel,
  settleKernelColony,
  tickKernel,
} from "../kernel.mjs";
import { BrainSession } from "../session.mjs";
import { createRoster, FLYSWARM_POLICY } from "./membership.mjs";
import { createWorld, restoreWorld, saveWorld, stepWorld } from "./world.mjs";
import {
  createProtocolFunds,
  restoreProtocol,
  saveProtocol,
  stepProtocol,
} from "./protocol.mjs";
import {
  createMarketFeed,
  restoreMarket,
  saveMarket,
  stepMarketFeed,
} from "./market.mjs";
import { snapshotBaseline } from "./layers.mjs";
import { clamp, START_PRICE } from "../../swarm.mjs";
import { genomeOf } from "./genome.mjs";
import { phenotypeOf } from "./phenotype.mjs";

export const PIT_MODEL = "iff-pit-colony-v1";
export const PIT_STORE = "iff-pit-colony-v1";
const MANIFEST_URL = "/data/malecns-circuit/manifest.json";
const COOLDOWN_TICKS = 30;
const STIM_TICKS = 12;
const COMPACT_EVERY = 400;

function freshAux(seed) {
  return {
    model: PIT_MODEL,
    seed: seed >>> 0,
    rng: seed >>> 0 || 1,
    lastStimTick: -1_000_000,
    cooldownTicks: COOLDOWN_TICKS,
    stimLog: [],
    prices: [START_PRICE],
    settleAt: FLYSWARM_POLICY.settleEveryTicks,
    pending: null,
    market: createMarketFeed(),
    baseline: null,
  };
}

/** 新建一场纸面实验：加载真实子图 → 内核 → 绑定创世 → 纸面交易世界。 */
export async function createPitSession({
  seed = 20260916,
  graph: injectedGraph = null,
} = {}) {
  const graph = injectedGraph || (await loadGraph(MANIFEST_URL));
  const kernel = createKernel(graph, {
    size: 5,
    seed: seed >>> 0,
    stepsPerTick: 6,
  });
  await bindGenesis(kernel, { seed: seed >>> 0 });
  const aux = freshAux(seed);
  aux.baseline = snapshotBaseline(kernel);
  return {
    graph,
    kernel,
    aux,
    world: createWorld(seed),
    protocol: createProtocolFunds(),
  };
}

/** 状态级快照（localStorage）。不是完整可重放档案。 */
export function savePitSession({ kernel, aux, world, protocol }) {
  return {
    model: PIT_MODEL,
    seed: aux.seed,
    rng: aux.rng,
    lastStimTick: aux.lastStimTick,
    stimLog: aux.stimLog,
    prices: aux.prices,
    settleAt: aux.settleAt,
    tick: kernel.colony.tick,
    marketPrice: kernel.colony.market.price,
    members: kernel.colony.members.map((member) => ({
      id: member.id,
      gen: member.gen,
      parent: member.parent,
      status: member.status,
      state: structuredClone(member.session.state),
      book: structuredClone(member.book),
      overlay: structuredClone(member.overlay),
      genome: structuredClone(member.genome || genomeOf(member)),
    })),
    lineage: structuredClone(kernel.colony.lineage),
    nextId: kernel.colony.nextId,
    roster: kernel.flyswarm.roster.snapshot(),
    world: world ? saveWorld(world) : null,
    protocol: protocol ? saveProtocol(protocol) : null,
    market: saveMarket(aux.market),
    baseline: aux.baseline ? structuredClone(aux.baseline) : null,
  };
}

/** 从状态级快照恢复：重建会话（状态与历史根链连续），名册按快照重建。 */
export async function restorePitSession(
  saved,
  { graph: injectedGraph = null } = {},
) {
  if (saved?.model !== PIT_MODEL) throw new Error("不是交易场 colony 快照");
  const graph = injectedGraph || (await loadGraph(MANIFEST_URL));
  const kernel = createKernel(graph, {
    size: 1,
    seed: saved.seed,
    stepsPerTick: 6,
  });
  kernel.colony.members = saved.members.map((member) => ({
    id: member.id,
    gen: member.gen,
    parent: member.parent,
    status: member.status,
    session: new BrainSession(graph, structuredClone(member.state)),
    book: structuredClone(member.book),
    overlay: structuredClone(member.overlay),
    genome: structuredClone(
      member.genome ||
        genomeOf({
          soulId: member.state?.soulId,
          seed: member.genome?.seed || member.state?.rng,
          id: member.id,
          gen: member.gen,
          parent: member.parent,
        }),
    ),
    ethology: null,
    intent: null,
  }));
  kernel.colony.tick = saved.tick;
  kernel.colony.nextId = saved.nextId;
  kernel.colony.lineage = structuredClone(saved.lineage);
  kernel.colony.market.price = saved.marketPrice;
  const roster = createRoster();
  for (const entry of saved.roster) {
    roster.register({
      soulId: entry.soulId,
      runnerPub: entry.runnerPub,
      tier: entry.tier,
      tick: entry.sinceTick,
    });
    if (entry.status === "retired")
      roster.retire(entry.soulId, entry.retiredTick ?? entry.sinceTick);
  }
  kernel.flyswarm.roster = roster;
  await bindGenesis(kernel, { seed: saved.seed });
  return {
    graph,
    kernel,
    aux: {
      model: PIT_MODEL,
      seed: saved.seed,
      rng: saved.rng,
      lastStimTick: saved.lastStimTick,
      cooldownTicks: COOLDOWN_TICKS,
      stimLog: saved.stimLog,
      prices: saved.prices,
      settleAt: saved.settleAt,
      pending: null,
      market: restoreMarket(saved.market),
      baseline: saved.baseline ? structuredClone(saved.baseline) : null,
    },
    world: restoreWorld(saved.world) || createWorld(saved.seed),
    protocol: restoreProtocol(saved.protocol),
  };
}

/**
 * 打开交易场：有可用快照则恢复，对不上当前连接组时丢掉快照并新开一场。
 * 旧 1,400 节点场存在 localStorage 里时，12k 子图会 DATASET_MISMATCH；
 * 不能把错误停在启动屏上，否则页面只剩暗色空舞台。
 */
export async function bootPitSession({
  seed = 20260916,
  graph: injectedGraph = null,
  store = globalThis.localStorage,
} = {}) {
  let saved = null;
  try {
    const raw = store?.getItem?.(PIT_STORE);
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  if (saved) {
    try {
      return {
        session: await restorePitSession(saved, { graph: injectedGraph }),
        discarded: false,
      };
    } catch (err) {
      console.warn(
        "[pit] snapshot restore failed, starting fresh:",
        err?.message || err,
      );
      try {
        store?.removeItem?.(PIT_STORE);
      } catch {
        /* 私有模式 */
      }
      return {
        session: await createPitSession({ seed, graph: injectedGraph }),
        discarded: true,
      };
    }
  }
  return {
    session: await createPitSession({ seed, graph: injectedGraph }),
    discarded: false,
  };
}

/** 每 COMPACT_EVERY tick 压缩会话事件日志：状态保留，历史根链继续，SIM 层允许。 */
function compactSessions(kernel) {
  for (const member of kernel.colony.members) {
    member.session = new BrainSession(
      kernel.colony.graph,
      structuredClone(member.session.state),
    );
  }
}

/**
 * 单一互斥队列：tick / 刺激 / 结算必须串行。
 * 并发结算与 tick 同时改内核曾造成两类故障：日志 sequence 冲突（LOG_SEQUENCE）
 * 与哈希读到未完成状态（INVALID_OBJECT）。浏览器 1Hz tick、立即结算按钮、
 * 服务端并发请求共用这一把锁；失败不阻塞后续任务。
 */
let pitQueue = Promise.resolve();
export function serializePit(fn) {
  const run = pitQueue.then(fn, fn);
  pitQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 注入感觉（人人可刺激，永不直达下单）：冷却校验同步抛出，状态变更排队执行。 */
export function pulsePit({ kernel, aux }, kind, intensity = 0.6) {
  const tick = kernel.colony.tick;
  if (tick - aux.lastStimTick < aux.cooldownTicks) {
    throw new Error(
      `刺激冷却中，还需 ${aux.cooldownTicks - (tick - aux.lastStimTick)} 秒`,
    );
  }
  const level = clamp(Math.round(Number(intensity) * 100), 15, 100);
  const stim = { food: 0, threat: 0, light: 0 };
  if (kind === "food") stim.food = level;
  else if (kind === "threat") stim.threat = level;
  else if (kind === "light") stim.light = level;
  return serializePit(() => {
    // dark = 全部归零（压低活动），不是第四种细胞。
    aux.pending = { ...stim, intensity: level, by: "paper:pit" };
    aux.lastStimTick = tick;
    aux.stimLog = [{ kind, intensity: level, tick }, ...aux.stimLog].slice(
      0,
      24,
    );
    return aux;
  });
}

/** 旧档案恢复的会话没有协议层：惰性初始化并把水位线对齐当前金库（历史余额不追溯计收）。 */
function ensureProtocol(session) {
  if (session.protocol) return session.protocol;
  session.protocol = createProtocolFunds();
  session.protocol._watermark = {
    feesIn: session.kernel.treasury.feesIn || 0,
    realized: session.kernel.treasury.book?.realized || 0,
  };
  return session.protocol;
}

/** 立即结算（退役/繁衍），同步纸面世界并返回新视图。 */
export function settleNow(session) {
  return serializePit(async () => {
    const result = await settleKernelColony(session.kernel);
    if (result) {
      session.aux.settleAt =
        session.kernel.colony.tick + FLYSWARM_POLICY.settleEveryTicks;
      await stepWorld(session, { settled: result });
    }
    await stepProtocol(ensureProtocol(session), session.kernel.treasury, {
      tick: session.kernel.colony.tick,
      ifsPrice: session.kernel.colony.market.price,
      exits: 0,
    });
    return pitView(session);
  });
}

/**
 * 推进一步：行情游走 → 感觉进适配器 → 蝇群协议一个完整 tick → 纸面世界 → 视图。
 * @param session
 * @param {{ compact?: boolean }} [opts] 服务端完整重放路径传 compact:false，禁止压缩事件日志。
 */
export function stepPit(session, { compact = true } = {}) {
  return serializePit(async () => {
    const { kernel, aux } = session;
    if (!aux.market) aux.market = createMarketFeed();
    if (!aux.baseline) aux.baseline = snapshotBaseline(kernel);
    const prev = kernel.colony.market.price;
    const stepped = stepMarketFeed(aux.market, {
      rng: aux.rng,
      price: prev,
      tick: kernel.colony.tick,
    });
    aux.market = stepped.feed;
    aux.rng = stepped.rng;
    const stimulus = {
      food: aux.pending?.food || 0,
      threat: aux.pending?.threat || 0,
      light: aux.pending?.light || 0,
      changeBps: stepped.changeBps,
      sourceId: stepped.source === "paper-walk" ? "environment" : "market",
      adapter: stepped.source === "paper-walk" ? "environment" : "market",
      by: aux.pending?.by || "paper:pit",
      intensity: aux.pending?.intensity ?? 60,
      assetId: stepped.assetId || stepped.provenance?.assetId || null,
      mid: stepped.mid ?? null,
      quoteSource:
        stepped.provenance?.kind === "aggregator-quote"
          ? "kyberswap"
          : stepped.provenance?.kind === "chain-observation"
            ? "chain"
            : "paper",
      quote: stepped.provenance?.kind === "aggregator-quote" ? "LIVE" : "SIM",
    };
    aux.pending = null;
    await tickKernel(kernel, stimulus);
    const price = kernel.colony.market.price;
    aux.prices = [...aux.prices, price].slice(-96);
    let settled = null;
    if (kernel.colony.tick >= aux.settleAt) {
      settled = await settleKernelColony(kernel);
      aux.settleAt = kernel.colony.tick + FLYSWARM_POLICY.settleEveryTicks;
    }
    if (compact && kernel.colony.tick % COMPACT_EVERY === 0)
      compactSessions(kernel);
    await stepWorld(session, { stimulus, settled });
    await stepProtocol(ensureProtocol(session), kernel.treasury, {
      tick: kernel.colony.tick,
      ifsPrice: kernel.colony.market.price,
      exits: 0,
    });
    return pitView(session);
  });
}

/** 内核 → 交易场 UI 形状（组件不变，数据换源）。 */
export function pitView({ kernel, aux }) {
  const colony = kernel.colony;
  const price = colony.market.price;
  const flies = colony.members.map((member) => ({
    id: member.id,
    gen: member.gen,
    parent: member.parent,
    status: member.status,
    seed: member.genome?.seed || member.session.state.rng,
    fingerprint: (member.genome?.seed || member.session.state.rng)
      .toString(16)
      .padStart(8, "0"),
    bnb: member.book.bnb,
    token: member.book.token,
    costBnb: member.book.costBnb,
    trades: member.book.trades,
    wins: member.book.wins,
    losses: member.book.losses,
    realized: member.book.realized,
    lastSide: member.intent?.side || "HOLD",
    lastConfidence: member.intent?.confidence || 0,
    lastRates: {
      left: member.ethology?.left || 0,
      right: member.ethology?.right || 0,
      buy: member.intent?.side === "BUY" ? 1 : 0,
      sell: member.intent?.side === "SELL" ? 1 : 0,
      hold: member.intent?.side === "HOLD" ? 1 : 0,
    },
    soulId: member.session.state.soulId,
    genome: member.genome || genomeOf(member),
    phenotype: phenotypeOf(member.genome || member),
  }));
  return {
    model: PIT_MODEL,
    seed: aux.seed,
    tick: colony.tick,
    size: flies.length,
    flies,
    market: {
      price,
      prev: aux.prices[aux.prices.length - 2] ?? price,
      delta: 0,
      focusAssetId: aux.market?.last?.payload?.assetId || null,
      quote:
        aux.market?.last?.provenance?.kind === "aggregator-quote" ? "LIVE" : "SIM",
      fill: "SIM",
      lastChangeBps: aux.market?.last?.payload?.changeBps ?? null,
      lastSource: aux.market?.last?.source || null,
    },
    prices: aux.prices,
    stimulus: {
      food: aux.pending?.food || 0,
      threat: aux.pending?.threat || 0,
      light: aux.pending?.light || 0,
    },
    lastStimulusAt: aux.lastStimTick,
    cooldownTicks: aux.cooldownTicks,
    stimuliLog: aux.stimLog,
    cullEvery: FLYSWARM_POLICY.settleEveryTicks,
    nextCullAt: aux.settleAt,
    trades: colony.trades,
    lineage: colony.lineage,
    audit: "SIM",
  };
}
