/**
 * Optional IFF API client for DeepSeek frontend wiring.
 * Default base '' uses same-origin / Vite proxy to the Node server.
 * Does not auto-wire pages — import explicitly when connecting Session / LLM UI.
 */
const BASE =
  typeof import.meta !== "undefined" &&
  import.meta.env?.VITE_IFF_API_BASE != null
    ? String(import.meta.env.VITE_IFF_API_BASE)
    : "";

export class IffApiError extends Error {
  constructor(status, body) {
    super(body?.detail || body?.title || `API error ${status}`);
    this.name = "IffApiError";
    this.status = status;
    this.body = body;
  }
}

async function request(
  path,
  { method = "GET", token, body, idempotencyKey, headers = {} } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new IffApiError(res.status, data);
  return data;
}

export const iffApi = {
  base: BASE,
  health: () => request("/health"),
  ready: () => request("/ready"),
  createSession: (body = {}) =>
    request("/v1/sessions", { method: "POST", body }),
  getSession: (id) => request(`/v1/sessions/${id}`),
  tick: (id, token, idempotencyKey) =>
    request(`/v1/sessions/${id}/tick`, {
      method: "POST",
      token,
      idempotencyKey,
    }),
  stimulus: (id, token, body) =>
    request(`/v1/sessions/${id}/stimulus`, { method: "POST", token, body }),
  settle: (id, token) =>
    request(`/v1/sessions/${id}/settle`, { method: "POST", token }),
  setRunning: (id, token, running) =>
    request(`/v1/sessions/${id}/running`, {
      method: "PATCH",
      token,
      body: { running },
    }),
  archive: (id, token) => request(`/v1/sessions/${id}/archive`, { token }),
  restore: (id, token, archive) =>
    request(`/v1/sessions/${id}/restore`, {
      method: "POST",
      token,
      body: { archive },
    }),
  prove: (id, token) =>
    request(`/v1/sessions/${id}/prove`, { method: "POST", token }),
  events: (id, { from = 0, limit = 20 } = {}) =>
    request(`/v1/sessions/${id}/events?from=${from}&limit=${limit}`),
  createBranch: (id, token, body = {}) =>
    request(`/v1/sessions/${id}/branches`, { method: "POST", token, body }),
  getBranch: (branchId) => request(`/v1/branches/${branchId}`),
  getSoul: (soulId) => request(`/v1/souls/${soulId}`),
  world: (id) => request(`/v1/sessions/${id}/world`),
  layer: (id, layer) => request(`/v1/sessions/${id}/layers/${layer}`),
  offerMarket: (id, token, body) =>
    request(`/v1/sessions/${id}/market`, { method: "POST", token, body }),
  explain: (token, body) =>
    request("/v1/llm/explain", { method: "POST", token, body }),
  ask: (token, body) => request("/v1/llm/ask", { method: "POST", token, body }),
  plan: (token, body) =>
    request("/v1/llm/plan", { method: "POST", token, body }),
  validate: (token, body) =>
    request("/v1/llm/validate", { method: "POST", token, body }),
  credit: (id) => request(`/v1/sessions/${id}/credit`),
  creditPolicy: () => request("/v1/credit/policy"),
  creditStake: (id, token, body) =>
    request(`/v1/sessions/${id}/credit/stake`, { method: "POST", token, body }),
  creditUnstake: (id, token, body) =>
    request(`/v1/sessions/${id}/credit/unstake`, {
      method: "POST",
      token,
      body,
    }),
  creditOccupy: (id, token, body) =>
    request(`/v1/sessions/${id}/credit/occupy`, {
      method: "POST",
      token,
      body,
    }),
  creditRelease: (id, token, body) =>
    request(`/v1/sessions/${id}/credit/release`, {
      method: "POST",
      token,
      body,
    }),
};
