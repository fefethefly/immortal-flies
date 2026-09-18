import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
const root = fileURLToPath(new URL("../", import.meta.url));
const UNITS = [
  "ImmortalSoul",
  "SoulRenderer",
  "LifeJournal",
  "SoulKin",
  "SoulKinFee",
  "KinCrossover",
  "SoulKinCross",
  "SoulKinCrossFee",
  "FlapPortalBuyAdapter",
  "SoulMarket",
  "MiningHub",
];
const MOCKS = [
  "MockIFS",
  "MockIFSTax",
  "MockKinBuyFail",
  "MockKinBuyOk",
  "RejectEther",
  "MockMarketSeller",
  "MockHatchGate",
  "MockRendererMismatch",
];
const ARTIFACTS = [
  "ImmortalSoul",
  "SoulRenderer",
  "LifeJournal",
  "SoulKin",
  "SoulKinFee",
  "SoulKinCross",
  "SoulKinCrossFee",
  "FlapPortalBuyAdapter",
  "SoulMarket",
  "MiningHub",
];
function resolveImport(from, spec) {
  if (!spec.startsWith(".")) return spec;
  return path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
}

function collectSources() {
  const sources = {};
  const visit = (rel) => {
    if (sources[rel]) return;
    const file = rel.startsWith("contracts/")
      ? path.join(root, rel)
      : path.join(root, "node_modules", rel);
    const content = fs.readFileSync(file, "utf8");
    sources[rel] = { content };
    for (const match of content.matchAll(
      /import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g,
    )) {
      visit(resolveImport(rel, match[1]));
    }
  };
  for (const name of UNITS) visit(`contracts/life/${name}.sol`);
  for (const name of MOCKS) visit(`contracts/life/mocks/${name}.sol`);
  return sources;
}

export function compileLife({ write = true } = {}) {
  const input = {
    language: "Solidity",
    sources: collectSources(),
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "paris",
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode.object",
            "evm.deployedBytecode.object",
            "metadata",
          ],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  for (const e of output.errors || [])
    if (e.severity === "error") throw new Error(e.formattedMessage);
  const artifacts = {};
  const compiled = [
    ...ARTIFACTS.map((name) => ({ name, rel: `contracts/life/${name}.sol` })),
    ...MOCKS.map((name) => ({ name, rel: `contracts/life/mocks/${name}.sol` })),
  ];
  for (const { name, rel } of compiled) {
    const c = output.contracts[rel]?.[name];
    if (!c) throw new Error(`missing artifact ${name}`);
    const object = c.evm.bytecode.object || "";
    const deployed = c.evm.deployedBytecode.object || "";
    const deployedBytes = deployed.length / 2;
    if (deployedBytes > 24576) throw new Error(`${name} exceeds EIP170 (${deployedBytes} bytes)`);
    artifacts[name] = {
      contractName: name,
      status: "UNDEPLOYED",
      compiler: solc.version(),
      evmVersion: "paris",
      abi: c.abi,
      bytecode: object ? `0x${object}` : "0x",
      deployedBytecode: deployed ? `0x${deployed}` : "0x",
      deployedBytes,
    };
  }
  if (write) {
    fs.mkdirSync(path.join(root, "artifacts/life"), { recursive: true });
    fs.mkdirSync(path.join(root, "public/contract/life"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "artifacts/life/standard-input.json"),
      JSON.stringify(input, null, 2) + "\n",
    );
    for (const [name, a] of Object.entries(artifacts)) {
      fs.writeFileSync(
        path.join(root, `artifacts/life/${name}.json`),
        JSON.stringify(a, null, 2) + "\n",
      );
      if (ARTIFACTS.includes(name))
        fs.writeFileSync(
          path.join(root, `public/contract/life/${name}.json`),
          JSON.stringify({ contractName: name, abi: a.abi }, null, 2) + "\n",
        );
    }
  }
  return artifacts;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    Object.fromEntries(
      Object.entries(compileLife()).map(([k, v]) => [k, v.deployedBytes]),
    ),
  );
