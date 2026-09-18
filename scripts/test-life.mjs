import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import {
  ContractFactory,
  JsonRpcProvider,
  ZeroAddress,
  ZeroHash,
  concat,
  keccak256,
  parseEther,
  toBeHex,
  toUtf8Bytes,
  zeroPadValue,
} from "ethers";
import { compileLife } from "./compile-life.mjs";
import { deploySoulCollection, deployRenderer } from "./life-soul-factory.mjs";
import { lifeId, birthHash } from "../src/life/identity.mjs";
import { expressPhenotype } from "../src/brain/flyswarm/phenotype.mjs";
import {
  grindCrossover,
  traitsOfSeed,
  verifyCrossover,
} from "../src/life/descent.mjs";
const artifacts = compileLife();
const port = await new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on("error", reject);
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => resolve(p));
  });
});
const child = spawn(
  "anvil",
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--chain-id",
    "31337",
    "--silent",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let launchError;
child.on("error", (e) => (launchError = e));
const provider = new JsonRpcProvider(`http://127.0.0.1:${port}`, 31337, {
  cacheTimeout: -1,
});
provider.pollingInterval = 10;
const checks = [];
const gas = {};
const pass = (s) => {
  checks.push(s);
  console.log("PASS " + s);
};
const tx = async (p) => {
  const r = await (await p).wait();
  assert.equal(r.status, 1);
  return r;
};
const mine = (n) => provider.send("anvil_mine", ["0x" + n.toString(16)]);
const increase = async (seconds) => {
  await provider.send("evm_increaseTime", [seconds]);
  await mine(1);
};
const TIMELOCK = 48 * 3600;
const rejectTx = async (p) =>
  assert.rejects(async () => {
    await tx(p);
  });
try {
  for (let i = 0; i < 80; i++) {
    if (launchError) throw launchError;
    try {
      await provider.getBlockNumber();
      break;
    } catch {
      if (i === 79) throw new Error("Anvil failed");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const [owner, other, runner, hiveSigner] = await Promise.all(
    [0, 1, 2, 3].map((i) => provider.getSigner(i)),
  );
  const [a, b, c, hive] = await Promise.all(
    [owner, other, runner, hiveSigner].map((x) => x.getAddress()),
  );
  const genesis = JSON.parse(
    fs.readFileSync("public/life-genesis/current.json"),
  );
  const { soul } = await deploySoulCollection(
    artifacts,
    owner,
    genesis,
    "https://example.invalid" + genesis.manifestPath,
  );
  gas.deployment = Number((await soul.deploymentTransaction().wait()).gasUsed);
  const address = await soul.getAddress();
  assert.equal(await soul.MAX_GEN0(), 1024n);
  assert.equal(await soul.maxSupply(), 1_048_576n);
  assert.equal(await soul.MAX_PER_ADDRESS(), 1n);
  assert.equal(await soul.TIMELOCK(), 48n * 3600n);
  assert.equal(await soul.MAX_ROYALTY_BPS(), 500n);
  assert.equal(await soul.symbol(), "IFSOUL");
  assert.equal(await soul.name(), "Immortal Flyswarm Soul");
  assert.equal(await soul.supportsInterface("0x80ac58cd"), true);
  assert.equal(await soul.supportsInterface("0x2a55205a"), true);
  assert.equal(await soul.supportsInterface("0x49064906"), true);
  const [royRecv, royAmt] = await soul.royaltyInfo(1, 10n ** 18n);
  assert.equal(royRecv, ZeroAddress);
  assert.equal(royAmt, 0n);
  assert.equal(await soul.curator(), a);
  assert.notEqual(await soul.renderer(), ZeroAddress);
  const installModule = async (id, addr) => {
    const supply = await soul.totalSupply();
    await tx(soul.setModule(id, addr));
    if (supply === 0n || addr === ZeroAddress) return;
    await increase(TIMELOCK);
    await tx(soul.activateModule(id));
  };
  assert.equal(
    soul.interface.fragments.some((x) =>
      ["burn", "owner", "upgradeTo"].includes(x.name),
    ),
    false,
  );
  await rejectTx(soul.requestHatch("Ember", { value: 1n }));
  await rejectTx(soul.requestHatch(""));
  await rejectTx(soul.requestHatch('bad"quote'));
  gas.requestHatch = Number((await tx(soul.requestHatch("Ember"))).gasUsed);
  await rejectTx(soul.requestHatch("Again"));
  await assert.rejects(soul.hatch.staticCall(1));
  await mine(3);
  gas.hatch = Number((await tx(soul.connect(other).hatch(1))).gasUsed);
  assert.equal(await soul.ownerOf(1), a);
  assert.equal(await soul.totalSupply(), 1n);
  assert.equal(await soul.gen0Supply(), 1n);
  assert.equal(await soul.hatched(a), true);
  assert.equal(await soul.givenName(1), "Ember");
  assert.equal(await provider.getBalance(address), 0n);
  const descent0 = await soul.getDescent(1);
  assert.equal(descent0.parentA, 0n);
  assert.equal(descent0.generation, 0n);
  await rejectTx(soul.requestHatch("Second"));
  await rejectTx(soul.hatch(1));
  const genome = await soul.getGenome(1),
    life = lifeId(31337, address, 1);
  assert.equal(await soul.lifeId(1), life);
  assert.equal(genome.lookVersion, 3n);
  assert.equal(
    await soul.genomeHash(1),
    birthHash({
      life,
      genesisRoot: genesis.genesisRoot,
      seed: Number(genome.seed),
    }),
  );
  pass(
    "Free named request/hatch, no value accepted, future entropy, permissionless completion, recipient and domain-separated identity",
  );
  const seeds = [
    1,
    2,
    43,
    99,
    20260916,
    0x7fffffff,
    0xffffffff,
    ...Array.from(
      { length: 32 },
      (_, i) => Math.imul(i + 1, 2654435761) >>> 0 || 1,
    ),
  ];
  const hues = [
    "amber",
    "umber",
    "olive",
    "slate",
    "ink",
    "wine",
    "rust",
    "sand",
    "copper",
    "pine",
    "indigo",
    "bone",
  ];
  const eyes = ["wild", "cinnabar", "sepia", "vermilion", "white", "pale"];
  const marks = ["none", "bar", "spots"];
  for (const seed of seeds) {
    const p = await soul.decodeGen0(seed);
    const js = expressPhenotype({ soulId: "test", seed });
    assert.equal(p.body, js.art.body);
    assert.equal(hues[Number(p.hue)], js.hue.id);
    assert.equal(eyes[Number(p.eye)], js.eye.id);
    assert.equal(Number(p.stripes), js.stripes.count);
    assert.equal(marks[Number(p.mark)], js.mark.id);
    assert.equal(["clear", "apical", "banded", "pictured"][Number(p.wingMark)], js.wingMark.id);
    assert.equal(["typical", "miniature", "curly", "vestigial"][Number(p.wingShape)], js.wingShape.id);
    assert.equal(["complete", "incomplete", "extra"][Number(p.wingVein)], js.wingVein.id);
    assert.equal(["female", "male"][Number(p.sex)], js.sex.id);
    const words = await soul.chipsOf(seed);
    const chipBytes = Buffer.concat(
      words.map((word) => Buffer.from(String(word).slice(2), "hex")),
    );
    assert.deepEqual([...chipBytes], js.chips.map((x) => x.value));
    assert.equal(["petite", "typical", "large"][Number(p.size)], js.size.id);
  }
  const meta = JSON.parse(
    Buffer.from((await soul.tokenURI(1)).split(",")[1], "base64"),
  );
  assert.equal(meta.seed, Number(genome.seed));
  assert.equal(meta.lifeId, life);
  assert.equal(meta.decoder, "phenotype-loci/3");
  assert.equal(meta.givenName, "Ember");
  assert.equal(meta.name, "Ember #1");
  assert.equal(meta.generation, 0);
  assert.ok(
    Buffer.from(meta.image.split(",")[1], "base64").toString().includes("<svg"),
  );
  const attrs = Object.fromEntries(
    meta.attributes.map((row) => [row.trait_type, row.value]),
  );
  assert.equal(attrs.Generation, "Gen0");
  assert.ok(attrs.Body);
  assert.ok(attrs.Mark);
  assert.ok(attrs.Wings);
  assert.ok(attrs["Wing shape"]);
  assert.ok(attrs.Veins);
  assert.ok(attrs.Sex);
  assert.equal(typeof attrs.Stripes, "number");
  const attrBlob = JSON.stringify(meta.attributes).toLowerCase();
  for (const word of [
    "rarity",
    "rank",
    "legendary",
    "epic",
    "common",
    "rare",
    "mythic",
    "floor",
    "price",
  ])
    assert.equal(attrBlob.includes(word), false);
  pass(
    "39 Solidity/JS Gen0 vectors including mark; tokenURI has filter traits, on-chain name, and no rarity grade",
  );
  await tx(soul.connect(other).requestHatch("Moss"));
  await mine(260);
  await rejectTx(soul.hatch(2));
  await tx(soul.expireHatch(2));
  assert.equal(await soul.pendingCount(), 0n);
  await tx(soul.connect(other).requestHatch("Moss"));
  await mine(3);
  gas.hatchOther = Number((await tx(soul.hatch(3))).gasUsed);
  assert.equal(await soul.ownerOf(2), b);
  assert.equal(await soul.givenName(2), "Moss");
  assert.equal(await soul.gen0Supply(), 2n);
  pass("Expired requests release capacity and can be retried");
  const journal = await new ContractFactory(
    artifacts.LifeJournal.abi,
    artifacts.LifeJournal.bytecode,
    owner,
  ).deploy(address);
  await journal.waitForDeployment();
  gas.journalDeployment = Number(
    (await journal.deploymentTransaction().wait()).gasUsed,
  );
  const kin = await new ContractFactory(
    artifacts.SoulKin.abi,
    artifacts.SoulKin.bytecode,
    owner,
  ).deploy(address);
  await kin.waitForDeployment();
  gas.kinDeployment = Number(
    (await kin.deploymentTransaction().wait()).gasUsed,
  );
  const kinAddress = await kin.getAddress();
  await rejectTx(
    soul.connect(other).setModule(await soul.MODULE_KIN(), kinAddress),
  );
  await installModule(
    await soul.MODULE_JOURNAL(),
    await journal.getAddress(),
  );
  await installModule(await soul.MODULE_KIN(), kinAddress);
  assert.equal(await soul.modules(await soul.MODULE_KIN()), kinAddress);
  await rejectTx(soul.connect(other).mintDescendant(b, 1, 1, 1));
  pass("Curator attaches modules; strangers cannot mint descendants");
  let epoch = await soul.controlEpoch(1);
  await tx(soul.approve(b, 1));
  await rejectTx(soul.connect(other).setRunner(1, c));
  await rejectTx(journal.connect(other).submitStimulus(1, epoch, 0, 500, 0));
  await tx(soul.setRunner(1, c));
  const prior = epoch;
  epoch = await soul.controlEpoch(1);
  await rejectTx(journal.connect(runner).submitStimulus(1, prior, 0, 500, 0));
  gas.stimulus = Number(
    (await tx(journal.connect(runner).submitStimulus(1, epoch, 0, 500, 0)))
      .gasUsed,
  );
  await rejectTx(journal.submitStimulus(1, epoch, 0, 500, 0));
  await rejectTx(journal.submitStimulus(1, epoch, 3, 500, 1));
  const state = keccak256(toUtf8Bytes("state")),
    archive = keccak256(toUtf8Bytes("archive"));
  await rejectTx(
    journal.checkpoint(1, epoch, ZeroHash, 0, state, archive, "ipfs://test"),
  );
  gas.checkpoint = Number(
    (
      await tx(
        journal.checkpoint(
          1,
          epoch,
          ZeroHash,
          1,
          state,
          archive,
          "ipfs://test",
        ),
      )
    ).gasUsed,
  );
  await rejectTx(
    journal.checkpoint(1, epoch, ZeroHash, 1, state, archive, "ipfs://test"),
  );
  const previous = (await journal.heads(1)).checkpointRoot;
  await tx(soul.connect(other).transferFrom(a, b, 1));
  assert.equal(await soul.authorizedRunner(1), ZeroAddress);
  assert.equal(await soul.hatched(a), true);
  await rejectTx(soul.requestHatch("Nope"));
  await rejectTx(journal.connect(runner).submitStimulus(1, epoch, 0, 500, 1));
  await rejectTx(
    journal.submitStimulus(1, await soul.controlEpoch(1), 0, 500, 1),
  );
  await tx(
    journal
      .connect(other)
      .submitStimulus(1, await soul.controlEpoch(1), 2, 750, 1),
  );
  assert.equal((await journal.heads(1)).checkpointRoot, previous);
  assert.equal(await soul.lifeId(1), life);
  assert.equal(await soul.genomeHash(1), meta.genomeHash);
  await rejectTx(soul.connect(other).transferFrom(b, ZeroAddress, 1));
  pass(
    "Marketplace approvals cannot control brain; epoch revocation, transfer continuity, no burn; input/checkpoint ordering",
  );
  await tx(soul.connect(other).setRunner(1, c));
  await tx(soul.connect(other).transferFrom(b, b, 1));
  assert.equal(await soul.authorizedRunner(1), ZeroAddress);
  assert.equal(await soul.canControl(1, c), false);
  assert.equal(await soul.canControl(1, b), true);
  await rejectTx(soul.connect(other).expireHatch(99));
  await rejectTx(soul.hatch(99));
  pass("Self-transfer clears authorizedRunner; unknown hatch/expire revert");
  await rejectTx(soul.requestHatch("Nope"));
  assert.equal(await soul.hatched(c), false);
  await tx(soul.connect(other).setGivenName(2, "Vein"));
  assert.equal(await soul.givenName(2), "Vein");
  await rejectTx(soul.connect(runner).setGivenName(2, "Steal"));
  pass(
    "Lifetime one Gen0 hatch per address; given name is on-chain and owner-writable",
  );
  await rejectTx(kin.connect(runner).requestBreed(1, 2));
  gas.requestBreed = Number(
    (await tx(kin.connect(other).requestBreed(1, 2))).gasUsed,
  );
  await rejectTx(kin.connect(other).breed(1));
  await mine(3);
  gas.breed = Number((await tx(kin.connect(other).breed(1))).gasUsed);
  assert.equal(await soul.totalSupply(), 3n);
  assert.equal(await soul.gen0Supply(), 2n);
  assert.equal(await soul.ownerOf(3), b);
  const child = await soul.getDescent(3);
  assert.equal(child.parentA, 1n);
  assert.equal(child.parentB, 2n);
  assert.equal(child.generation, 1n);
  const kids = await soul.childrenOf(1);
  assert.deepEqual(kids.map(Number), [3]);
  const childMeta = JSON.parse(
    Buffer.from((await soul.tokenURI(3)).split(",")[1], "base64"),
  );
  assert.equal(childMeta.generation, 1);
  assert.equal(
    Object.fromEntries(
      childMeta.attributes.map((row) => [row.trait_type, row.value]),
    ).Generation,
    "Gen1",
  );
  pass(
    "SoulKin mints a descendant without consuming a Gen0 hatch slot; looks stay a seed readout",
  );
  await rejectTx(kin.connect(other).requestBreed(1, 2));
  await rejectTx(kin.setBreedCooldown(8 * 24 * 3600));
  await tx(kin.setBreedCooldown(0));
  pass("Per-parent 24h cooldown; operator may set 0..7d");
  const mockIfs = await new ContractFactory(
    artifacts.MockIFS.abi,
    artifacts.MockIFS.bytecode,
    owner,
  ).deploy();
  await mockIfs.waitForDeployment();
  const failBuy = await new ContractFactory(
    artifacts.MockKinBuyFail.abi,
    artifacts.MockKinBuyFail.bytecode,
    owner,
  ).deploy();
  await failBuy.waitForDeployment();
  const okBuy = await new ContractFactory(
    artifacts.MockKinBuyOk.abi,
    artifacts.MockKinBuyOk.bytecode,
    owner,
  ).deploy(await mockIfs.getAddress());
  await okBuy.waitForDeployment();
  const rejector = await new ContractFactory(
    artifacts.RejectEther.abi,
    artifacts.RejectEther.bytecode,
    owner,
  ).deploy();
  await rejector.waitForDeployment();
  const feeKin = await new ContractFactory(
    artifacts.SoulKinFee.abi,
    artifacts.SoulKinFee.bytecode,
    owner,
  ).deploy(address, await mockIfs.getAddress(), hive);
  await feeKin.waitForDeployment();
  const feeAddr = await feeKin.getAddress();
  await tx(feeKin.setBreedCooldown(0));
  await tx(kin.connect(other).requestBreed(1, 2));
  await installModule(await soul.MODULE_KIN(), feeAddr);
  await mine(3);
  await rejectTx(kin.connect(other).breed(2));
  await mine(260);
  await tx(kin.expireBreed(2));
  pass("Replacing MODULE_KIN leaves old SoulKin unable to mint");
  await rejectTx(feeKin.connect(other).requestBreed(1, 2, { value: 1n }));
  gas.requestBreedFree = Number(
    (await tx(feeKin.connect(other).requestBreed(1, 2))).gasUsed,
  );
  await rejectTx(feeKin.connect(other).breed(1));
  await mine(3);
  gas.breedFree = Number((await tx(feeKin.connect(other).breed(1))).gasUsed);
  assert.equal(await soul.totalSupply(), 4n);
  assert.equal(await soul.ownerOf(4), b);
  assert.equal(await soul.gen0Supply(), 2n);
  pass("SoulKinFee with price 0 still mints and rejects stray BNB");
  const fee = parseEther("0.002");
  await rejectTx(feeKin.connect(other).setBreedPrice(fee));
  await rejectTx(feeKin.setBreedPrice(parseEther("0.2")));
  await tx(feeKin.setBreedPrice(fee));
  await rejectTx(feeKin.connect(other).requestBreed(2, 3));
  await rejectTx(feeKin.connect(other).requestBreed(2, 3, { value: 1n }));
  await tx(feeKin.connect(other).requestBreed(2, 3, { value: fee }));
  const paidId = Number(await feeKin.pendingRequest(b));
  assert.equal(paidId > 0, true);
  await mine(3);
  const hiveBefore = await provider.getBalance(hive);
  const heldBefore = await feeKin.heldBNB();
  gas.breedHeld = Number(
    (await tx(feeKin.connect(runner).breed(paidId))).gasUsed,
  );
  assert.equal(await soul.ownerOf(5), b);
  assert.equal(await feeKin.heldBNB(), heldBefore + fee);
  assert.equal(await feeKin.pendingRequest(b), 0n);
  const flushReceipt = await tx(feeKin.connect(runner).flushHeldBnb());
  gas.flushHeld = Number(flushReceipt.gasUsed);
  assert.equal(await feeKin.heldBNB(), 0n);
  assert.equal(await provider.getBalance(hive), hiveBefore + fee);
  pass("No adapter: child is born, BNB is held, flush goes only to hive");
  await tx(feeKin.setAdapter(await failBuy.getAddress()));
  await tx(feeKin.connect(other).requestBreed(3, 4, { value: fee }));
  const failId = Number(await feeKin.pendingRequest(b));
  await mine(3);
  await tx(feeKin.breed(failId));
  assert.equal(await soul.ownerOf(6), b);
  assert.equal(await feeKin.heldBNB(), fee);
  pass("Failing adapter cannot roll back birth");
  await tx(feeKin.setAdapter(await okBuy.getAddress()));
  await tx(feeKin.retryHeldBuy(fee));
  assert.equal(await feeKin.heldBNB(), 0n);
  assert.equal(await mockIfs.balanceOf(hive), fee);
  const ops = await feeKin.MAINNET_OPS();
  assert.equal(await mockIfs.balanceOf(ops), 0n);
  assert.equal(await mockIfs.balanceOf(a), 0n);
  pass("Retry buy sends mock IFS to hive, not operator or ops");
  await tx(feeKin.connect(other).requestBreed(4, 5, { value: fee }));
  const fillId = Number(await feeKin.pendingRequest(b));
  await mine(3);
  await tx(feeKin.breed(fillId));
  assert.equal(await soul.ownerOf(7), b);
  assert.equal(await mockIfs.balanceOf(hive), fee + fee);
  assert.equal(await feeKin.heldBNB(), 0n);
  pass("Live adapter buys into hive in the same completion tx");
  await tx(feeKin.connect(other).requestBreed(5, 6, { value: fee }));
  const expireId = Number(await feeKin.pendingRequest(b));
  await mine(260);
  const otherBefore = await provider.getBalance(b);
  await tx(feeKin.connect(owner).expireBreed(expireId));
  assert.equal(await provider.getBalance(b), otherBefore + fee);
  assert.equal(await feeKin.pendingRequest(b), 0n);
  pass("Expired paid request refunds the original recipient");
  await rejectTx(
    new ContractFactory(
      artifacts.SoulMarket.abi,
      artifacts.SoulMarket.bytecode,
      owner,
    ).deploy(ZeroAddress, hive),
  );
  await rejectTx(
    new ContractFactory(
      artifacts.SoulMarket.abi,
      artifacts.SoulMarket.bytecode,
      owner,
    ).deploy(address, ZeroAddress),
  );
  const market = await new ContractFactory(
    artifacts.SoulMarket.abi,
    artifacts.SoulMarket.bytecode,
    owner,
  ).deploy(address, hive);
  await market.waitForDeployment();
  gas.marketDeployment = Number(
    (await market.deploymentTransaction().wait()).gasUsed,
  );
  const marketAddr = await market.getAddress();
  assert.equal(await market.soul(), address);
  assert.equal(await market.hive(), hive);
  assert.equal(await market.feeBps(), 200n);
  assert.equal(await market.MIN_PRICE(), parseEther("0.001"));
  assert.equal(
    market.interface.fragments.some(
      (x) => x.name === "upgradeTo" || x.name === "withdraw",
    ),
    false,
  );
  await rejectTx(owner.sendTransaction({ to: marketAddr, value: 1n }));
  const ask = parseEther("0.01");
  await rejectTx(market.connect(other).list(7, ask));
  await tx(soul.connect(other).approve(marketAddr, 7));
  await rejectTx(market.connect(other).list(7, parseEther("0.0005")));
  gas.list = Number((await tx(market.connect(other).list(7, ask))).gasUsed);
  const listed = await market.listings(7);
  assert.equal(listed.seller, b);
  assert.equal(listed.lifeId, await soul.lifeId(7));
  assert.equal(listed.price, ask);
  await rejectTx(market.connect(other).relist(7, parseEther("0.0005")));
  const ask2 = parseEther("0.02");
  gas.relist = Number(
    (await tx(market.connect(other).relist(7, ask2))).gasUsed,
  );
  assert.equal((await market.listings(7)).price, ask2);
  await rejectTx(market.connect(other).buy(7, { value: ask2 }));
  await rejectTx(market.connect(owner).buy(7, { value: ask }));
  const epochBefore = await soul.controlEpoch(7);
  const hiveBeforeAsk = await provider.getBalance(hive);
  const sellerBefore = await provider.getBalance(b);
  gas.buy = Number(
    (await tx(market.connect(owner).buy(7, { value: ask2 }))).gasUsed,
  );
  const feeAmt = (ask2 * 200n) / 10000n;
  assert.equal(await soul.ownerOf(7), a);
  assert.equal(await soul.authorizedRunner(7), ZeroAddress);
  assert.equal(await soul.controlEpoch(7), epochBefore + 1n);
  assert.equal(await provider.getBalance(hive), hiveBeforeAsk + feeAmt);
  assert.equal(await provider.getBalance(b), sellerBefore + ask2 - feeAmt);
  assert.equal((await market.listings(7)).price, 0n);
  assert.equal(await soul.hatched(a), true);
  pass(
    "SoulMarket list/relist/buy: fee to hive, runner cleared, Gen0 hatch stays spent",
  );
  await tx(soul.connect(other).approve(marketAddr, 6));
  await tx(market.connect(other).list(6, ask));
  await tx(soul.connect(other).transferFrom(b, a, 6));
  await rejectTx(market.connect(runner).buy(6, { value: ask }));
  gas.sweep = Number((await tx(market.connect(runner).sweep(6))).gasUsed);
  assert.equal((await market.listings(6)).price, 0n);
  pass("Stale listing cannot sell; anyone can sweep");
  await tx(soul.connect(other).approve(marketAddr, 5));
  await tx(market.connect(other).list(5, ask));
  gas.cancel = Number((await tx(market.connect(other).cancel(5))).gasUsed);
  assert.equal((await market.listings(5)).price, 0n);
  await rejectTx(market.connect(other).cancel(5));
  pass("Seller can cancel or relist an unsold ask");
  await tx(soul.connect(other).approve(marketAddr, 3));
  await tx(market.connect(other).list(3, ask));
  await tx(soul.connect(other).approve(ZeroAddress, 3));
  await rejectTx(market.connect(owner).buy(3, { value: ask }));
  await tx(market.sweep(3));
  assert.equal((await market.listings(3)).price, 0n);
  pass("Revoked approval cannot fill; sweep clears the ask");
  await tx(soul.connect(other).approve(marketAddr, 3));
  await tx(market.connect(other).list(3, ask));
  const listingBase = keccak256(
    concat([zeroPadValue(toBeHex(3), 32), zeroPadValue(toBeHex(2), 32)]),
  );
  await provider.send("anvil_setStorageAt", [
    marketAddr,
    toBeHex(BigInt(listingBase) + 1n, 32),
    zeroPadValue(toBeHex(1), 32),
  ]);
  assert.notEqual((await market.listings(3)).lifeId, await soul.lifeId(3));
  await rejectTx(market.connect(owner).buy(3, { value: ask }));
  await tx(market.sweep(3));
  pass("WrongLife rejects a swapped listing identity");
  const seller = await new ContractFactory(
    artifacts.MockMarketSeller.abi,
    artifacts.MockMarketSeller.bytecode,
    owner,
  ).deploy();
  await seller.waitForDeployment();
  const sellerAddr = await seller.getAddress();
  await tx(soul.connect(other).transferFrom(b, sellerAddr, 4));
  await tx(seller.approve(address, marketAddr, 4));
  await tx(seller.list(marketAddr, 4, ask));
  const hiveMid = await provider.getBalance(hive);
  await tx(market.connect(owner).buy(4, { value: ask }));
  assert.equal(await soul.ownerOf(4), a);
  assert.equal(
    await provider.getBalance(hive),
    hiveMid + (ask * 200n) / 10000n,
  );
  assert.equal(await market.refunds(sellerAddr), ask - (ask * 200n) / 10000n);
  await rejectTx(seller.withdraw(marketAddr));
  assert.equal(await market.refunds(sellerAddr), ask - (ask * 200n) / 10000n);
  pass("Rejecting seller keeps proceeds as refund; hive still paid");
  await rejectTx(market.connect(other).setFeeBps(100));
  await rejectTx(market.setFeeBps(1001));
  await tx(market.setFeeBps(100));
  assert.equal(await market.feeBps(), 100n);
  pass(
    "Operator fee stays capped; constructor pins soul/hive and rejects empty addresses",
  );
  // —— Crossover kin: each locus from one parent, ~2% mutation; off-chain grind, one-decode verify ——
  const crossKin = await new ContractFactory(
    artifacts.SoulKinCross.abi,
    artifacts.SoulKinCross.bytecode,
    owner,
  ).deploy(address);
  await crossKin.waitForDeployment();
  gas.crossKinDeployment = Number(
    (await crossKin.deploymentTransaction().wait()).gasUsed,
  );
  assert.equal(await crossKin.CROSSOVER_RULE(), "ifs.descent-cross/1");
  await installModule(
    await soul.MODULE_KIN(),
    await crossKin.getAddress(),
  );
  await tx(crossKin.setBreedCooldown(0));
  await rejectTx(crossKin.connect(runner).requestBreed(1, 2));
  await tx(crossKin.connect(other).requestBreed(1, 2));
  const crossId = Number(await crossKin.pendingRequest(b));
  const crossReq = await crossKin.requests(crossId);
  await rejectTx(crossKin.connect(other).breed(crossId, 0));
  await mine(3);
  const crossParents = [await soul.getGenome(1), await soul.getGenome(2)];
  const entropyHash = (await provider.getBlock(Number(crossReq.entropyBlock)))
    .hash;
  const grind = grindCrossover({
    seedA: Number(crossParents[0].seed),
    seedB: Number(crossParents[1].seed),
    collection: address,
    requestId: crossId,
    entropy: entropyHash,
  });
  assert.ok(grind.tries > 0);
  let badN = grind.n + 1;
  while (
    verifyCrossover({
      seedA: Number(crossParents[0].seed),
      seedB: Number(crossParents[1].seed),
      collection: address,
      requestId: crossId,
      entropy: entropyHash,
      n: badN,
    }).ok
  )
    badN++;
  await rejectTx(crossKin.connect(runner).breed(crossId, badN));
  gas.breedCross = Number(
    (await tx(crossKin.connect(runner).breed(crossId, grind.n))).gasUsed,
  );
  assert.ok(gas.breedCross < 1_000_000, `verify gas ${gas.breedCross}`);
  const crossChild = Number(await soul.totalSupply());
  assert.equal(await soul.ownerOf(crossChild), b);
  assert.equal((await soul.getDescent(crossChild)).generation, 1n);
  assert.equal(
    Number((await soul.getGenome(crossChild)).seed),
    grind.seed,
    "on-chain seed must equal the ground candidate bit for bit",
  );
  const crossTa = traitsOfSeed(Number(crossParents[0].seed)),
    crossTb = traitsOfSeed(Number(crossParents[1].seed)),
    crossTc = traitsOfSeed(grind.seed);
  const locusNames = ["hue", "sat", "light", "eye", "size", "stripes", "mark", "wingMark", "wingShape", "wingVein"];
  for (let i = 0; i < 10; i++) {
    if (grind.sources[i] === 2) continue;
    assert.equal(
      crossTc[i],
      grind.sources[i] === 1 ? crossTa[i] : crossTb[i],
      `locus ${locusNames[i]} must follow its drawn source exactly`,
    );
  }
  pass(
    "SoulKinCross: off-chain grind + one-decode verify; every locus follows its drawn parent (~2% mutation)",
  );
  const crossFee = await new ContractFactory(
    artifacts.SoulKinCrossFee.abi,
    artifacts.SoulKinCrossFee.bytecode,
    owner,
  ).deploy(address, await mockIfs.getAddress(), hive);
  await crossFee.waitForDeployment();
  gas.crossKinFeeDeployment = Number(
    (await crossFee.deploymentTransaction().wait()).gasUsed,
  );
  assert.equal(await crossFee.CROSSOVER_RULE(), "ifs.descent-cross/1");
  await installModule(
    await soul.MODULE_KIN(),
    await crossFee.getAddress(),
  );
  await tx(crossFee.setBreedCooldown(0));
  await tx(crossFee.connect(other).requestBreed(1, 3));
  const crossFeeId = Number(await crossFee.pendingRequest(b));
  await mine(3);
  const feeParents = [await soul.getGenome(1), await soul.getGenome(3)];
  const feeEntropy = (
    await provider.getBlock(
      Number((await crossFee.requests(crossFeeId)).entropyBlock),
    )
  ).hash;
  const feeGrind = grindCrossover({
    seedA: Number(feeParents[0].seed),
    seedB: Number(feeParents[1].seed),
    collection: address,
    requestId: crossFeeId,
    entropy: feeEntropy,
  });
  gas.breedCrossFee = Number(
    (await tx(crossFee.connect(runner).breed(crossFeeId, feeGrind.n))).gasUsed,
  );
  assert.ok(gas.breedCrossFee < 1_000_000);
  assert.equal(await soul.ownerOf(Number(await soul.totalSupply())), b);
  assert.equal(
    Number((await soul.getGenome(Number(await soul.totalSupply()))).seed),
    feeGrind.seed,
  );
  await installModule(await soul.MODULE_KIN(), feeAddr);
  pass(
    "SoulKinCrossFee keeps SoulKinFee fee/buy semantics with the verified crossover seed",
  );
  await tx(soul.connect(other).transferFrom(b, await rejector.getAddress(), 1));
  await tx(soul.connect(other).transferFrom(b, await rejector.getAddress(), 2));
  await tx(rejector.requestBreed(feeAddr, 1, 2, { value: fee }));
  const rejectId = Number(
    await feeKin.pendingRequest(await rejector.getAddress()),
  );
  await mine(260);
  await tx(feeKin.expireBreed(rejectId));
  assert.equal(await feeKin.refunds(await rejector.getAddress()), fee);
  pass("Refund that cannot land is held for the recipient");
  await rejectTx(soul.raiseMaxSupply(1_048_576n));
  await tx(soul.raiseMaxSupply(1_048_577n));
  assert.equal(await soul.maxSupply(), 1_048_577n);
  await rejectTx(soul.setRoyalty(a, 501));
  await tx(soul.setRoyalty(a, 250));
  await rejectTx(soul.activateRoyalty());
  await increase(TIMELOCK);
  await tx(soul.activateRoyalty());
  {
    const [rr, ra] = await soul.royaltyInfo(1, 10_000n);
    assert.equal(rr, a);
    assert.equal(ra, 250n);
  }
  await tx(soul.setRoyalty(ZeroAddress, 0));
  await increase(TIMELOCK);
  await tx(soul.activateRoyalty());
  await tx(soul.setContractURI("ipfs://collection"));
  assert.equal(await soul.contractURI(), "ipfs://collection");
  const badRenderer = await new ContractFactory(
    artifacts.MockRendererMismatch.abi,
    artifacts.MockRendererMismatch.bytecode,
    owner,
  ).deploy();
  await badRenderer.waitForDeployment();
  await tx(soul.proposeRenderer(await badRenderer.getAddress()));
  await rejectTx(soul.activateRenderer());
  await tx(soul.challengeRenderer(1));
  assert.equal((await soul.pendingRenderer()).next, ZeroAddress);
  const twinRenderer = await deployRenderer(artifacts, owner);
  await tx(soul.proposeRenderer(await twinRenderer.getAddress()));
  await rejectTx(soul.challengeRenderer(1));
  await increase(TIMELOCK);
  await tx(soul.activateRenderer());
  assert.equal(await soul.renderer(), await twinRenderer.getAddress());
  const gate = await new ContractFactory(
    artifacts.MockHatchGate.abi,
    artifacts.MockHatchGate.bytecode,
    owner,
  ).deploy();
  await gate.waitForDeployment();
  await installModule(await soul.MODULE_HATCH_GATE(), await gate.getAddress());
  await tx(gate.setOk(false));
  await rejectTx(soul.connect(runner).requestHatch("Gate"));
  await tx(soul.setModule(await soul.MODULE_HATCH_GATE(), ZeroAddress));
  assert.equal(await soul.modules(await soul.MODULE_HATCH_GATE()), ZeroAddress);
  pass(
    "Raisable cap, 2981 default-off, 48h renderer challenge, hatch gate deny-only, instant unset",
  );
  await tx(soul.setCurator(ZeroAddress));
  await rejectTx(soul.setModule(await soul.MODULE_KIN(), ZeroAddress));
  pass("Renounced curator cannot swap modules");
  fs.mkdirSync("artifacts/life", { recursive: true });
  fs.writeFileSync(
    "artifacts/life/test-report.json",
    JSON.stringify(
      {
        checks,
        gas,
        runtimeBytes: Object.fromEntries(
          Object.entries(artifacts).map(([k, v]) => [k, v.deployedBytes]),
        ),
        scope:
          "Local Anvil; public-chain deploy and security audit not performed",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(gas));
} finally {
  provider.destroy();
  child.kill("SIGTERM");
}
