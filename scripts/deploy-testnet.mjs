import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";
import { compileContracts } from "./compile-contracts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;
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
    )
      value = value.slice(1, -1);
    if (process.env[key] == null) process.env[key] = value;
  }
}

loadDotEnv();

const CHAIN_ID = 97;
const EXPLORER = "https://testnet.bscscan.com";
const RPCS = [
  process.env.BSC_TESTNET_RPC,
  "https://bsc-testnet-rpc.publicnode.com",
  "https://bsc-testnet.public.blastapi.io",
].filter(Boolean);

function readKey() {
  const key = (process.env.IFF_DEPLOY_KEY || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "缺少 IFF_DEPLOY_KEY。在环境变量中放入带 0x 的测试网私钥，不要提交到 git。账户需要有 tBNB 付 gas。",
    );
  }
  return key;
}

async function connect() {
  let last;
  for (const url of RPCS) {
    try {
      const provider = new JsonRpcProvider(url, CHAIN_ID, {
        staticNetwork: true,
      });
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== CHAIN_ID)
        throw new Error(`RPC 返回 chainId ${network.chainId}`);
      await provider.getBlockNumber();
      return { provider, url };
    } catch (error) {
      last = error;
    }
  }
  throw new Error(`无法连接 BSC 测试网：${last?.message || "未知错误"}`);
}

function writeDeployment(record) {
  const file = path.join(root, "public/contract/ImmortalFly.deployment.json");
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  return file;
}

const checkOnly = process.argv.includes("--check");
const { artifact } = compileContracts();
const { provider, url } = await connect();
const block = await provider.getBlockNumber();
console.log(`RPC ${url}`);
console.log(`chain ${CHAIN_ID} · block ${block} · compiled ${artifact.model}`);

if (checkOnly) {
  console.log(
    "检查通过。未发送交易。设置 IFF_DEPLOY_KEY 后去掉 --check 即可部署。",
  );
  process.exit(0);
}

const wallet = new Wallet(readKey(), provider);
const balance = await provider.getBalance(wallet.address);
console.log(`deployer ${wallet.address}`);
console.log(`balance  ${balance} wei`);
if (balance === 0n)
  throw new Error("部署账户 tBNB 为 0。请先在 BSC 测试网领取测试币。");

const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy();
const deployTx = contract.deploymentTransaction();
console.log(`tx ${deployTx.hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();
const receipt = await deployTx.wait();
const model = await contract.MODEL();
if (model !== "iff-neural-16-v1") throw new Error(`部署后模型不符：${model}`);

const record = {
  status: "BSC_TESTNET",
  chainId: CHAIN_ID,
  address,
  deployer: wallet.address,
  txHash: deployTx.hash,
  fromBlock: receipt.blockNumber,
  model,
  explorer: `${EXPLORER}/address/${address}`,
  deployedAt: new Date().toISOString(),
};
const file = writeDeployment(record);
console.log(`address ${address}`);
console.log(`gas ${receipt.gasUsed}`);
console.log(`wrote ${file}`);
console.log(`explorer ${record.explorer}`);
