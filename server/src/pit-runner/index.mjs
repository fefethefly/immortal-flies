/**
 * Official hosted paper pit on malecns-full.
 * Not the mining runner: no hub, no key, no IFS wage.
 * One fly, one full connectome. Kyber quotes in; fills stay SIM.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGraphFromDir } from "../shared/graph-fs.mjs";
import { requireLittleEndianGraph } from "../../../src/brain/endian.mjs";
import { createLogger } from "../shared/logger.mjs";
import { createConfig } from "../config.mjs";
import { createVenueService } from "../venue/service.mjs";
import {
  createPitSession,
  pitView,
  pulsePit,
  restorePitSession,
  savePitSession,
  stepPit,
} from "../../../src/brain/flyswarm/pit.mjs";
import { offerObservation } from "../../../src/brain/flyswarm/market.mjs";
import { worldView } from "../../../src/brain/flyswarm/world.mjs";
import { decorateQuotes, observationFromQuotes } from "../../../src/venue-quotes.mjs";
import { restorePort } from "../../../src/brain/fill-admit.mjs";
import { resetSharedBook } from "../../../src/brain/colony.mjs";
import { snapshotBaseline } from "../../../src/brain/flyswarm/layers.mjs";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const SNAPSHOT = "pit-snapshot.json";
const BOOK = "pit-book.json";
const SIZE = Math.max(1, Number(process.env.IFF_PIT_SIZE || 1) || 1);
const TICK_MS = Math.max(500, Number(process.env.IFF_PIT_TICK_MS || 1000) || 1000);
const SEED = Number(process.env.IFF_PIT_SEED || 20260916) >>> 0;

async function writeAtomic(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, typeof data === "string" ? data : `${JSON.stringify(data)}\n`);
  await rename(tmp, file);
}

export function bookLedger(session) {
  const view = pitView(session);
  return {
    schema: "iff.pit-book/1",
    tick: view.tick,
    savedAt: Date.now(),
    market: {
      price: view.market.price,
      mark: view.market.mark,
      assetId: view.market.assetId,
      quote: view.market.quote,
      fill: "SIM",
    },
    edgeWindow: [...(session.kernel.colony.market.edgeWindow || [])],
    hive: view.hive,
    members: session.kernel.colony.members.map((member) => ({
      id: member.id,
      status: member.status,
      book: structuredClone(member.book),
      port: structuredClone(member.port || null),
    })),
    trades: structuredClone(session.kernel.colony.trades || []).slice(0, 500),
    prices: [...(session.aux.prices || [])],
  };
}

export function applyBookLedger(session, ledger) {
  if (!ledger || ledger.schema !== "iff.pit-book/1") return false;
  const byId = new Map((ledger.members || []).map((row) => [row.id, row]));
  for (const member of session.kernel.colony.members) {
    const row = byId.get(member.id);
    if (row?.book) member.book = structuredClone(row.book);
    if (row) member.port = restorePort(row.port);
  }
  if (Array.isArray(ledger.trades)) {
    session.kernel.colony.trades = structuredClone(ledger.trades);
  }
  if (ledger.market?.price) {
    session.kernel.colony.market.price = ledger.market.price;
    session.kernel.colony.market.mark = ledger.market.mark || "USD";
    session.kernel.colony.market.quote = ledger.market.quote || "LIVE";
    session.kernel.colony.market.assetId =
      ledger.market.assetId || session.kernel.colony.market.assetId;
  }
  if (Number.isFinite(Number(ledger.tick))) {
    session.kernel.colony.tick = Math.max(
      session.kernel.colony.tick,
      Math.trunc(ledger.tick),
    );
  }
  if (Array.isArray(ledger.prices) && ledger.prices.length) {
    session.aux.prices = ledger.prices;
  }
  if (Array.isArray(ledger.edgeWindow)) {
    session.kernel.colony.market.edgeWindow = ledger.edgeWindow.map((n) =>
      Math.trunc(Number(n) || 0),
    );
  }
  return true;
}

export async function createPitHost({
  config,
  logger,
  graph,
  venue,
  size = SIZE,
  seed = SEED,
} = {}) {
  const dataDir = config.dataDir;
  await mkdir(dataDir, { recursive: true });
  const snapFile = join(dataDir, SNAPSHOT);
  const bookFile = join(dataDir, BOOK);
  let session = null;
  if (existsSync(snapFile)) {
    try {
      const saved = JSON.parse(await readFile(snapFile, "utf8"));
      session = await restorePitSession(saved, { graph });
      logger?.info?.("pit snapshot restored", { tick: session.kernel.colony.tick });
    } catch (err) {
      logger?.warn?.("pit snapshot discarded", { error: err?.message || String(err) });
    }
  }
  if (!session) {
    session = await createPitSession({ graph, seed, size });
  }
  if (existsSync(bookFile)) {
    try {
      const ledger = JSON.parse(await readFile(bookFile, "utf8"));
      if (applyBookLedger(session, ledger)) {
        logger?.info?.("pit book restored", { tick: ledger.tick });
      }
    } catch (err) {
      logger?.warn?.("pit book discarded", { error: err?.message || String(err) });
    }
  }
  session.aux.host = {
    kind: "full",
    dataset: graph.manifest?.id || "malecns-full",
    neurons: graph.n,
    size,
  };

  const reseed =
    process.env.IFF_PIT_RESEED === "1" || process.env.IFF_PIT_RESEED === "true";
  if (reseed) {
    const reset = resetSharedBook(session.kernel.colony);
    session.aux.baseline = snapshotBaseline(session.kernel);
    session.aux.prices = [session.kernel.colony.market.price];
    logger?.info?.("pit book reseeded", reset);
  }

  const status = {
    service: "iff-pit-runner",
    audit: "SIM",
    yield: false,
    fill: "SIM",
    dataset: graph.manifest?.id || "malecns-full",
    neurons: graph.n,
    size,
    ready: true,
    lastTick: null,
    lastError: null,
    tick: session.kernel.colony.tick,
    note: "Full MaleCNS paper pit. Kyber quotes drive sense. Fills stay SIM. Not the mining runner.",
  };

  async function persist() {
    await writeAtomic(snapFile, savePitSession(session));
  }

  async function persistBook() {
    await writeAtomic(bookFile, bookLedger(session));
  }

  async function persistAll({ full = false } = {}) {
    await persistBook();
    if (full) await persist();
  }

  if (reseed) {
    await persistAll({ full: true });
  }

  function feedQuotes() {
    const quotes = decorateQuotes(venue.getQuotes(), "server");
    const obs = observationFromQuotes(quotes);
    if (!obs || !session.aux.market) return quotes;
    try {
      offerObservation(session.aux.market, obs);
    } catch (err) {
      logger?.warn?.("pit offer skipped", { error: err?.message || String(err) });
    }
    return quotes;
  }

  async function tick() {
    feedQuotes();
    const view = await stepPit(session);
    status.lastTick = new Date().toISOString();
    status.tick = view.tick;
    status.lastError = null;
    await persistBook();
    if (view.tick % 10 === 0) {
      persist().catch((err) => {
        logger?.warn?.("pit snapshot persist skipped", {
          error: err?.message || String(err),
        });
      });
    }
    return view;
  }

  async function stimulus(kind, intensity = 0.7) {
    await pulsePit(session, kind || "light", intensity);
    await persistBook();
    return pitView(session);
  }

  function view() {
    return pitView(session);
  }

  function world() {
    return worldView(session);
  }

  function book() {
    return bookLedger(session);
  }

  return {
    session,
    status,
    tick,
    persist,
    persistBook,
    persistAll,
    stimulus,
    view,
    world,
    book,
    feedQuotes,
  };
}

function send(res, status, body) {
  const payload = typeof body === "string" ? body : `${JSON.stringify(body)}\n`;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function createPitHandler(host) {
  return async function handler(req, res) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      send(res, host.status.ready ? 200 : 503, {
        ok: host.status.ready,
        service: host.status.service,
        audit: host.status.audit,
        fill: "SIM",
        dataset: host.status.dataset,
        neurons: host.status.neurons,
        size: host.status.size,
        yield: false,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/status") {
      send(res, 200, host.status);
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/pit") {
      send(res, 200, host.view());
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/book") {
      send(res, 200, host.book());
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/world") {
      send(res, 200, host.world());
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/venue/quotes") {
      send(res, 200, host.feedQuotes());
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/pit/stimulus") {
      try {
        const body = await readJson(req);
        send(res, 200, await host.stimulus(body.kind, body.intensity));
      } catch (err) {
        send(res, /刺激冷却/.test(err.message) ? 409 : 400, {
          error: err.message || String(err),
        });
      }
      return;
    }
    send(res, 404, { error: "not found" });
  };
}

async function main() {
  const config = createConfig(process.env);
  const logger = createLogger("iff-pit-runner");
  const graphDir = resolve(
    process.env.IFF_GRAPH_DIR ||
      (existsSync(join(root, "public/data/malecns-full/graph.bin"))
        ? join(root, "public/data/malecns-full")
        : join(root, "public/data/malecns-circuit")),
  );
  config.graphDir = graphDir;
  const bin = readFileSync(join(graphDir, "graph.bin"));
  requireLittleEndianGraph(bin);
  const graph = await loadGraphFromDir(graphDir);
  const venue = createVenueService({ config, logger });
  venue.start();
  const host = await createPitHost({ config, logger, graph, venue });
  const port = Number(process.env.PORT || config.port || 8787);
  const server = createServer(createPitHandler(host));
  await new Promise((resolveListen) => server.listen(port, "0.0.0.0", resolveListen));
  logger.info("listening", {
    port,
    dataset: host.status.dataset,
    neurons: host.status.neurons,
    size: host.status.size,
  });

  let busy = false;
  const loop = async () => {
    if (busy) return;
    busy = true;
    try {
      await host.tick();
    } catch (err) {
      host.status.lastError = String(err.message || err);
      logger.error("pit tick failed", { error: host.status.lastError });
    } finally {
      busy = false;
    }
  };
  setTimeout(() => {
    loop().catch(() => {});
  }, 250);
  setInterval(() => {
    loop().catch(() => {});
  }, TICK_MS);

  const shutdown = async (signal) => {
    logger.info("shutdown", { signal });
    venue.stop();
    try {
      await host.persistAll({ full: true });
    } catch (err) {
      logger.error("persist on shutdown failed", { error: err?.message || String(err) });
    }
    await new Promise((resolveClose) => server.close(resolveClose));
    process.exit(0);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || "")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
