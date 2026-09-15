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

/** P5 用户金库路由。注资/退出需要 Bearer owner token；结算为 SIM 机械动作。 */
export function mountVaultRoutes({ router, vault }) {
  router.add("GET", "/v1/vault", async () => vault.view());

  router.add("POST", "/v1/vault/deposit", async (req) => {
    const body = await readJson(req);
    return vault.deposit(body, req);
  });

  router.add("POST", "/v1/vault/exit", async (req) => {
    const body = await readJson(req);
    return vault.exit(body, req);
  });

  router.add("POST", "/v1/vault/settle", async () => vault.settle());
}
