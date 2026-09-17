/**
 * Deploy SoulKinFee against an already-live ImmortalSoul.
 *
 * Testnet:
 *   npm run life:check:kin-fee
 *   IFF_DEPLOY_KEY=0x… npm run life:deploy:kin-fee:testnet
 *   IFF_DEPLOY_KEY=0x… npm run life:deploy:kin-fee:testnet -- --bind
 *
 * Mainnet deploy of the satellite only (does not touch Soul):
 *   npm run life:check:kin-fee -- --mainnet
 *   IFF_DEPLOY_KEY=0x… npm run life:deploy:kin-fee:testnet -- --mainnet
 *
 * Binding mainnet MODULE_KIN requires pendingCount == 0 and:
 *   --i-am-replacing-mainnet-kin --bind
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { compileLife } from "./compile-life.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAINNET_BIND = "--i-am-replacing-mainnet-kin";

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
const bind = process.argv.includes("--bind");
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
const listing = path.join(
  root,
  mainnet
    ? "public/contract/life/ImmortalSoul.deployment.json"
    : "public/contract/life/ImmortalSoul.testnet.json",
);
const fallback = path.join(root, "public/contract/life/ImmortalSoul.deployment.json");
const deployment = JSON.parse(
  fs.readFileSync(fs.existsSync(listing) ? listing : fallback, "utf8"),
);
if (!deployment.address) throw new Error("部署清单没有 Soul 地址");
if (mainnet && Number(deployment.chainId) !== 56) {
  throw new Error("主网替换必须读 chainId 56 的清单");
}

const ifs = getAddress(official.address);
const hive = mainnet
  ? getAddress(official.vault)
  : process.env.IFF_TESTNET_HIVE
    ? getAddress(process.env.IFF_TESTNET_HIVE)
    : null;

const { provider, url } = await connect();
console.log(`RPC ${url}`);
console.log(`chain ${CHAIN_ID}`);
console.log(`soul ${deployment.address}`);
console.log(`ifs ${ifs}`);
console.log(`SoulKinFee ${artifacts.SoulKinFee.deployedBytes}B`);

if (checkOnly) {
  console.log("检查通过。未发送交易。未绑定模块。");
  process.exit(0);
}

if (mainnet && bind && !process.argv.includes(MAINNET_BIND)) {
  throw new Error(`主网绑定 MODULE_KIN 必须带 ${MAINNET_BIND}`);
}

const wallet = new Wallet(readKey(), provider);
const hiveAddr = hive || wallet.address;
const soul = new Contract(
  deployment.address,
  artifacts.ImmortalSoul.abi,
  wallet,
);
if (bind) {
  const oldKin = new Contract(
    deployment.kin,
    artifacts.SoulKin.abi,
    provider,
  );
  const pending = await oldKin.pendingCount().catch(() => null);
  if (pending != null && pending !== 0n) {
    throw new Error(`旧 Kin pendingCount=${pending}，先完成或过期再绑定`);
  }
}

const fee = await new ContractFactory(
  artifacts.SoulKinFee.abi,
  artifacts.SoulKinFee.bytecode,
  wallet,
).deploy(deployment.address, ifs, hiveAddr);
const feeTx = fee.deploymentTransaction();
console.log(`fee kin tx ${feeTx.hash}`);
await fee.waitForDeployment();
const feeAddr = await fee.getAddress();
const feeReceipt = await feeTx.wait();
console.log(`fee kin ${feeAddr}`);
console.log(`hive ${hiveAddr}`);

let bindTxHash = null;
if (bind) {
  const moduleKin = await soul.MODULE_KIN();
  const bindTx = await (await soul.setModule(moduleKin, feeAddr)).wait();
  bindTxHash = bindTx.hash;
  console.log(`bound MODULE_KIN ${bindTx.hash}`);
} else {
  console.log("未绑定。现网繁衍模块未改。");
}

const record = {
  ...deployment,
  previousKin: deployment.kin,
  kin: bind ? feeAddr : deployment.kin,
  kinFee: feeAddr,
  kinKind: bind ? "SoulKinFee" : deployment.kinKind || "SoulKin",
  ifs,
  hive: hiveAddr,
  kinFeeTxHash: feeTx.hash,
  kinFeeExplorer: `${EXPLORER}/address/${feeAddr}`,
  kinExplorer: bind ? `${EXPLORER}/address/${feeAddr}` : deployment.kinExplorer,
  previousKinExplorer: deployment.kinExplorer,
  kinFeeDeployedAt: new Date().toISOString(),
  bindTxHash: bindTxHash || deployment.bindTxHash,
  note: bind
    ? "SoulKinFee is MODULE_KIN. Price starts at 0, adapter unset. Not a burn. Do not redeploy ImmortalSoul."
    : "SoulKinFee deployed but not bound. Current kin is unchanged.",
};
const out = fs.existsSync(listing) ? listing : fallback;
if (mainnet && !bind) {
  const satellite = path.join(root, "public/contract/life/SoulKinFee.deployment.json");
  fs.writeFileSync(satellite, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${satellite} (Soul 清单未改)`);
} else {
  fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${out}`);
}
console.log(`gas ${feeReceipt.gasUsed}`);
