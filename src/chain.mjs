import { BrowserProvider, Contract, getAddress } from "ethers";

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

const ZERO = "0x0000000000000000000000000000000000000000";

export function decodeFly(tokenId, raw) {
  return {
    model: "iff-neural-16-v1",
    id: Number(tokenId),
    dna: Number(raw.dna),
    bornAt: new Date(Number(raw.bornAt) * 1000).toISOString(),
    source: "bsc-testnet",
    brain: {
      rng: Number(raw.brain.rng),
      ticks: Number(raw.brain.ticks),
      learning: Array.from(raw.brain.learning, Number),
      potential: Array.from(raw.brain.potential, Number),
      energy: Number(raw.brain.energy),
      spikes: Number(raw.brain.spikes),
      incarnation: Number(raw.brain.incarnation),
      dormant: Boolean(raw.brain.dormant),
    },
    achievements: [],
  };
}

export async function loadDeployment() {
  const fromEnv = import.meta.env?.VITE_IFF_ADDRESS;
  try {
    const response = await fetch("/contract/ImmortalFly.deployment.json", {
      cache: "no-store",
    });
    if (!response.ok) {
      if (fromEnv) return { address: getAddress(fromEnv), chainId: 97 };
      return null;
    }
    const data = await response.json();
    const address = fromEnv || data.address;
    if (!address || data.status === "UNDEPLOYED" || data.chainId !== 97)
      return fromEnv ? { address: getAddress(fromEnv), chainId: 97 } : null;
    return {
      ...data,
      address: getAddress(address),
      chainId: 97,
      fromBlock: data.fromBlock ?? 0,
    };
  } catch {
    return fromEnv ? { address: getAddress(fromEnv), chainId: 97 } : null;
  }
}

export async function loadArtifact() {
  const response = await fetch("/contract/ImmortalFly.json");
  if (!response.ok) throw new Error("无法读取合约 ABI");
  return response.json();
}

export async function ensureTestnet(ethereum) {
  const current = await ethereum.request({ method: "eth_chainId" });
  if (current === BSC_TESTNET.hexChainId) return 97;
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_TESTNET.hexChainId }],
    });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BSC_TESTNET.hexChainId,
          chainName: BSC_TESTNET.name,
          nativeCurrency: BSC_TESTNET.nativeCurrency,
          rpcUrls: BSC_TESTNET.rpcUrls,
          blockExplorerUrls: [`${BSC_TESTNET.explorer}/`],
        },
      ],
    });
  }
  return 97;
}

export async function connectChain(ethereum, deployment) {
  if (!ethereum) throw new Error("未检测到钱包");
  if (!deployment?.address) throw new Error("测试网合约尚未部署");
  await ethereum.request({ method: "eth_requestAccounts" });
  await ensureTestnet(ethereum);
  const provider = new BrowserProvider(ethereum, 97);
  const signer = await provider.getSigner();
  const artifact = await loadArtifact();
  const contract = new Contract(deployment.address, artifact.abi, signer);
  const model = await contract.MODEL();
  if (model !== "iff-neural-16-v1") throw new Error("合约模型版本与页面不一致");
  return { provider, signer, contract, address: await signer.getAddress() };
}

export async function findOwnedTokenIds(contract, owner, fromBlock = 0) {
  const filter = contract.filters.Transfer(null, owner);
  let logs;
  try {
    logs = await contract.queryFilter(filter, fromBlock);
  } catch {
    const head = await contract.runner.provider.getBlockNumber();
    logs = await contract.queryFilter(filter, Math.max(0, head - 40_000));
  }
  const seen = new Set();
  const owned = [];
  for (const log of logs) {
    const id = log.args.tokenId;
    const key = id.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if ((await contract.ownerOf(id)).toLowerCase() === owner.toLowerCase())
        owned.push(id);
    } catch {
      /* burned or missing; this contract cannot burn */
    }
  }
  return owned;
}

export async function readFly(contract, tokenId) {
  return decodeFly(tokenId, await contract.getFly(tokenId));
}

export async function waitAction(txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("链上交易失败");
  return receipt;
}

export function explorerTx(hash) {
  return `${BSC_TESTNET.explorer}/tx/${hash}`;
}

export function explorerAddress(address) {
  return `${BSC_TESTNET.explorer}/address/${address}`;
}

export function mintSeedFromDna(dna) {
  const seed = Number(dna) >>> 0;
  return seed === 0 ? 3700127 : seed;
}

export function tokenIdFromReceipt(contract, receipt) {
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({
        topics: log.topics,
        data: log.data,
      });
      if (parsed?.name === "Born") return parsed.args.tokenId;
      if (
        parsed?.name === "Transfer" &&
        String(parsed.args.from).toLowerCase() === ZERO
      )
        return parsed.args.tokenId;
    } catch {
      /* other contracts in the receipt */
    }
  }
  return null;
}

export { ZERO };
