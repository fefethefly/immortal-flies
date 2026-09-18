/**
 * Allowlist + bond + bind an already-deployed testnet MiningHub.
 * Reuses MockIFSTax. Does not touch ImmortalSoul bytecode. Does not setModule.
 *
 *   npm run life:wire:hub:testnet
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Contract,
  JsonRpcProvider,
  MaxUint256,
  Wallet,
  getAddress,
  parseEther,
} from "ethers";
import { compileLife } from "./compile-life.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN_ID = 97;
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
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
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

async function send(tx) {
  const sent = await tx;
  const receipt = await sent.wait();
  if (receipt.status !== 1) throw new Error("tx failed");
  return receipt;
}

loadDotEnv();
if (Number(process.env.IFF_CHAIN_ID || CHAIN_ID) === 56) {
  throw new Error("refuses chainId 56");
}
const listing = JSON.parse(
  fs.readFileSync(path.join(root, "public/contract/life/MiningHub.testnet.json"), "utf8"),
);
if (listing.status === "STALE") throw new Error("listing is STALE");
if (Number(listing.chainId) !== 97) throw new Error("not testnet hub");
const artifacts = compileLife({ write: false });
const { provider, url } = await connect();
const wallet = new Wallet(readKey(), provider);
const from = wallet.address;
const hub = new Contract(listing.address, artifacts.MiningHub.abi, wallet);
const ifs = new Contract(listing.ifs, artifacts.MockIFSTax.abi, wallet);
const soul = new Contract(listing.soul, artifacts.ImmortalSoul.abi, wallet);

console.log(`RPC ${url}`);
console.log(`hub ${listing.address}`);
console.log(`ifs ${listing.ifs}`);
console.log(`runner ${from}`);
console.log("will not setModule");

if (getAddress(await hub.soul()) !== getAddress(listing.soul)) {
  throw new Error("hub soul mismatch");
}
if (getAddress(await hub.ifs()) !== getAddress(listing.ifs)) {
  throw new Error("hub ifs mismatch");
}

const bal = await ifs.balanceOf(from);
if (bal < parseEther("200")) {
  await send(ifs.mint(from, parseEther("1000000")));
  console.log("minted TIFS");
}
if ((await ifs.allowance(from, listing.address)) < parseEther("200")) {
  await send(ifs.approve(listing.address, MaxUint256));
  console.log("approved hub");
}
if (!(await hub.allowlisted(from))) {
  await send(hub.setAllowlisted(from, true));
  console.log("allowlisted");
}
const op = await hub.operators(from);
if (Number(op.status) !== 1) {
  await send(hub.registerOperator(1, parseEther("100")));
  console.log("registered operator");
}
const window = Number(await hub.challengeWindow());
if (window !== 60 * 60) {
  await send(hub.setLimits(10n ** 21n, 10n ** 18n, 5, 60 * 60, 10n ** 17n));
  console.log("challengeWindow=1h");
}

const owned = [];
for (let id = 1; id <= 8; id += 1) {
  try {
    if (getAddress(await soul.ownerOf(id)) === getAddress(from)) owned.push(id);
  } catch {
    break;
  }
}
console.log(`owned tokens ${owned.join(",") || "(none)"}`);
const tokenId = owned[0] || Number(process.env.IFF_RUNNER_TOKENS || 1);
if (!owned.includes(tokenId)) {
  throw new Error(`deployer does not own token ${tokenId}`);
}
const authorized = await soul.authorizedRunner(tokenId);
if (getAddress(authorized) !== getAddress(from)) {
  await send(soul.setRunner(tokenId, from));
  console.log(`soul.setRunner token ${tokenId}`);
}
const tank = await hub.tanks(tokenId);
if (tank.ownerFuel + tank.giftFuel < parseEther("20")) {
  await send(hub.refuel(tokenId, parseEther("50")));
  console.log(`refueled token ${tokenId}`);
}
const fee = parseEther("1");
if (
  !tank.runner ||
  getAddress(tank.runner) !== getAddress(from) ||
  tank.fee !== fee ||
  Number(tank.steps) !== 1000
) {
  await send(hub.bindRunner(tokenId, from, fee, 1000, parseEther("1000"), 0));
  console.log(`bound token ${tokenId} steps=1000`);
}

const next = await hub.tanks(tokenId);
const nextOp = await hub.operators(from);
console.log(
  JSON.stringify(
    {
      ok: true,
      yield: false,
      hub: listing.address,
      tokenId,
      runner: next.runner,
      fee: next.fee.toString(),
      steps: Number(next.steps),
      ownerFuel: next.ownerFuel.toString(),
      bond: nextOp.bond.toString(),
      challengeWindow: Number(await hub.challengeWindow()),
    },
    null,
    2,
  ),
);
