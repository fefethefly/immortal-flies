import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { CANON } from "../src/brain/canon.mjs";
import { createConfig } from "../server/src/config.mjs";
import { createLogger } from "../server/src/shared/logger.mjs";
import { createVenueService } from "../server/src/venue/service.mjs";
import {
  createPitHandler,
  createPitHost,
} from "../server/src/pit-runner/index.mjs";
import { pitIsLive } from "../src/pit-live.mjs";
import { START_BNB } from "../src/swarm.mjs";

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
        groups: { food: [0, 1], threat: [4], light: [6], left: [4], right: [5] },
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
    "pit-runner-fixture",
  );
}

async function withHost(run) {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-pit-"));
  const config = createConfig({
    PORT: "0",
    IFF_DATA_DIR: dataDir,
    IFF_VENUE_ENABLED: "0",
  });
  config.dataDir = dataDir;
  const logger = createLogger("test-pit");
  const venue = createVenueService({ config, logger });
  const graph = fixtureGraph();
  const host = await createPitHost({
    config,
    logger,
    graph,
    venue,
    size: 1,
    seed: 17,
  });
  const server = createServer(createPitHandler(host));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await run({ host, base });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    venue.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
}

test("pit runner hosts one fly on the injected graph", async () => {
  await withHost(async ({ host, base }) => {
    const health = await fetch(`${base}/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.service, "iff-pit-runner");
    assert.equal(health.size, 1);
    assert.equal(health.fill, "SIM");
    assert.equal(pitIsLive(health), true);
    const view = await fetch(`${base}/v1/pit`).then((r) => r.json());
    assert.equal(view.flies.filter((row) => row.status === "alive").length, 1);
    assert.equal(view.host.kind, "full");
    assert.equal(view.fill || view.market.fill, "SIM");
    const next = await host.tick();
    assert.ok(next.tick >= 1);
    assert.ok(next.hive.equity <= START_BNB * 2);
    const book = await fetch(`${base}/v1/book`).then((r) => r.json());
    assert.equal(book.schema, "iff.pit-book/1");
    assert.equal(book.fill || book.market.fill, "SIM");
    assert.equal(book.hive.equity, next.hive.equity);
    assert.equal(book.members.length, 1);
  });
});

test("pit runner stimulus changes the book without executing a swap", async () => {
  await withHost(async ({ base }) => {
    const res = await fetch(`${base}/v1/pit/stimulus`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "food", intensity: 0.8 }),
    });
    assert.equal(res.status, 200);
    const view = await res.json();
    assert.equal(view.market.fill, "SIM");
    assert.ok(view.stimuliLog[0].kind === "food");
  });
});

test("pit runner restores the shared book after a host restart", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-pit-book-"));
  const config = createConfig({
    PORT: "0",
    IFF_DATA_DIR: dataDir,
    IFF_VENUE_ENABLED: "0",
  });
  config.dataDir = dataDir;
  const logger = createLogger("test-pit-book");
  const venue = createVenueService({ config, logger });
  const graph = fixtureGraph();
  try {
    const first = await createPitHost({
      config,
      logger,
      graph,
      venue,
      size: 1,
      seed: 19,
    });
    await first.tick();
    first.session.kernel.colony.members[0].book.bnb = 77;
    first.session.kernel.colony.members[0].book.realized = 12;
    await first.persistBook();
    const ledger = first.book();
    const second = await createPitHost({
      config,
      logger,
      graph,
      venue,
      size: 1,
      seed: 19,
    });
    assert.equal(second.session.kernel.colony.members[0].book.bnb, 77);
    assert.equal(second.session.kernel.colony.members[0].book.realized, 12);
    assert.equal(second.view().hive.cash, 77);
    assert.equal(second.book().tick, ledger.tick);
  } finally {
    venue.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("IFF_PIT_RESEED lays a fresh $1000 shared book", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "iff-pit-reseed-"));
  const config = createConfig({
    PORT: "0",
    IFF_DATA_DIR: dataDir,
    IFF_VENUE_ENABLED: "0",
  });
  config.dataDir = dataDir;
  const logger = createLogger("test-pit-reseed");
  const venue = createVenueService({ config, logger });
  const graph = fixtureGraph();
  const prev = process.env.IFF_PIT_RESEED;
  try {
    const first = await createPitHost({
      config,
      logger,
      graph,
      venue,
      size: 1,
      seed: 23,
    });
    first.session.kernel.colony.members[0].book.bnb = 1;
    first.session.kernel.colony.trades = [{ tick: 1, side: "SELL", amount: 1 }];
    await first.persistBook();
    process.env.IFF_PIT_RESEED = "1";
    const second = await createPitHost({
      config,
      logger,
      graph,
      venue,
      size: 1,
      seed: 23,
    });
    const hive = second.view().hive;
    assert.equal(hive.fills, 0);
    assert.ok(hive.equity >= START_BNB / 2);
    assert.ok(hive.equity <= START_BNB * 2);
  } finally {
    if (prev == null) delete process.env.IFF_PIT_RESEED;
    else process.env.IFF_PIT_RESEED = prev;
    venue.stop();
    await rm(dataDir, { recursive: true, force: true });
  }
});
