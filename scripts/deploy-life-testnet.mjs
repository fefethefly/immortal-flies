import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { compileLife } from "./compile-life.mjs";
import { deployRenderer, deploySoul } from "./life-soul-factory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const CHAIN_ID = 97;
const EXPLORER = "https://testnet.bscscan.com";
const RPCS = [
  process.env.BSC_TESTNET_RPC,
  "https://bsc-testnet.publicnode.com",
  "https://bsc-testnet-rpc.publicnode.com",
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
].filter(Boolean);

function readKey() {
  let key = (process.env.IFF_DEPLOY_KEY || "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "缺少 IFF_DEPLOY_KEY。可放在项目 .env 或 ~/.env，不要提交。账户需要有 tBNB。",
    );
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
  throw new Error(`无法连接 BSC 测试网：${last?.message || "未知错误"}`);
}

const checkOnly = process.argv.includes("--check");
const artifacts = compileLife({ write: true });
const genesis = JSON.parse(
  fs.readFileSync(path.join(root, "public/life-genesis/current.json"), "utf8"),
);
const { provider, url } = await connect();
const block = await provider.getBlockNumber();
console.log(`RPC ${url}`);
console.log(`chain ${CHAIN_ID} · block ${block}`);
console.log(
  `genesis ${genesis.genesisRoot.slice(0, 12)}… · soul ${artifacts.ImmortalSoul.deployedBytes}B · renderer ${artifacts.SoulRenderer.deployedBytes}B`,
);

if (checkOnly) {
  console.log("检查通过。未发送交易。");
  process.exit(0);
}

const wallet = new Wallet(readKey(), provider);
const balance = await provider.getBalance(wallet.address);
console.log(`deployer ${wallet.address}`);
console.log(`balance  ${balance} wei`);
if (balance === 0n) throw new Error("部署账户 tBNB 为 0。请先领取测试币。");

const renderer = await deployRenderer(artifacts, wallet);
const rendererTx = renderer.deploymentTransaction();
const rendererAddress = await renderer.getAddress();
console.log(`renderer tx ${rendererTx.hash}`);

const soul = await deploySoul(
  artifacts,
  wallet,
  genesis,
  `https://immortalflies.com${genesis.manifestPath}`,
  rendererAddress,
);
const soulTx = soul.deploymentTransaction();
console.log(`soul tx ${soulTx.hash}`);
const soulAddress = await soul.getAddress();
const soulReceipt = await soulTx.wait();

const journalFactory = new ContractFactory(
  artifacts.LifeJournal.abi,
  artifacts.LifeJournal.bytecode,
  wallet,
);
const journal = await journalFactory.deploy(soulAddress);
const journalTx = journal.deploymentTransaction();
console.log(`journal tx ${journalTx.hash}`);
await journal.waitForDeployment();
const journalAddress = await journal.getAddress();
    const journalReceipt = await journalTx.wait();

const official = JSON.parse(
  fs.readFileSync(path.join(root, "public/token/official.json"), "utf8"),
);
const ifs = getAddress(official.address);
const hive = process.env.IFF_TESTNET_HIVE
  ? getAddress(process.env.IFF_TESTNET_HIVE)
  : wallet.address;
const kinFactory = new ContractFactory(
  artifacts.SoulKinFee.abi,
  artifacts.SoulKinFee.bytecode,
  wallet,
);
const kin = await kinFactory.deploy(soulAddress, ifs, hive);
const kinTx = kin.deploymentTransaction();
console.log(`kin tx ${kinTx.hash}`);
await kin.waitForDeployment();
const kinAddress = await kin.getAddress();
const kinReceipt = await kinTx.wait();

const moduleKin = await soul.MODULE_KIN();
const moduleJournal = await soul.MODULE_JOURNAL();
const bindKin = await (await soul.setModule(moduleKin, kinAddress)).wait();
const bindJournal = await (await soul.setModule(moduleJournal, journalAddress)).wait();

const record = {
  status: "BSC_TESTNET",
  chainId: CHAIN_ID,
  address: soulAddress,
  renderer: rendererAddress,
  journal: journalAddress,
  kin: kinAddress,
  deployer: wallet.address,
  txHash: soulTx.hash,
  rendererTxHash: rendererTx.hash,
  journalTxHash: journalTx.hash,
  kinTxHash: kinTx.hash,
  fromBlock: soulReceipt.blockNumber,
  collection: "ImmortalSoul",
  decoder: "phenotype-loci/3",
  maxPerAddress: 1,
  maxGen0: 1024,
  modules: true,
  genesisRoot: genesis.genesisRoot,
  explorer: `${EXPLORER}/address/${soulAddress}`,
  journalExplorer: `${EXPLORER}/address/${journalAddress}`,
  kinExplorer: `${EXPLORER}/address/${kinAddress}`,
  deployedAt: new Date().toISOString(),
  kinKind: "SoulKinFee",
  ifs,
  hive,
  note: "Testnet identity only. Not mainnet. Soul is the identity kernel; names live on Soul; pedigree rules live on SoulKinFee (price 0, adapter unset). Do not deploy ImmortalFly.sol to chain 56. Do not redeploy ImmortalSoul on mainnet.",
  bindTxHash: bindKin.hash,
  journalBindTxHash: bindJournal.hash,
};
const file = path.join(root, "public/contract/life/ImmortalSoul.testnet.json");
fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
    console.log(`soul ${soulAddress}`);
console.log(`journal ${journalAddress}`);
console.log(`kin ${kinAddress}`);
console.log(
  `gas soul ${soulReceipt.gasUsed} journal ${journalReceipt.gasUsed} kin ${kinReceipt.gasUsed}`,
);
console.log(`wrote ${file}`);
