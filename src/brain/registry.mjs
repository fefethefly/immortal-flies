import { identifier, requireValue } from "./codec.mjs";

/** Explicit plugin list. New capability = register, not a second brain. */
export function createRegistry(kind, items = []) {
  identifier(kind);
  const map = new Map();
  const register = (item) => {
    requireValue(item && typeof item === "object", "INVALID_PLUGIN");
    identifier(item.id);
    identifier(item.version);
    const key = `${item.id}@${item.version}`;
    requireValue(!map.has(key), "DUPLICATE_PLUGIN", `${kind} 已登记 ${key}`);
    map.set(key, Object.freeze({ ...item }));
    return key;
  };
  for (const item of items) register(item);
  return {
    kind,
    register,
    get(id, version) {
      return map.get(`${id}@${version}`) || null;
    },
    require(id, version) {
      const item = map.get(`${id}@${version}`);
      requireValue(item, "UNKNOWN_PLUGIN", `${kind} 未登记 ${id}@${version}`);
      return item;
    },
    has(id, version) {
      return map.has(`${id}@${version}`);
    },
    list() {
      return [...map.values()];
    },
    keys() {
      return [...map.keys()];
    },
    size() {
      return map.size;
    },
  };
}
