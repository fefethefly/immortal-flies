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
    "vault-service-fixture",
  );
}

async function withApp(run) {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-vault-"));
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
    await run({ base, app });
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

test("用户金库：注资铸份额、所有权隔离、退出结算、身份为 token 哈希", async () => {
  await withApp(async ({ base }) => {
    // 两个用户注资
    const a = await json(base, "/v1/vault/deposit", {
      method: "POST",
      token: "token-alice",
      body: { amount: 1000 },
    });
    assert.equal(a.status, 200);
    assert.match(a.data.positionId, /^pos-\d{4}$/);
    const b = await json(base, "/v1/vault/deposit", {
      method: "POST",
      token: "token-bob",
      body: { amount: 500 },
    });
    assert.equal(b.status, 200);

    const view = await json(base, "/v1/vault");
    assert.equal(view.status, 200);
    assert.equal(view.data.schema, "iff.vault/1");
    assert.equal(view.data.shares, 1500);
    assert.equal(view.data.batches.length, 2);
    for (const batch of view.data.batches) {
      assert.match(batch.owner, /^owner:[0-9a-f]{64}$/, "磁盘不存明文 token");
    }

    // 他人份额不可赎回；超额不可赎回
    const steal = await json(base, "/v1/vault/exit", {
      method: "POST",
      token: "token-bob",
      body: { shares: 1001 },
    });
    assert.equal(steal.status, 400);
    const over = await json(base, "/v1/vault/exit", {
      method: "POST",
      token: "token-alice",
      body: { shares: 2000 },
    });
    assert.equal(over.status, 400);

    // 正常退出 + 结算
    const exit = await json(base, "/v1/vault/exit", {
      method: "POST",
      token: "token-alice",
      body: { shares: 400 },
    });
    assert.equal(exit.status, 200);
    assert.equal(exit.data.status, "queued");
    const settled = await json(base, "/v1/vault/settle", { method: "POST" });
    assert.equal(settled.status, 200);
    assert.equal(settled.data.settled.length, 1);
    const after = await json(base, "/v1/vault");
    assert.equal(after.data.shares, 1100);
    assert.equal(after.data.exits[0].status, "done");
  });
});

test("用户金库与协议资金分账：vault 快照与 protocol 无交集字段", async () => {
  await withApp(async ({ base }) => {
    await json(base, "/v1/vault/deposit", {
      method: "POST",
      token: "token-x",
      body: { amount: 100 },
    });
    const view = await json(base, "/v1/vault");
    assert.ok(!("ifsBudget" in view.data));
    assert.ok(!("buyback" in view.data));
    assert.ok(!("stakes" in view.data));
  });
});
