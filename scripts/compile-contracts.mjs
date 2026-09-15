import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function compileContracts({ write = true } = {}) {
  const input = {
    language: "Solidity",
    sources: {
      "contracts/ImmortalFly.sol": {
        content: fs.readFileSync(
          path.join(root, "contracts/ImmortalFly.sol"),
          "utf8",
        ),
      },
    },
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
            "storageLayout",
          ],
        },
      },
    },
  };
  const output = JSON.parse(
    solc.compile(JSON.stringify(input), {
      import: (name) => {
        const resolved = path.resolve(root, "node_modules", name);
        if (!resolved.startsWith(path.join(root, "node_modules") + path.sep))
          return { error: "Import outside node_modules" };
        try {
          return { contents: fs.readFileSync(resolved, "utf8") };
        } catch {
          return { error: `Cannot resolve ${name}` };
        }
      },
    }),
  );
  for (const issue of output.errors || []) {
    if (issue.severity === "error") throw new Error(issue.formattedMessage);
    console.warn(issue.formattedMessage);
  }
  const result = output.contracts["contracts/ImmortalFly.sol"].ImmortalFly;
  const artifact = {
    contractName: "ImmortalFly",
    sourceName: "contracts/ImmortalFly.sol",
    model: "iff-neural-16-v1",
    status: "UNDEPLOYED_PROTOTYPE",
    compiler: solc.version(),
    evmVersion: input.settings.evmVersion,
    abi: result.abi,
    bytecode: `0x${result.evm.bytecode.object}`,
    deployedBytecode: `0x${result.evm.deployedBytecode.object}`,
  };
  const deployedBytes = result.evm.deployedBytecode.object.length / 2;
  if (deployedBytes > 24576)
    throw new Error(`Runtime size ${deployedBytes} exceeds EIP-170 limit`);
  if (write) {
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    fs.mkdirSync(path.join(root, "public/contract"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "artifacts/ImmortalFly.json"),
      JSON.stringify(
        {
          ...artifact,
          metadata: JSON.parse(result.metadata),
          storageLayout: result.storageLayout,
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(
      path.join(root, "public/contract/ImmortalFly.json"),
      JSON.stringify(artifact, null, 2) + "\n",
    );
  }
  return { artifact, deployedBytes };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { deployedBytes } = compileContracts();
  console.log(
    `Compiled ImmortalFly: ${deployedBytes} runtime bytes. No chain deployment performed.`,
  );
}
