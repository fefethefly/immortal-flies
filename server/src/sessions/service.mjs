import { randomBytes } from "node:crypto";
import { loadGraphFromDir } from "../shared/graph-fs.mjs";
import { hash, BrainError } from "../../../src/brain/codec.mjs";
import { BrainSession } from "../../../src/brain/session.mjs";
import { bindGenesis, createKernel } from "../../../src/brain/kernel.mjs";
import { createOverlay } from "../../../src/brain/learn.mjs";
import {
  createPitSession,
  pulsePit,
  stepPit,
  settleNow,
  pitView,
  PIT_MODEL,
  restorePitSession,
  savePitSession,
} from "../../../src/brain/flyswarm/pit.mjs";
import { createRoster } from "../../../src/brain/flyswarm/membership.mjs";
import {
  createBranch,
  createWorld,
  replayChain,
  restoreWorld,
  saveWorld,
  worldView,
} from "../../../src/brain/flyswarm/world.mjs";
import {
  createMarketFeed,
  offerObservation,
  restoreMarket,
} from "../../../src/brain/flyswarm/market.mjs";
import { protocolView } from "../../../src/brain/flyswarm/protocol.mjs";
import {
  LAYER_IDS,
  paperLayer,
  paperLayers,
} from "../../../src/brain/flyswarm/layers.mjs";
import {
  AppError,
  badRequest,
  conflict,
  notFound,
  tooMany,
  unauthorized,
} from "../shared/errors.mjs";
import { hashToken, tokensMatch } from "../shared/tokens.mjs";
import { createSchemas, validateRecord } from "../../../src/brain/flyswarm/schemas.mjs";

const genomeSchemas = createSchemas();

const ARCHIVE_SCHEMA = "iff.colony-archive/1";

function newId(prefix) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h).trim());
  return m ? m[1].trim() : "";
}

function mapBrainError(err) {
  if (err instanceof BrainError) {
    const status =
      err.code === "JOURNAL_LIMIT" || err.code === "REPLAY_LIMIT" ? 409 : 400;
    return new AppError(err.code, status, err.message);
  }
  if (err instanceof Error && /刺激冷却/.test(err.message)) {
    return conflict("STIM_COOLDOWN", err.message);
  }
  return err;
}

