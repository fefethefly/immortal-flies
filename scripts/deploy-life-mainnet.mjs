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
 * Curator stays the deployer. Journal and SoulKinCross are bound. Curator is not renounced.
 * Also deploys SoulMarket against the new Soul. Never deploys ImmortalFly.sol.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AbiCoder, ContractFactory, JsonRpcProvider, Wallet, ZeroAddress, getAddress, keccak256, toUtf8Bytes } from "ethers";
import { compileLife } from "./compile-life.mjs";
import { deployRenderer, deploySoul } from "./life-soul-factory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN_ID = 56;
const EXPLORER = "https://bscscan.com";
const CONFIRM = "--i-am-deploying-bsc-mainnet";
const DECODER = "phenotype-loci/3";
const SITE = "https://immortalflies.com";
const MAINNET_HIVE = "0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467";
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
    throw new Error("创世包解码器必须是 phenotype-loci/3。先跑 npm run life:genesis");
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

function constructorData(genesis, uri, renderer) {
  return AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes32", "bytes32", "string", "address"],
    [genesis.genesisRoot, genesis.speciesHash, genesis.modelHash, uri, renderer],
  );
}

function retireLiveMainnet() {
  const live = path.join(root, "public/contract/life/ImmortalSoul.deployment.json");
  if (!fs.existsSync(live)) return null;
  const data = JSON.parse(fs.readFileSync(live, "utf8"));
  if (Number(data.chainId) !== 56 || data.status !== "LIVE") return null;
  const retired = {
    ...data,
    status: "RETIRED",
    retiredAt: new Date().toISOString(),
    note: "Team-test phenotype-loci/2 collection. Token #1 stays on this address. Not the live identity kernel. Do not treat as the same collection as the /3 Soul.",
  };
  writeJson("public/contract/life/ImmortalSoul.retired.json", retired);
  console.log(`retired previous LIVE ${data.address} → ImmortalSoul.retired.json`);
  return retired;
}

function retireLiveMarket() {
  const live = path.join(root, "public/contract/life/SoulMarket.deployment.json");
  if (!fs.existsSync(live)) return null;
  const data = JSON.parse(fs.readFileSync(live, "utf8"));
  if (Number(data.chainId) !== 56 || data.status !== "LIVE") return null;
  const retired = {
    ...data,
    status: "RETIRED",
    retiredAt: new Date().toISOString(),
    note: "Official book for the retired /2 Soul. Not the live market.",
  };
  writeJson("public/contract/life/SoulMarket.retired.json", retired);
  console.log(`retired previous market ${data.address} → SoulMarket.retired.json`);
  return retired;
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
  rendererAddress,
  journalAddress,
  kinAddress,
  wallet,
  soulTx,
  rendererTx,
  journalTx,
  kinTx,
  soulReceipt,
  genesis,
  uri,
  bindKin,
  bindJournal,
  previous,
}) {
  return {
    status: "LIVE",
    chainId: CHAIN_ID,
    address: soulAddress,
    renderer: rendererAddress,
    journal: journalAddress,
    kin: kinAddress,
    kinKind: "SoulKinCross",
    deployer: wallet.address,
    curator: wallet.address,
    txHash: soulTx.hash,
    rendererTxHash: rendererTx.hash,
    journalTxHash: journalTx.hash,
    kinTxHash: kinTx.hash,
    fromBlock: soulReceipt.blockNumber,
    collection: "ImmortalSoul",
    decoder: DECODER,
    maxPerAddress: 1,
    maxGen0: 1024,
    maxSupply: 1_048_576,
    timelock: 172800,
    royaltyBps: 0,
    breedCooldown: 86400,
    modules: true,
    genesisRoot: genesis.genesisRoot,
    genesisURI: uri,
    previous,
    explorer: `${EXPLORER}/address/${soulAddress}`,
    rendererExplorer: `${EXPLORER}/address/${rendererAddress}`,
    journalExplorer: `${EXPLORER}/address/${journalAddress}`,
    kinExplorer: `${EXPLORER}/address/${kinAddress}`,
    deployedAt: new Date().toISOString(),
    bindTxHash: bindKin.hash,
    journalBindTxHash: bindJournal.hash,
    note: "BSC mainnet identity kernel /3. Curator is the deploy account. SoulKinCross is bound (free, 24h parent cooldown). Renderer is replaceable after 48h challenge. ERC-2981 default 0 cap 5%. Do not deploy ImmortalFly.sol to chain 56. Do not redeploy this collection to iterate.",
  };
}

loadDotEnv();

const confirm = process.argv.includes(CONFIRM);
const checkOnly = process.argv.includes("--check") || !confirm;
const artifacts = compileLife({ write: true });
const { genesis, uri } = loadGenesis();
const encoded = constructorData(genesis, uri, ZeroAddress);
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
console.log(`renderer ${artifacts.SoulRenderer.deployedBytes}B`);
console.log(`Soul constructor is (root, species, model, uri, renderer). Check-only encodes renderer=0x0.`);
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
  throw new Error(`部署账户 BNB 不足 0.01。当前 ${balance} wei`);
}

backupTestnetIfNeeded();
const previous = retireLiveMainnet();

const renderer = await deployRenderer(artifacts, wallet);
const rendererTx = renderer.deploymentTransaction();
const rendererAddress = await renderer.getAddress();
console.log(`renderer tx ${rendererTx.hash}`);
console.log(`renderer ${rendererAddress}`);

