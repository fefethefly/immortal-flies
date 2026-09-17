import { formatEther, getAddress } from "ethers";

const ZERO = "0x0000000000000000000000000000000000000000";

export const MIN_ASK_BNB = "0.001";

export function listingKey({ chainId, collection, tokenId, lifeId }) {
  return [
    Number(chainId) || 0,
    String(collection || "").toLowerCase(),
    Number(tokenId) || 0,
    String(lifeId || "").toLowerCase(),
  ].join(":");
}

export function isOpenListing(row) {
  if (!row?.seller || row.seller === ZERO) return false;
  try {
    return BigInt(row.price || 0) > 0n;
  } catch {
    return false;
  }
}

export function formatAsk(wei) {
  try {
    const value = BigInt(wei ?? 0);
    if (value === 0n) return "0";
    return formatEther(value);
  } catch {
    return "0";
  }
}

export function askWei(text) {
  const raw = String(text || "").trim();
  if (!raw) return 0n;
  const [whole, frac = ""] = raw.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac)) return 0n;
  const padded = (frac + "000000000000000000").slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(padded || "0");
}

export const MARKET_SORTS = ["new", "price", "priceDesc"];

export function askFee(wei, feeBps = 200) {
  try {
    const price = BigInt(wei || 0);
    const bps = BigInt(Math.max(0, Number(feeBps) || 0));
    return (price * bps) / 10000n;
  } catch {
    return 0n;
  }
}

export function askProceeds(wei, feeBps = 200) {
  try {
    const price = BigInt(wei || 0);
    const fee = askFee(price, feeBps);
    return price > fee ? price - fee : 0n;
  } catch {
    return 0n;
  }
}

export function isSelfAsk(row, wallet) {
  return Boolean(
    row?.seller &&
      wallet &&
      String(row.seller).toLowerCase() === String(wallet).toLowerCase(),
  );
}

export function hasMarketFilters({
  body = "",
  eyes = "",
  mark = "",
  generation = "",
  query = "",
} = {}) {
  return Boolean(
    body || eyes || mark || generation || String(query || "").trim(),
  );
}

export function parseMarketView(search = "") {
  const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const sort = q.get("sort") || "new";
  const generation = q.get("gen") || "";
  return {
    query: q.get("q") || "",
    sort: MARKET_SORTS.includes(sort) ? sort : "new",
    body: q.get("body") || "",
    eyes: q.get("eyes") || "",
    mark: q.get("mark") || "",
    generation: generation === "0" || generation === "1+" ? generation : "",
  };
}

export function writeMarketView(view, search = "") {
  const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const put = (key, value, skip) => {
    const text = String(value || "");
    if (!text || text === skip) q.delete(key);
    else q.set(key, text);
  };
  put("q", view?.query);
  put("sort", view?.sort || "new", "new");
  put("body", view?.body);
  put("eyes", view?.eyes);
  put("mark", view?.mark);
  put("gen", view?.generation);
  const text = q.toString();
  return text ? `?${text}` : "";
}

export function filterListed(
  rows,
  { body = "", eyes = "", mark = "", generation = "" } = {},
) {
  return (rows || []).filter((row) => {
    if (!isOpenListing(row)) return false;
    const ph = row.soul?.phenotype;
    if (body && ph?.hue?.id !== body) return false;
    if (eyes && ph?.eye?.id !== eyes) return false;
    if (mark && ph?.mark?.id !== mark) return false;
    const gen = Number(row.soul?.generation) || 0;
    if (generation === "0" && gen !== 0) return false;
    if (generation === "1+" && gen < 1) return false;
    return true;
  });
}

export function matchListed(rows, query = "") {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return rows || [];
  return (rows || []).filter((row) => {
    const name = String(row.soul?.givenName || "").toLowerCase();
    const life = String(row.lifeId || "").toLowerCase();
    const id = String(row.tokenId || "");
    return (
      id === q ||
      `#${id}` === q ||
      id.includes(q) ||
      name.includes(q) ||
      life.includes(q)
    );
  });
}

export function sortListed(rows, sort = "new") {
  const copy = [...(rows || [])];
  copy.sort((a, b) => {
    if (sort === "price") {
      const delta = BigInt(a.price || 0) - BigInt(b.price || 0);
      return delta === 0n ? 0 : delta < 0n ? -1 : 1;
    }
    if (sort === "priceDesc") {
      const delta = BigInt(b.price || 0) - BigInt(a.price || 0);
      return delta === 0n ? 0 : delta < 0n ? -1 : 1;
    }
    return Number(b.listedAt || 0) - Number(a.listedAt || 0);
  });
  return copy;
}

export function listingForToken(rows, tokenId) {
  const id = Number(tokenId);
  if (!id) return null;
  return (
    (rows || []).find(
      (row) => Number(row.tokenId) === id && isOpenListing(row),
    ) || null
  );
}

export function breedTouchesListing(pending, tokenId) {
  const id = Number(tokenId);
  if (!pending || !id) return false;
  return Number(pending.parentA) === id || Number(pending.parentB) === id;
}

export function shortLife(life) {
  const text = String(life || "");
  return text.length > 12 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text;
}

export function externalAskUrl(chainId, collection, tokenId) {
  if (Number(chainId) !== 56 || !collection || !tokenId) return "";
  try {
    return `https://element.market/assets/bsc/${getAddress(collection)}/${Number(tokenId)}`;
  } catch {
    return "";
  }
}

export function readListingRow(tokenId, row) {
  if (!row) return null;
  const seller = row.seller ?? row[0];
  const lifeId = row.lifeId ?? row[1];
  const price = row.price ?? row[2] ?? 0;
  const listedAt = Number(row.listedAt ?? row[3] ?? 0);
  const parsed = {
    tokenId: Number(tokenId),
    seller,
    lifeId,
    price: BigInt(price || 0).toString(),
    listedAt,
  };
  return isOpenListing(parsed) ? parsed : null;
}