/** 内存 Session 运行时 + 磁盘档案。tick 由客户端驱动；compact 关闭以保留完整重放。 */
export function createSessionService({ config, store, logger, venue = null }) {
  /** @type {Map<string, object>} */
  const live = new Map();
  /** @type {Map<string, string>} soulId -> sessionId */
  const soulIndex = new Map();
  /** @type {object|null} */
  let graph = null;
  let graphReady = false;
  let graphError = null;

  const clock = () =>
    typeof config.now === "function" ? config.now() : Date.now();
  const idleMs = () => config.session?.idleMs ?? 2 * 60 * 60 * 1000;
  const maxAgeMs = () => config.session?.maxAgeMs ?? 0;
  const maxLive = () => config.session?.maxLive ?? 64;

  async function boot(preloadedGraph = null) {
    await store.ensure();
    if (preloadedGraph) {
      graph = preloadedGraph;
      graphReady = true;
      graphError = null;
      logger.info("graph injected", { neurons: graph.n, edges: graph.e });
    } else {
      try {
        graph = await loadGraphFromDir(config.graphDir);
        graphReady = true;
        logger.info("graph loaded", {
          neurons: graph.n,
          edges: graph.e,
          dir: config.graphDir,
        });
      } catch (err) {
        graphReady = false;
        graphError = err?.message || String(err);
        logger.error("graph load failed", { error: graphError });
        throw err;
      }
    }
    await restoreFromDisk();
  }

  async function restoreFromDisk() {
    const ids = await store.listSessionIds();
    let restored = 0;
    let purged = 0;
    const now = clock();
    for (const sessionId of ids) {
      try {
        const meta = await store.loadSessionMeta(sessionId);
        const createdAt = meta.createdAt || meta.updatedAt || 0;
        if (maxAgeMs() > 0 && createdAt && now - createdAt > maxAgeMs()) {
          await store.deleteSession(sessionId);
          purged += 1;
          continue;
        }
        const recentlyActive =
          !idleMs() || now - (meta.updatedAt || createdAt) <= idleMs();
        if (!recentlyActive) continue;
        if (live.size >= maxLive()) break;
        await loadFromDisk(sessionId, meta);
        restored += 1;
      } catch (err) {
        logger.warn("session restore skipped", {
          sessionId,
          error: err?.message || String(err),
        });
      }
    }
    logger.info("sessions restored", {
      restored,
      purged,
      live: live.size,
      disk: ids.length,
    });
  }

  function requireGraph() {
    if (!graphReady || !graph) {
      throw new AppError(
        "GRAPH_UNAVAILABLE",
        503,
        graphError || "Connectome graph not loaded",
      );
    }
  }

  function forgetSouls(sessionId) {
    for (const [soulId, sid] of [...soulIndex.entries()]) {
      if (sid === sessionId) soulIndex.delete(soulId);
    }
  }

  function evict(sessionId) {
    const row = live.get(sessionId);
    if (!row) return;
    live.delete(sessionId);
    forgetSouls(sessionId);
  }

  async function purge(sessionId) {
    evict(sessionId);
    await store.deleteSession(sessionId);
  }

  function isMaxAge(row, now = clock()) {
    return maxAgeMs() > 0 && now - row.createdAt > maxAgeMs();
  }

  function isIdle(row, now = clock()) {
    return idleMs() > 0 && now - row.lastAccessAt > idleMs();
  }

  async function sweep(now = clock()) {
    let evicted = 0;
    let purged = 0;
    for (const [sessionId, row] of [...live.entries()]) {
      if (isMaxAge(row, now)) {
        await purge(sessionId);
        purged += 1;
        continue;
      }
      if (isIdle(row, now)) {
        evict(sessionId);
        evicted += 1;
      }
    }
    const ids = await store.listSessionIds().catch(() => []);
    for (const sessionId of ids) {
      if (live.has(sessionId)) continue;
      try {
        const meta = await store.loadSessionMeta(sessionId);
        const createdAt = meta.createdAt || meta.updatedAt || 0;
        if (maxAgeMs() > 0 && createdAt && now - createdAt > maxAgeMs()) {
          await store.deleteSession(sessionId);
          purged += 1;
        }
      } catch {
        // ignore unreadable leftovers
      }
    }
    if (evicted || purged)
      logger.info("session sweep", { evicted, purged, live: live.size });
    return { evicted, purged, live: live.size };
  }

  async function loadFromDisk(sessionId, metaHint = null) {
    requireGraph();
    const meta = metaHint || (await store.loadSessionMeta(sessionId));
    const archive = await store.loadArchive(sessionId);
    const session = await sessionFromArchive(archive.payload || archive);
    const createdAt = meta.createdAt || meta.updatedAt || clock();
    if (maxAgeMs() > 0 && clock() - createdAt > maxAgeMs()) {
      await store.deleteSession(sessionId);
      return null;
    }
    return installLive({
      sessionId,
      ownerTokenHash: meta.ownerTokenHash,
      running: meta.running !== false,
      createdAt,
      lastAccessAt: meta.updatedAt || createdAt,
      session,
    });
  }

  async function getLive(sessionId) {
    await sweep();
    let row = live.get(sessionId);
    if (!row) {
      try {
        row = await loadFromDisk(sessionId);
      } catch {
        row = null;
      }
    }
    if (!row) throw notFound("session", sessionId);
    if (isMaxAge(row)) {
      await purge(sessionId);
      throw notFound("session", sessionId);
    }
    row.lastAccessAt = clock();
    return row;
  }

  function assertOwner(row, req) {
    const token = bearer(req);
    if (!tokensMatch(token, row.ownerTokenHash)) throw unauthorized();
  }

  function composeView(session) {
    const venueSnap = venue?.getQuotes?.() || null;
    return {
      pit: pitView(session),
      world: worldView(session),
      venue: venueSnap,
    };
  }

  function reindexSouls(sessionId, session) {
    forgetSouls(sessionId);
    for (const member of session.kernel.colony.members) {
      const soulId = member.session?.state?.soulId;
      if (soulId) soulIndex.set(soulId, sessionId);
    }
    const roster = session.kernel.flyswarm.roster.snapshot();
    for (const entry of roster) {
      if (entry.soulId) soulIndex.set(entry.soulId, sessionId);
    }
  }

  function installLive({
    sessionId,
    ownerTokenHash,
    running,
    createdAt,
    lastAccessAt,
    session,
  }) {
    const row = {
      sessionId,
      ownerTokenHash,
      running: running !== false,
      session,
      idempotency: new Map(),
      createdAt: createdAt || clock(),
      lastAccessAt: lastAccessAt || clock(),
    };
    live.set(sessionId, row);
    reindexSouls(sessionId, session);
    return row;
  }

  async function persistMeta(row) {
    await store.saveSessionMeta(row.sessionId, {
      sessionId: row.sessionId,
      ownerTokenHash: row.ownerTokenHash,
      seed: row.session.aux.seed,
      genesisId: row.session.kernel.flyswarm.genesisId,
      running: row.running,
      tick: row.session.kernel.colony.tick,
      createdAt: row.createdAt,
      updatedAt: clock(),
    });
  }

  async function persistFull(row) {
    await persistMeta(row);
    const archive = await buildArchive(row);
    await store.saveArchive(row.sessionId, archive);
    return archive;
  }

  async function flushAll() {
    for (const row of live.values()) {
      try {
        await persistFull(row);
      } catch (err) {
        logger.error("flush failed", {
          sessionId: row.sessionId,
          error: err?.message || String(err),
        });
      }
    }
  }

  function applyFlyswarmLog(kernel, payload) {
    const pack = payload.flyswarmLog;
    if (!pack) return;
    const log = kernel.flyswarm.log;
    if (
      typeof log.importArchive === "function" &&
      Array.isArray(pack.entries)
    ) {
      log.importArchive({
        entries: pack.entries,
        sealed: pack.snapshot?.sealed || [],
      });
    }
    if (payload.lastQuorum)
      kernel.flyswarm.lastQuorum = structuredClone(payload.lastQuorum);
    if (payload.soulHashes) {
      kernel.flyswarm.soulPrev = new Map(Object.entries(payload.soulHashes));
    }
  }

  async function sessionFromArchive(payload) {
    requireGraph();
    if (
      Array.isArray(payload.members) &&
      payload.members.length &&
      payload.members[0]?.archive
    ) {
      const kernel = createKernel(graph, {
        size: 1,
        seed: payload.seed,
        stepsPerTick: 6,
      });
      kernel.colony.members = [];
      for (const member of payload.members) {
        const session = await BrainSession.restore(member.archive, graph);
        // Older server archives omitted this field but kept it in pitSnapshot.
        // Never manufacture birth identity from the evolved RNG.
        const savedGenome = member.genome || payload.pitSnapshot?.members?.find(
          (item) => item.id === member.id,
        )?.genome;
        if (!savedGenome) throw badRequest("ARCHIVE_GENOME_MISSING", "Birth genome unavailable; preserve this archive for explicit migration");
        validateRecord(genomeSchemas, savedGenome);
        if (savedGenome.soulId !== session.state.soulId) {
          throw badRequest("ARCHIVE_GENOME_ID", "Genome and session identity differ");
        }
        kernel.colony.members.push({
          id: member.id,
          gen: member.gen,
          parent: member.parent,
          status: member.status,
          session,
          book: structuredClone(member.book),
          overlay: structuredClone(member.overlay || createOverlay()),
          genome: structuredClone(savedGenome),
          ethology: null,
          intent: null,
        });
      }
      kernel.colony.tick = payload.tick;
      kernel.colony.nextId = payload.nextId;
      kernel.colony.lineage = structuredClone(payload.lineage || []);
      kernel.colony.market.price = payload.marketPrice;
      kernel.colony.trades = structuredClone(payload.trades || []);
      const roster = createRoster();
      for (const entry of payload.roster || []) {
        roster.register({
          soulId: entry.soulId,
          runnerPub: entry.runnerPub,
          tier: entry.tier,
          tick: entry.sinceTick,
        });
        if (entry.status === "retired")
          roster.retire(entry.soulId, entry.retiredTick ?? entry.sinceTick);
      }
      kernel.flyswarm.roster = roster;
      await bindGenesis(kernel, { seed: payload.seed });
      applyFlyswarmLog(kernel, payload);
      const aux = {
        model: PIT_MODEL,
        seed: payload.aux?.seed ?? payload.seed,
        rng: payload.aux?.rng ?? payload.seed,
        lastStimTick: payload.aux?.lastStimTick ?? -1_000_000,
        cooldownTicks: payload.aux?.cooldownTicks ?? 30,
        stimLog: structuredClone(payload.aux?.stimLog || []),
        prices: structuredClone(payload.aux?.prices || [payload.marketPrice]),
        settleAt: payload.aux?.settleAt ?? payload.tick + 100,
        pending: null,
        market: restoreMarket(payload.aux?.market),
        baseline: payload.aux?.baseline || null,
      };
      const world = restoreWorld(payload.world) || createWorld(payload.seed);
      return { graph, kernel, aux, world };
    }
    const snap = payload.pitSnapshot;
    if (!snap || snap.model !== PIT_MODEL) {
      throw badRequest("ARCHIVE_PIT", "Archive missing pit snapshot");
    }
    const restored = await restorePitSession(snap, { graph });
    if (payload.world) restored.world = structuredClone(payload.world);
    applyFlyswarmLog(restored.kernel, payload);
    return restored;
  }

  async function buildArchive(row) {
    const session = row.session;
    const members = [];
    for (const member of session.kernel.colony.members) {
      const archive = await member.session.checkpoint();
      members.push({
        id: member.id,
        gen: member.gen,
        parent: member.parent,
        status: member.status,
        soulId: member.session.state.soulId,
        book: structuredClone(member.book),
        overlay: structuredClone(member.overlay),
        genome: structuredClone(member.genome),
        archive,
      });
    }
    const log = session.kernel.flyswarm.log;
    const payload = {
      schema: ARCHIVE_SCHEMA,
      model: PIT_MODEL,
      audit: "SIM",
      sessionId: row.sessionId,
      seed: session.aux.seed,
      genesisId: session.kernel.flyswarm.genesisId,
      tick: session.kernel.colony.tick,
      aux: {
        model: session.aux.model,
        seed: session.aux.seed,
        rng: session.aux.rng,
        lastStimTick: session.aux.lastStimTick,
        cooldownTicks: session.aux.cooldownTicks,
        stimLog: structuredClone(session.aux.stimLog),
        prices: structuredClone(session.aux.prices),
        settleAt: session.aux.settleAt,
        market: session.aux.market ? structuredClone(session.aux.market) : null,
        baseline: session.aux.baseline
          ? structuredClone(session.aux.baseline)
          : null,
      },
      members,
      lineage: structuredClone(session.kernel.colony.lineage),
      nextId: session.kernel.colony.nextId,
      marketPrice: session.kernel.colony.market.price,
      trades: structuredClone(session.kernel.colony.trades),
      roster: session.kernel.flyswarm.roster.snapshot(),
      lastQuorum: structuredClone(session.kernel.flyswarm.lastQuorum),
      soulHashes: Object.fromEntries(session.kernel.flyswarm.soulPrev),
      flyswarmLog: {
        snapshot: log.snapshot(),
        entries: log.allEntries
          ? structuredClone(log.allEntries())
          : structuredClone(log.windowEntries(0)),
      },
      world: saveWorld(session.world),
      pitSnapshot: savePitSession(session),
    };
    const sha256 = await hash(payload);
    return { schema: ARCHIVE_SCHEMA, payload, sha256 };
  }

  async function createSession({ seed } = {}) {
    requireGraph();
    await sweep();
    if (live.size >= maxLive()) {
      throw tooMany("Too many live sessions");
    }
    const session = await createPitSession({
      seed: seed == null ? 20260916 : seed >>> 0,
      graph,
    });
    const sessionId = newId("sess");
    const ownerToken = randomBytes(24).toString("hex");
    const row = installLive({
      sessionId,
      ownerTokenHash: hashToken(ownerToken),
      running: true,
      createdAt: clock(),
      session,
    });
    await persistFull(row);
    logger.info("session created", {
      sessionId,
      seed: session.aux.seed,
      tick: 0,
    });
    return {
      sessionId,
      ownerToken,
      genesisId: session.kernel.flyswarm.genesisId,
      view: composeView(session),
    };
  }

  async function getSession(sessionId) {
    const row = await getLive(sessionId);
    return {
      sessionId,
      genesisId: row.session.kernel.flyswarm.genesisId,
      view: composeView(row.session),
    };
  }

  async function tick(sessionId, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    const key =
      req.headers["idempotency-key"] || req.headers["Idempotency-Key"];
    if (key) {
      const cached = row.idempotency.get(String(key));
      if (cached) return cached;
    }
    try {
      if (venue?.enabled) {
        const obs = await venue.observationForTick();
        if (obs) {
          if (!row.session.aux.market) row.session.aux.market = createMarketFeed();
          try {
            offerObservation(row.session.aux.market, obs);
          } catch (err) {
            logger?.warn?.("venue observation rejected", {
              error: err?.message || String(err),
            });
          }
        }
      }
      await stepPit(row.session, { compact: false });
    } catch (err) {
      throw mapBrainError(err);
    }
    reindexSouls(sessionId, row.session);
    await persistFull(row);
    const result = { sessionId, view: composeView(row.session) };
    if (key) {
      row.idempotency.set(String(key), result);
      if (row.idempotency.size > 64) {
        const first = row.idempotency.keys().next().value;
        row.idempotency.delete(first);
      }
    }
    return result;
  }

  async function stimulus(sessionId, body, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    const kind = body?.kind;
    if (!["food", "threat", "light", "dark"].includes(kind)) {
      throw badRequest(
        "INVALID_STIMULUS",
        "kind must be food|threat|light|dark",
      );
    }
    const intensity = body?.intensity == null ? 0.6 : Number(body.intensity);
    try {
      pulsePit(row.session, kind, intensity);
    } catch (err) {
      throw mapBrainError(err);
    }
    await persistFull(row);
    return { sessionId, view: composeView(row.session) };
  }

  async function settle(sessionId, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    try {
      await settleNow(row.session);
    } catch (err) {
      throw mapBrainError(err);
    }
    reindexSouls(sessionId, row.session);
    await persistFull(row);
    return { sessionId, view: composeView(row.session) };
  }

  async function setRunning(sessionId, body, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    if (typeof body?.running !== "boolean") {
      throw badRequest("INVALID_RUNNING", "running must be boolean");
    }
    row.running = body.running;
    await persistMeta(row);
    return { sessionId, running: row.running };
  }

  async function getArchive(sessionId, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    return persistFull(row);
  }

  async function restoreFromArchive(sessionId, body, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    const archive = body?.archive || body;
    if (!archive?.payload || archive.payload.schema !== ARCHIVE_SCHEMA) {
      throw badRequest("ARCHIVE_SCHEMA", "Expected iff.colony-archive/1");
    }
    const digest = await hash(archive.payload);
    if (archive.sha256 && digest !== archive.sha256) {
      throw badRequest("ARCHIVE_HASH", "Archive integrity check failed");
    }
    row.session = await sessionFromArchive(archive.payload);
    row.idempotency.clear();
    reindexSouls(sessionId, row.session);
    await persistFull(row);
    return { sessionId, view: composeView(row.session) };
  }

  async function prove(sessionId, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    const proofs = [];
    let equal = true;
    for (const member of row.session.kernel.colony.members) {
      const proof = await member.session.prove();
      proofs.push({
        id: member.id,
        soulId: member.session.state.soulId,
        ...proof,
      });
      if (!proof.equal) equal = false;
    }
    const worldHash = await hash(saveWorld(row.session.world));
    const log = row.session.kernel.flyswarm.log;
    const logEntries = log.allEntries ? log.allEntries() : log.windowEntries(0);
    const logEqual = Array.isArray(logEntries);
    const stateHash = await hash({
      members: proofs.map((p) => ({
        id: p.id,
        stateHash: p.stateHash,
        historyRoot: p.historyRoot,
      })),
      worldHash,
      tick: row.session.kernel.colony.tick,
    });
    return {
      equal,
      ticks: row.session.kernel.colony.tick,
      stateHash,
      worldHash,
      historyRoot: proofs[0]?.historyRoot || null,
      members: proofs,
      log: {
        equal: logEqual,
        count: logEntries.length,
        sealed: log.snapshot().sealed.length,
      },
    };
  }

  async function listEvents(sessionId, query) {
    const row = await getLive(sessionId);
    const from = Number.parseInt(query.from || "0", 10) || 0;
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(query.limit || "20", 10) || 20),
    );
    const events = row.session.world.events || [];
    const items = events.filter((e) => e.seq > from).slice(0, limit);
    const next = items.length ? items[items.length - 1].seq : from;
    return { items, next, total: events.length };
  }

  async function branch(sessionId, body, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    const label =
      typeof body?.label === "string" ? body.label.slice(0, 64) : "";
    const branchObj = createBranch(row.session, label);
    const eventId = body?.eventId || null;
    const chain = eventId
      ? replayChain(row.session.world, eventId)
      : { nodes: [], links: [] };
    const record = {
      ...branchObj,
      sessionId,
      chain,
      savedAt: clock(),
    };
    await store.saveBranch(branchObj.id, record);
    await persistFull(row);
    return {
      branchId: branchObj.id,
      tick: branchObj.tick,
      label: branchObj.label,
    };
  }

  async function getBranch(branchId) {
    try {
      return await store.loadBranch(branchId);
    } catch {
      throw notFound("branch", branchId);
    }
  }

  async function getWorld(sessionId) {
    const row = await getLive(sessionId);
    return {
      sessionId,
      world: paperLayers(row.session, { venue: venue?.getQuotes?.() || null }),
    };
  }

  async function getProtocol(sessionId) {
    const row = await getLive(sessionId);
    return { sessionId, protocol: protocolView(row.session.protocol) };
  }

  async function getLayer(sessionId, layer) {
    const row = await getLive(sessionId);
    if (!LAYER_IDS.includes(layer)) {
      throw badRequest("UNKNOWN_LAYER", `layer must be ${LAYER_IDS.join("|")}`);
    }
    return {
      sessionId,
      ...paperLayer(row.session, layer, { venue: venue?.getQuotes?.() || null }),
    };
  }

  async function offerMarket(sessionId, body, req) {
    const row = await getLive(sessionId);
    assertOwner(row, req);
    if (!row.session.aux.market) row.session.aux.market = createMarketFeed();
    try {
      const pending = offerObservation(row.session.aux.market, body || {});
      await persistFull(row);
      return {
        sessionId,
        pending,
        market: paperLayer(row.session, "market").market,
      };
    } catch (err) {
      throw mapBrainError(err);
    }
  }

  async function getSoul(soulId) {
    let sessionId = soulIndex.get(soulId);
    if (!sessionId) {
      await sweep();
      sessionId = soulIndex.get(soulId);
    }
    if (!sessionId) throw notFound("soul", soulId);
    const row = await getLive(sessionId);
    const roster = row.session.kernel.flyswarm.roster.snapshot();
    const entry = roster.find((r) => r.soulId === soulId) || null;
    const member =
      row.session.kernel.colony.members.find(
        (m) => m.session.state.soulId === soulId,
      ) || null;
    return {
      soulId,
      sessionId,
      tick: row.session.kernel.colony.tick,
      roster: entry,
      member: member
        ? {
            id: member.id,
            status: member.status,
            gen: member.gen,
            branchId: member.session.state.branchId,
            historyRoot: member.session.state.historyRoot,
          }
        : null,
    };
  }

  function readiness() {
    return {
      graph: graphReady
        ? { status: "ok", neurons: graph?.n, edges: graph?.e }
        : { status: "error", detail: graphError },
      store: { status: "pending" },
      llm: {
        status: config.openai.apiKey ? "configured" : "degraded",
        model: config.openai.model,
        provider: config.openai.baseUrl,
      },
      sessions: live.size,
    };
  }

  async function readinessAsync() {
    await sweep();
    const checks = readiness();
    checks.store = (await store.writable())
      ? { status: "ok" }
      : { status: "error", detail: "data dir not writable" };
    const ok = checks.graph.status === "ok" && checks.store.status === "ok";
    return {
      status: ok ? "ok" : "degraded",
      checks,
    };
  }

  async function getRow(sessionId) {
    return getLive(sessionId);
  }

  return {
    boot,
    createSession,
    getSession,
    tick,
    stimulus,
    settle,
    setRunning,
    getArchive,
    restoreFromArchive,
    prove,
    listEvents,
    branch,
    getBranch,
    getSoul,
    getWorld,
    getProtocol,
    getLayer,
    offerMarket,
    readinessAsync,
    getRow,
    assertOwner,
    requireGraph,
    sweep,
    flushAll,
    evict,
    get graphReady() {
      return graphReady;
    },
    get liveSize() {
      return live.size;
    },
  };
}
