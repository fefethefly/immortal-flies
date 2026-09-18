import test from "node:test";
import assert from "node:assert/strict";
import {
  MAINNET_HIVE,
  MAINNET_IFS,
  acceptancePolicy,
  archiveUrl,
  dailyLeft,
  decodeOperator,
  decodeSegment,
  decodeTank,
  formatCountdown,
  formatIfs,
  hubListingPath,
  isLiveIfs,
  isMockIfsNetwork,
  liveRunnerForToken,
  nativeSymbol,
  parseBindForm,
  parseHubDeployment,
  parseLineage,
  runnerListingPath,
  segmentPhase,
  segmentsRemaining,
  spentToday,
  tankFuel,
  validUntilOf,
  windowLeftSec,
} from "../src/life/host.mjs";
import { assertRunnerEnv } from "../server/src/runner/guard.mjs";

test("host listings stay off the mesh shard path", () => {
  assert.equal(hubListingPath(""), "/contract/life/MiningHub.deployment.json");
  assert.equal(
    hubListingPath("?net=test"),
    "/contract/life/MiningHub.testnet.json",
  );
  assert.equal(
    runnerListingPath("?net=test"),
    "/contract/life/PrivateRunner.testnet.json",
  );
  assert.equal(parseHubDeployment({ status: "UNDEPLOYED" }), null);
  assert.equal(
    parseHubDeployment({
      status: "BSC_TESTNET",
      chainId: 97,
      address: "0xdb80def1828236A5af09965F46c6BEE63ccc1f4e",
      ifs: "0xff23A7635140cF3c127f31A3c56A59C19F058899",
    }).chainId,
    97,
  );
});

test("live IFS is only the posted mainnet token", () => {
  assert.equal(isLiveIfs(MAINNET_IFS), true);
  assert.equal(isLiveIfs("0xff23A7635140cF3c127f31A3c56A59C19F058899"), false);
  assert.equal(isMockIfsNetwork(97), true);
  assert.equal(isMockIfsNetwork(56), false);
  assert.equal(MAINNET_HIVE.startsWith("0xfAdb"), true);
});

test("v1 acceptance is pay-if-unchallenged, timeout-only arbiter", () => {
  const main = acceptancePolicy(56);
  assert.equal(main.verifier, "none");
  assert.equal(main.payIfUnchallenged, true);
  assert.equal(main.arbiter, "timeout-only");
  assert.equal(main.liveIfs, true);
  assert.equal(main.yield, false);
  assert.equal(acceptancePolicy(97).liveIfs, false);
  assert.equal(
    archiveUrl("https://runner.example", "0xabc"),
    "https://runner.example/archive/0xabc",
  );
});

test("bind form keeps steps in range and ignores empty expiry", () => {
  const form = parseBindForm({
    runner: " 0x11 ",
    fee: "1",
    steps: "1000",
    spendCap: "10",
    validHours: "",
  });
  assert.equal(form.runner, "0x11");
  assert.equal(form.steps, 1000);
  assert.equal(form.validHours, 0);
  assert.equal(validUntilOf(0, 1_000), 0);
  assert.equal(validUntilOf(2, 1_000), 1_000 + 7200);
});

test("tank decode and daily caps", () => {
  const tank = decodeTank({
    owner: "0x1111111111111111111111111111111111111111",
    lifeId: "0x22",
    ownerFuel: 10n ** 18n,
    giftFuel: 0n,
    reserved: 0n,
    runner: "0x3333333333333333333333333333333333333333",
    fee: 10n ** 18n,
    steps: 1000,
    spendCap: 10n * 10n ** 18n,
    spent: 0n,
    validUntil: 0,
  });
  assert.equal(tank.steps, 1000);
  assert.equal(formatIfs(tank.ownerFuel), "1");
  assert.equal(formatIfs(10n ** 18n / 2n), "0.5");
  assert.equal(spentToday("5", 3, 4), 0n);
  assert.equal(spentToday("5", 4, 4), 5n);
  assert.equal(dailyLeft(0, 5n), null);
  assert.equal(dailyLeft(10n ** 20n, 10n ** 18n), 99n * 10n ** 18n);
});

