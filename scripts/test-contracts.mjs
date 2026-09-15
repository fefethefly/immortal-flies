import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, ZeroAddress } from "ethers";
import solc from "solc";
import { compileContracts } from "./compile-contracts.mjs";
import {
  createFly,
  tick,
  train,
  sleep,
  wake,
  rebirth,
} from "../src/engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { artifact, deployedBytes } = compileContracts();
const freePort = await new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.on("error", reject);
  socket.listen(0, "127.0.0.1", () => {
    const port = socket.address().port;
    socket.close(() => resolve(port));
  });
});
const anvil = spawn(
  "anvil",
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(freePort),
    "--chain-id",
    "31337",
    "--silent",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let launchError,
  stderr = "";
anvil.on("error", (error) => {
  launchError = error;
});
anvil.stderr.on("data", (data) => {
  stderr += data.toString();
});
// Every immediately mined transaction can alter the cost of an identical next call.
// Disable ethers' short request cache so gas estimates always use the fresh state.
const provider = new JsonRpcProvider(`http://127.0.0.1:${freePort}`, 31337, {
  staticNetwork: true,
  cacheTimeout: -1,
});
provider.pollingInterval = 10;
const checks = [],
  gas = {};
const passed = (label) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};

function brainJSON(b) {
  return {
    rng: Number(b.rng),
    ticks: Number(b.ticks),
    learning: Array.from(b.learning, Number),
    potential: Array.from(b.potential, Number),
    energy: Number(b.energy),
    spikes: Number(b.spikes),
    incarnation: Number(b.incarnation),
    dormant: b.dormant,
  };
}

async function tx(promise, label) {
  const receipt = await (await promise).wait();
  assert.equal(receipt.status, 1);
  if (label) gas[label] = Number(receipt.gasUsed);
  return receipt;
}

