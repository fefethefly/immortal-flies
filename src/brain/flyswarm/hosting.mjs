/**
 * iff.hosting/1 —— 计算托管单（L3，SIM）。
 *
 * IFS：占用已有质押（occupyCredit purpose=hosting），买的是额度与会员结算。
 * BNB：只记 gas / 算力轨道意向，不授予 bonded，不写 Life Core。
 *
 * 自动续费必须带 maxRenewals + tickBudget；预算耗尽进入 HOLD，不静默加码。
 * 本文件不签名、不转账、不部署合约、不改官方连接组。
 */
import { identifier, integer, requireValue } from "../codec.mjs";
import { occupyCredit, releaseCredit } from "./credit.mjs";
import {
  HOSTING_ASSETS,
  HOSTING_ORDER_STATUSES,
  isRunner,
} from "./schemas.mjs";
import { FLYSWARM_POLICY } from "./membership.mjs";
import {
  assignShard,
  emptyShardsOf,
  firstEmptyRegion,
  joinMesh,
  liveShard,
  regionOf,
  releaseShard,
} from "./mesh.mjs";

export const HOSTING_SCHEMA = "iff.hosting/1";
export const HOSTING_PURPOSE = "hosting";

export const HOSTING_POLICY = Object.freeze({
  id: "iff-hosting-1",
  version: "1",
  ifsMin: FLYSWARM_POLICY.bondedStakeMin,
  bnbMin: 1,
  escrowTicks: 2_000,
  maxAutoRenewals: 3,
  tickBudgetDefault: 10_000,
});

export function createHosting({ audit = "SIM" } = {}) {
  return {
    schema: HOSTING_SCHEMA,
    policy: `${HOSTING_POLICY.id}@${HOSTING_POLICY.version}`,
    audit,
    tick: 0,
    nextOrderId: 1,
    orders: [],
  };
}

function minFor(asset) {
  return asset === "IFS" ? HOSTING_POLICY.ifsMin : HOSTING_POLICY.bnbMin;
}

function orderOf(hosting, orderId) {
  const order = hosting.orders.find((row) => row.id === orderId);
  requireValue(order, "HOSTING_ORDER", `未知托管单 ${orderId}`);
  return order;
}

export function quoteHosting(mesh, { regionId, asset, amount, autoRenew = false }) {
  identifier(regionId, "regionId");
  requireValue(HOSTING_ASSETS.includes(asset), "HOSTING_ASSET");
  integer(amount, minFor(asset), Number.MAX_SAFE_INTEGER, "amount");
  regionOf(mesh, regionId);
  const empty = emptyShardsOf(mesh, regionId);
  requireValue(empty.length > 0, "HOSTING_FULL", "该分区没有空分片");
  return {
    schema: "iff.hosting-quote/1",
    audit: "SIM",
    regionId,
    shardHint: empty[0].id,
    officialCount: empty[0].officialCount,
    asset,
    amount,
    autoRenew,
    note: "Quote only. No escrow, no neuron, no chain send.",
  };
}

