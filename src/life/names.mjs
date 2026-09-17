const ZH_A = Object.freeze([
  "暮",
  "砂",
  "墨",
  "铜",
  "烬",
  "露",
  "苔",
  "脉",
  "羽",
  "骨",
  "酒",
  "松",
  "沙",
  "赭",
  "靛",
  "雪",
]);
const ZH_B = Object.freeze([
  "翅",
  "息",
  "眼",
  "缕",
  "茧",
  "痕",
  "喙",
  "尘",
  "灯",
  "刺",
  "丝",
  "影",
  "砂",
  "脉",
  "灯",
  "茧",
]);
const EN_A = Object.freeze([
  "dusk",
  "grit",
  "ink",
  "copper",
  "ember",
  "dew",
  "moss",
  "vein",
  "plume",
  "bone",
  "wine",
  "pine",
  "sand",
  "umber",
  "indigo",
  "snow",
]);
const EN_B = Object.freeze([
  "wing",
  "breath",
  "eye",
  "thread",
  "husk",
  "mark",
  "beak",
  "dust",
  "lamp",
  "spur",
  "silk",
  "shade",
  "grit",
  "vein",
  "lamp",
  "husk",
]);

export const NAME_STORE = "ifs.keeper.names/1";
export const PENDING_NAME = "ifs.keeper.pendingGiven/1";
export const NAME_MAX = 24;

const memory = new Map();

export function normalizeGiven(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

export function trueNameOf(life, locale = "en") {
  const hex = String(life || "").replace(/^0x/i, "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) return locale === "zh" ? "未名" : "unnamed";
  const a = Number.parseInt(hex.slice(0, 2), 16);
  const b = Number.parseInt(hex.slice(2, 4), 16);
  if (locale === "zh")
    return `${ZH_A[a % ZH_A.length]}${ZH_B[b % ZH_B.length]}`;
  return `${EN_A[a % EN_A.length]}-${EN_B[b % EN_B.length]}`;
}

export function nameKey(chainId, life) {
  return `${Number(chainId) || 0}:${String(life || "").toLowerCase()}`;
}

function persisted() {
  if (typeof localStorage === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(NAME_STORE) || "{}");
  } catch {
    return {};
  }
}

export function givenNameOf(chainId, life) {
  const key = nameKey(chainId, life);
  if (memory.has(key)) return memory.get(key);
  const row = persisted()?.[key];
  return row?.given || "";
}

export function setGivenName(chainId, life, given) {
  const clean = normalizeGiven(given);
  const key = nameKey(chainId, life);
  memory.set(key, clean);
  const all = persisted();
  if (all) {
    if (!clean) delete all[key];
    else all[key] = { given: clean, setAt: Date.now() };
    localStorage.setItem(NAME_STORE, JSON.stringify(all));
  }
  return clean;
}

export function setPendingGiven(given) {
  const clean = normalizeGiven(given);
  memory.set("pending", clean);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(PENDING_NAME, clean);
  }
  return clean;
}

export function peekPendingGiven() {
  if (memory.has("pending")) return normalizeGiven(memory.get("pending"));
  if (typeof sessionStorage === "undefined") return "";
  try {
    return normalizeGiven(sessionStorage.getItem(PENDING_NAME) || "");
  } catch {
    return "";
  }
}

export function takePendingGiven() {
  let clean = memory.get("pending") || "";
  if (typeof sessionStorage !== "undefined") {
    clean = sessionStorage.getItem(PENDING_NAME) || clean;
    sessionStorage.removeItem(PENDING_NAME);
  }
  memory.delete("pending");
  return normalizeGiven(clean);
}

export function labelOf(soul, locale = "en") {
  const trueName = soul.trueName || trueNameOf(soul.life, locale);
  if (soul.givenName && soul.givenName !== trueName) {
    return `${soul.givenName} · ${trueName}`;
  }
  return trueName;
}

export function matchSoul(souls, query, locale = "en") {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return null;
  return (
    (souls || []).find((item) => {
      const label = labelOf(item, locale).toLowerCase();
      const trueName = (
        item.trueName || trueNameOf(item.life, locale)
      ).toLowerCase();
      return (
        String(item.tokenId) === q ||
        `#${item.tokenId}` === q ||
        label.includes(q) ||
        trueName.includes(q) ||
        String(item.givenName || "")
          .toLowerCase()
          .includes(q)
      );
    }) || null
  );
}
