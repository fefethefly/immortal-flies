/**
 * One-shot BSC testnet private-track stack:
 * MockIFSTax + MiningHub + mint/approve/register.
 * Does not touch ImmortalSoul. Does not setModule. Does not deploy to 56.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, ContractFactory, JsonRpcProvider, Wallet, getAddress, MaxUint256, parseEther } from "ethers";
import { compileLife } from "./compile-life.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN_ID = 97;
const EXPLORER = "https://testnet.bscscan.com";
const RPCS = [
  process.env.BSC_TESTNET_RPC,
  "https://bsc-testnet.publicnode.com",
  "https://bsc-testnet-rpc.publicnode.com",
].filter(Boolean);

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
      if (Number(network.chainId) !== CHAIN_ID) throw new Error(`RPC 返回 chainId ${network.chainId}`);
      await provider.getBlockNumber();
      return { provider, url };
    } catch (error) {
      last = error;
    }
  }
  throw new Error(`无法连接 RPC：${last?.message || "未知错误"}`);
}

function writeJson(rel, record) {
  const out = path.join(root, rel);
  fs.writeFileSync(out, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${rel}`);
}

function upsertEnvLocal(entries) {
  const file = path.join(root, ".env.local");
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const map = new Map();
  for (const line of existing.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
  }
  for (const [key, value] of Object.entries(entries)) map.set(key, value);
  const body = [...map.entries()].map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  fs.writeFileSync(file, body);
  console.log("wrote .env.local (gitignored)");
}

loadDotEnv();
const artifacts = compileLife({ write: true });
const soulListing = JSON.parse(
  fs.readFileSync(path.join(root, "public/contract/life/ImmortalSoul.testnet.json"), "utf8"),
);
const hive = getAddress(process.env.IFF_TESTNET_HIVE || soulListing.hive);
const { provider, url } = await connect();
const wallet = new Wallet(readKey(), provider);
const from = wallet.address;
const bal = await provider.getBalance(from);
console.log(`RPC ${url}`);
console.log(`chain ${CHAIN_ID}`);
console.log(`deployer ${from}`);
console.log(`tBNB ${bal.toString()}`);
console.log(`soul ${soulListing.address}`);
console.log(`journal ${soulListing.journal}`);
console.log(`hive ${hive}`);
if (bal < parseEther("0.02")) throw new Error("测试网 tBNB 不足 0.02，先领水再部署");

const tax = await new ContractFactory(artifacts.MockIFSTax.abi, artifacts.MockIFSTax.bytecode, wallet).deploy();
const taxTx = tax.deploymentTransaction();
console.log(`ifs tx ${taxTx.hash}`);
await tax.waitForDeployment();
const ifsAddr = await tax.getAddress();
const taxReceipt = await taxTx.wait();
console.log(`ifs ${ifsAddr}`);

const mintAmt = parseEther("1000000");
const mintTx = await tax.mint(from, mintAmt);
await mintTx.wait();
console.log(`minted ${mintAmt} TIFS to deployer`);

const hub = await new ContractFactory(artifacts.MiningHub.abi, artifacts.MiningHub.bytecode, wallet).deploy(
  soulListing.address,
  soulListing.journal,
  ifsAddr,
  hive,
);
const hubTx = hub.deploymentTransaction();
console.log(`hub tx ${hubTx.hash}`);
await hub.waitForDeployment();
const hubAddr = await hub.getAddress();
const hubReceipt = await hubTx.wait();
console.log(`hub ${hubAddr}`);
console.log("will not setModule");

await (await tax.approve(hubAddr, MaxUint256)).wait();
await (await hub.setAllowlisted(from, true)).wait();
const bond = parseEther("100");
await (await hub.registerOperator(1, bond)).wait();
await (await hub.setLimits(10n ** 21n, 10n ** 18n, 5, 60 * 60, 10n ** 17n)).wait();
const op = await hub.operators(from);
console.log(`registered runner bond=${op.bond} status=${op.status}`);

const soul = new Contract(soulListing.address, artifacts.ImmortalSoul.abi, wallet);
let owned = [];
for (let id = 1; id <= 8; id += 1) {
  try {
    const owner = await soul.ownerOf(id);
    if (getAddress(owner) === getAddress(from)) owned.push(id);
  } catch {
    break;
  }
}
console.log(`owned tokens ${owned.join(",") || "(none)"}`);
if (owned.length) {
  const tokenId = owned[0];
  const fee = parseEther("1");
  await (await hub.refuel(tokenId, parseEther("50"))).wait();
  await (await soul.setRunner(tokenId, from)).wait();
  await (await hub.bindRunner(tokenId, from, fee, 1000, parseEther("1000"), 0)).wait();
  const tank = await hub.tanks(tokenId);
  console.log(`fueled token ${tokenId} ownerFuel=${tank.ownerFuel} runner=${tank.runner} fee=${tank.fee}`);
}

writeJson("public/contract/life/MockIFSTax.testnet.json", {
  status: "BSC_TESTNET",
  chainId: CHAIN_ID,
  address: ifsAddr,
  symbol: "TIFS",
  taxBps: 100,
  operator: from,
  fromBlock: taxReceipt.blockNumber,
  txHash: taxTx.hash,
  explorer: `${EXPLORER}/address/${ifsAddr}`,
  deployedAt: new Date().toISOString(),
  note: "Testnet mock with 1% tax. Not live IFS. Not a yield token.",
});
writeJson("public/contract/life/MiningHub.testnet.json", {
  status: "BSC_TESTNET",
  chainId: CHAIN_ID,
  address: hubAddr,
  soul: getAddress(soulListing.address),
  journal: getAddress(soulListing.journal),
  ifs: ifsAddr,
  hive,
  operator: from,
  fromBlock: hubReceipt.blockNumber,
  txHash: hubTx.hash,
  explorer: `${EXPLORER}/address/${hubAddr}`,
  deployedAt: new Date().toISOString(),
  note: "Independent satellite. Not a Soul module. Do not setModule. Private-track service fee is not mining yield. Testnet mock IFS, not live IFS.",
});
upsertEnvLocal({ IFF_TESTNET_IFS: ifsAddr, IFF_TESTNET_HIVE: hive });
console.log("testnet mining stack ready");
