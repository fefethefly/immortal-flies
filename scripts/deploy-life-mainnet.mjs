/**
 * BSC mainnet ImmortalSoul deploy. Never deploys ImmortalFly.sol.
 *
 * Check only:
 *   npm run life:check:mainnet
 *
 * Broadcast (explicit):
 *   npm run life:deploy:mainnet -- --i-am-deploying-bsc-mainnet
 *
 * Key: IFS_MAINNET_DEPLOY_KEY, or IFF_DEPLOY_KEY if that is the hot key.
 * Curator stays the deployer. Journal and SoulKin are bound. Curator is not renounced.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AbiCoder, ContractFactory, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { compileLife } from "./compile-life.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN_ID = 56;
const EXPLORER = "https://bscscan.com";
const CONFIRM = "--i-am-deploying-bsc-mainnet";
const DECODER = "phenotype-loci/2";
const SITE = "https://immortalflies.com";
const MIN_WEI = 10_000_000_000_000_000n;
const RPCS = [
  process.env.BSC_MAINNET_RPC,
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed.binance.org",
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
  let key = (process.env.IFS_MAINNET_DEPLOY_KEY || process.env.IFF_DEPLOY_KEY || "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "缺少 IFS_MAINNET_DEPLOY_KEY 或 IFF_DEPLOY_KEY。可放在 ~/.env，不要提交。账户需要有主网 BNB。",
    );
  }
  return key;
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function writeJson(relative, data) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function loadGenesis() {
  const genesis = readJson("public/life-genesis/current.json");
  const manifest = readJson(`public/life-genesis/${genesis.genesisRoot.slice(2)}/manifest.json`);
  if (manifest.decoder !== DECODER || genesis.decoder !== DECODER) {
    throw new Error("创世包解码器必须是 phenotype-loci/2。先跑 npm run life:genesis");
  }
  if (genesis.genesisRoot === "0xe45cb0c66f29a3229fa9d8c20b805b0c6a1dd1b3023f0bbb26a7238f4efee091") {
    throw new Error("创世根仍是测试网旧包（decoder /1）。先跑 npm run life:genesis");
  }
  if (!genesis.genesisRoot || !genesis.speciesHash || !genesis.modelHash || !genesis.manifestPath) {
    throw new Error("创世包缺构造参数");
  }
  return { genesis, manifest, uri: `${SITE}${genesis.manifestPath}` };
}

async function connect() {
  let last;
  for (const url of RPCS) {
    try {
      const provider = new JsonRpcProvider(url, CHAIN_ID, { staticNetwork: true });
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== CHAIN_ID) {
        throw new Error(`RPC 返回 chainId ${network.chainId}，拒绝继续`);
      }
      await provider.getBlockNumber();
      return { provider, url };
    } catch (error) {
      last = error;
    }
  }
  throw new Error(`无法连接 BSC 主网：${last?.message || "未知错误"}`);
}

function constructorData(genesis, uri) {
  return AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "bytes32", "string"],
    [genesis.genesisRoot, genesis.speciesHash, genesis.modelHash, uri],
  );
}

function backupTestnetIfNeeded() {
  const live = path.join(root, "public/contract/life/ImmortalSoul.deployment.json");
  const testnetFile = path.join(root, "public/contract/life/ImmortalSoul.testnet.json");
  if (!fs.existsSync(live)) return;
  const data = JSON.parse(fs.readFileSync(live, "utf8"));
  if (data.chainId === 97 && data.status === "BSC_TESTNET" && !fs.existsSync(testnetFile)) {
    fs.copyFileSync(live, testnetFile);
    console.log(`backed up testnet list → ${testnetFile}`);
  }
}

function recordOf({
  soulAddress,
  journalAddress,
  kinAddress,
  wallet,
  soulTx,
  journalTx,
  kinTx,
  soulReceipt,
  genesis,
  uri,
  bindKin,
  bindJournal,
}) {
  return {
    status: "LIVE",
    chainId: CHAIN_ID,
    address: soulAddress,
    journal: journalAddress,
    kin: kinAddress,
    deployer: wallet.address,
    curator: wallet.address,
    txHash: soulTx.hash,
    journalTxHash: journalTx.hash,
    kinTxHash: kinTx.hash,
    fromBlock: soulReceipt.blockNumber,
    collection: "ImmortalSoul",
    decoder: DECODER,
    maxPerAddress: 1,
    maxGen0: 1024,
    modules: true,
    genesisRoot: genesis.genesisRoot,
    genesisURI: uri,
    explorer: `${EXPLORER}/address/${soulAddress}`,
    journalExplorer: `${EXPLORER}/address/${journalAddress}`,
    kinExplorer: `${EXPLORER}/address/${kinAddress}`,
    deployedAt: new Date().toISOString(),
    bindTxHash: bindKin.hash,
    journalBindTxHash: bindJournal.hash,
    note: "BSC mainnet identity kernel. Curator is the hot deploy key; Journal and SoulKin are bound. Do not deploy ImmortalFly.sol to chain 56. Do not redeploy ImmortalSoul to iterate.",
  };
}

loadDotEnv();

const confirm = process.argv.includes(CONFIRM);
const checkOnly = process.argv.includes("--check") || !confirm;
const artifacts = compileLife({ write: true });
const { genesis, uri } = loadGenesis();
const encoded = constructorData(genesis, uri);
const { provider, url } = await connect();
const block = await provider.getBlockNumber();

console.log(`RPC ${url}`);
console.log(`chain ${CHAIN_ID} · block ${block}`);
console.log(`decoder ${DECODER}`);
console.log(`genesis ${genesis.genesisRoot}`);
console.log(`species ${genesis.speciesHash}`);
console.log(`model   ${genesis.modelHash}`);
console.log(`uri     ${uri}`);
console.log(`soul    ${artifacts.ImmortalSoul.deployedBytes}B`);
console.log(`BscScan constructor args (ABI-encoded, strip 0x when pasting):`);
console.log(encoded);
console.log(`standard JSON input: artifacts/life/standard-input.json`);
console.log(`compiler solc 0.8.30 · optimizer 200 · viaIR · evm paris`);

if (checkOnly) {
  if (!confirm) {
    console.log("检查通过。未发送交易。");
    console.log("真正部署：npm run life:deploy:mainnet -- --i-am-deploying-bsc-mainnet");
  } else {
    console.log("带了确认旗标但仍是 --check，未发送交易。");
  }
  process.exit(0);
}

const wallet = new Wallet(readKey(), provider);
const balance = await provider.getBalance(wallet.address);
console.log(`deployer ${wallet.address}`);
console.log(`balance  ${balance} wei`);
if (balance === 0n) throw new Error("部署账户 BNB 为 0。");
if (balance < MIN_WEI) {
  throw new Error(`部署账户 BNB 不足 0.03。当前 ${balance} wei`);
}

backupTestnetIfNeeded();

const soulFactory = new ContractFactory(
  artifacts.ImmortalSoul.abi,
  artifacts.ImmortalSoul.bytecode,
  wallet,
);
const soul = await soulFactory.deploy(
  genesis.genesisRoot,
  genesis.speciesHash,
  genesis.modelHash,
  uri,
);
const soulTx = soul.deploymentTransaction();
console.log(`soul tx ${soulTx.hash}`);
await soul.waitForDeployment();
const soulAddress = await soul.getAddress();
const soulReceipt = await soulTx.wait();

const onChain = {
  chainId: Number(await soul.birthChainId()),
  genesisRoot: await soul.genesisRoot(),
  speciesHash: await soul.speciesHash(),
  modelHash: await soul.modelHash(),
  decoder: await soul.DECODER_HASH(),
  curator: await soul.curator(),
  genesisURI: await soul.genesisURI(),
};
if (onChain.chainId !== CHAIN_ID) throw new Error(`链上 birthChainId=${onChain.chainId}`);
if (onChain.genesisRoot !== genesis.genesisRoot) throw new Error("链上 genesisRoot 不一致");
if (onChain.speciesHash !== genesis.speciesHash) throw new Error("链上 speciesHash 不一致");
if (onChain.modelHash !== genesis.modelHash) throw new Error("链上 modelHash 不一致");
if (onChain.decoder !== keccak256(toUtf8Bytes(DECODER))) throw new Error("链上 decoder 不是 phenotype-loci/2");
if (onChain.curator.toLowerCase() !== wallet.address.toLowerCase()) {
  throw new Error("curator 不是部署热钥匙");
}
if (onChain.genesisURI !== uri) throw new Error("链上 genesisURI 不一致");

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

const kinFactory = new ContractFactory(
  artifacts.SoulKin.abi,
  artifacts.SoulKin.bytecode,
  wallet,
);
const kin = await kinFactory.deploy(soulAddress);
const kinTx = kin.deploymentTransaction();
console.log(`kin tx ${kinTx.hash}`);
await kin.waitForDeployment();
const kinAddress = await kin.getAddress();
const kinReceipt = await kinTx.wait();

const bindKin = await (await soul.setModule(await soul.MODULE_KIN(), kinAddress)).wait();
const bindJournal = await (await soul.setModule(await soul.MODULE_JOURNAL(), journalAddress)).wait();
if ((await soul.modules(await soul.MODULE_KIN())) !== kinAddress) {
  throw new Error("SoulKin 未绑定");
}
if ((await soul.modules(await soul.MODULE_JOURNAL())) !== journalAddress) {
  throw new Error("LifeJournal 未绑定");
}

const record = recordOf({
  soulAddress,
  journalAddress,
  kinAddress,
  wallet,
  soulTx,
  journalTx,
  kinTx,
  soulReceipt,
  genesis,
  uri,
  bindKin,
  bindJournal,
});
const mainnetFile = writeJson("public/contract/life/ImmortalSoul.mainnet.json", record);
const liveFile = writeJson("public/contract/life/ImmortalSoul.deployment.json", record);
console.log(`soul ${soulAddress}`);
console.log(`journal ${journalAddress}`);
console.log(`kin ${kinAddress}`);
console.log(`curator ${wallet.address} （热钥匙，未交出）`);
console.log(
  `gas soul ${soulReceipt.gasUsed} journal ${journalReceipt.gasUsed} kin ${kinReceipt.gasUsed}`,
);
console.log(`wrote ${mainnetFile}`);
console.log(`promoted ${liveFile}`);
console.log("下一步：BscScan 开源验证 → 用另一只钱包孵 1 只 → 再推生产网站。不要部署 ImmortalFly.sol。");