try {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (launchError)
      throw new Error(
        `Anvil is required for local contract tests: ${launchError.message}`,
      );
    try {
      await provider.getBlockNumber();
      break;
    } catch (error) {
      if (attempt === 59 || anvil.exitCode !== null)
        throw new Error(
          `Local Anvil did not start: ${stderr || error.message}`,
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const [owner, approved, outsider, nextOwner] = await Promise.all(
    [0, 1, 2, 3].map((index) => provider.getSigner(index)),
  );
  const [ownerAddress, approvedAddress, outsiderAddress, nextAddress] =
    await Promise.all(
      [owner, approved, outsider, nextOwner].map((signer) =>
        signer.getAddress(),
      ),
    );
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
  const fly = await factory.deploy();
  await fly.waitForDeployment();
  gas.deployment = Number((await fly.deploymentTransaction().wait()).gasUsed);
  const address = await fly.getAddress();
  assert.equal(await fly.MODEL(), "iff-neural-16-v1");
  assert.equal(await fly.MAX_SUPPLY(), 1024n);
  assert.equal(await fly.supportsInterface("0x80ac58cd"), true);
  assert.equal(await fly.supportsInterface("0x5b5e139f"), true);
  passed("Deployment and ERC-721 / metadata interfaces");

  await assert.rejects(fly.mint.staticCall(0));
  await assert.rejects(fly.mint.staticCall(5, { value: 1n }));
  await tx(fly.mint(3700127), "mint");
  assert.equal(await fly.ownerOf(1), ownerAddress);
  let model = createFly(3700127);
  const assertBrain = async (id = 1, expected = model) => {
    const state = await fly.getFly(id);
    assert.deepEqual(brainJSON(state.brain), expected.brain);
    assert.equal(Number(state.dna), expected.dna);
    assert.equal(state.parent1, 0n);
    assert.equal(state.parent2, 0n);
    assert.equal(state.generation, 0n);
    assert.ok(state.bornAt > 0 && state.bornBlock > 0);
    return state;
  };
  await assertBrain();
  passed(
    "Free mint, nonzero seeds, complete initial readable state and Gen0 lineage",
  );

  for (const [method, args] of [
    ["tick", [1, 0, 1]],
    ["train", [1, 0]],
    ["sleep", [1]],
    ["wake", [1]],
    ["rebirth", [1]],
  ])
    await assert.rejects(fly.connect(outsider)[method].staticCall(...args));
  await assert.rejects(fly.getFly(9999));
  await assert.rejects(fly.train.staticCall(1, 3));
  await assert.rejects(fly.tick.staticCall(1, 4, 1));
  await assert.rejects(fly.tick.staticCall(1, 0, 0));
  await assert.rejects(fly.tick.staticCall(1, 0, 129));
  passed(
    "Unauthorized state changes, nonexistent IDs and invalid inputs rejected",
  );

  const operations = [
    [3, 1],
    [0, 7],
    [1, 17],
    [2, 41],
    [3, 128],
  ];
  for (const [stimulus, steps] of operations) {
    await tx(
      fly.tick(1, stimulus, steps),
      `tick_${steps}_stimulus_${stimulus}`,
    );
    for (let i = 0; i < steps; i++) model = tick(model, stimulus);
    await assertBrain();
  }
  for (const channel of [0, 1, 2, 0]) {
    await tx(fly.train(1, channel), `train_channel_${channel}`);
    model = train(model, channel);
    await assertBrain();
  }
  passed("JS ↔ Solidity parity for 194 ticks and 4 training actions");

  await tx(fly.sleep(1), "sleep");
  model = sleep(model);
  await tx(fly.tick(1, 0, 128), "dormant_tick");
  await assertBrain();
  await assert.rejects(fly.train.staticCall(1, 0));
  await tx(fly.wake(1), "wake");
  model = wake(model);
  await assertBrain();
  passed(
    "Dormancy stops neural time, RNG, energy and learning; wake restores activity",
  );

  await tx(fly.approve(approvedAddress, 1));
  await tx(fly.connect(approved).train(1, 1));
  model = train(model, 1);
  await assertBrain();
  await tx(
    fly.connect(approved).transferFrom(ownerAddress, nextAddress, 1),
    "transfer",
  );
  assert.equal(await fly.getApproved(1), ZeroAddress);
  await assert.rejects(fly.connect(owner).sleep.staticCall(1));
  await assert.rejects(fly.connect(approved).sleep.staticCall(1));
  await tx(fly.connect(nextOwner).sleep(1));
  model = sleep(model);
  await tx(fly.connect(nextOwner).setApprovalForAll(approvedAddress, true));
  await tx(fly.connect(approved).wake(1));
  model = wake(model);
  await tx(fly.connect(nextOwner).setApprovalForAll(approvedAddress, false));
  await assert.rejects(fly.connect(approved).wake.staticCall(1));
  await assertBrain();
  passed(
    "Token approvals, transfer authority handoff, operator approvals and revocation",
  );

  await assert.rejects(
    fly.connect(nextOwner).transferFrom.staticCall(nextAddress, ZeroAddress, 1),
  );
  const functions = artifact.abi
    .filter((item) => item.type === "function")
    .map((item) => item.name);
  for (const forbidden of [
    "burn",
    "setState",
    "setSnapshot",
    "upgradeTo",
    "upgradeToAndCall",
    "pause",
    "setBaseURI",
  ]) {
    assert.ok(!functions.includes(forbidden));
  }
  await assert.rejects(
    provider.call({
      from: nextAddress,
      to: address,
      data: "0x42966c680000000000000000000000000000000000000000000000000000000000000001",
    }),
  );
  passed(
    "No burn, zero-address transfer, administrative mutation or upgrade entry point",
  );

  while (model.brain.energy > 0) {
    const steps = Math.min(128, model.brain.energy);
    await tx(fly.connect(nextOwner).tick(1, 0, steps));
    for (let i = 0; i < steps; i++) model = tick(model, 0);
  }
  await assertBrain();
  await assert.rejects(fly.connect(nextOwner).wake.staticCall(1));
  await assert.rejects(fly.connect(nextOwner).train.staticCall(1, 0));
  await tx(fly.connect(nextOwner).tick(1, 1, 1));
  await assertBrain();
  const previous = structuredClone(model.brain);
  await tx(fly.connect(nextOwner).rebirth(1), "rebirth");
  model = rebirth(model);
  await assertBrain();
  assert.deepEqual(model.brain.learning, previous.learning);
  assert.deepEqual(model.brain.potential, previous.potential);
  assert.equal(model.brain.rng, previous.rng);
  assert.equal(model.brain.ticks, 1000);
  assert.equal(await fly.totalSupply(), 1n);
  passed(
    "Exhaustion locks wake; rebirth preserves learned brain and identity at tick 1000",
  );

  // Exercise uint32 overflow/high bit and the learning saturation boundary.
  for (const seed of [0xffffffff, 0x80000000, 1]) {
    await tx(fly.mint(seed));
    const id = Number(await fly.totalSupply());
    let expected = createFly(seed);
    await tx(fly.tick(id, 3, 32));
    for (let i = 0; i < 32; i++) expected = tick(expected, 3);
    await assertBrain(id, expected);
  }
  let saturation = createFly(1);
  for (let i = 0; i < 32; i++) saturation = tick(saturation, 3);
  for (let i = 0; i < 18; i++) {
    await tx(fly.train(4, 0));
    saturation = train(saturation, 0);
  }
  await assertBrain(4, saturation);
  assert.equal(saturation.brain.learning[0], 1000);
  passed(
    "uint32 xorshift parity across high-bit seeds; learning capped at 1000",
  );

  const uri = await fly.tokenURI(1);
  assert.ok(uri.startsWith("data:application/json;base64,"));
  const metadata = JSON.parse(
    Buffer.from(uri.split(",")[1], "base64").toString(),
  );
  assert.equal(metadata.name, "IMMORTAL #1");
  assert.ok(metadata.image.startsWith("data:image/svg+xml;base64,"));
  const svg = Buffer.from(metadata.image.split(",")[1], "base64").toString();
  assert.ok(
    svg.includes("SOUL #1") &&
      svg.includes("NEURAL TICKS 1000") &&
      svg.endsWith("</svg>"),
  );
  assert.ok(!svg.includes("https://") && !svg.includes("href="));
  assert.equal(
    metadata.attributes.find((a) => a.trait_type === "Incarnation").value,
    2,
  );
  await assert.rejects(fly.tokenURI(9999));
  passed("On-chain metadata and SVG decode without external files or services");

  // Restore into the off-chain simulator solely from the public on-chain state.
  const archived = await fly.getFly(1);
  let recovered = {
    model: await fly.MODEL(),
    id: 1,
    dna: Number(archived.dna),
    bornAt: new Date(Number(archived.bornAt) * 1000).toISOString(),
    brain: brainJSON(archived.brain),
    achievements: [],
  };
  await tx(fly.connect(nextOwner).tick(1, 2, 64), "tick_64_stimulus_2");
  for (let i = 0; i < 64; i++) recovered = tick(recovered, 2);
  await assertBrain(1, recovered);
  passed("Complete chain → independent JS recovery and 64-step continuation");

  const batchSource = fs.readFileSync(
    path.join(root, "contracts/test/MintBatch.sol"),
    "utf8",
  );
  const batchOutput = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: { "MintBatch.sol": { content: batchSource } },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "paris",
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
    ),
  );
  assert.ok(
    !(batchOutput.errors || []).some((error) => error.severity === "error"),
  );
  const batchArtifact = batchOutput.contracts["MintBatch.sol"].MintBatch;
  const batch = await new ContractFactory(
    batchArtifact.abi,
    `0x${batchArtifact.evm.bytecode.object}`,
    outsider,
  ).deploy();
  await batch.waitForDeployment();
  let remaining = 1024 - Number(await fly.totalSupply());
  while (remaining > 0) {
    const count = Math.min(100, remaining);
    await tx(batch.mintMany(address, count, { gasLimit: 29_000_000 }));
    remaining -= count;
  }
  assert.equal(await fly.totalSupply(), 1024n);
  assert.equal(await fly.ownerOf(1024), await batch.getAddress());
  await assert.rejects(fly.mint.staticCall(6));
  await tx(fly.connect(nextOwner).rebirth(1));
  assert.equal(await fly.totalSupply(), 1024n);
  passed(
    "Actual 1024 mints succeed; mint 1025 rejected and rebirth cannot inflate supply",
  );

  const report = {
    checkedAt: new Date().toISOString(),
    environment: "Ephemeral local Anvil only, chainId 31337",
    externalDeployment: false,
    compiler: artifact.compiler,
    evmVersion: artifact.evmVersion,
    deployedBytes,
    passed: checks,
    gas,
    limitations: [
      "Prototype only; no independent security audit or BSC mainnet deployment.",
      "Gen0 seed is user-selected; free mint has no anti-Sybil or fair-distribution mechanism.",
      "On-chain model is the 16-node JS model; it is not a scientific whole-brain simulation.",
      "Frontend maze and achievements are not implemented or certified by this contract.",
      "Chain state persistence depends on the chain and data access; there is no perpetual autonomous computation.",
      "Approved NFT operators can change the brain, as documented by the controller permission.",
      "No breeding, royalties, cross-chain bridge, sale, fungible token or external snapshot storage.",
    ],
  };
  fs.writeFileSync(
    path.join(root, "artifacts/contract-test-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      { result: "PASS", checks: checks.length, deployedBytes, gas },
      null,
      2,
    ),
  );
} finally {
  provider.destroy();
  if (anvil.exitCode === null) {
    const exited = new Promise((resolve) => anvil.once("exit", resolve));
    anvil.kill("SIGTERM");
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    if (anvil.exitCode === null) anvil.kill("SIGKILL");
  }
}
