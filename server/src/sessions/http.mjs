import { AppError, badRequest } from "../shared/errors.mjs";

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("INVALID_JSON", "Request body must be JSON");
  }
}

function matchPath(pattern, pathname) {
  const pp = pattern.split("/").filter(Boolean);
  const ss = pathname.split("/").filter(Boolean);
  if (pp.length !== ss.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(ss[i]);
    else if (pp[i] !== ss[i]) return null;
  }
  return params;
}

/** Session HTTP 路由挂载。 */
export function mountSessionRoutes({ router, sessions }) {
  router.add("POST", "/v1/sessions", async (req) => {
    const body = await readJson(req);
    return sessions.createSession({ seed: body.seed });
  });

  router.add("GET", "/v1/sessions/:id", async (_req, params) => sessions.getSession(params.id));

  router.add("POST", "/v1/sessions/:id/tick", async (req, params) => sessions.tick(params.id, req));

  router.add("POST", "/v1/sessions/:id/stimulus", async (req, params) => {
    const body = await readJson(req);
    return sessions.stimulus(params.id, body, req);
  });

  router.add("POST", "/v1/sessions/:id/settle", async (req, params) => sessions.settle(params.id, req));

  router.add("PATCH", "/v1/sessions/:id/running", async (req, params) => {
    const body = await readJson(req);
    return sessions.setRunning(params.id, body, req);
  });

  router.add("GET", "/v1/sessions/:id/archive", async (req, params) => sessions.getArchive(params.id, req));

  router.add("POST", "/v1/sessions/:id/restore", async (req, params) => {
    const body = await readJson(req);
    return sessions.restoreFromArchive(params.id, body, req);
  });

  router.add("POST", "/v1/sessions/:id/prove", async (req, params) => sessions.prove(params.id, req));

  router.add("GET", "/v1/sessions/:id/events", async (req, params) => {
    const url = new URL(req.url, "http://localhost");
    const query = Object.fromEntries(url.searchParams.entries());
    return sessions.listEvents(params.id, query);
  });

  router.add("POST", "/v1/sessions/:id/branches", async (req, params) => {
    const body = await readJson(req);
    return sessions.branch(params.id, body, req);
  });

  router.add("GET", "/v1/branches/:id", async (_req, params) => sessions.getBranch(params.id));

  router.add("GET", "/v1/souls/:soulId", async (_req, params) => sessions.getSoul(params.soulId));

  router.add("GET", "/v1/sessions/:id/world", async (_req, params) => sessions.getWorld(params.id));

  router.add("GET", "/v1/sessions/:id/layers/:layer", async (_req, params) =>
    sessions.getLayer(params.id, params.layer),
  );

  router.add("POST", "/v1/sessions/:id/market", async (req, params) => {
    const body = await readJson(req);
    return sessions.offerMarket(params.id, body, req);
  });
}

/** LLM HTTP 路由挂载。 */
export function mountLlmRoutes({ router, llm }) {
  router.add("POST", "/v1/llm/explain", async (req) => {
    const body = await readJson(req);
    return llm.explain(body, req);
  });
  router.add("POST", "/v1/llm/ask", async (req) => {
    const body = await readJson(req);
    return llm.ask(body, req);
  });
  router.add("POST", "/v1/llm/plan", async (req) => {
    const body = await readJson(req);
    return llm.plan(body, req);
  });
  router.add("POST", "/v1/llm/validate", async (req) => {
    const body = await readJson(req);
    return llm.validate(body, req);
  });
}

export function createRouter() {
  const routes = [];
  return {
    add(method, pattern, handler) {
      routes.push({ method, pattern, handler });
    },
    async handle(req, pathname) {
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const params = matchPath(route.pattern, pathname);
        if (!params) continue;
        return route.handler(req, params);
      }
      throw new AppError("NOT_FOUND", 404, `No route ${req.method} ${pathname}`);
    },
  };
}

export { readJson };
