import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function intEnv(env, name, fallback) {
  const raw = env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid env ${name}: ${raw}`);
  return n;
}

/** 启动期集中读配置；缺 OPENAI_API_KEY 时仍可启动（LLM 降级）。 */
export function createConfig(env = process.env) {
  const portRaw = env.PORT;
  const port =
    portRaw == null || portRaw === ""
      ? 8787
      : (() => {
          const n = Number.parseInt(portRaw, 10);
          if (!Number.isFinite(n)) throw new Error(`Invalid env PORT: ${portRaw}`);
          return n;
        })();

  const corsRaw = env.IFF_CORS_ORIGINS;
  const corsOrigins =
    corsRaw == null || corsRaw === ""
      ? [
          "http://127.0.0.1:4173",
          "http://localhost:4173",
          "http://127.0.0.1:5173",
          "http://localhost:5173",
        ]
      : corsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  return {
    root,
    port,
    corsOrigins,
    dataDir: resolve(root, env.IFF_DATA_DIR || "./server/data"),
    graphDir: resolve(root, env.IFF_GRAPH_DIR || "./public/data/malecns-circuit"),
    now: typeof env.IFF_NOW === "function" ? env.IFF_NOW : Date.now,
    session: {
      idleMs: intEnv(env, "IFF_SESSION_IDLE_MS", 2 * 60 * 60 * 1000),
      maxAgeMs: intEnv(env, "IFF_SESSION_MAX_AGE_MS", 24 * 60 * 60 * 1000),
      maxLive: intEnv(env, "IFF_SESSION_MAX_LIVE", 64),
    },
    rate: {
      tickPerSec: intEnv(env, "IFF_RATE_TICK_PER_SEC", 8),
      writePerMin: intEnv(env, "IFF_RATE_WRITE_PER_MIN", 60),
      llmPerMin: intEnv(env, "IFF_RATE_LLM_PER_MIN", 20),
      createPerMin: intEnv(env, "IFF_RATE_CREATE_PER_MIN", 20),
    },
    openai: {
      baseUrl: (env.OPENAI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, ""),
      apiKey: env.OPENAI_API_KEY || "",
      model: env.OPENAI_MODEL || "deepseek-chat",
    },
  };
}
