import test from "node:test";
import assert from "node:assert/strict";
import {
  createSchemas,
  validateRecord,
} from "../src/brain/flyswarm/schemas.mjs";
import {
  createCreditLedger,
  occupyCredit,
  stakeCredit,
} from "../src/brain/flyswarm/credit.mjs";
import {
  INTER_SHARD_COUNT,
  MESH_REGIONS,
  OFFICIAL_NEURONS,
  SUBGRAPH_NEURONS,
  advanceMesh,
  assignShard,
  beatMesh,
  createMesh,
  emptyShardsOf,
  firstEmptyRegion,
  joinMesh,
  liveShard,
  meshNodeRecord,
  meshView,
  restoreMesh,
  retireNode,
  saveMesh,
} from "../src/brain/flyswarm/mesh.mjs";
import {
  HOSTING_POLICY,
  assignHosting,
  createHosting,
  escrowHosting,
  hostFromJoin,
  hostingView,
  quoteHosting,
  refundHosting,
  renewHosting,
  restoreHosting,
  saveHosting,
  settleHosting,
  startHosting,
} from "../src/brain/flyswarm/hosting.mjs";
import { fieldBodies } from "../src/swarm-field.mjs";

function paperCredit(soulId = "soul-guest") {
  const credit = createCreditLedger();
  const stake = stakeCredit(credit, {
    soulId,
    amount: HOSTING_POLICY.ifsMin,
    tick: 0,
    priceAt: 1,
  });
  return { credit, stake };
}

test("分区普查加总等于官方 MaleCNS，创世只托管 1,400 子图", () => {
  const census = MESH_REGIONS.reduce((sum, row) => sum + row.officialCount, 0);
  assert.equal(census, OFFICIAL_NEURONS);
  const mesh = createMesh();
  const view = meshView(mesh);
  assert.equal(view.officialNeurons, 166_700);
  assert.equal(view.hostedNeurons, SUBGRAPH_NEURONS);
  assert.equal(view.coverageBps, Math.trunc((1_400 * 10_000) / 166_700));
  assert.equal(
    view.regions.filter((row) => row.kind === "subgraph" && row.status === "LIVE")
      .length,
    5,
  );
  assert.equal(
    view.regions.find((row) => row.id === "inter.core").emptyShards,
    INTER_SHARD_COUNT,
  );
  assert.equal(view.note.includes("Not new neurons"), true);
  assert.equal(
    Object.hasOwn(view, "voltages") || Object.hasOwn(view, "bodyIds"),
    false,
  );
});

test("接入登记运行器，不增加官方神经元，不改分区普查", () => {
  const mesh = createMesh();
  const census = mesh.regions.map((row) => row.officialCount);
  const node = joinMesh(mesh, {
    soulId: "soul-guest",
    runnerPub: "paper:guest",
    tick: 3,
  });
  assert.equal(node.status, "PENDING");
  assert.equal(mesh.officialNeurons, OFFICIAL_NEURONS);
  assert.deepEqual(
    mesh.regions.map((row) => row.officialCount),
    census,
  );
  assert.equal(meshView(mesh).hostedNeurons, SUBGRAPH_NEURONS);
  assert.throws(
    () =>
      joinMesh(mesh, {
        soulId: "soul-guest",
        runnerPub: "paper:other",
        tick: 4,
      }),
    /已在托管网/,
  );
  const schemas = createSchemas();
  validateRecord(schemas, meshNodeRecord(mesh, node.id));
});

test("IFS 托管空分区会提高覆盖，仍不得改写官方计数", () => {
  const mesh = createMesh();
  const hosting = createHosting();
  const { credit, stake } = paperCredit();
  const order = hostFromJoin({
    mesh,
    hosting,
    credit,
    soulId: "soul-guest",
    runnerPub: "paper:guest",
    regionId: "inter.core",
    asset: "IFS",
    amount: HOSTING_POLICY.ifsMin,
    stakeId: stake.id,
    tick: 8,
  });
  assert.equal(order.status, "RUNNING");
  assert.equal(mesh.officialNeurons, OFFICIAL_NEURONS);
  const view = meshView(mesh);
  assert.equal(view.hostedNeurons, SUBGRAPH_NEURONS + 27_550);
  assert.equal(view.regions.find((row) => row.id === "inter.core").status, "PARTIAL");
  assert.equal(
    view.nodes.find((row) => row.soulId === "soul-guest").status,
    "LIVE",
  );
  assert.equal(credit.stakes[0].occupiedBy.purpose, "hosting");
  const schemas = createSchemas();
  validateRecord(schemas, {
    ...order,
    schema: "iff.hosting-order/1",
  });
});

