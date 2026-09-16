/**
 * iff.mesh/1 —— 蝇群托管网（运行时覆盖层，不是连接组）。
 *
 * 官方 MaleCNS body ID、边权、神经元计数不可改写。用户接入只登记节点
 * 与分片覆盖：成为网络的一部分 = 托管官方图的一片，不是把自己写成新神经元。
 *
 * 首页只读 meshView()：分区 / 节点 / 覆盖率。16 万电位留在连接组页。
 * 本文件不导入钱包、LLM、DEX 或网页组件。
 */
import { identifier, integer, requireValue } from "../codec.mjs";
import { DATASET_CANON, isRunner } from "./schemas.mjs";

export const MESH_SCHEMA = "iff.mesh/1";
export const OFFICIAL_NEURONS = 166_700;
export const SUBGRAPH_NEURONS = 1_400;
export const STALE_TICKS = 2_000;

/** 协议分区：托管覆盖切片，不是新的官方胞体普查。五块感官-运动 = 现有 1,400 子图。 */
export const MESH_REGIONS = Object.freeze([
  Object.freeze({
    id: "sensory.food",
    officialCount: 280,
    kind: "subgraph",
  }),
  Object.freeze({
    id: "sensory.threat",
    officialCount: 280,
    kind: "subgraph",
  }),
  Object.freeze({
    id: "sensory.light",
    officialCount: 280,
    kind: "subgraph",
  }),
  Object.freeze({ id: "motor.left", officialCount: 280, kind: "subgraph" }),
  Object.freeze({ id: "motor.right", officialCount: 280, kind: "subgraph" }),
  Object.freeze({ id: "inter.core", officialCount: 165_300, kind: "full" }),
]);

export const INTER_SHARD_COUNT = 6;
export const PROTOCOL_NODE_ID = "node-protocol";
export const PROTOCOL_SOUL = "soul-protocol";
export const PROTOCOL_RUNNER = "paper:protocol";

const REGION_SUM = MESH_REGIONS.reduce((sum, row) => sum + row.officialCount, 0);
if (REGION_SUM !== OFFICIAL_NEURONS) {
  throw new Error("mesh region census must equal official MaleCNS count");
}

export function createMesh({ audit = "SIM" } = {}) {
  const regions = MESH_REGIONS.map((row) => ({
    id: row.id,
    kind: row.kind,
    officialCount: row.officialCount,
  }));
  const shards = [];
  let nextShard = 1;
  const protocolShards = [];
  for (const region of regions) {
    if (region.kind === "subgraph") {
      const id = `shard-${nextShard}`;
      nextShard += 1;
      shards.push({
        id,
        regionId: region.id,
        officialCount: region.officialCount,
        status: "LIVE",
        assignedNode: PROTOCOL_NODE_ID,
        sinceTick: 0,
      });
      protocolShards.push(id);
      continue;
    }
    const size = region.officialCount / INTER_SHARD_COUNT;
    integer(size, 1, Number.MAX_SAFE_INTEGER, "inter shard size");
    for (let i = 0; i < INTER_SHARD_COUNT; i += 1) {
      shards.push({
        id: `shard-${nextShard}`,
        regionId: region.id,
        officialCount: size,
        status: "EMPTY",
        assignedNode: null,
        sinceTick: 0,
      });
      nextShard += 1;
    }
  }
  return {
    schema: MESH_SCHEMA,
    audit,
    dataset: DATASET_CANON,
    officialNeurons: OFFICIAL_NEURONS,
    tick: 0,
    nextNodeId: 2,
    nextShardId: nextShard,
    nodes: [
      {
        id: PROTOCOL_NODE_ID,
        soulId: PROTOCOL_SOUL,
        runnerPub: PROTOCOL_RUNNER,
        status: "LIVE",
        shardIds: protocolShards,
        joinedAt: 0,
        lastBeat: 0,
      },
    ],
    regions,
    shards,
  };
}

function nodeOf(mesh, nodeId) {
  const node = mesh.nodes.find((row) => row.id === nodeId);
  requireValue(node, "MESH_NODE", `未知节点 ${nodeId}`);
  return node;
}

function shardOf(mesh, shardId) {
  const shard = mesh.shards.find((row) => row.id === shardId);
  requireValue(shard, "MESH_SHARD", `未知分片 ${shardId}`);
  return shard;
}

export function regionOf(mesh, regionId) {
  const region = mesh.regions.find((row) => row.id === regionId);
  requireValue(region, "MESH_REGION", `未知分区 ${regionId}`);
  return region;
}

export function emptyShardsOf(mesh, regionId) {
  return mesh.shards.filter(
    (row) => row.regionId === regionId && row.status === "EMPTY",
  );
}

export function firstEmptyRegion(mesh) {
  return (
    mesh.regions.find((region) => emptyShardsOf(mesh, region.id).length > 0)
      ?.id || null
  );
}

