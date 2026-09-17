import { getAddress } from "ethers";

export const TOKEN_PATH = "/token/official.json";

function optionalAddress(value) {
  if (!value) return null;
  return getAddress(String(value).toLowerCase());
}

export function normalizeToken(raw) {
  if (!raw || raw.schema !== "iff.token/1") throw new Error("TOKEN_SCHEMA");
  if (!/^[A-Z]{2,10}$/.test(raw.symbol)) throw new Error("TOKEN_SYMBOL");
  return {
    schema: raw.schema,
    name: raw.name,
    symbol: raw.symbol,
    chainId: raw.chainId,
    status: raw.status === "live" ? "live" : "unlaunched",
    address: raw.address || null,
    vault: optionalAddress(raw.vault),
    ops: optionalAddress(raw.ops),
    flapUrl: raw.flapUrl || null,
    website: raw.website || null,
    twitter: raw.twitter || null,
    buyTaxBps: raw.buyTaxBps ?? 100,
    sellTaxBps: raw.sellTaxBps ?? 100,
    hiveBps: raw.hiveBps ?? 8000,
    opsBps: raw.opsBps ?? 2000,
    quote: raw.quote || "BNB",
    rejected: raw.rejected || [],
  };
}

export async function loadOfficialToken() {
  const response = await fetch(TOKEN_PATH, { cache: "no-store" });
  if (!response.ok) throw new Error("TOKEN_FETCH");
  return normalizeToken(await response.json());
}

export function explorerToken(address, chainId = 56) {
  if (!address) return null;
  const host = chainId === 97 ? "testnet.bscscan.com" : "bscscan.com";
  return `https://${host}/token/${address}`;
}

export function explorerAddress(address, chainId = 56) {
  if (!address) return null;
  const host = chainId === 97 ? "testnet.bscscan.com" : "bscscan.com";
  return `https://${host}/address/${address}`;
}

export function flapToken(address) {
  return address ? `https://flap.sh/bnb/${address}` : "https://flap.sh";
}
