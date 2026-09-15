import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { createConfig } from "../server/src/config.mjs";
import { createStore } from "../server/src/shared/store.mjs";
import { createLogger } from "../server/src/shared/logger.mjs";
import { createSessionService } from "../server/src/sessions/service.mjs";
import { createApp } from "../server/src/index.mjs";
import { createFakeProvider } from "../server/src/llm/provider.mjs";

function fixtureGraph() {
  return bindManifest(
    encodeGraph(
      {
        schema: "iff.connectome/1",
        dataset: CANON.dataset,
        nodes: [
          { id: "1001", sign: 1, type: "ORN", side: "L" },
          { id: "1002", sign: 1, type: "GRN", side: "R" },
          { id: "2001", sign: -1, type: "LN", side: "L" },
          { id: "3001", sign: 1, type: "PN", side: "L" },
          { id: "4001", sign: 1, type: "DNp", side: "L" },
          { id: "4002", sign: 1, type: "DNp", side: "R" },
          { id: "5001", sign: 1, type: "R1", side: "L" },
          { id: "5002", sign: 0, type: "unc", side: "M" },
        ],
        groups: {
          food: [0, 1],
          threat: [4],
          light: [6],
          left: [4],
          right: [5],
        },
      },
      [
        { pre: 0, post: 2, weight: 12 },
        { pre: 0, post: 3, weight: 8 },
        { pre: 1, post: 3, weight: 10 },
        { pre: 2, post: 3, weight: 4 },
        { pre: 3, post: 4, weight: 15 },
        { pre: 3, post: 5, weight: 9 },
        { pre: 6, post: 3, weight: 7 },
        { pre: 7, post: 3, weight: 3 },
      ],
    ),
    "credit-service-fixture",
  );
}

async function withApp(run) {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-credit-"));
  const config = createConfig({
    PORT: "0",
    IFF_DATA_DIR: dataDir,
    IFF_CORS_ORIGINS: "http://127.0.0.1:4173",
  });
  config.port = 0;
  config.dataDir = dataDir;
  const logger = createLogger("test");
  const store = createStore(dataDir);
  const sessions = createSessionService({ config, store, logger });
  await sessions.boot(fixtureGraph());
  const app = await createApp({
    config,
    logger,
    store,
    sessions,
    provider: createFakeProvider(),
    skipBoot: true,
  });
  const server = createServer(app.handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await run({ base, app, sessions });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function json(base, path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function newSession(base, app) {
  const created = await json(base, "/v1/sessions", {
    method: "POST",
    body: { seed: 7 },
  });
  assert.equal(created.status, 200);
  const { sessionId, ownerToken, view } = created.data;
  const soulId = view.pit.flies.find((f) => f.status === "alive")?.soulId;
  // 推进几拍，让账本有结算事实可镜像
  for (let i = 0; i < 4; i++) {
    await json(base, `/v1/sessions/${sessionId}/tick`, {
      method: "POST",
      token: ownerToken,
    });
  }
  return { sessionId, ownerToken, soulId };
}

test("credit 政策端点与账本视图", async () => {
  await withApp(async ({ base }) => {
    const { sessionId, soulId } = await newSession(base);
    const policy = await json(base, "/v1/credit/policy");
    assert.equal(policy.status, 200);
    assert.equal(policy.data.id, "iff-credit-1");
    assert.equal(policy.data.audit, "SIM");
    const view = await json(base, `/v1/sessions/${sessionId}/credit`);
    assert.equal(view.status, 200);
    assert.equal(view.data.schema, "iff.credit/1");
    const soul = view.data.souls.find((s) => s.soulId === soulId);
    assert.ok(soul, "在册灵魂应有信用账户");
    assert.ok(soul.usable >= 0);
  });
});

test("锁仓 → 占用 → 重复占用拒绝 → 释放 → 到期解锁", async () => {
  await withApp(async ({ base }) => {
    const { sessionId, ownerToken, soulId } = await newSession(base);
    const stake = await json(base, `/v1/sessions/${sessionId}/credit/stake`, {
      method: "POST",
      token: ownerToken,
      body: { soulId, amount: 10_000 },
    });
    assert.equal(stake.status, 200);
    const stakeId = stake.data.id;
    assert.equal(stake.data.audit, "SIM");

    const occupied = await json(
      base,
      `/v1/sessions/${sessionId}/credit/occupy`,
      {
        method: "POST",
        token: ownerToken,
        body: { stakeId, purpose: "llm" },
      },
    );
    assert.equal(occupied.status, 200);
    assert.equal(occupied.data.occupiedBy.purpose, "llm");

    const twice = await json(base, `/v1/sessions/${sessionId}/credit/occupy`, {
      method: "POST",
      token: ownerToken,
      body: { stakeId, purpose: "verify" },
    });
    assert.equal(twice.status, 400, "同一抵押重复占用必须拒绝");

    const early = await json(base, `/v1/sessions/${sessionId}/credit/unstake`, {
      method: "POST",
      token: ownerToken,
      body: { stakeId },
    });
    assert.equal(early.status, 400, "占用中/未到期不可解锁");

    await json(base, `/v1/sessions/${sessionId}/credit/release`, {
      method: "POST",
      token: ownerToken,
      body: { stakeId },
    });
    const view = await json(base, `/v1/sessions/${sessionId}/credit`);
    const row = view.data.stakes.find((s) => s.id === stakeId);
    assert.equal(row.occupiedBy, null);
  });
});

test("未授权与非法输入被拒绝", async () => {
  await withApp(async ({ base }) => {
    const { sessionId, ownerToken, soulId } = await newSession(base);
    const noAuth = await json(base, `/v1/sessions/${sessionId}/credit/stake`, {
      method: "POST",
      body: { soulId, amount: 10_000 },
    });
    assert.equal(noAuth.status, 401);
    const badSoul = await json(base, `/v1/sessions/${sessionId}/credit/stake`, {
      method: "POST",
      token: ownerToken,
      body: { soulId: "soul-nope", amount: 10_000 },
    });
    assert.equal(badSoul.status, 400);
    const small = await json(base, `/v1/sessions/${sessionId}/credit/stake`, {
      method: "POST",
      token: ownerToken,
      body: { soulId, amount: 999 },
    });
    assert.equal(small.status, 400, "低于 bonded 门槛必须拒绝");
  });
});