export function escrowHosting(
  hosting,
  credit,
  {
    soulId,
    runnerPub,
    regionId,
    asset,
    amount,
    stakeId = null,
    tick = hosting.tick,
    autoRenew = false,
    maxRenewals = HOSTING_POLICY.maxAutoRenewals,
    tickBudget = HOSTING_POLICY.tickBudgetDefault,
  },
) {
  identifier(soulId, "soulId");
  isRunner(runnerPub, "runnerPub");
  identifier(regionId, "regionId");
  requireValue(HOSTING_ASSETS.includes(asset), "HOSTING_ASSET");
  integer(amount, minFor(asset), Number.MAX_SAFE_INTEGER, "amount");
  integer(tick, hosting.tick, Number.MAX_SAFE_INTEGER, "tick");
  integer(maxRenewals, 0, HOSTING_POLICY.maxAutoRenewals, "maxRenewals");
  integer(tickBudget, amount, Number.MAX_SAFE_INTEGER, "tickBudget");
  if (asset === "IFS") {
    requireValue(stakeId, "HOSTING_STAKE", "IFS 托管必须占用一笔质押");
    occupyCredit(credit, { stakeId, purpose: HOSTING_PURPOSE });
  } else {
    requireValue(
      stakeId == null,
      "HOSTING_BNB_STAKE",
      "BNB 轨道不得占用 IFS 质押",
    );
  }
  const order = {
    schema: "iff.hosting-order/1",
    id: `host-${hosting.nextOrderId}`,
    audit: hosting.audit,
    soulId,
    runnerPub,
    asset,
    amount,
    stakeId,
    regionId,
    shardId: null,
    nodeId: null,
    status: "ESCROWED",
    createdAt: tick,
    expiresAt: tick + HOSTING_POLICY.escrowTicks,
    policy: {
      autoRenew,
      maxRenewals,
      tickBudget,
      renewalsUsed: 0,
      spent: amount,
    },
  };
  hosting.nextOrderId += 1;
  hosting.tick = tick;
  hosting.orders.push(order);
  return order;
}

export function assignHosting(hosting, mesh, { orderId, tick = hosting.tick }) {
  integer(tick, hosting.tick, Number.MAX_SAFE_INTEGER, "tick");
  const order = orderOf(hosting, orderId);
  requireValue(order.status === "ESCROWED", "HOSTING_NOT_ESCROWED");
  requireValue(tick <= order.expiresAt, "HOSTING_EXPIRED", "托管单已过期");
  const empty = emptyShardsOf(mesh, order.regionId);
  requireValue(empty.length > 0, "HOSTING_FULL", "该分区没有空分片");
  let node = mesh.nodes.find((row) => row.soulId === order.soulId);
  if (!node) {
    node = joinMesh(mesh, {
      soulId: order.soulId,
      runnerPub: order.runnerPub,
      tick,
    });
  }
  const shard = assignShard(mesh, {
    shardId: empty[0].id,
    nodeId: node.id,
    tick,
  });
  order.shardId = shard.id;
  order.nodeId = node.id;
  order.status = "ASSIGNED";
  hosting.tick = tick;
  mesh.tick = tick;
  return order;
}

export function startHosting(hosting, mesh, { orderId, tick = hosting.tick }) {
  integer(tick, hosting.tick, Number.MAX_SAFE_INTEGER, "tick");
  const order = orderOf(hosting, orderId);
  requireValue(order.status === "ASSIGNED", "HOSTING_NOT_ASSIGNED");
  requireValue(order.shardId, "HOSTING_SHARD");
  liveShard(mesh, { shardId: order.shardId, tick });
  order.status = "RUNNING";
  hosting.tick = tick;
  return order;
}

export function settleHosting(
  hosting,
  credit,
  mesh,
  { orderId, tick = hosting.tick },
) {
  integer(tick, hosting.tick, Number.MAX_SAFE_INTEGER, "tick");
  const order = orderOf(hosting, orderId);
  requireValue(
    order.status === "RUNNING" || order.status === "HELD",
    "HOSTING_NOT_RUNNING",
  );
  if (order.shardId) releaseShard(mesh, { shardId: order.shardId, tick });
  if (order.asset === "IFS" && order.stakeId) {
    releaseCredit(credit, { stakeId: order.stakeId });
  }
  order.status = "SETTLED";
  order.shardId = null;
  hosting.tick = tick;
  return order;
}

export function refundHosting(
  hosting,
  credit,
  mesh,
  { orderId, tick = hosting.tick },
) {
  integer(tick, hosting.tick, Number.MAX_SAFE_INTEGER, "tick");
  const order = orderOf(hosting, orderId);
  requireValue(
    order.status === "ESCROWED" || order.status === "ASSIGNED",
    "HOSTING_NOT_REFUNDABLE",
  );
  if (order.shardId) releaseShard(mesh, { shardId: order.shardId, tick });
  if (order.asset === "IFS" && order.stakeId) {
    releaseCredit(credit, { stakeId: order.stakeId });
  }
  order.status = "REFUNDED";
  order.shardId = null;
  order.nodeId = order.nodeId;
  hosting.tick = tick;
  return order;
}

