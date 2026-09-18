/**
 * Deploy MiningHub against an already-live ImmortalSoul + LifeJournal.
 * Does not call setModule. Does not touch ImmortalSoul.
 *
 *   npm run life:check:hub
 *   npm run life:check:hub -- --mainnet
 *   IFF_DEPLOY_KEY=0x… IFF_TESTNET_IFS=0x… npm run life:deploy:hub:testnet
 *
 * Mainnet deploy is refused until a fund-track audit and an explicit later flag.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { compileLife } from "./compile-life.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAINNET_IFS = "0x65b66BB4Adb0e244E19d290b6AAa0381B81A7777";
const MAINNET_HIVE = "0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467";
const MAINNET_OPS = "0x055bB2aF42B832A55F3D708c92824C491dE05427";

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
if (artifacts.MiningHub.deployedBytes > 24576) {
  throw new Error("MiningHub exceeds EIP-170");
}
const official = JSON.parse(
  fs.readFileSync(path.join(root, "public/token/official.json"), "utf8"),
);
const soulListing = path.join(
  root,
  mainnet
    ? "public/contract/life/ImmortalSoul.deployment.json"
    : "public/contract/life/ImmortalSoul.testnet.json",
);
const soul = JSON.parse(fs.readFileSync(soulListing, "utf8"));
if (!soul.address || !soul.journal) throw new Error("部署清单没有 Soul / Journal 地址");
if (mainnet && Number(soul.chainId) !== 56) {
  throw new Error("主网 MiningHub 必须对着 chainId 56 的 Soul");
}

const hive = mainnet
  ? getAddress(official.vault)
  : process.env.IFF_TESTNET_HIVE
    ? getAddress(process.env.IFF_TESTNET_HIVE)
    : soul.hive
      ? getAddress(soul.hive)
      : null;
const ifs = mainnet
  ? getAddress(official.address)
  : process.env.IFF_TESTNET_IFS
    ? getAddress(process.env.IFF_TESTNET_IFS)
    : null;

if (mainnet) {
  if (getAddress(ifs) !== getAddress(MAINNET_IFS)) throw new Error("主网 IFS 必须是 official.json");
  if (getAddress(hive) !== getAddress(MAINNET_HIVE)) throw new Error("主网 hive 必须是 official.json 的蜂巢");
  if (getAddress(hive) === getAddress(MAINNET_OPS)) throw new Error("hive 不得等于运营钱包");
}

const { provider, url } = await connect();
console.log(`RPC ${url}`);
console.log(`chain ${CHAIN_ID}`);
console.log(`soul ${soul.address}`);
console.log(`journal ${soul.journal}`);
console.log(`ifs ${ifs || "(unset, need IFF_TESTNET_IFS to deploy)"}`);
console.log(`hive ${hive || "(unset)"}`);
console.log(`MiningHub ${artifacts.MiningHub.deployedBytes}B`);
console.log("will not setModule");

if (checkOnly) {
  console.log("检查通过。未发送交易。未绑定模块。未开放挖矿。");
  process.exit(0);
}

if (mainnet) {
  throw new Error("主网 MiningHub 需资金轨道审计 + 显式批准后才开放部署。本次只允许 --check。");
}
if (!ifs) throw new Error("测试网部署需要 IFF_TESTNET_IFS");
if (!hive) throw new Error("测试网部署需要 IFF_TESTNET_HIVE 或清单 hive");

const wallet = new Wallet(readKey(), provider);
const hub = await new ContractFactory(
  artifacts.MiningHub.abi,
  artifacts.MiningHub.bytecode,
  wallet,
).deploy(soul.address, soul.journal, ifs, hive);
const hubTx = hub.deploymentTransaction();
console.log(`hub tx ${hubTx.hash}`);
await hub.waitForDeployment();
const hubAddr = await hub.getAddress();
const receipt = await hubTx.wait();
console.log(`hub ${hubAddr}`);

const out = path.join(root, "public/contract/life/MiningHub.testnet.json");
let previous = null;
if (fs.existsSync(out)) {
  const old = JSON.parse(fs.readFileSync(out, "utf8"));
  if (old.address && old.status !== "STALE" && getAddress(old.address) !== getAddress(hubAddr)) {
    previous = {
      status: "STALE",
      address: getAddress(old.address),
      txHash: old.txHash || null,
      fromBlock: old.fromBlock || 0,
      deployedAt: old.deployedAt || null,
      note: "Superseded testnet satellite. Do not send funds. Soul / Journal unchanged.",
    };
  } else if (old.previous) {
    previous = old.previous;
  }
}
const record = {
  status: "BSC_TESTNET",
  chainId: CHAIN_ID,
  address: hubAddr,
  soul: getAddress(soul.address),
  journal: getAddress(soul.journal),
  ifs,
  hive,
  operator: wallet.address,
  fromBlock: receipt.blockNumber,
  txHash: hubTx.hash,
  explorer: `${EXPLORER}/address/${hubAddr}`,
  deployedAt: new Date().toISOString(),
  previous,
  note: "Independent satellite. Not a Soul module. Do not setModule. Private-track service fee is not mining yield. Testnet mock IFS, not live IFS.",
};
fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
console.log(`wrote ${out}`);
console.log(`gas ${receipt.gasUsed}`);