test("没有托管单不能占分片；同一质押不能再买第二条托管", () => {
  const mesh = createMesh();
  const hosting = createHosting();
  const { credit, stake } = paperCredit();
  const empty = emptyShardsOf(mesh, "inter.core")[0];
  assert.throws(
    () =>
      assignShard(mesh, {
        shardId: empty.id,
        nodeId: "node-missing",
        tick: 1,
      }),
    /未知节点/,
  );
  escrowHosting(hosting, credit, {
    soulId: "soul-guest",
    runnerPub: "paper:guest",
    regionId: "inter.core",
    asset: "IFS",
    amount: HOSTING_POLICY.ifsMin,
    stakeId: stake.id,
    tick: 1,
  });
  assert.throws(
    () =>
      escrowHosting(hosting, credit, {
        soulId: "soul-guest",
        runnerPub: "paper:guest",
        regionId: "inter.core",
        asset: "IFS",
        amount: HOSTING_POLICY.ifsMin,
        stakeId: stake.id,
        tick: 2,
      }),
    /不能重复抵押/,
  );
});

test("BNB 只是算力轨道：不占用 IFS 质押，也不加神经元", () => {
  const mesh = createMesh();
  const hosting = createHosting();
  const { credit, stake } = paperCredit("soul-bnb");
  occupyCredit(credit, { stakeId: stake.id, purpose: "llm" });
  const order = hostFromJoin({
    mesh,
    hosting,
    credit,
    soulId: "soul-bnb",
    runnerPub: "paper:bnb",
    regionId: "inter.core",
    asset: "BNB",
    amount: 2,
    tick: 4,
  });
  assert.equal(order.stakeId, null);
  assert.equal(order.asset, "BNB");
  assert.equal(credit.stakes[0].occupiedBy.purpose, "llm");
  assert.equal(mesh.officialNeurons, OFFICIAL_NEURONS);
  assert.throws(
    () =>
      escrowHosting(hosting, credit, {
        soulId: "soul-bnb-2",
        runnerPub: "paper:bnb2",
        regionId: "inter.core",
        asset: "BNB",
        amount: 2,
        stakeId: stake.id,
        tick: 5,
      }),
    /不得占用 IFS/,
  );
});

test("自动续费耗尽预算后 HOLD，退款释放质押并交还分片", () => {
  const mesh = createMesh();
  const hosting = createHosting();
  const { credit, stake } = paperCredit();
  const order = escrowHosting(hosting, credit, {
    soulId: "soul-guest",
    runnerPub: "paper:guest",
    regionId: "inter.core",
    asset: "IFS",
    amount: HOSTING_POLICY.ifsMin,
    stakeId: stake.id,
    tick: 1,
    autoRenew: true,
    maxRenewals: 1,
    tickBudget: HOSTING_POLICY.ifsMin * 2,
  });
  assignHosting(hosting, mesh, { orderId: order.id, tick: 1 });
  startHosting(hosting, mesh, { orderId: order.id, tick: 1 });
  const once = renewHosting(hosting, { orderId: order.id, tick: 10 });
  assert.equal(once.status, "RUNNING");
  assert.equal(once.policy.renewalsUsed, 1);
  const held = renewHosting(hosting, { orderId: order.id, tick: 11 });
  assert.equal(held.status, "HELD");
  settleHosting(hosting, credit, mesh, { orderId: order.id, tick: 12 });
  assert.equal(credit.stakes[0].occupiedBy, null);
  assert.equal(meshView(mesh).hostedNeurons, SUBGRAPH_NEURONS);
  assert.equal(firstEmptyRegion(mesh), "inter.core");
});

