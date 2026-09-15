/**
 * Flyswarm 全局事件日志：era 分片的追加式全序账本。
 *
 * 长期原则（这是「全人类共同参与」的扩展主干）：
 * 1. 全序：append 只接受 tick 不降序的记录；乱序/回退大声拒绝。
 *    同一 tick 内跨来源的顺序由聚合方按 (soulId, sequence) 排序，保证逐位重放。
 * 2. era 分片：每 eraTicks 个 tick 封一个 era，era 根 = hash(prevRoot, entries)。
 *    历史 era 可独立归档、镜像、按需下载；quorum 只读当前 era 窗口，O(窗口) 而非 O(历史)。
 *    实验长到一百年后，账本仍是可验证的哈希链，而不是一个打不开的大文件。
 * 3. 追加即承诺：log 只追加不修改；任何条目一旦进 era，其哈希永不复算。
 * 4. 重放是纯函数：replay(entries, reduce, init) 不依赖任何环境状态。
 */
import { canonical, hash, integer, requireValue } from "../codec.mjs";

export function createLog({ eraTicks = 1000, audit = "SIM" } = {}) {
  integer(eraTicks, 1, 1_000_000, "eraTicks");
  const eras = []; // 已封口: {id, startTick, endTick, count, root, prevRoot}
  let currentId = 0;
  let currentStart = 0;
  let entries = [];
  let lastTick = -1;

  function current() {
    return { id: currentId, startTick: currentStart, endTick: currentStart + eraTicks - 1, count: entries.length };
  }

  /** 追加一条记录。tick 必须不降序；同 tick 内 sequence 必须严格递增。 */
  function append(entry) {
    requireValue(entry && Number.isSafeInteger(entry.tick) && entry.tick >= 0, "LOG_TICK");
    requireValue(entry.tick >= lastTick, "LOG_ORDER", `日志拒绝乱序：tick ${entry.tick} < ${lastTick}`);
    if (entry.tick === lastTick) {
      const prev = entries.length ? entries[entries.length - 1] : null;
      requireValue(!prev || entry.sequence > prev.sequence, "LOG_SEQUENCE", "同 tick 内 sequence 必须递增");
    }
    lastTick = entry.tick;
    entries.push(entry);
    return entry;
  }

  /** 封当前 era：计算根哈希并推进。由调用方在每个 era 边界调用一次。 */
  async function sealEra() {
    if (!entries.length) return null;
    const prevRoot = eras.length ? eras[eras.length - 1].root : `0x${"0".repeat(64)}`;
    const root = await hash({ id: currentId, prevRoot, entries });
    const record = {
      id: currentId,
      startTick: currentStart,
      endTick: entries[entries.length - 1].tick,
      count: entries.length,
      root,
      prevRoot,
    };
    eras.push(record);
    entries = [];
    currentId += 1;
    currentStart = record.endTick + 1;
    lastTick = -1; // 新 era 允许任意起点（分片独立），但 era 内仍强制有序
    return record;
  }

  /** 当前未封口条目的即时根（供快照与验证，不改变状态）。 */
  async function currentRoot() {
    const prevRoot = eras.length ? eras[eras.length - 1].root : `0x${"0".repeat(64)}`;
    return entries.length ? hash({ id: currentId, prevRoot, entries }) : prevRoot;
  }

  function windowEntries(fromTick = 0) {
    return entries.filter((e) => e.tick >= fromTick);
  }

  function snapshot() {
    return {
      audit,
      eraTicks,
      current: current(),
      sealed: eras.map((e) => ({ ...e })),
      currentCount: entries.length,
    };
  }

  return { audit, eraTicks, append, sealEra, current, currentRoot, windowEntries, snapshot, eras };
}

/** 纯函数重放：同一条目序列 + 同一 reduce，任何机器得到同一结果。 */
export function replayEntries(entries, reduce, init) {
  let acc = init;
  for (const entry of entries) acc = reduce(acc, entry);
  return acc;
}

/** 两条日志是否逐位等价（canonical 比较，不依赖字段顺序）。 */
export function sameEntries(a, b) {
  return a.length === b.length && canonical(a) === canonical(b);
}
