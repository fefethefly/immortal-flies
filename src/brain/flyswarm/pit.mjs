/**
 * 交易坑的 MaleCNS 数据桥（浏览器侧）。
 *
 * 交易坑不再跑 24 节点占位反射：这里加载已入库的真实 MaleCNS 感官-运动子图
 * （public/data/malecns-circuit，1,400 节点，同一套 body ID），建内核、绑创世、
 * 逐 tick 走蝇群协议（话语/记忆/聚合），并把内核状态映射成交易坑 UI 的形状。
 *
 * 边界声明：
 * - 行情是纸面随机游走（占位，直到接只读行情适配器）；audit = SIM。
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
import { clamp, random32, START_PRICE } from "../../swarm.mjs";

export const PIT_MODEL = "iff-pit-colony-v1";
export const PIT_STORE = "iff-pit-colony-v1";
const MANIFEST_URL = "/data/malecns-circuit/manifest.json";
const COOLDOWN_TICKS = 30;
const STIM_TICKS = 12;
const COMPACT_EVERY = 400;

/** 纸面行情占位：与旧坑同一公式的种子随机游走。不是真实行情。 */
function stepMarket(rng, price) {
  const shock = (rng % 161) - 80;
  const revert = Math.trunc(((START_PRICE - price) * 3) / 100);
  return clamp(price + Math.trunc((price * shock) / 10_000) + revert, 1_200, 220_000);
}

function freshAux(seed) {
  return {
    model: PIT_MODEL,
    seed: seed >>> 0,
    rng: (seed >>> 0) || 1,
    lastStimTick: -1_000_000,
    cooldownTicks: COOLDOWN_TICKS,
    stimLog: [],
    prices: [START_PRICE],
    settleAt: FLYSWARM_POLICY.settleEveryTicks,
    pending: null,
  };
}

/** 新建一场纸面实验：加载真实子图 → 内核 → 绑定创世。 */
export async function createPitSession({ seed = 20260916 } = {}) {
  const graph = await loadGraph(MANIFEST_URL);
  const kernel = createKernel(graph, { size: 5, seed: seed >>> 0, stepsPerTick: 6 });
  await bindGenesis(kernel, { seed: seed >>> 0 });
  return { graph, kernel, aux: freshAux(seed) };
}

/** 状态级快照（localStorage）。不是完整可重放档案。 */
export function savePitSession({ kernel, aux }) {
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
    })),
    lineage: structuredClone(kernel.colony.lineage),
    nextId: kernel.colony.nextId,
    roster: kernel.flyswarm.roster.snapshot(),
  };
}

/** 从状态级快照恢复：重建会话（状态与历史根链连续），名册按快照重建。 */
export async function restorePitSession(saved) {
  if (saved?.model !== PIT_MODEL) throw new Error("不是交易坑 colony 快照");
  const graph = await loadGraph(MANIFEST_URL);
  const kernel = createKernel(graph, { size: 1, seed: saved.seed, stepsPerTick: 6 });
  kernel.colony.members = saved.members.map((member) => ({
    id: member.id,
    gen: member.gen,
    parent: member.parent,
    status: member.status,
    session: new BrainSession(graph, structuredClone(member.state)),
    book: structuredClone(member.book),
    overlay: structuredClone(member.overlay),
    ethology: null,
    intent: null,
  }));
  kernel.colony.tick = saved.tick;
  kernel.colony.nextId = saved.nextId;
  kernel.colony.lineage = structuredClone(saved.lineage);
  kernel.colony.market.price = saved.marketPrice;
  const roster = createRoster();
  for (const entry of saved.roster) {
    roster.register({ soulId: entry.soulId, runnerPub: entry.runnerPub, tier: entry.tier, tick: entry.sinceTick });
    if (entry.status === "retired") roster.retire(entry.soulId, entry.retiredTick ?? entry.sinceTick);
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
    },
  };
}

/** 每 COMPACT_EVERY tick 压缩会话事件日志：状态保留，历史根链继续，SIM 层允许。 */
function compactSessions(kernel) {
  for (const member of kernel.colony.members) {
    member.session = new BrainSession(kernel.colony.graph, structuredClone(member.session.state));
  }
}

/** 注入感觉（人人可刺激，永不直达下单）：只排队进下一 tick 的输入。 */
export function pulsePit({ kernel, aux }, kind, intensity = 0.6) {
  const tick = kernel.colony.tick;
  if (tick - aux.lastStimTick < aux.cooldownTicks) {
    throw new Error(`刺激冷却中，还需 ${aux.cooldownTicks - (tick - aux.lastStimTick)} 秒`);
  }
  const level = clamp(Math.round(Number(intensity) * 100), 15, 100);
  const stim = { food: 0, threat: 0, light: 0 };
  if (kind === "food") stim.food = level;
  else if (kind === "threat") stim.threat = level;
  else if (kind === "light") stim.light = level;
  // dark = 全部归零（压低活动），不是第四种细胞。
  aux.pending = { ...stim, intensity: level, by: "paper:pit" };
  aux.lastStimTick = tick;
  aux.stimLog = [{ kind, intensity: level, tick }, ...aux.stimLog].slice(0, 24);
  return aux;
}

/** 立即结算（退役/繁衍），返回新视图。 */
export async function settleNow(session) {
  const result = await settleKernelColony(session.kernel);
  if (result) {
    session.aux.settleAt = session.kernel.colony.tick + FLYSWARM_POLICY.settleEveryTicks;
  }
  return pitView(session);
}

/** 推进一步：行情游走 → 感觉进适配器 → 蝇群协议一个完整 tick → 视图。 */
export async function stepPit(session) {
  const { kernel, aux } = session;
  const prev = kernel.colony.market.price;
  aux.rng = random32(aux.rng);
  const walked = stepMarket(aux.rng, prev);
  const changeBps = Math.trunc(((walked - prev) * 10_000) / prev);
  const stimulus = {
    food: aux.pending?.food || 0,
    threat: aux.pending?.threat || 0,
    light: aux.pending?.light || 0,
    changeBps,
    sourceId: "environment",
    by: aux.pending?.by || "paper:pit",
    intensity: aux.pending?.intensity ?? 60,
  };
  aux.pending = null;
  await tickKernel(kernel, stimulus);
  const price = kernel.colony.market.price;
  aux.prices = [...aux.prices, price].slice(-96);
  if (kernel.colony.tick >= aux.settleAt) {
    await settleKernelColony(kernel);
    aux.settleAt = kernel.colony.tick + FLYSWARM_POLICY.settleEveryTicks;
  }
  if (kernel.colony.tick % COMPACT_EVERY === 0) compactSessions(kernel);
  return pitView(session);
}

/** 内核 → 交易坑 UI 形状（组件不变，数据换源）。 */
export function pitView({ kernel, aux }) {
  const colony = kernel.colony;
  const price = colony.market.price;
  const flies = colony.members.map((member) => ({
    id: member.id,
    gen: member.gen,
    parent: member.parent,
    status: member.status,
    seed: member.session.state.rng,
    fingerprint: member.session.state.rng.toString(16).padStart(8, "0"),
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
  }));
  return {
    model: PIT_MODEL,
    seed: aux.seed,
    tick: colony.tick,
    size: flies.length,
    flies,
    market: { price, prev: aux.prices[aux.prices.length - 2] ?? price, delta: 0 },
    prices: aux.prices,
    stimulus: { food: aux.pending?.food || 0, threat: aux.pending?.threat || 0, light: aux.pending?.light || 0 },
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
