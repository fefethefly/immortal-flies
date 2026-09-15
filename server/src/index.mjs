import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createConfig } from "./config.mjs";
import { createLogger } from "./shared/logger.mjs";
import { createStore } from "./shared/store.mjs";
import { AppError, problemBody } from "./shared/errors.mjs";
import { createRateLimiter, rateKey } from "./shared/rate-limit.mjs";
import { createSessionService } from "./sessions/service.mjs";
import { createRouter, mountSessionRoutes } from "./sessions/http.mjs";
import { createOpenAIProvider } from "./llm/provider.mjs";
import { createLlmService } from "./llm/service.mjs";
import { mountLlmRoutes } from "./llm/http.mjs";

export async function createApp(options = {}) {
  const config = options.config || createConfig(options.env || process.env);
  const logger = options.logger || createLogger("iff-server");
  const store = options.store || createStore(config.dataDir);
  const sessions = options.sessions || createSessionService({ config, store, logger });
  const provider =
    options.provider ||
    createOpenAIProvider({
      baseUrl: config.openai.baseUrl,
      apiKey: config.openai.apiKey,
      model: config.openai.model,
      fetchImpl: options.fetchImpl,
    });
  const llm = options.llm || createLlmService({ sessions, store, provider, logger });

  if (!options.skipBoot) {
    await sessions.boot(options.graph || null);
  }

  const router = createRouter();
  mountSessionRoutes({ router, sessions });
  mountLlmRoutes({ router, llm });
  const limiter = options.limiter || createRateLimiter();

  const corsOrigins = new Set(config.corsOrigins);

  function enforceRate(req, pathname) {
    const key = rateKey(req, pathname);
    const rate = config.rate || {};
    let result = { ok: true };
    if (req.method === "POST" && pathname === "/v1/sessions") {
      result = limiter.allow(`create:${key}`, { max: rate.createPerMin, windowMs: 60_000 });
    } else if (req.method === "POST" && pathname.startsWith("/v1/llm/")) {
      result = limiter.allow(`llm:${key}`, { max: rate.llmPerMin, windowMs: 60_000 });
    } else if (req.method === "POST" && pathname.endsWith("/tick")) {
      result = limiter.allow(`tick:${key}`, { max: rate.tickPerSec, windowMs: 1000 });
    } else if (req.method !== "GET" && pathname.startsWith("/v1/")) {
      result = limiter.allow(`write:${key}`, { max: rate.writePerMin, windowMs: 60_000 });
    }
    if (!result.ok) throw limiter.reject(result);
  }

  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (origin && corsOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    }
  }

  async function handler(req, res) {
    const requestId = req.headers["x-request-id"] || randomUUID();
    const started = Date.now();
    applyCors(req, res);
    res.setHeader("X-Request-Id", requestId);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === "/health") {
        sendJson(res, 200, { status: "ok" });
        return;
      }
      if (req.method === "GET" && pathname === "/ready") {
        const ready = await sessions.readinessAsync();
        sendJson(res, ready.status === "ok" ? 200 : 503, ready);
        return;
      }

      enforceRate(req, pathname);
      const data = await router.handle(req, pathname);
      sendJson(res, 200, data);
      logger.info("request", {
        request_id: requestId,
        method: req.method,
        path: pathname,
        status: 200,
        duration_ms: Date.now() - started,
      });
    } catch (err) {
      const body = problemBody(err, requestId);
      const status = body.status || 500;
      if (status === 429 && body.retry_after) {
        res.setHeader("Retry-After", String(body.retry_after));
      }
      if (!(err instanceof AppError) || status >= 500) {
        logger.error("request failed", {
          request_id: requestId,
          method: req.method,
          path: req.url,
          status,
          error: err?.message || String(err),
          stack: err?.stack,
        });
      } else {
        logger.warn("request rejected", {
          request_id: requestId,
          method: req.method,
          path: req.url,
          status,
          title: body.title,
        });
      }
      sendJson(res, status, body);
    }
  }

  return { config, logger, store, sessions, llm, provider, handler };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": status >= 400 ? "application/problem+json; charset=utf-8" : "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export async function startServer(options = {}) {
  const app = await createApp(options);
  const server = createServer(app.handler);
  await new Promise((resolve) => server.listen(app.config.port, "127.0.0.1", resolve));
  app.logger.info("listening", { port: app.config.port });

  const shutdown = async (signal) => {
    app.logger.info("shutdown", { signal });
    try {
      await app.sessions.flushAll();
    } catch (err) {
      app.logger.error("flush on shutdown failed", { error: err?.message || String(err) });
    }
    await new Promise((resolve) => server.close(resolve));
    if (!options.keepAlive) process.exit(0);
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  return { ...app, server };
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || "")) {
  startServer().catch((err) => {
    console.error(JSON.stringify({ level: "error", msg: "boot failed", error: err?.message, stack: err?.stack }));
    process.exit(1);
  });
}
