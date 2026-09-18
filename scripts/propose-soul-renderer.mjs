/**
 * Replace SoulRenderer on the LIVE BSC ImmortalSoul. Never redeploys Soul.
 *
 * Check:
 *   npm run life:check:renderer
 *
 * Propose (48h challenge window):
 *   npm run life:propose:renderer:mainnet -- --i-am-proposing-bsc-mainnet-renderer
 *
 * Activate after eta:
 *   npm run life:activate:renderer:mainnet -- --i-am-activating-bsc-mainnet-renderer
 *
 * Key: IFS_MAINNET_DEPLOY_KEY or IFF_DEPLOY_KEY. Must be the live curator.
 * Deploy the website SVG route before activate, or wallets cache a broken image.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getAddress,
  hexlify,
} from "ethers";
import { compileLife } from "./compile-life.mjs";
import { deployRenderer } from "./life-soul-factory.mjs";
import {
  soulTokenImageUrl,
  soulTokenSvg,
} from "../src/life/soul-token-svg.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAIN_ID = 56;
const EXPLORER = "https://bscscan.com";
const DECODER = "phenotype-loci/3";
const SITE = "https://immortalflies.com";
const PROPOSE = "--i-am-proposing-bsc-mainnet-renderer";
const ACTIVATE = "--i-am-activating-bsc-mainnet-renderer";
const MIN_WEI = 10_000_000_000_000_000n;
const LOCI_SEEDS = [1, 43, 2476182759, 541271453, 0xffffffff];
const LISTINGS = [
  "public/contract/life/ImmortalSoul.mainnet.json",
  "public/contract/life/ImmortalSoul.deployment.json",
];
const RPCS = [
  process.env.BSC_MAINNET_RPC,
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed.binance.org",
  "https://bsc.publicnode.com",
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
  let key = (
    process.env.IFS_MAINNET_DEPLOY_KEY ||
    process.env.IFF_DEPLOY_KEY ||
    ""
  ).trim();
  if (/^[0-9a-fA-F]{64}$/.test(key)) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "缺少 IFS_MAINNET_DEPLOY_KEY 或 IFF_DEPLOY_KEY。可放在 ~/.env，不要提交。必须是 LIVE curator。",
    );
  }
  return key;
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function writeJson(relative, data) {
  const file = path.join(root, relative);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function listingOf() {
  const mainnet = readJson("public/contract/life/ImmortalSoul.mainnet.json");
  const live = readJson("public/contract/life/ImmortalSoul.deployment.json");
  if (mainnet.status !== "LIVE" || Number(mainnet.chainId) !== CHAIN_ID) {
    throw new Error("ImmortalSoul.mainnet.json 不是 BSC 主网 LIVE");
  }
  if (getAddress(live.address) !== getAddress(mainnet.address)) {
    throw new Error("deployment.json 与 mainnet.json 不是同一只 Soul");
  }
  if (live.status !== "LIVE")
    throw new Error("ImmortalSoul.deployment.json 不是 LIVE");
  if (mainnet.decoder !== DECODER) throw new Error(`decoder 必须是 ${DECODER}`);
  return mainnet;
}

function decodeTokenUri(uri) {
  if (!uri.startsWith("data:application/json;base64,")) {
    throw new Error(`tokenURI 不是 on-chain JSON：${uri.slice(0, 48)}`);
  }
  return JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
}

function svgFromData(imageData) {
  if (!String(imageData).startsWith("data:image/svg+xml;base64,")) {
    throw new Error("image_data 不是 SVG data URI");
  }
  return Buffer.from(imageData.split(",")[1], "base64").toString();
}

async function connect() {
  let last;
  for (const url of RPCS) {
    try {
      const provider = new JsonRpcProvider(url, CHAIN_ID, {
        staticNetwork: true,
      });
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
  throw new Error(`无法连接 BSC 主网：${last?.message || "未知错误"}`);
}

async function probeSiteImage(id, seed, generation) {
  const href = soulTokenImageUrl(id, seed, generation);
  try {
    const response = await fetch(href, { method: "GET" });
    const type = response.headers.get("content-type") || "";
    const body = await response.text();
    return {
      href,
      status: response.status,
      type,
      ok: response.ok && type.includes("image/svg") && body.includes("<svg"),
    };
  } catch (error) {
    return { href, status: 0, type: "", ok: false, error: error.message };
  }
}

function rendererContract(address, artifacts, runner) {
  return new Contract(address, artifacts.SoulRenderer.abi, runner);
}

async function assertLociMatch(current, next) {
  for (const seed of LOCI_SEEDS) {
    const a = hexlify(await current.loci(seed));
    const b = hexlify(await next.loci(seed));
    if (a !== b) throw new Error(`loci(${seed}) 前缀不一致：旧 ${a} 新 ${b}`);
    if ((await next.loci(seed)).length < (await current.loci(seed)).length) {
      throw new Error(`loci(${seed}) 变短，激活会被 RendererMismatch 挡住`);
    }
  }
}

async function assertWalletImage(next, soul, id) {
  const genome = await soul.getGenome(id);
  const descent = await soul.getDescent(id);
  const uri = await next.tokenURI(await soul.getAddress(), id);
  const meta = decodeTokenUri(uri);
  const want = soulTokenImageUrl(
    id,
    Number(genome.seed),
    Number(descent.generation),
  );
  if (meta.image !== want)
    throw new Error(`#${id} image 不是钱包 HTTPS：${meta.image}`);
  const svg = svgFromData(meta.image_data);
  const expected = soulTokenSvg({
    id,
    seed: Number(genome.seed),
    generation: Number(descent.generation),
  });
  if (svg !== expected) throw new Error(`#${id} image_data 与 JS 卡面不一致`);
  if (!svg.includes('width="400"') || !svg.includes('height="440"')) {
    throw new Error(`#${id} SVG 缺宽高`);
  }
  if (meta.decoder !== DECODER)
    throw new Error(`#${id} decoder 不是 ${DECODER}`);
  return { id, image: meta.image, name: meta.name };
}

loadDotEnv();

const propose = process.argv.includes(PROPOSE);
const activate = process.argv.includes(ACTIVATE);
const checkOnly = process.argv.includes("--check") || (!propose && !activate);
if (propose && activate) throw new Error("不要同时带 propose 和 activate 旗标");

const artifacts = compileLife({ write: true });
const listing = listingOf();
const { provider, url } = await connect();
const soul = new Contract(
  listing.address,
  artifacts.ImmortalSoul.abi,
  provider,
);
const currentRenderer = rendererContract(
  await soul.renderer(),
  artifacts,
  provider,
);
const supply = Number(await soul.totalSupply());
const pending = await soul.pendingRenderer();
const locked = await soul.rendererLocked();
const curator = await soul.curator();
const sample = supply >= 1 ? decodeTokenUri(await soul.tokenURI(1)) : null;
const site =
  supply >= 1
    ? await probeSiteImage(
        1,
        Number((await soul.getGenome(1)).seed),
        Number((await soul.getDescent(1)).generation),
      )
    : null;

console.log(`RPC ${url}`);
console.log(`soul ${listing.address}`);
console.log(`curator ${curator}`);
console.log(`renderer ${await soul.renderer()}`);
console.log(`locked ${locked}`);
console.log(`supply ${supply}`);
console.log(`pending ${pending.next} eta ${pending.eta}`);
console.log(
  `decoder ${await currentRenderer.decoderId()} v${await currentRenderer.version()}`,
);
if (sample) {
  console.log(`#1 image ${String(sample.image).slice(0, 88)}`);
}
if (site) {
  console.log(
    `site ${site.status} ${site.type || site.error || ""} ${site.href}`,
  );
}
console.log(`new renderer bytecode ${artifacts.SoulRenderer.deployedBytes}B`);

if (Number(await soul.birthChainId()) !== CHAIN_ID)
  throw new Error("birthChainId 不是 56");
if (
  getAddress(await soul.renderer()) !== getAddress(listing.renderer) &&
  !listing.pendingRenderer
) {
  throw new Error("清单 renderer 与链上不一致");
}
if ((await currentRenderer.decoderId()) !== DECODER)
  throw new Error("当前渲染器 decoder 已不是 /3");
if (locked) throw new Error("rendererLocked，不能再换");

if (checkOnly) {
  if (sample?.image?.startsWith("data:image/svg+xml")) {
    console.log(
      "当前钱包 image 仍是嵌套 SVG data URI。提案后 48h 才能切到 HTTPS。",
    );
  }
  if (site && !site.ok) {
    console.log(
      "警告：生产站还没返回 SVG。激活前必须先部署网站，否则钱包会缓存裂图。",
    );
  }
  console.log("检查通过。未发送交易。未重部 ImmortalSoul。");
  console.log(`提案：npm run life:propose:renderer:mainnet -- ${PROPOSE}`);
  console.log(`激活：npm run life:activate:renderer:mainnet -- ${ACTIVATE}`);
  process.exit(0);
}

const wallet = new Wallet(readKey(), provider);
if (getAddress(wallet.address) !== getAddress(curator)) {
  throw new Error(`热钥匙 ${wallet.address} 不是 curator ${curator}`);
}
const balance = await provider.getBalance(wallet.address);
console.log(`signer ${wallet.address}`);
console.log(`balance ${balance} wei`);
if (balance < MIN_WEI) throw new Error("部署账户 BNB 不足 0.01");

const connectedSoul = soul.connect(wallet);

if (activate) {
  if (pending.next === ZeroAddress || pending.eta === 0n) {
    throw new Error("没有 pendingRenderer。先提案。");
  }
  const now = BigInt((await provider.getBlock("latest")).timestamp);
  if (now < pending.eta) {
    throw new Error(`时锁未到。eta ${pending.eta} 现在 ${now}`);
  }
  if (site && !site.ok) {
    throw new Error(`生产 SVG 还不可用（${site.status}）。先部署网站再激活。`);
  }
  const next = rendererContract(pending.next, artifacts, provider);
  if ((await next.decoderId()) !== DECODER)
    throw new Error("pending 渲染器 decoder 不是 /3");
  await assertLociMatch(currentRenderer, next);
  if (supply >= 1) await assertWalletImage(next, soul, 1);
  if (supply >= 2) await assertWalletImage(next, soul, 2);
  const tx = await connectedSoul.activateRenderer();
  console.log(`activate tx ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("activateRenderer 失败");
  if (getAddress(await soul.renderer()) !== getAddress(pending.next)) {
    throw new Error("激活后 renderer 未切换");
  }
  const record = {
    ...listing,
    previousRenderer: listing.renderer,
    renderer: pending.next,
    rendererExplorer: `${EXPLORER}/address/${pending.next}`,
    rendererActivatedTxHash: tx.hash,
    rendererActivatedAt: new Date().toISOString(),
    pendingRenderer: undefined,
    pendingRendererEta: undefined,
    pendingRendererTxHash: undefined,
    rendererProposedAt: undefined,
    note: `${listing.note} Wallet image is HTTPS SVG; on-chain SVG remains in image_data.`,
  };
  for (const file of LISTINGS) writeJson(file, record);
  console.log(`renderer ${pending.next}`);
  console.log(`explorer ${EXPLORER}/tx/${tx.hash}`);
  console.log("已激活。不要重部 ImmortalSoul。");
  process.exit(0);
}

if (pending.next !== ZeroAddress && pending.eta !== 0n) {
  throw new Error(
    `已有 pendingRenderer ${pending.next} eta ${pending.eta}。不要叠提案。`,
  );
}

const renderer = await deployRenderer(artifacts, wallet);
const deployTx = renderer.deploymentTransaction();
const rendererAddress = await renderer.getAddress();
console.log(`deploy tx ${deployTx.hash}`);
console.log(`next renderer ${rendererAddress}`);
await deployTx.wait();

if ((await renderer.decoderId()) !== DECODER)
  throw new Error("新渲染器 decoder 不是 /3");
if (Number(await renderer.version()) !== 3)
  throw new Error("新渲染器 version 不是 3");
await assertLociMatch(currentRenderer, renderer);
const cards = [];
if (supply >= 1) cards.push(await assertWalletImage(renderer, soul, 1));
if (supply >= 2) cards.push(await assertWalletImage(renderer, soul, 2));
for (const card of cards) console.log(`ready ${card.name} ${card.image}`);

const proposeTx = await connectedSoul.proposeRenderer(rendererAddress);
console.log(`propose tx ${proposeTx.hash}`);
const proposeReceipt = await proposeTx.wait();
if (proposeReceipt.status !== 1) throw new Error("proposeRenderer 失败");
const after = await soul.pendingRenderer();
if (getAddress(after.next) !== getAddress(rendererAddress)) {
  throw new Error("pendingRenderer 未写入");
}
const eta = new Date(Number(after.eta) * 1000).toISOString();
const record = {
  ...listing,
  pendingRenderer: rendererAddress,
  pendingRendererEta: eta,
  pendingRendererTxHash: proposeTx.hash,
  pendingRendererDeployTxHash: deployTx.hash,
  rendererProposedAt: new Date().toISOString(),
  rendererExplorerPending: `${EXPLORER}/address/${rendererAddress}`,
};
for (const file of LISTINGS) writeJson(file, record);
console.log(`pending ${rendererAddress}`);
console.log(`eta ${eta}`);
console.log(`deploy ${EXPLORER}/tx/${deployTx.hash}`);
console.log(`propose ${EXPLORER}/tx/${proposeTx.hash}`);
if (site && !site.ok) {
  console.log("时锁期内必须先部署网站 SVG 路由，再激活。");
}
console.log(`48h 后：npm run life:activate:renderer:mainnet -- ${ACTIVATE}`);
console.log(
  "未重部 ImmortalSoul。时锁期内 challengeRenderer(seed) 可废提案（loci 前缀必须仍匹配）。",
);