test("dashboard phase, countdown, remaining segments, and lineage", () => {
  assert.equal(segmentPhase(null, 100), "idle");
  assert.equal(segmentPhase({ status: 1 }, 100), "open");
  assert.equal(segmentPhase({ status: 2, challengeUntil: 200 }, 100), "window");
  assert.equal(segmentPhase({ status: 2, challengeUntil: 100 }, 100), "ready");
  assert.equal(segmentPhase({ status: 4 }, 1), "settled");
  assert.equal(windowLeftSec(200, 150), 50);
  assert.equal(windowLeftSec(100, 150), 0);
  assert.equal(formatCountdown(90), "1m 30s");
  assert.equal(formatCountdown(3661), "1h 01m");
  const tank = decodeTank({
    owner: "0x1111111111111111111111111111111111111111",
    lifeId: "0x22",
    ownerFuel: 5n * 10n ** 18n,
    giftFuel: 0n,
    reserved: 0n,
    runner: "0x3333333333333333333333333333333333333333",
    fee: 10n ** 18n,
    steps: 1000,
    spendCap: 10n * 10n ** 18n,
    spent: 2n * 10n ** 18n,
    validUntil: 0,
  });
  assert.equal(tankFuel(tank), 5n * 10n ** 18n);
  assert.equal(segmentsRemaining(tank), 5);
  const book = parseLineage({
    schema: "iff.life-lineage/1",
    yield: false,
    tokenId: 1,
    hub: "0xdb80def1828236A5af09965F46c6BEE63ccc1f4e",
    segments: [
      { segmentId: "0x11", nonce: 22, startRoot: "0xaa", finalRoot: "0xbb" },
    ],
  });
  assert.equal(book.segments.length, 1);
  assert.equal(book.segments[0].nonce, 22);
  assert.equal(
    parseLineage({ schema: "iff.life-lineage/1", yield: true }).segments.length,
    0,
  );
  const live = liveRunnerForToken(
    {
      lastSegment: {
        tokenId: 1,
        action: "awaiting-window",
        segmentId: "0x53",
        challengeUntil: 9,
      },
      lastError: null,
      ready: true,
    },
    1,
  );
  assert.equal(live.action, "awaiting-window");
  assert.equal(liveRunnerForToken({ lastSegment: { tokenId: 2 } }, 1), null);
  assert.equal(nativeSymbol(97), "tBNB");
  assert.equal(nativeSymbol(56), "BNB");
  const seg = decodeSegment(
    {
      tokenId: 1,
      runner: "0x3333333333333333333333333333333333333333",
      steps: 1000,
      status: 2,
      fee: 10n ** 18n,
      startRoot: "0xaa",
      finalRoot: "0xbb",
      challengeUntil: 9,
      paid: 0n,
    },
    "0x53",
  );
  assert.equal(seg.id, "0x53");
  assert.equal(seg.status, 2);
  const op = decodeOperator({
    roles: 1,
    status: 1,
    bond: 99n * 10n ** 18n,
    exposure: 10n ** 18n,
    accepted: 1,
    disputed: 0,
    lost: 0,
  });
  assert.equal(op.status, 1);
  assert.equal(op.accepted, 1);
});

test("mainnet runner cannot reuse testnet dir or mock IFS", () => {
  assert.throws(
    () =>
      assertRunnerEnv({
        chainId: 56,
        mainnetFlag: "",
        dataDir: "/tmp/main",
        defaultTestnetDir: "/tmp/test",
        listing: {
          status: "LIVE",
          address: "0x1",
          ifs: MAINNET_IFS,
          hive: MAINNET_HIVE,
        },
      }),
    /IFF_MAINNET_RUNNER/,
  );
  assert.throws(
    () =>
      assertRunnerEnv({
        chainId: 56,
        mainnetFlag: "1",
        dataDir: "/tmp/test",
        defaultTestnetDir: "/tmp/test",
        listing: {
          status: "LIVE",
          address: "0x1",
          ifs: MAINNET_IFS,
          hive: MAINNET_HIVE,
        },
      }),
    /testnet data directory/,
  );
  assert.throws(
    () =>
      assertRunnerEnv({
        chainId: 56,
        mainnetFlag: "1",
        dataDir: "/tmp/main",
        defaultTestnetDir: "/tmp/test",
        listing: {
          status: "LIVE",
          address: "0x1",
          ifs: "0xff23A7635140cF3c127f31A3c56A59C19F058899",
          hive: MAINNET_HIVE,
        },
      }),
    /live IFS/,
  );
  assert.throws(
    () =>
      assertRunnerEnv({
        chainId: 56,
        mainnetFlag: "1",
        dataDir: "/tmp/main",
        defaultTestnetDir: "/tmp/test",
        listing: {
          status: "LIVE",
          address: "0x1111111111111111111111111111111111111111",
          ifs: MAINNET_IFS,
          hive: "0x1111111111111111111111111111111111111111",
        },
      }),
    /0xfAdb2FE1/,
  );
  assert.deepEqual(
    assertRunnerEnv({
      chainId: 56,
      mainnetFlag: "1",
      dataDir: "/tmp/main",
      defaultTestnetDir: "/tmp/test",
      listing: {
        status: "LIVE",
        address: "0x1111111111111111111111111111111111111111",
        ifs: MAINNET_IFS,
        hive: MAINNET_HIVE,
      },
    }),
    { audit: "MAINNET", yield: false, chainId: 56 },
  );
  assert.deepEqual(
    assertRunnerEnv({
      chainId: 97,
      dataDir: "/tmp/test",
      defaultTestnetDir: "/tmp/test",
      listing: {
        ifs: "0xff23A7635140cF3c127f31A3c56A59C19F058899",
        hive: "0xc2FcdA8D7abbff26FbF0CD27D4Dc45b59c8419F2",
      },
    }),
    { audit: "TESTNET", yield: false, chainId: 97 },
  );
});

test("host connect and refresh stay clickable without a live hub", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(
    new URL("../src/life/host-page.jsx", import.meta.url),
    "utf8",
  );
  assert.equal(src.includes("disabled={busy || !liveHub}"), false);
  assert.match(src, /useConnectedWallet\(\s*deployment/);
  assert.match(src, /onClick=\{onRefresh\}/);
});
