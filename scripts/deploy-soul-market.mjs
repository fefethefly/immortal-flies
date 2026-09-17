/**
 * Deploy SoulMarket against an already-live ImmortalSoul.
 * Does not call setModule. Does not touch ImmortalSoul.
 *
 * Testnet:
 *   npm run life:check:market
 *   IFF_DEPLOY_KEY=0x… npm run life:deploy:market:testnet
 *
 * Mainnet satellite only:
 *   npm run life:check:market -- --mainnet
 *   IFF_DEPLOY_KEY=0x… npm run life:deploy:market:testnet -- --mainnet --i-am-deploying-bsc-mainnet
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { compileLife } from "./compile-life.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAINNET_FLAG = "--i-am-deploying-bsc-mainnet";
const MAINNET_HIVE = "0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467";

function loadDotEnv() {
  const home = process.env.HOME || "";
  const files = [];
  if (home) files.push(path.join(home, ".env"));
  files.push(path.join(root, ".env"), path.join(root, ".env.local"));
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  }
}

loadDotEnv();

const mainnet = process.argv.includes("--mainnet");
const checkOnly = process.argv.includes("--check");
const CHAIN_ID = mainnet ? 56 : 97;
const EXPLORER = mainnet ? "https://bscscan.com" : "https://testnet.bscscan.com";
const RPCS = mainnet
  ? [
      process.env.BSC_MAINNET_RPC,
      "https://bsc-dataseed.bnbchain.org",
      "https://bsc-dataseed.binance.org",
    ].filter(Boolean)
  : [
      process.env.BSC_TESTNET_RPC,
      "https://bsc-testnet.publicnode.com",
      "https://bsc-testnet-rpc.publicnode.com",
      "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    ].filter(Boolean);

function readKey() {
  let key = (process.env.IFF_DEPLOY_KEY || "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("缺少 IFF_DEPLOY_KEY。可放在项目 .env 或 ~/.env，不要提交。");
  }
  return key;
}

async function connect() {
  let last;
  for (const url of RPCS) {
    try {
      const provider = new JsonRpcProvider(url, CHAIN_ID, { staticNetwork: true });
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== CHAIN_ID) {
        throw new Error(`RPC 返回 chainId ${network.chainId}`);
      }
      await provider.getBlockNumber();
      return { provider, url };
    } catch (error) {
      last = error;
    }
  }
  throw new Error(`无法连接 RPC：${last?.message || "未知错误"}`);
}

const artifacts = compileLife({ write: true });
const official = JSON.parse(
  fs.readFileSync(path.join(root, "public/token/official.json"), "utf8"),
);
const soulListing = path.join(
  root,
  mainnet
    ? "public/contract/life/ImmortalSoul.deployment.json"
    : "public/contract/life/ImmortalSoul.testnet.json",
);
const soulFallback = path.join(root, "public/contract/life/ImmortalSoul.deployment.json");
const soul = JSON.parse(
  fs.readFileSync(fs.existsSync(soulListing) ? soulListing : soulFallback, "utf8"),
);
if (!soul.address) throw new Error("部署清单没有 Soul 地址");
if (mainnet && Number(soul.chainId) !== 56) {
  throw new Error("主网市场必须对着 chainId 56 的 Soul");
}

const hive = mainnet
  ? getAddress(official.vault)
  : process.env.IFF_TESTNET_HIVE
    ? getAddress(process.env.IFF_TESTNET_HIVE)
    : null;

if (mainnet && getAddress(hive) !== getAddress(MAINNET_HIVE)) {
  throw new Error("主网 hive 必须是 official.json 的蜂巢金库");
}

const { provider, url } = await connect();
console.log(`RPC ${url}`);
console.log(`chain ${CHAIN_ID}`);
console.log(`soul ${soul.address}`);
console.log(`SoulMarket ${artifacts.SoulMarket.deployedBytes}B`);
console.log("will not setModule");

if (checkOnly) {
  console.log("检查通过。未发送交易。未绑定模块。");
  process.exit(0);
}

if (mainnet && !process.argv.includes(MAINNET_FLAG)) {
  throw new Error(`主网部署市场卫星必须带 ${MAINNET_FLAG}`);
}

const wallet = new Wallet(readKey(), provider);
const hiveAddr = hive || wallet.address;
const market = await new ContractFactory(
  artifacts.SoulMarket.abi,
  artifacts.SoulMarket.bytecode,
  wallet,
).deploy(soul.address, hiveAddr);
const marketTx = market.deploymentTransaction();
console.log(`market tx ${marketTx.hash}`);
await market.waitForDeployment();
const marketAddr = await market.getAddress();
const receipt = await marketTx.wait();
console.log(`market ${marketAddr}`);
console.log(`hive ${hiveAddr}`);
console.log(`feeBps ${await market.feeBps()}`);

const record = {
  status: mainnet ? "LIVE" : "BSC_TESTNET",
  chainId: CHAIN_ID,
  address: marketAddr,
  soul: getAddress(soul.address),
  hive: hiveAddr,
  feeBps: Number(await market.feeBps()),
  operator: wallet.address,
  fromBlock: receipt.blockNumber,
  txHash: marketTx.hash,
  explorer: `${EXPLORER}/address/${marketAddr}`,
  deployedAt: new Date().toISOString(),
  note: "Independent satellite. Not a Soul module. Do not setModule. Not OpenSea. 2% hive fee is not a buyback.",
};
const out = path.join(
  root,
  mainnet
    ? "public/contract/life/SoulMarket.deployment.json"
    : "public/contract/life/SoulMarket.testnet.json",
);
fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
console.log(`wrote ${out}`);
console.log(`gas ${receipt.gasUsed}`);