/** 自动续费：只在政策与剩余预算内延长，绝不加码到无限扣款。 */
export function renewHosting(hosting, { orderId, tick = hosting.tick }) {
  integer(tick, hosting.tick, Number.MAX_SAFE_INTEGER, "tick");
  const order = orderOf(hosting, orderId);
  requireValue(order.status === "RUNNING", "HOSTING_NOT_RUNNING");
  const left = order.policy.maxRenewals - order.policy.renewalsUsed;
  const remaining = order.policy.tickBudget - order.policy.spent;
  if (!order.policy.autoRenew || left <= 0 || remaining < order.amount) {
    order.status = "HELD";
    hosting.tick = tick;
    return order;
  }
  order.policy.renewalsUsed += 1;
  order.policy.spent += order.amount;
  order.expiresAt = tick + HOSTING_POLICY.escrowTicks;
  hosting.tick = tick;
  return order;
}

/** 接入并托管：报价 → 托管 → 分片 → 上线。不改官方神经元计数。 */
export function hostFromJoin({
  mesh,
  hosting,
  credit,
  soulId,
  runnerPub,
  regionId,
  asset,
  amount,
  stakeId = null,
  tick = 0,
  autoRenew = false,
}) {
  const target = regionId || firstEmptyRegion(mesh);
  requireValue(target, "HOSTING_FULL", "没有可托管的空分片");
  quoteHosting(mesh, { regionId: target, asset, amount, autoRenew });
  const officialBefore = mesh.officialNeurons;
  const order = escrowHosting(hosting, credit, {
    soulId,
    runnerPub,
    regionId: target,
    asset,
    amount,
    stakeId,
    tick,
    autoRenew,
  });
  assignHosting(hosting, mesh, { orderId: order.id, tick });
  startHosting(hosting, mesh, { orderId: order.id, tick });
  requireValue(
    mesh.officialNeurons === officialBefore,
    "MESH_IMMUTABLE",
    "托管不得改写官方神经元计数",
  );
  return order;
}

export function hostingView(hosting) {
  return {
    schema: HOSTING_SCHEMA,
    audit: hosting.audit,
    policy: hosting.policy,
    tick: hosting.tick,
    orders: hosting.orders.map((row) => ({
      id: row.id,
      soulId: row.soulId,
      runnerPub: row.runnerPub,
      asset: row.asset,
      amount: row.amount,
      regionId: row.regionId,
      shardId: row.shardId,
      nodeId: row.nodeId,
      status: row.status,
      expiresAt: row.expiresAt,
      autoRenew: row.policy.autoRenew,
      renewalsUsed: row.policy.renewalsUsed,
      spent: row.policy.spent,
      tickBudget: row.policy.tickBudget,
    })),
    open: hosting.orders.filter((row) =>
      ["ESCROWED", "ASSIGNED", "RUNNING", "HELD"].includes(row.status),
    ).length,
  };
}

export function saveHosting(hosting) {
  return {
    schema: hosting.schema,
    policy: hosting.policy,
    audit: hosting.audit,
    tick: hosting.tick,
    nextOrderId: hosting.nextOrderId,
    orders: hosting.orders.map((row) => ({
      ...row,
      policy: { ...row.policy },
    })),
  };
}

export function restoreHosting(saved) {
  if (!saved || saved.schema !== HOSTING_SCHEMA) return createHosting();
  const hosting = createHosting({ audit: saved.audit });
  hosting.tick = saved.tick;
  hosting.nextOrderId = saved.nextOrderId;
  hosting.orders = saved.orders.map((row) => ({
    ...row,
    policy: { ...row.policy },
  }));
  return hosting;
}

export { HOSTING_ORDER_STATUSES };