function isHosted(status) {
  return status === "LIVE" || status === "STALE";
}

function hostedCount(mesh) {
  return mesh.shards
    .filter((row) => isHosted(row.status))
    .reduce((sum, row) => sum + row.officialCount, 0);
}

function regionStatus(mesh, regionId) {
  const shards = mesh.shards.filter((row) => row.regionId === regionId);
  if (shards.every((row) => row.status === "EMPTY")) return "EMPTY";
  if (shards.every((row) => row.status === "LIVE")) return "LIVE";
  if (shards.every((row) => isHosted(row.status))) return "STALE";
  return "PARTIAL";
}

function refreshNode(mesh, nodeId) {
  const node = nodeOf(mesh, nodeId);
  if (node.status === "OFFLINE") return node;
  const held = node.shardIds
    .map((id) => mesh.shards.find((row) => row.id === id))
    .filter((row) => row && (row.status === "LIVE" || row.status === "ASSIGNED"));
  if (held.length === 0 && node.status === "LIVE") node.status = "PENDING";
  return node;
}

/** 接入：登记运行器。不增加官方神经元，不改分区普查。 */
export function joinMesh(mesh, { soulId, runnerPub, tick = mesh.tick }) {
  identifier(soulId, "soulId");
  isRunner(runnerPub, "runnerPub");
  integer(tick, mesh.tick, Number.MAX_SAFE_INTEGER, "tick");
  requireValue(
    !mesh.nodes.some((row) => row.soulId === soulId),
    "MESH_SOUL",
    `灵魂 ${soulId} 已在托管网`,
  );
  const before = mesh.officialNeurons;
  const census = mesh.regions.map((row) => row.officialCount);
  const node = {
    id: `node-${mesh.nextNodeId}`,
    soulId,
    runnerPub,
    status: "PENDING",
    shardIds: [],
    joinedAt: tick,
    lastBeat: tick,
  };
  mesh.nextNodeId += 1;
  mesh.tick = tick;
  mesh.nodes.push(node);
  requireValue(
    mesh.officialNeurons === before &&
      mesh.officialNeurons === OFFICIAL_NEURONS,
    "MESH_IMMUTABLE",
    "接入不得改写官方神经元计数",
  );
  requireValue(
    mesh.regions.every((row, i) => row.officialCount === census[i]),
    "MESH_CENSUS",
    "接入不得改写分区普查",
  );
  return node;
}

export function assignShard(mesh, { shardId, nodeId, tick = mesh.tick }) {
  integer(tick, mesh.tick, Number.MAX_SAFE_INTEGER, "tick");
  const shard = shardOf(mesh, shardId);
  const node = nodeOf(mesh, nodeId);
  requireValue(node.status !== "OFFLINE", "MESH_OFFLINE", "离线节点不能接分片");
  requireValue(shard.status === "EMPTY", "MESH_TAKEN", "分片已被托管");
  shard.status = "ASSIGNED";
  shard.assignedNode = nodeId;
  shard.sinceTick = tick;
  if (!node.shardIds.includes(shardId)) node.shardIds.push(shardId);
  node.lastBeat = tick;
  mesh.tick = tick;
  return shard;
}

export function liveShard(mesh, { shardId, tick = mesh.tick }) {
  integer(tick, mesh.tick, Number.MAX_SAFE_INTEGER, "tick");
  const shard = shardOf(mesh, shardId);
  requireValue(shard.status === "ASSIGNED", "MESH_NOT_ASSIGNED");
  requireValue(shard.assignedNode, "MESH_ORPHAN");
  shard.status = "LIVE";
  shard.sinceTick = tick;
  const node = nodeOf(mesh, shard.assignedNode);
  node.status = "LIVE";
  node.lastBeat = tick;
  mesh.tick = tick;
  return shard;
}

export function releaseShard(mesh, { shardId, tick = mesh.tick }) {
  integer(tick, mesh.tick, Number.MAX_SAFE_INTEGER, "tick");
  const shard = shardOf(mesh, shardId);
  const nodeId = shard.assignedNode;
  shard.status = "EMPTY";
  shard.assignedNode = null;
  shard.sinceTick = tick;
  if (nodeId) {
    const node = nodeOf(mesh, nodeId);
    node.shardIds = node.shardIds.filter((id) => id !== shardId);
    refreshNode(mesh, nodeId);
  }
  mesh.tick = tick;
  return shard;
}

export function beatMesh(mesh, { nodeId, tick = mesh.tick }) {
  integer(tick, mesh.tick, Number.MAX_SAFE_INTEGER, "tick");
  const node = nodeOf(mesh, nodeId);
  requireValue(node.status !== "OFFLINE", "MESH_OFFLINE");
  node.lastBeat = tick;
  if (node.status === "STALE") node.status = "LIVE";
  for (const shardId of node.shardIds) {
    const shard = shardOf(mesh, shardId);
    if (shard.status === "STALE") shard.status = "LIVE";
  }
  mesh.tick = tick;
  return node;
}

