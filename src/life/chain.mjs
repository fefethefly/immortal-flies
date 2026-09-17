/**
 * New Soul / Journal wallet adapter. Old src/chain.mjs stays on the 16-node testnet prototype.
 */
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, getAddress } from "ethers";

export const BSC_MAINNET = Object.freeze({
  chainId: 56,
  hexChainId: "0x38",
  name: "BNB Smart Chain",
  explorer: "https://bscscan.com",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: [
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed1.bnbchain.org",
    "https://bsc-dataseed.binance.org",
    "https://bsc.publicnode.com",
  ],
});

export const BSC_TESTNET = Object.freeze({
  chainId: 97,
  hexChainId: "0x61",
  name: "BNB Smart Chain Testnet",
  explorer: "https://testnet.bscscan.com",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: [
    "https://bsc-testnet-rpc.publicnode.com",
    "https://bsc-testnet.public.blastapi.io",
  ],
});

export function networkOf(chainId) {
  return Number(chainId) === 56 ? BSC_MAINNET : BSC_TESTNET;
}

export function parseLifeDeployment(data) {
  if (
    !data?.address ||
    data.status === "UNDEPLOYED" ||
    String(data.status).startsWith("STALE")
  )
    return null;
  const chainId = Number(data.chainId);
  if (chainId !== 56 && chainId !== 97) return null;
  return {
    ...data,
    chainId,
    address: getAddress(data.address),
    journal: data.journal ? getAddress(data.journal) : null,
    kin: data.kin ? getAddress(data.kin) : null,
  };
}

export function lifeListingPath(search = "") {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  if (params.get("net") === "test" || params.get("chain") === "97") {
    return "/contract/life/ImmortalSoul.testnet.json";
  }
  return "/contract/life/ImmortalSoul.deployment.json";
}

export function marketListingPath(search = "") {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  if (params.get("net") === "test" || params.get("chain") === "97") {
    return "/contract/life/SoulMarket.testnet.json";
  }
  return "/contract/life/SoulMarket.deployment.json";
}

export function parseMarketDeployment(data) {
  if (
    !data?.address ||
    data.status === "UNDEPLOYED" ||
    String(data.status).startsWith("STALE")
  ) {
    return null;
  }
  const chainId = Number(data.chainId);
  if (chainId !== 56 && chainId !== 97) return null;
  return {
    ...data,
    chainId,
    address: getAddress(data.address),
    soul: data.soul ? getAddress(data.soul) : null,
    hive: data.hive ? getAddress(data.hive) : null,
  };
}

export async function loadMarketDeployment(
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  const response = await fetch(marketListingPath(search), {
    cache: "no-store",
  });
  if (!response.ok) return null;
  return parseMarketDeployment(await response.json());
}

export async function openLifeMarket(address, runner) {
  const artifact = await loadLifeArtifact("SoulMarket");
  return new Contract(address, artifact.abi, runner);
}

export async function loadLifeDeployment(
  search = typeof window === "undefined" ? "" : window.location.search,
) {
  const response = await fetch(lifeListingPath(search), {
    cache: "no-store",
  });
  if (!response.ok) return null;
  return parseLifeDeployment(await response.json());
}

export async function loadLifeArtifact(name = "ImmortalSoul") {
  const response = await fetch(`/contract/life/${name}.json`);
  if (!response.ok) throw new Error(`无法读取 ${name} ABI`);
  return response.json();
}

const KIN_FEE_PROBE = [
  "function breedPrice() view returns (uint256)",
];

export async function openLifeKin(address, runner) {
  const probe = new Contract(address, KIN_FEE_PROBE, runner);
  try {
    await probe.breedPrice();
    const artifact = await loadLifeArtifact("SoulKinFee");
    return new Contract(address, artifact.abi, runner);
  } catch {
    const artifact = await loadLifeArtifact("SoulKin");
    return new Contract(address, artifact.abi, runner);
  }
}

export async function readKinBreedPrice(kin) {
  try {
    if (typeof kin?.breedPrice !== "function") return 0n;
    return BigInt(await kin.breedPrice());
  } catch {
    return 0n;
  }
}

export function formatBreedPrice(wei) {
  try {
    const value = BigInt(wei ?? 0);
    if (value === 0n) return "0";
    return formatEther(value);
  } catch {
    return "0";
  }
}

