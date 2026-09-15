import { createRegistry } from "./registry.mjs";
import { decodeFinance } from "./finance.mjs";

/**
 * A port turns ethology into one financial act.
 * New act = new port. Do not grow a second decoder inside the connectome.
 */
export const FINANCIAL_PORTS = Object.freeze([
  { id: "trade", label: "交易", english: "TRADE", status: "live", version: "1" },
  { id: "lend", label: "出借", english: "LEND", status: "next", version: "1" },
  { id: "vault", label: "金库", english: "VAULT", status: "next", version: "1" },
  { id: "predict", label: "预测", english: "PREDICT", status: "later", version: "1" },
  { id: "buyback", label: "回购", english: "BUYBACK", status: "later", version: "1" },
]);

function hold(port, reason) {
  return { schema: "iff.port/1", port, action: "HOLD", side: "HOLD", reason };
}

export const PORT_TRADE = Object.freeze({
  id: "trade",
  version: "1",
  title: "交易",
  status: "live",
  decode(ethology, context = {}) {
    return { schema: "iff.port/1", port: "trade", ...decodeFinance(ethology, context.book) };
  },
});

export const PORT_LEND = Object.freeze({
  id: "lend",
  version: "1",
  title: "出借",
  status: "next",
  decode(ethology) {
    if (ethology?.action === "FORAGE") return { schema: "iff.port/1", port: "lend", action: "SUPPLY", reason: "趋近被读成供给；本版不结算" };
    if (ethology?.action === "AVOID") return { schema: "iff.port/1", port: "lend", action: "WITHDRAW", reason: "退避被读成赎回；本版不结算" };
    return hold("lend", "运动未分胜负，出借不动");
  },
});

export const PORT_VAULT = Object.freeze({
  id: "vault",
  version: "1",
  title: "金库",
  status: "next",
  decode(ethology, context = {}) {
    return { schema: "iff.port/1", port: "vault", ...decodeFinance(ethology, context.book) };
  },
});

export const PORT_PREDICT = Object.freeze({
  id: "predict",
  version: "1",
  title: "预测",
  status: "later",
  decode(ethology) {
    if (ethology?.action === "FORAGE") return { schema: "iff.port/1", port: "predict", action: "YES", reason: "趋近被读成是；本版不结算" };
    if (ethology?.action === "AVOID") return { schema: "iff.port/1", port: "predict", action: "NO", reason: "退避被读成否；本版不结算" };
    return hold("predict", "运动未分胜负，预测不动");
  },
});

export const PORT_BUYBACK = Object.freeze({
  id: "buyback",
  version: "1",
  title: "回购",
  status: "later",
  decode() {
    return hold("buyback", "回购只由金库盈余策略触发，不由单只果蝇运动解码");
  },
});

export const BUILTIN_PORTS = Object.freeze([PORT_TRADE, PORT_LEND, PORT_VAULT, PORT_PREDICT, PORT_BUYBACK]);

export function createPorts(additional = []) {
  return createRegistry("port", [...BUILTIN_PORTS, ...additional]);
}

export function decodePort(ports, id, version, ethology, context) {
  return ports.require(id, version).decode(ethology, context);
}
