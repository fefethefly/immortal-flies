import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { fileURLToPath } from "node:url";
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
    "server-fixture",
  );
}

async function withApp(run) {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-server-"));
  const config = createConfig({
    PORT: "0",
    IFF_DATA_DIR: dataDir,
    IFF_CORS_ORIGINS: "http://127.0.0.1:4173",
  });
  config.port = 0;
  config.dataDir = dataDir;
  const logger = createLogger("test");
  const store = createStore(dataDir);
  const graph = fixtureGraph();
  const sessions = createSessionService({ config, store, logger });
  await sessions.boot(graph);
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

async function json(
  base,
  path,
  { method = "GET", token, body, headers = {} } = {},
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data, headers: res.headers };
}

test("loadGraphFromDir loads MaleCNS circuit from disk", async () => {
  const dir = fileURLToPath(
    new URL("../public/data/malecns-circuit", import.meta.url),
  );
  const graph = await loadGraphFromDir(dir);
  assert.equal(graph.n, 12000);
  assert.ok(graph.e > 1000);
  assert.equal(graph.manifest.id, "malecns-circuit");
});

test("health and ready", async () => {
  await withApp(async ({ base }) => {
    const health = await json(base, "/health");
    assert.equal(health.status, 200);
    assert.equal(health.data.status, "ok");
    const ready = await json(base, "/ready");
    assert.equal(ready.status, 200);
    assert.equal(ready.data.status, "ok");
    assert.equal(ready.data.checks.graph.status, "ok");
  });
});

test("session tick stimulus archive prove branch llm", async () => {
  await withApp(async ({ base }) => {
    const created = await json(base, "/v1/sessions", {
      method: "POST",
      body: { seed: 42 },
    });
    assert.equal(created.status, 200);
    const { sessionId, ownerToken } = created.data;
    assert.ok(sessionId);
    assert.ok(ownerToken);
    assert.equal(created.data.view.pit.tick, 0);
    assert.equal(created.data.view.world.audit, "SIM");

    const tick1 = await json(base, `/v1/sessions/${sessionId}/tick`, {
      method: "POST",
      token: ownerToken,
      headers: { "Idempotency-Key": "t1" },
    });
    assert.equal(tick1.status, 200);
    assert.equal(tick1.data.view.pit.tick, 1);

    const tickDup = await json(base, `/v1/sessions/${sessionId}/tick`, {
      method: "POST",
      token: ownerToken,
      headers: { "Idempotency-Key": "t1" },
    });
    assert.equal(tickDup.data.view.pit.tick, 1);

    const stim = await json(base, `/v1/sessions/${sessionId}/stimulus`, {
      method: "POST",
      token: ownerToken,
      body: { kind: "food", intensity: 0.8 },
    });
    assert.equal(stim.status, 200);

    const cool = await json(base, `/v1/sessions/${sessionId}/stimulus`, {
      method: "POST",
      token: ownerToken,
      body: { kind: "threat", intensity: 0.5 },
    });
    assert.equal(cool.status, 409);
    assert.equal(cool.data.title, "STIM_COOLDOWN");

    for (let i = 0; i < 4; i++) {
      await json(base, `/v1/sessions/${sessionId}/tick`, {
        method: "POST",
        token: ownerToken,
      });
    }

    const flyId = stim.data.view.pit.flies[0].id;
    const explain = await json(base, "/v1/llm/explain", {
      method: "POST",
      token: ownerToken,
      body: { sessionId, flyId, locale: "zh" },
    });
    assert.equal(explain.status, 200);
    assert.equal(explain.data.schema, "iff.explain/1");
    assert.ok(explain.data.resultHash);
    assert.equal(explain.data.explainer.degraded, false);
    assert.ok(explain.data.narrative);

    const plan = await json(base, "/v1/llm/plan", {
      method: "POST",
      token: ownerToken,
      body: { sessionId },
    });
    assert.equal(plan.status, 200);
    assert.equal(plan.data.executed, false);
    assert.ok(Array.isArray(plan.data.plans));

    const archive = await json(base, `/v1/sessions/${sessionId}/archive`, {
      token: ownerToken,
    });
    assert.equal(archive.status, 200);
    assert.equal(archive.data.payload.schema, "iff.colony-archive/1");
    assert.ok(archive.data.sha256);
    assert.ok(
      archive.data.payload.members[0].archive.payload.schema ===
        "iff.archive/1",
    );

    const proof = await json(base, `/v1/sessions/${sessionId}/prove`, {
      method: "POST",
      token: ownerToken,
    });
    assert.equal(proof.status, 200);
    assert.equal(proof.data.equal, true);

    const branch = await json(base, `/v1/sessions/${sessionId}/branches`, {
      method: "POST",
      token: ownerToken,
      body: { label: "实验" },
    });
    assert.equal(branch.status, 200);
    const got = await json(base, `/v1/branches/${branch.data.branchId}`);
    assert.equal(got.status, 200);
    assert.equal(got.data.id, branch.data.branchId);

    const restored = await json(base, `/v1/sessions/${sessionId}/restore`, {
      method: "POST",
      token: ownerToken,
      body: { archive: archive.data },
    });
    assert.equal(restored.status, 200);
    assert.equal(restored.data.view.pit.tick, archive.data.payload.tick);

    const ask = await json(base, "/v1/llm/ask", {
      method: "POST",
      token: ownerToken,
      body: { sessionId, questionId: "q-society" },
    });
    assert.equal(ask.status, 200);
    assert.ok(ask.data.answer.key);

    const unauth = await json(base, `/v1/sessions/${sessionId}/tick`, {
      method: "POST",
    });
    assert.equal(unauth.status, 401);
  });
});