export function readBreedBuy(receipt, kin) {
  if (!receipt?.logs || !kin?.interface) return { status: "none" };
  for (const log of receipt.logs) {
    try {
      const parsed = kin.interface.parseLog(log);
      if (parsed?.name === "BreedBuyFilled") {
        return {
          status: "filled",
          paid: parsed.args.paid?.toString?.() ?? "0",
          amountOut: parsed.args.amountOut?.toString?.() ?? "0",
        };
      }
      if (parsed?.name === "BreedBuyHeld") {
        return {
          status: "held",
          paid: parsed.args.paid?.toString?.() ?? "0",
          reason: Number(parsed.args.reason ?? 0),
        };
      }
    } catch {
      /* ignore unrelated logs */
    }
  }
  return { status: "none" };
}

export async function ensureChain(ethereum, network) {
  const current = await ethereum.request({ method: "eth_chainId" });
  if (current === network.hexChainId) return network.chainId;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.hexChainId }],
    });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: network.hexChainId,
          chainName: network.name,
          nativeCurrency: network.nativeCurrency,
          rpcUrls: network.rpcUrls,
          blockExplorerUrls: [`${network.explorer}/`],
        },
      ],
    });
  }
  return network.chainId;
}

const LOG_CHUNK = 2000;

export async function openReadProvider(network) {
  let lastError;
  for (const url of network.rpcUrls) {
    const provider = new JsonRpcProvider(url, network.chainId, {
      staticNetwork: true,
    });
    try {
      await provider.getBlockNumber();
      return provider;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("No reachable BSC RPC");
}

export async function readHeadBlock(network, fallback = 0) {
  try {
    const provider = await openReadProvider(network);
    return await provider.getBlockNumber();
  } catch {
    return fallback;
  }
}

export async function queryLatestLog(
  contract,
  filter,
  fromBlock = 0,
  chunk = LOG_CHUNK,
) {
  const provider = contract.runner?.provider;
  if (!provider) return null;
  const head = await provider.getBlockNumber();
  const floor = Math.max(0, Number(fromBlock) || 0);
  for (let to = head; to >= floor; to -= chunk) {
    const from = Math.max(floor, to - chunk + 1);
    try {
      const logs = await contract.queryFilter(filter, from, to);
      if (logs.length) return logs.at(-1);
    } catch {
      /* public BSC RPCs reject wide or busy log scans */
    }
  }
  return null;
}

export async function queryAllLogs(
  contract,
  filter,
  fromBlock = 0,
  chunk = LOG_CHUNK,
) {
  const provider = contract.runner?.provider;
  if (!provider) return [];
  const head = await provider.getBlockNumber();
  const floor = Math.max(0, Number(fromBlock) || 0);
  const out = [];
  for (let from = floor; from <= head; from += chunk) {
    const to = Math.min(head, from + chunk - 1);
    try {
      const logs = await contract.queryFilter(filter, from, to);
      if (logs.length) out.push(...logs);
    } catch {
      /* public BSC RPCs reject wide or busy log scans */
    }
  }
  return out;
}

export async function readSoulCensus(deployment) {
  if (!deployment?.address) {
    return { status: "off", total: 0, gen0: 0, cap: 1024, live: false };
  }
  const reader = await openLifeReader(deployment);
  if (!reader?.soul) {
    return { status: "off", total: 0, gen0: 0, cap: 1024, live: false };
  }
  try {
    const [total, gen0, cap] = await Promise.all([
      reader.soul.totalSupply(),
      reader.soul.gen0Supply(),
      reader.soul.MAX_GEN0(),
    ]);
    return {
      status: "live",
      total: Number(total),
      gen0: Number(gen0),
      cap: Number(cap) || 1024,
      live: Number(deployment.chainId) === 56,
      chainId: Number(deployment.chainId),
    };
  } catch {
    return {
      status: "live",
      total: 0,
      gen0: 0,
      cap: 1024,
      live: Number(deployment.chainId) === 56,
      chainId: Number(deployment.chainId),
      unread: true,
    };
  }
}

export async function openLifeReader(deployment) {
  if (!deployment?.address) return null;
  const network = networkOf(deployment.chainId);
  const provider = await openReadProvider(network);
  const artifact = await loadLifeArtifact("ImmortalSoul");
  const soul = new Contract(deployment.address, artifact.abi, provider);
  let journal = null;
  if (deployment.journal) {
    const journalAbi = await loadLifeArtifact("LifeJournal");
    journal = new Contract(deployment.journal, journalAbi.abi, provider);
  }
  let kin = null;
  if (deployment.kin) kin = await openLifeKin(deployment.kin, provider);
  return { provider, soul, journal, kin, network };
}

export const HATCH_HASH_WINDOW = 256;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export function hatchPhase(pending, blockNow) {
  if (!pending) return "none";
  const now = Number(blockNow) || 0;
  if (!now || now <= pending.entropyBlock) return "wait";
  if (now > pending.entropyBlock + HATCH_HASH_WINDOW) return "expired";
  return "ready";
}

export async function readPendingHatch(soul, address) {
  if (!address || typeof soul.pendingRequest !== "function") return null;
  const id = Number(await soul.pendingRequest(address));
  if (!id) return null;
  const req = await soul.requests(id);
  const recipient = String(req.recipient ?? req[0] ?? "");
  if (!recipient || recipient.toLowerCase() === ZERO_ADDR) return null;
  return {
    requestId: id,
    recipient,
    entropyBlock: Number(req.entropyBlock ?? req[1]),
  };
}

export async function readPendingBreed(kin, address) {
  if (!address || typeof kin?.pendingRequest !== "function") return null;
  const id = Number(await kin.pendingRequest(address));
  if (!id) return null;
  const req = await kin.requests(id);
  const recipient = String(req.recipient ?? req[0] ?? "");
  if (!recipient || recipient.toLowerCase() === ZERO_ADDR) return null;
  return {
    requestId: id,
    recipient,
    parentA: Number(req.parentA ?? req[1]),
    parentB: Number(req.parentB ?? req[2]),
    entropyBlock: Number(req.entropyBlock ?? req[3]),
    paid: BigInt(req.paid ?? req[4] ?? 0).toString(),
  };
}

export function explainMarketError(err, tx) {
  const raw = err?.shortMessage || err?.reason || err?.message || String(err);
  if (/WrongPrice/i.test(raw)) return tx("market.wrongPrice");
  if (/NotListed/i.test(raw)) return tx("market.notListed");
  if (/WrongLife/i.test(raw)) return tx("market.wrongLife");
  if (/FeeCap/i.test(raw)) return tx("market.feeCap");
  if (/BadList/i.test(raw)) return tx("market.badList");
  if (/Unauthorized/i.test(raw)) return tx("market.needOwner");
  return explainLifeError(err, tx);
}

export async function readOpenListing(market, tokenId) {
  if (!market || !tokenId) return null;
  try {
    const row = await market.listings(tokenId);
    const seller = row.seller ?? row[0];
    const lifeId = row.lifeId ?? row[1];
    const price = BigInt(row.price ?? row[2] ?? 0);
    const listedAt = Number(row.listedAt ?? row[3] ?? 0);
    if (!price || !seller || seller === ZERO_ADDR) return null;
    return {
      tokenId: Number(tokenId),
      seller,
      lifeId,
      price: price.toString(),
      listedAt,
    };
  } catch {
    return null;
  }
}

export async function loadOpenListings(market, fromBlock = 0, tokenIds = []) {
  if (!market) return [];
  const ids = new Set(
    (tokenIds || []).map((id) => Number(id)).filter((id) => id > 0),
  );
  const listed = await queryAllLogs(market, market.filters.Listed(), fromBlock);
  const relisted = await queryAllLogs(
    market,
    market.filters.Relisted(),
    fromBlock,
  );
  for (const log of [...listed, ...relisted]) {
    const id = Number(log.args?.tokenId ?? 0);
    if (id) ids.add(id);
  }
  const rows = [];
  const list = [...ids];
  for (let i = 0; i < list.length; i += 12) {
    const chunk = await Promise.all(
      list.slice(i, i + 12).map((id) => readOpenListing(market, id)),
    );
    rows.push(...chunk.filter(Boolean));
  }
  return rows.sort((a, b) => Number(b.listedAt) - Number(a.listedAt));
}

export async function loadMarketActivity(market, fromBlock = 0, limit = 16) {
  if (!market) return [];
  const kinds = ["Sold", "Listed", "Relisted", "Canceled", "Swept"];
  const rows = [];
  for (const kind of kinds) {
    const logs = await queryAllLogs(
      market,
      market.filters[kind](),
      fromBlock,
    );
    for (const log of logs) {
      rows.push({
        kind: kind.toLowerCase(),
        tokenId: Number(log.args?.tokenId ?? 0),
        seller: log.args?.seller,
        buyer: log.args?.buyer,
        lifeId: log.args?.lifeId,
        price: log.args?.price != null ? BigInt(log.args.price).toString() : "0",
        fee: log.args?.fee != null ? BigInt(log.args.fee).toString() : "0",
        block: Number(log.blockNumber || 0),
      });
    }
  }
  return rows
    .filter((row) => row.tokenId > 0)
    .sort((a, b) => b.block - a.block)
    .slice(0, limit);
}

export async function readMarketRefund(market, address) {
  if (!market || !address || typeof market.refunds !== "function") return "0";
  try {
    return BigInt(await market.refunds(address)).toString();
  } catch {
    return "0";
  }
}

export function explainLifeError(err, tx) {
  const raw = err?.shortMessage || err?.reason || err?.message || String(err);
  if (/HatchLimit/i.test(raw)) return tx("hatch.limit");
  if (/PendingHatch/i.test(raw)) return tx("hatch.pendingBusy");
  if (/HatchNotReady/i.test(raw)) return tx("hatch.notReady");
  if (/HatchUnavailable/i.test(raw)) return tx("hatch.unavailable");
  if (/SoldOut/i.test(raw)) return tx("hatch.soldOut");
  if (/InvalidName/i.test(raw)) return tx("hatch.nameNeed");
  if (/StaleEpoch/i.test(raw)) return tx("life.staleEpoch");
  if (/InvalidCheckpoint/i.test(raw)) return tx("life.badCheckpoint");
  if (/InvalidInput/i.test(raw)) return tx("life.badInput");
  if (/WrongFee|PriceCap/i.test(raw)) return tx("kin.wrongFee");
  if (/PendingBreed|InvalidPair|Unauthorized/i.test(raw))
    return tx("kin.breedNeed");
  if (/BreedNotReady|BreedUnavailable/i.test(raw)) return tx("kin.breedWait");
  if (
    /already pending|already processing|Request of type|断开|刷新/i.test(raw)
  ) {
    return tx("hatch.walletBusy");
  }
  if (/limit exceeded|eth_getLogs|could not coalesce/i.test(raw))
    return tx("hatch.rpcLimit");
  return raw;
}

export async function connectLife(ethereum, deployment, network) {
  if (!ethereum) throw new Error("未检测到钱包");
  if (!deployment?.address) throw new Error("Soul 合约尚未部署");
  const resolved = network || networkOf(deployment.chainId);
  const accounts = await ethereum
    .request({ method: "eth_accounts" })
    .catch(() => []);
  if (!accounts?.length) {
    await ethereum.request({ method: "eth_requestAccounts" });
  }
  await ensureChain(ethereum, resolved);
  const provider = new BrowserProvider(ethereum, resolved.chainId);
  const signer = await provider.getSigner();
  const artifact = await loadLifeArtifact("ImmortalSoul");
  const soul = new Contract(deployment.address, artifact.abi, signer);
  let journal = null;
  if (deployment.journal) {
    const journalAbi = await loadLifeArtifact("LifeJournal");
    journal = new Contract(deployment.journal, journalAbi.abi, signer);
  }
  let kin = null;
  if (deployment.kin) kin = await openLifeKin(deployment.kin, signer);
  return {
    provider,
    signer,
    soul,
    journal,
    kin,
    address: await signer.getAddress(),
    network: resolved,
  };
}

export function readHatchRequested(receipt, soul) {
  for (const log of receipt.logs) {
    try {
      const parsed = soul.interface.parseLog(log);
      if (parsed?.name === "HatchRequested") {
        return {
          requestId: Number(parsed.args.requestId),
          recipient: parsed.args.recipient,
          entropyBlock: Number(parsed.args.entropyBlock),
        };
      }
    } catch {
      /* ignore unrelated logs */
    }
  }
  throw new Error("交易回执中没有 HatchRequested");
}

export function readBorn(receipt, soul) {
  for (const log of receipt.logs) {
    try {
      const parsed = soul.interface.parseLog(log);
      if (parsed?.name === "Born") {
        return {
          tokenId: Number(parsed.args.tokenId),
          owner: parsed.args.owner,
          life: parsed.args.life,
          seed: Number(parsed.args.seed),
          birthHash: parsed.args.birthHash,
        };
      }
    } catch {
      /* ignore unrelated logs */
    }
  }
  throw new Error("交易回执中没有 Born");
}

export function readBreedRequested(receipt, kin) {
  for (const log of receipt.logs) {
    try {
      const parsed = kin.interface.parseLog(log);
      if (parsed?.name === "BreedRequested") {
        return {
          requestId: Number(parsed.args.requestId),
          recipient: parsed.args.recipient,
          parentA: Number(parsed.args.parentA),
          parentB: Number(parsed.args.parentB),
          entropyBlock: Number(parsed.args.entropyBlock),
          paid: parsed.args.paid != null ? BigInt(parsed.args.paid).toString() : "0",
        };
      }
    } catch {
      /* ignore unrelated logs */
    }
  }
  throw new Error("交易回执中没有 BreedRequested");
}