export function retireNode(mesh, { nodeId, tick = mesh.tick }) {
  integer(tick, mesh.tick, Number.MAX_SAFE_INTEGER, "tick");
  const node = nodeOf(mesh, nodeId);
  requireValue(node.id !== PROTOCOL_NODE_ID, "MESH_PROTOCOL", "创世节点不可退役");
  for (const shardId of [...node.shardIds]) {
    releaseShard(mesh, { shardId, tick });
  }
  node.status = "OFFLINE";
  mesh.tick = tick;
  return node;
}

/** 心跳过期的节点变 STALE；覆盖仍算已声明，但首页标陈旧。 */
export function advanceMesh(mesh, tick) {
  integer(tick, mesh.tick, Number.MAX_SAFE_INTEGER, "tick");
  mesh.tick = tick;
  for (const node of mesh.nodes) {
    if (node.id === PROTOCOL_NODE_ID) continue;
    if (node.status !== "LIVE") continue;
    if (tick - node.lastBeat < STALE_TICKS) continue;
    node.status = "STALE";
    for (const shardId of node.shardIds) {
      const shard = shardOf(mesh, shardId);
      if (shard.status === "LIVE") shard.status = "STALE";
    }
  }
  return mesh;
}

export function meshNodeRecord(mesh, nodeId) {
  const node = nodeOf(mesh, nodeId);
  return {
    schema: "iff.mesh-node/1",
    audit: mesh.audit,
    dataset: mesh.dataset,
    nodeId: node.id,
    soulId: node.soulId,
    runnerPub: node.runnerPub,
    status: node.status,
    joinedAt: node.joinedAt,
    lastBeat: node.lastBeat,
  };
}

/** 首页与 API 共用的只读快照：分区 + 节点，不含 body ID / 电位。 */
export function meshView(mesh) {
  const hostedNeurons = hostedCount(mesh);
  return {
    schema: MESH_SCHEMA,
    audit: mesh.audit,
    dataset: mesh.dataset,
    tick: mesh.tick,
    officialNeurons: mesh.officialNeurons,
    hostedNeurons,
    coverageBps: Math.trunc((hostedNeurons * 10_000) / mesh.officialNeurons),
    note: "Coverage is declared hosting of official MaleCNS body IDs. Not new neurons. Not 166,700 spikes in this tab.",
    regions: mesh.regions.map((region) => {
      const hosted = mesh.shards
        .filter((row) => row.regionId === region.id && isHosted(row.status))
        .reduce((sum, row) => sum + row.officialCount, 0);
      return {
        id: region.id,
        kind: region.kind,
        officialCount: region.officialCount,
        hostedCount: hosted,
        emptyShards: emptyShardsOf(mesh, region.id).length,
        status: regionStatus(mesh, region.id),
      };
    }),
    nodes: mesh.nodes.map((node) => ({
      id: node.id,
      soulId: node.soulId,
      runnerPub: node.runnerPub,
      status: node.status,
      shards: node.shardIds.length,
      joinedAt: node.joinedAt,
      lastBeat: node.lastBeat,
    })),
    shards: mesh.shards.map((row) => ({
      id: row.id,
      regionId: row.regionId,
      officialCount: row.officialCount,
      status: row.status,
      assignedNode: row.assignedNode,
    })),
  };
}

export function saveMesh(mesh) {
  return {
    schema: mesh.schema,
    audit: mesh.audit,
    dataset: mesh.dataset,
    officialNeurons: mesh.officialNeurons,
    tick: mesh.tick,
    nextNodeId: mesh.nextNodeId,
    nextShardId: mesh.nextShardId,
    nodes: mesh.nodes.map((row) => ({
      ...row,
      shardIds: [...row.shardIds],
    })),
    regions: mesh.regions.map((row) => ({ ...row })),
    shards: mesh.shards.map((row) => ({ ...row })),
  };
}

export function restoreMesh(saved) {
  if (!saved || saved.schema !== MESH_SCHEMA) return createMesh();
  requireValue(
    saved.officialNeurons === OFFICIAL_NEURONS,
    "MESH_IMMUTABLE",
    "恢复不得改写官方神经元计数",
  );
  const mesh = createMesh({ audit: saved.audit });
  mesh.tick = saved.tick;
  mesh.nextNodeId = saved.nextNodeId;
  mesh.nextShardId = saved.nextShardId;
  mesh.nodes = saved.nodes.map((row) => ({
    ...row,
    shardIds: [...row.shardIds],
  }));
  mesh.regions = saved.regions.map((row) => ({ ...row }));
  mesh.shards = saved.shards.map((row) => ({ ...row }));
  return mesh;
}
