/** 结构化 JSON 日志；禁止写入 token / api key。 */
export function createLogger(scope = "iff-server") {
  const write = (level, msg, fields = {}) => {
    const line = {
      level,
      scope,
      msg,
      ts: new Date().toISOString(),
      ...sanitize(fields),
    };
    const sink = level === "error" ? console.error : console.log;
    sink(JSON.stringify(line));
  };
  return {
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
  };
}

function sanitize(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    const key = k.toLowerCase();
    if (key.includes("token") || key.includes("apikey") || key.includes("authorization") || key.includes("secret")) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = v;
  }
  return out;
}
