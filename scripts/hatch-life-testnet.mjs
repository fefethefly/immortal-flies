import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

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

const deployment = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/contract/life/ImmortalSoul.deployment.json"),
    "utf8",
  ),
);
if (
  !deployment.address ||
  deployment.status === "UNDEPLOYED" ||
  String(deployment.status).startsWith("STALE")
) {
  throw new Error("Soul 尚未部署。先跑 npm run life:deploy:testnet");
}
const abi = JSON.parse(
  fs.readFileSync(path.join(root, "public/contract/life/ImmortalSoul.json"), "utf8"),
).abi;
let key = (process.env.IFF_DEPLOY_KEY || "").trim();
if (/^[0-9a-fA-F]{64}$/.test(key)) key = `0x${key}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("缺少 IFF_DEPLOY_KEY");

const provider = new JsonRpcProvider(
  process.env.BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com",
  97,
  { staticNetwork: true },
);
const wallet = new Wallet(key, provider);
const soul = new Contract(deployment.address, abi, wallet);

    const given = process.argv[2] || "Ember";
const requestTx = await soul.requestHatch(given);
console.log(`request ${requestTx.hash}`);
const requestReceipt = await requestTx.wait();
const requested = requestReceipt.logs
  .map((log) => {
    try {
      return soul.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((item) => item?.name === "HatchRequested");
if (!requested) throw new Error("没有 HatchRequested");
const requestId = requested.args.requestId;
const entropyBlock = Number(requested.args.entropyBlock);
console.log(`requestId ${requestId} entropyBlock ${entropyBlock}`);

for (let i = 0; i < 40; i += 1) {
  const now = await provider.getBlockNumber();
  if (now > entropyBlock) break;
  console.log(`wait block ${now} / ${entropyBlock + 1}`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

const hatchTx = await soul.hatch(requestId);
console.log(`hatch ${hatchTx.hash}`);
const hatchReceipt = await hatchTx.wait();
const born = hatchReceipt.logs
  .map((log) => {
    try {
      return soul.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((item) => item?.name === "Born");
if (!born) throw new Error("没有 Born");
console.log(
  JSON.stringify(
    {
      tokenId: Number(born.args.tokenId),
      owner: born.args.owner,
      life: born.args.life,
      seed: Number(born.args.seed),
      birthHash: born.args.birthHash,
      given,
      explorer: `https://testnet.bscscan.com/tx/${hatchTx.hash}`,
    },
    null,
    2,
  ),
);
