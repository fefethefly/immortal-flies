import { badRequest } from "../shared/errors.mjs";

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

/** P3 模拟 Credit 路由。全部 SIM，写操作需要会话 owner token。 */
export function mountCreditRoutes({ router, credit }) {
  router.add("GET", "/v1/sessions/:id/credit", async (_req, params) =>
    credit.view(params.id),
  );

  router.add("POST", "/v1/sessions/:id/credit/stake", async (req, params) => {
    const body = await readJson(req);
    return credit.stake(params.id, body, req);
  });

  router.add("POST", "/v1/sessions/:id/credit/unstake", async (req, params) => {
    const body = await readJson(req);
    return credit.unstake(params.id, body, req);
  });

  router.add("POST", "/v1/sessions/:id/credit/occupy", async (req, params) => {
    const body = await readJson(req);
    return credit.occupy(params.id, body, req);
  });

  router.add("POST", "/v1/sessions/:id/credit/release", async (req, params) => {
    const body = await readJson(req);
    return credit.release(params.id, body, req);
  });

  router.add("GET", "/v1/credit/policy", async () => credit.policy());
}
