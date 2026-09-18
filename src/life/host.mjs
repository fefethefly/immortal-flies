/**
 * Private-track hosting helpers. No wallet, no RPC.
 * Mesh shard hosting (flyswarm/hosting.mjs) is a different product.
 */
export const MAINNET_IFS = "0x65b66BB4Adb0e244E19d290b6AAa0381B81A7777";
export const MAINNET_HIVE = "0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467";
export const MAINNET_OPS = "0x055bB2aF42B832A55F3D708c92824C491dE05427";
export const DEFAULT_ARCHIVE_RETAIN_MS = 37 * 24 * 60 * 60 * 1000;
export const IFS_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address who) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

function sameAddr(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

export function hubListingPath(search = "") {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  if (params.get("net") === "test" || params.get("chain") === "97") {
    return "/contract/life/MiningHub.testnet.json";
  }
  return "/contract/life/MiningHub.deployment.json";
}

export function runnerListingPath(search = "") {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  if (params.get("net") === "test" || params.get("chain") === "97") {
    return "/contract/life/PrivateRunner.testnet.json";
  }
  return "/contract/life/PrivateRunner.deployment.json";
}

export function parseHubDeployment(data) {
  if (
    !data?.address ||
    data.status === "UNDEPLOYED" ||
    data.status === "RETIRED" ||
    String(data.status).startsWith("STALE")
  ) {
    return null;
  }
  const chainId = Number(data.chainId);
  if (chainId !== 56 && chainId !== 97) return null;
  return {
    ...data,
    chainId,
    address: data.address,
    soul: data.soul || null,
    journal: data.journal || null,
    ifs: data.ifs || null,
    hive: data.hive || null,
  };
}

export function parseRunnerListing(data) {
  if (!data?.url || data.status === "UNDEPLOYED") return null;
  return data;
}

export function isLiveIfs(address) {
  return sameAddr(address, MAINNET_IFS);
}

export function isMockIfsNetwork(chainId) {
  return Number(chainId) === 97;
}

export function archiveUrl(runnerUrl, segmentId) {
  if (!runnerUrl || !segmentId) return "";
  return `${String(runnerUrl).replace(/\/$/, "")}/archive/${segmentId}`;
}

export function lineageUrl(runnerUrl, tokenId) {
  if (!runnerUrl || !tokenId) return "";
  return `${String(runnerUrl).replace(/\/$/, "")}/life/${tokenId}`;
}

/** v1: official allowlisted runner; pay if unchallenged after the window. */
export function acceptancePolicy(chainId) {
  return {
    schema: "iff.host-policy/1",
    yield: false,
    chainId: Number(chainId) || 0,
    verifier: "none",
    payIfUnchallenged: true,
    arbiter: "timeout-only",
    retainMs: DEFAULT_ARCHIVE_RETAIN_MS,
    liveIfs: Number(chainId) === 56,
  };
}

export function parseBindForm({
  runner = "",
  fee = "",
  steps = "",
  spendCap = "",
  validHours = "",
} = {}) {
  const stepsN = Number(steps);
  const hours = Number(validHours);
  return {
    runner: String(runner || "").trim(),
    fee: String(fee || "").trim(),
    steps: Number.isInteger(stepsN) && stepsN > 0 ? stepsN : 0,
    spendCap: String(spendCap || "").trim(),
    validHours: Number.isFinite(hours) && hours > 0 ? hours : 0,
  };
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export function isZeroAddr(value) {
  return !value || String(value).toLowerCase() === ZERO_ADDR;
}

export function isZeroHash(value) {
  return !value || String(value).toLowerCase() === ZERO_HASH;
}

export function validUntilOf(hours, nowSec = Math.floor(Date.now() / 1000)) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return nowSec + Math.floor(n * 3600);
}

export function formatIfs(amount, digits = 4) {
  const value = BigInt(amount || 0);
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const whole = abs / 10n ** 18n;
  const frac = abs % 10n ** 18n;
  const fracStr = frac
    .toString()
    .padStart(18, "0")
    .slice(0, digits)
    .replace(/0+$/, "");
  return fracStr ? `${sign}${whole}.${fracStr}` : `${sign}${whole}`;
}

export function decodeTank(row) {
  if (!row) return null;
  return {
    owner: String(row.owner ?? row[0] ?? ZERO_ADDR),
    lifeId: String(row.lifeId ?? row[1] ?? ZERO_HASH),
    ownerFuel: String(row.ownerFuel ?? row[2] ?? 0n),
    giftFuel: String(row.giftFuel ?? row[3] ?? 0n),
    reserved: String(row.reserved ?? row[4] ?? 0n),
    runner: String(row.runner ?? row[5] ?? ZERO_ADDR),
    fee: String(row.fee ?? row[6] ?? 0n),
    steps: Number(row.steps ?? row[7] ?? 0),
    spendCap: String(row.spendCap ?? row[8] ?? 0n),
    spent: String(row.spent ?? row[9] ?? 0n),
    validUntil: Number(row.validUntil ?? row[10] ?? 0),
  };
}

export function spentToday(userDaySpend, userSpendDay, spendDay) {
  if (Number(userSpendDay) !== Number(spendDay)) return 0n;
  return BigInt(userDaySpend || 0);
}

export function dailyLeft(maxUserDaily, spent) {
  const max = BigInt(maxUserDaily || 0);
  if (max === 0n) return null;
  const left = max - BigInt(spent || 0);
  return left < 0n ? 0n : left;
}

export const SEG_OPEN = 1;
export const SEG_COMMITTED = 2;
export const SEG_CHALLENGED = 3;
export const SEG_SETTLED = 4;
export const SEG_SLASHED = 5;
export const SEG_VOID = 6;

export function decodeSegment(row, id = "") {
  if (!row) return null;
  return {
    id: String(id || ""),
    tokenId: Number(row.tokenId ?? row[0] ?? 0),
    runner: String(row.runner ?? row[2] ?? ZERO_ADDR),
    steps: Number(row.steps ?? row[3] ?? 0),
    status: Number(row.status ?? row[4] ?? 0),
    fee: String(row.fee ?? row[5] ?? 0n),
    startRoot: String(row.startRoot ?? row[9] ?? ZERO_HASH),
    finalRoot: String(row.finalRoot ?? row[10] ?? ZERO_HASH),
    challengeUntil: Number(row.challengeUntil ?? row[15] ?? 0),
    paid: String(row.paid ?? row[18] ?? 0n),
  };
}

export function decodeOperator(row) {
  if (!row) return null;
  return {
    roles: Number(row.roles ?? row[0] ?? 0),
    status: Number(row.status ?? row[1] ?? 0),
    bond: String(row.bond ?? row[2] ?? 0n),
    exposure: String(row.exposure ?? row[3] ?? 0n),
    accepted: Number(row.accepted ?? row[5] ?? 0),
    disputed: Number(row.disputed ?? row[6] ?? 0),
    lost: Number(row.lost ?? row[7] ?? 0),
  };
}

export function windowLeftSec(until, nowSec) {
  const u = Number(until || 0);
  if (!u) return null;
  const left = u - Number(nowSec || 0);
  return left > 0 ? left : 0;
}

export function formatCountdown(sec) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.floor(Number(sec)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(r).padStart(2, "0")}s`;
  return `${r}s`;
}

/** Live phase for the dashboard. No APY. */
export function segmentPhase(seg, nowSec) {
  const st = Number(seg?.status || 0);
  if (!st) return "idle";
  if (st === SEG_OPEN) return "open";
  if (st === SEG_COMMITTED) {
    const left = windowLeftSec(seg.challengeUntil, nowSec);
    return left > 0 ? "window" : "ready";
  }
  if (st === SEG_CHALLENGED) return "challenged";
  if (st === SEG_SETTLED) return "settled";
  if (st === SEG_SLASHED) return "slashed";
  if (st === SEG_VOID) return "void";
  return "idle";
}

export function tankFuel(tank) {
  return BigInt(tank?.ownerFuel || 0) + BigInt(tank?.giftFuel || 0);
}

export function capLeft(tank) {
  const cap = BigInt(tank?.spendCap || 0);
  const spent = BigInt(tank?.spent || 0);
  return cap > spent ? cap - spent : 0n;
}

export function segmentsRemaining(tank) {
  const fee = BigInt(tank?.fee || 0);
  if (fee === 0n) return 0;
  const byCap = capLeft(tank) / fee;
  const byFuel = tankFuel(tank) / fee;
  const n = byCap < byFuel ? byCap : byFuel;
  return Number(n > 10_000n ? 10_000n : n);
}

export function parseLineage(data) {
  if (!data || data.schema !== "iff.life-lineage/1" || data.yield) {
    return { tokenId: 0, hub: null, segments: [] };
  }
  const rows = Array.isArray(data.segments) ? data.segments : [];
  return {
    tokenId: Number(data.tokenId || 0),
    hub: data.hub || null,
    segments: rows.map((row) => ({
      segmentId: String(row.segmentId || ""),
      nonce: Number(row.nonce || 0),
      parentRoot: String(row.parentRoot || row.startRoot || ""),
      startRoot: String(row.startRoot || ""),
      finalRoot: String(row.finalRoot || ""),
      archiveHash: String(row.archiveHash || ""),
    })),
  };
}

export function liveRunnerForToken(status, tokenId) {
  const id = Number(tokenId);
  const last = status?.lastSegment;
  if (!status || !id || Number(last?.tokenId) !== id) return null;
  return {
    action: String(last.action || ""),
    segmentId: String(last.segmentId || ""),
    challengeUntil: Number(last.challengeUntil || 0),
    error: status.lastError || null,
    ready: Boolean(status.ready),
    tick: String(status.lastTick || ""),
    runner: String(status.runner || ""),
    yield: false,
  };
}

export function nativeSymbol(chainId) {
  return Number(chainId) === 97 ? "tBNB" : "BNB";
}