test("过期未分配的托管单可退款；报价本身不改状态", () => {
  const mesh = createMesh();
  const hosting = createHosting();
  const { credit, stake } = paperCredit();
  const quote = quoteHosting(mesh, {
    regionId: "inter.core",
    asset: "IFS",
    amount: HOSTING_POLICY.ifsMin,
  });
  assert.equal(quote.schema, "iff.hosting-quote/1");
  assert.equal(hosting.orders.length, 0);
  assert.equal(meshView(mesh).hostedNeurons, SUBGRAPH_NEURONS);
  const order = escrowHosting(hosting, credit, {
    soulId: "soul-guest",
    runnerPub: "paper:guest",
    regionId: "inter.core",
    asset: "IFS",
    amount: HOSTING_POLICY.ifsMin,
    stakeId: stake.id,
    tick: 1,
  });
  refundHosting(hosting, credit, mesh, { orderId: order.id, tick: 2 });
  assert.equal(order.status, "REFUNDED");
  assert.equal(credit.stakes[0].occupiedBy, null);
});

test("快照往返保持覆盖；心跳过期变 STALE；创世节点不可退役", () => {
  const mesh = createMesh();
  const hosting = createHosting();
  const { credit, stake } = paperCredit();
  hostFromJoin({
    mesh,
    hosting,
    credit,
    soulId: "soul-guest",
    runnerPub: "paper:guest",
    regionId: "inter.core",
    asset: "IFS",
    amount: HOSTING_POLICY.ifsMin,
    stakeId: stake.id,
    tick: 2,
  });
  const guest = mesh.nodes.find((row) => row.soulId === "soul-guest");
  const restored = restoreMesh(saveMesh(mesh));
  assert.equal(restoreHosting(saveHosting(hosting)).orders.length, 1);
  assert.equal(restored.officialNeurons, OFFICIAL_NEURONS);
  assert.equal(meshView(restored).hostedNeurons, meshView(mesh).hostedNeurons);
  advanceMesh(restored, 2 + 2_000);
  assert.equal(
    restored.nodes.find((row) => row.id === guest.id).status,
    "STALE",
  );
  beatMesh(restored, { nodeId: guest.id, tick: 2 + 2_001 });
  assert.equal(
    restored.nodes.find((row) => row.id === guest.id).status,
    "LIVE",
  );
  assert.throws(
    () => retireNode(restored, { nodeId: "node-protocol", tick: 9_000 }),
    /创世节点/,
  );
  retireNode(restored, { nodeId: guest.id, tick: 9_000 });
  assert.equal(meshView(restored).hostedNeurons, SUBGRAPH_NEURONS);
  assert.equal(hostingView(hosting).open, 1);
});

test("已分配分片不能再指派；未分配不能上线", () => {
  const mesh = createMesh();
  const node = joinMesh(mesh, {
    soulId: "soul-a",
    runnerPub: "paper:a",
    tick: 0,
  });
  const shard = emptyShardsOf(mesh, "inter.core")[0];
  assignShard(mesh, { shardId: shard.id, nodeId: node.id, tick: 1 });
  assert.throws(
    () => assignShard(mesh, { shardId: shard.id, nodeId: node.id, tick: 2 }),
    /已被托管/,
  );
  const other = emptyShardsOf(mesh, "inter.core")[1];
  assert.throws(
    () => liveShard(mesh, { shardId: other.id, tick: 3 }),
    /MESH_NOT_ASSIGNED/,
  );
});

test("蝇群场座次：创世五只在线，中间核六个空栖位，坐标落在画布内", () => {
  const bodies = fieldBodies(meshView(createMesh()));
  assert.equal(bodies.length, 11);
  assert.equal(bodies.filter((row) => row.status === "LIVE").length, 5);
  assert.equal(
    bodies.filter((row) => row.regionId === "inter.core" && row.status === "EMPTY")
      .length,
    6,
  );
  assert.ok(bodies.every((row) => row.ux > 0 && row.ux < 1 && row.uy > 0 && row.uy < 1));
});