const soul = await deploySoul(artifacts, wallet, genesis, uri, rendererAddress);
const soulTx = soul.deploymentTransaction();
console.log(`soul tx ${soulTx.hash}`);
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
if (onChain.decoder !== keccak256(toUtf8Bytes(DECODER))) throw new Error("链上 decoder 不是 phenotype-loci/3");
if (onChain.curator.toLowerCase() !== wallet.address.toLowerCase()) {
  throw new Error("curator 不是部署热钥匙");
}
if (onChain.genesisURI !== uri) throw new Error("链上 genesisURI 不一致");
if ((await soul.renderer()).toLowerCase() !== rendererAddress.toLowerCase()) {
  throw new Error("链上 renderer 不一致");
}
if ((await soul.symbol()) !== "IFSOUL") throw new Error("symbol 不是 IFSOUL");
if ((await soul.maxSupply()) !== 1_048_576n) throw new Error("maxSupply 不是 1048576");
if ((await soul.TIMELOCK()) !== 172800n) throw new Error("TIMELOCK 不是 48h");
if ((await soul.MAX_GEN0()) !== 1024n) throw new Error("MAX_GEN0 不是 1024");
{
  const [recv, amt] = await soul.royaltyInfo(1, 10n ** 18n);
  if (recv !== ZeroAddress || amt !== 0n) throw new Error("ERC-2981 默认必须是 0");
}

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
  artifacts.SoulKinCross.abi,
  artifacts.SoulKinCross.bytecode,
  wallet,
);
const kin = await kinFactory.deploy(soulAddress);
const kinTx = kin.deploymentTransaction();
console.log(`kin tx ${kinTx.hash}`);
await kin.waitForDeployment();
const kinAddress = await kin.getAddress();
const kinReceipt = await kinTx.wait();
if ((await kin.CROSSOVER_RULE()) !== "ifs.descent-cross/1") {
  throw new Error("Kin 不是交叉规则");
}
if ((await kin.breedCooldown()) !== 86400n) throw new Error("亲本冷却不是 24h");

const bindKin = await (await soul.setModule(await soul.MODULE_KIN(), kinAddress)).wait();
const bindJournal = await (await soul.setModule(await soul.MODULE_JOURNAL(), journalAddress)).wait();
if ((await soul.modules(await soul.MODULE_KIN())) !== kinAddress) {
  throw new Error("SoulKinCross 未绑定");
}
if ((await soul.modules(await soul.MODULE_JOURNAL())) !== journalAddress) {
  throw new Error("LifeJournal 未绑定");
}

const record = recordOf({
  soulAddress,
  rendererAddress,
  journalAddress,
  kinAddress,
  wallet,
  soulTx,
  rendererTx,
  journalTx,
  kinTx,
  soulReceipt,
  genesis,
  uri,
  bindKin,
  bindJournal,
  previous: previous?.address || null,
});
const mainnetFile = writeJson("public/contract/life/ImmortalSoul.mainnet.json", record);
const liveFile = writeJson("public/contract/life/ImmortalSoul.deployment.json", record);

retireLiveMarket();
const official = readJson("public/token/official.json");
if (getAddress(official.vault) !== getAddress(MAINNET_HIVE)) {
  throw new Error("official.json 蜂巢金库与主网常量不一致");
}
const marketFactory = new ContractFactory(
  artifacts.SoulMarket.abi,
  artifacts.SoulMarket.bytecode,
  wallet,
);
const market = await marketFactory.deploy(soulAddress, MAINNET_HIVE);
const marketTx = market.deploymentTransaction();
console.log(`market tx ${marketTx.hash}`);
await market.waitForDeployment();
const marketAddr = await market.getAddress();
const marketReceipt = await marketTx.wait();
if ((await market.soul()).toLowerCase() !== soulAddress.toLowerCase()) {
  throw new Error("市场钉的 Soul 不对");
}
if ((await market.hive()).toLowerCase() !== MAINNET_HIVE.toLowerCase()) {
  throw new Error("市场钉的 hive 不对");
}
writeJson("public/contract/life/SoulMarket.deployment.json", {
  status: "LIVE",
  chainId: CHAIN_ID,
  address: marketAddr,
  soul: soulAddress,
  hive: MAINNET_HIVE,
  feeBps: Number(await market.feeBps()),
  operator: wallet.address,
  fromBlock: marketReceipt.blockNumber,
  txHash: marketTx.hash,
  explorer: `${EXPLORER}/address/${marketAddr}`,
  deployedAt: new Date().toISOString(),
  note: "Independent satellite for the /3 Soul. Not a Soul module. Do not setModule. Not OpenSea. 2% hive fee is not a buyback.",
});

console.log(`soul ${soulAddress}`);
console.log(`renderer ${rendererAddress}`);
console.log(`journal ${journalAddress}`);
console.log(`kin ${kinAddress} (SoulKinCross)`);
console.log(`market ${marketAddr}`);
console.log(`curator ${wallet.address} （热钥匙，未交出）`);
console.log(
  `gas soul ${soulReceipt.gasUsed} journal ${journalReceipt.gasUsed} kin ${kinReceipt.gasUsed} market ${marketReceipt.gasUsed}`,
);
console.log(`wrote ${mainnetFile}`);
console.log(`promoted ${liveFile}`);
console.log("下一步：BscScan / Sourcify 开源验证 → 用另一只钱包孵 1 只 → 再推生产网站。不要部署 ImmortalFly.sol。");