test("restart restores session from disk with owner token and flyswarm log", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-server-rst-"));
  const graph = fixtureGraph();
  try {
    const config = createConfig({ IFF_DATA_DIR: dataDir });
    config.dataDir = dataDir;
    const logger = createLogger("test");
    const store = createStore(dataDir);
    const sessions = createSessionService({ config, store, logger });
    await sessions.boot(graph);
    const created = await sessions.createSession({ seed: 99 });
    const token = created.ownerToken;
    const fakeReq = { headers: { authorization: `Bearer ${token}` } };
    await sessions.tick(created.sessionId, fakeReq);
    await sessions.tick(created.sessionId, fakeReq);
    await sessions.tick(created.sessionId, fakeReq);
    const before = await sessions.getArchive(created.sessionId, fakeReq);
    const beforeView = await sessions.getSession(created.sessionId);
    const logCount = before.payload.flyswarmLog.entries.length;
    assert.ok(logCount > 0);
    assert.ok(before.payload.lastQuorum);

    const sessions2 = createSessionService({ config, store, logger });
    await sessions2.boot(graph);
    assert.ok(sessions2.liveSize >= 1);
    const view = await sessions2.getSession(created.sessionId);
    assert.equal(view.view.pit.tick, 3);
    assert.deepEqual(
      view.view.pit.flies.map((f) => f.genome),
      beforeView.view.pit.flies.map((f) => f.genome),
    );
    assert.deepEqual(
      view.view.pit.flies.map((f) => f.phenotype),
      beforeView.view.pit.flies.map((f) => f.phenotype),
    );
    const restoredArchive = await sessions2.getArchive(
      created.sessionId,
      fakeReq,
    );
    assert.deepEqual(
      restoredArchive.payload.members.map((m) => m.genome),
      before.payload.members.map((m) => m.genome),
    );
    // Backward-compatible recovery reads actual birth records in old pitSnapshot.
    const legacy = structuredClone(before);
    legacy.payload.members.forEach((m) => delete m.genome);
    delete legacy.sha256;
    await sessions2.restoreFromArchive(
      created.sessionId,
      { archive: legacy },
      fakeReq,
    );
    assert.deepEqual(
      (await sessions2.getSession(created.sessionId)).view.pit.flies.map(
        (f) => f.phenotype,
      ),
      beforeView.view.pit.flies.map((f) => f.phenotype),
    );
    const missing = structuredClone(before);
    missing.payload.members.forEach((m) => delete m.genome);
    if (missing.payload.pitSnapshot?.members) {
      missing.payload.pitSnapshot.members.forEach((m) => delete m.genome);
    }
    delete missing.sha256;
    await assert.rejects(
      () =>
        sessions2.restoreFromArchive(
          created.sessionId,
          { archive: missing },
          fakeReq,
        ),
      (err) => err.code === "ARCHIVE_GENOME_MISSING",
    );
    const ticked = await sessions2.tick(created.sessionId, fakeReq);
    assert.equal(ticked.view.pit.tick, 4);
    const proof = await sessions2.prove(created.sessionId, fakeReq);
    assert.equal(proof.equal, true);
    assert.ok(proof.log.count >= logCount);
    const after = await sessions2.getArchive(created.sessionId, fakeReq);
    assert.equal(
      after.payload.flyswarmLog.snapshot.sealed.length,
      before.payload.flyswarmLog.snapshot.sealed.length,
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("idle evicts memory then lazy-loads; max age deletes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-server-ttl-"));
  const graph = fixtureGraph();
  try {
    let now = 1_000_000;
    const config = createConfig({ IFF_DATA_DIR: dataDir });
    config.dataDir = dataDir;
    config.now = () => now;
    config.session = { idleMs: 100, maxAgeMs: 10_000, maxLive: 64 };
    const logger = createLogger("test");
    const store = createStore(dataDir);
    const sessions = createSessionService({ config, store, logger });
    await sessions.boot(graph);
    const created = await sessions.createSession({ seed: 3 });
    const token = created.ownerToken;
    await sessions.tick(created.sessionId, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(sessions.liveSize, 1);

    now = 1_000_250;
    const swept = await sessions.sweep();
    assert.equal(swept.evicted, 1);
    assert.equal(sessions.liveSize, 0);

    const view = await sessions.getSession(created.sessionId);
    assert.equal(view.view.pit.tick, 1);
    assert.equal(sessions.liveSize, 1);

    now = 1_020_000;
    await sessions.sweep();
    await assert.rejects(
      () => sessions.getSession(created.sessionId),
      /not found/,
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("tick rate limit returns 429", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-server-rl-"));
  try {
    const config = createConfig({ IFF_DATA_DIR: dataDir });
    config.dataDir = dataDir;
    config.port = 0;
    config.rate = {
      tickPerSec: 2,
      writePerMin: 60,
      llmPerMin: 20,
      createPerMin: 20,
    };
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
      const created = await json(base, "/v1/sessions", {
        method: "POST",
        body: { seed: 1 },
      });
      const { sessionId, ownerToken } = created.data;
      const a = await json(base, `/v1/sessions/${sessionId}/tick`, {
        method: "POST",
        token: ownerToken,
      });
      const b = await json(base, `/v1/sessions/${sessionId}/tick`, {
        method: "POST",
        token: ownerToken,
      });
      const c = await json(base, `/v1/sessions/${sessionId}/tick`, {
        method: "POST",
        token: ownerToken,
      });
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(c.status, 429);
      assert.equal(c.data.title, "RATE_LIMITED");
      assert.ok(c.headers.get("retry-after"));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("P2 world layers and read-only market offer", async () => {
  await withApp(async ({ base }) => {
    const created = await json(base, "/v1/sessions", {
      method: "POST",
      body: { seed: 21 },
    });
    const { sessionId, ownerToken } = created.data;
    await json(base, `/v1/sessions/${sessionId}/tick`, {
      method: "POST",
      token: ownerToken,
    });
    const world = await json(base, `/v1/sessions/${sessionId}/world`);
    assert.equal(world.status, 200);
    assert.equal(world.data.world.schema, "iff.paper-layers/1");
    assert.ok(world.data.world.colony.society);
    assert.ok(world.data.world.transparency.netCost);
    const risk = await json(base, `/v1/sessions/${sessionId}/layers/risk`);
    assert.equal(risk.status, 200);
    assert.equal(risk.data.layer, "risk");
    const bad = await json(base, `/v1/sessions/${sessionId}/market`, {
      method: "POST",
      token: ownerToken,
      body: { changeBps: 12, signature: "0x01" },
    });
    assert.equal(bad.status, 400);
    const offered = await json(base, `/v1/sessions/${sessionId}/market`, {
      method: "POST",
      token: ownerToken,
      body: {
        payload: { changeBps: -200, activity: 4 },
        provenance: { kind: "simulation" },
      },
    });
    assert.equal(offered.status, 200);
    assert.equal(offered.data.pending.payload.changeBps, -200);
    await json(base, `/v1/sessions/${sessionId}/tick`, {
      method: "POST",
      token: ownerToken,
    });
    const market = await json(base, `/v1/sessions/${sessionId}/layers/market`);
    assert.equal(market.data.market.last.source, "offered-sim");
  });
});

test("llm degrades without provider key", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-server-deg-"));
  try {
    const config = createConfig({ IFF_DATA_DIR: dataDir, OPENAI_API_KEY: "" });
    config.dataDir = dataDir;
    config.openai.apiKey = "";
    const logger = createLogger("test");
    const store = createStore(dataDir);
    const sessions = createSessionService({ config, store, logger });
    await sessions.boot(fixtureGraph());
    const app = await createApp({
      config,
      logger,
      store,
      sessions,
      skipBoot: true,
      // real provider with empty key
    });
    const server = createServer(app.handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    try {
      const created = await json(base, "/v1/sessions", {
        method: "POST",
        body: { seed: 7 },
      });
      await json(base, `/v1/sessions/${created.data.sessionId}/tick`, {
        method: "POST",
        token: created.data.ownerToken,
      });
      const flyId = created.data.view.pit.flies[0].id;
      const explain = await json(base, "/v1/llm/explain", {
        method: "POST",
        token: created.data.ownerToken,
        body: { sessionId: created.data.sessionId, flyId },
      });
      assert.equal(explain.status, 200);
      assert.equal(explain.data.locale, "en");
      assert.equal(explain.data.explainer.degraded, true);
      assert.equal(explain.data.narrative, null);
      assert.ok(explain.data.steps.length >= 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
