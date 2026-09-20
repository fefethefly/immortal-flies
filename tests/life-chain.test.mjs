import test from "node:test";
import assert from "node:assert/strict";
import {
  explainLifeError,
  formatBreedPrice,
  hatchPhase,
  explainMarketError,
  lifeListingPath,
  loadOpenListings,
  marketListingPath,
  parseLifeDeployment,
  parseMarketDeployment,
  queryAllLogs,
  queryLatestLog,
  readBreedBuy,
  readPendingHatch,
  requestLifeAccounts,
} from "../src/life/chain.mjs";

test("lifeListingPath only uses the testnet file when asked", () => {
  assert.equal(
    lifeListingPath(""),
    "/contract/life/ImmortalSoul.deployment.json",
  );
  assert.equal(
    lifeListingPath("?soul=1"),
    "/contract/life/ImmortalSoul.deployment.json",
  );
  assert.equal(
    lifeListingPath("?net=test"),
    "/contract/life/ImmortalSoul.testnet.json",
  );
  assert.equal(
    lifeListingPath("?chain=97&soul=2"),
    "/contract/life/ImmortalSoul.testnet.json",
  );
  assert.equal(
    marketListingPath(""),
    "/contract/life/SoulMarket.deployment.json",
  );
  assert.equal(
    marketListingPath("?net=test"),
    "/contract/life/SoulMarket.testnet.json",
  );
});

test("parseLifeDeployment stays null until a real address exists", () => {
  assert.equal(
    parseLifeDeployment({ status: "UNDEPLOYED", chainId: 56, address: null }),
    null,
  );
  const testnet = parseLifeDeployment({
    status: "BSC_TESTNET",
    chainId: 97,
    address: "0x1111111111111111111111111111111111111111",
    journal: "0x2222222222222222222222222222222222222222",
    kin: "0x3333333333333333333333333333333333333333",
  });
  assert.equal(testnet.chainId, 97);
  assert.equal(testnet.address, "0x1111111111111111111111111111111111111111");
  assert.equal(testnet.kin, "0x3333333333333333333333333333333333333333");
  const live = parseLifeDeployment({
    status: "LIVE",
    chainId: 56,
    address: "0x1111111111111111111111111111111111111111",
  });
  assert.equal(live.address, "0x1111111111111111111111111111111111111111");
  assert.equal(
    parseLifeDeployment({
      status: "LIVE",
      chainId: 1,
      address: "0x1111111111111111111111111111111111111111",
    }),
    null,
  );
  assert.equal(
    parseLifeDeployment({
      status: "STALE_LOCI_1",
      chainId: 97,
      address: "0x1111111111111111111111111111111111111111",
    }),
    null,
  );
});

test("parseMarketDeployment stays null until a real address exists", () => {
  assert.equal(
    parseMarketDeployment({ status: "UNDEPLOYED", chainId: 56, address: null }),
    null,
  );
  const row = parseMarketDeployment({
    status: "BSC_TESTNET",
    chainId: 97,
    address: "0x1111111111111111111111111111111111111111",
    soul: "0x2222222222222222222222222222222222222222",
    hive: "0x3333333333333333333333333333333333333333",
  });
  assert.equal(row.chainId, 97);
  assert.equal(row.address, "0x1111111111111111111111111111111111111111");
});

test("loadOpenListings still probes hinted token ids when logs are empty", async () => {
  const market = {
    filters: { Listed: () => "listed", Relisted: () => "relisted" },
    listings: async (id) =>
      Number(id) === 4
        ? {
            seller: "0x1111111111111111111111111111111111111111",
            lifeId: "0xab",
            price: 5n,
            listedAt: 9n,
          }
        : {
            seller: "0x0000000000000000000000000000000000000000",
            lifeId: "0x00",
            price: 0n,
            listedAt: 0n,
          },
    runner: { provider: { getBlockNumber: async () => 10 } },
    queryFilter: async () => [],
  };
  const rows = await loadOpenListings(market, 0, [4, 7]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tokenId, 4);
});

test("loadOpenListings probes soul supply when public logs are unreadable", async () => {
  let logCalls = 0;
  const market = {
    soul: async () => "0x2222222222222222222222222222222222222222",
    filters: { Listed: () => "listed", Relisted: () => "relisted" },
    listings: async (id) =>
      Number(id) === 1
        ? {
            seller: "0x1111111111111111111111111111111111111111",
            lifeId: "0xab",
            price: 5n,
            listedAt: 9n,
          }
        : {
            seller: "0x0000000000000000000000000000000000000000",
            lifeId: "0x00",
            price: 0n,
            listedAt: 0n,
          },
    runner: {
      provider: {
        getBlockNumber: async () => 9000,
        call: async () =>
          "0x0000000000000000000000000000000000000000000000000000000000000002",
      },
    },
    queryFilter: async () => {
      logCalls += 1;
      throw new Error("limit exceeded");
    },
  };
  const rows = await loadOpenListings(market, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tokenId, 1);
  assert.equal(logCalls, 0);
});

test("queryAllLogs stops after consecutive public RPC failures", async () => {
  const calls = [];
  const contract = {
    runner: { provider: { getBlockNumber: async () => 9000 } },
    queryFilter: async (_filter, from, to) => {
      calls.push([from, to]);
      throw new Error("could not coalesce error");
    },
  };
  const logs = await queryAllLogs(contract, {}, 0, 2000, 2);
  assert.equal(logs.length, 0);
  assert.equal(calls.length, 2);
});

test("explainMarketError keeps Unauthorized off the breed copy", () => {
  const tx = (key) =>
    ({
      "market.wrongPrice": "exact bnb",
      "market.needOwner": "owner only",
      "kin.breedNeed": "breed",
    })[key];
  assert.equal(
    explainMarketError({ shortMessage: "WrongPrice()" }, tx),
    "exact bnb",
  );
  assert.equal(
    explainMarketError({ shortMessage: "Unauthorized()" }, tx),
    "owner only",
  );
});

test("explainLifeError maps hatch limit without leaking revert noise", () => {
  const tx = (key) =>
    ({
      "hatch.limit": "already hatched",
      "hatch.pendingBusy": "pending",
      "hatch.soldOut": "sold out",
      "hatch.notReady": "not ready",
      "hatch.unavailable": "unavailable",
      "hatch.walletBusy": "wallet busy",
      "kin.wrongFee": "wrong fee",
    })[key];
  assert.equal(
    explainLifeError({ shortMessage: "HatchLimit()" }, tx),
    "already hatched",
  );
  assert.equal(explainLifeError({ message: "PendingHatch()" }, tx), "pending");
  assert.equal(
    explainLifeError({ message: "HatchNotReady()" }, tx),
    "not ready",
  );
  assert.equal(
    explainLifeError({ message: "HatchUnavailable()" }, tx),
    "unavailable",
  );
  assert.equal(
    explainLifeError(
      { message: "Already processing eth_requestAccounts. Please wait." },
      tx,
    ),
    "wallet busy",
  );
  assert.equal(
    explainLifeError({ message: "network down" }, tx),
    "network down",
  );
  assert.equal(
    explainLifeError({ shortMessage: "WrongFee()" }, tx),
    "wrong fee",
  );
  const rpcTx = (key) => (key === "hatch.rpcLimit" ? "rpc limit" : key);
  assert.equal(
    explainLifeError(
      {
        message:
          'could not coalesce error (error={ "code": -32005, "message": "limit exceeded" })',
      },
      rpcTx,
    ),
    "rpc limit",
  );
});

test("requestLifeAccounts prompts first and never probes eth_accounts", async () => {
  const calls = [];
  const ethereum = {
    async request({ method }) {
      calls.push(method);
      if (method === "eth_requestAccounts") return ["0xabc"];
      if (method === "eth_accounts") return [];
      throw new Error(method);
    },
  };
  assert.deepEqual(await requestLifeAccounts(ethereum), ["0xabc"]);
  assert.deepEqual(calls, ["eth_requestAccounts"]);
  calls.length = 0;
  assert.equal(await requestLifeAccounts(ethereum, { silent: true }), null);
  assert.deepEqual(calls, ["eth_accounts"]);
});

test("queryLatestLog walks recent chunks and ignores wide-scan failures", async () => {
  const calls = [];
  const contract = {
    runner: { provider: { getBlockNumber: async () => 9000 } },
    queryFilter: async (_filter, from, to) => {
      calls.push([from, to]);
      if (to === 9000) throw new Error("limit exceeded");
      return [{ args: { tokenId: 1 } }];
    },
  };
  const last = await queryLatestLog(contract, {}, 0, 2000);
  assert.deepEqual(last, { args: { tokenId: 1 } });
  assert.deepEqual(calls[0], [7001, 9000]);
  assert.deepEqual(calls[1], [5001, 7000]);
});

test("hatchPhase opens a two-block wait and a 256-block complete window", () => {
  const pending = { requestId: 1, entropyBlock: 100 };
  assert.equal(hatchPhase(null, 200), "none");
  assert.equal(hatchPhase(pending, 0), "wait");
  assert.equal(hatchPhase(pending, 100), "wait");
  assert.equal(hatchPhase(pending, 101), "ready");
  assert.equal(hatchPhase(pending, 356), "ready");
  assert.equal(hatchPhase(pending, 357), "expired");
});

test("readPendingHatch ignores empty or burned request slots", async () => {
  const soul = {
    pendingRequest: async () => 1n,
    requests: async () => ({
      recipient: "0x0000000000000000000000000000000000000000",
      entropyBlock: 10n,
    }),
  };
  assert.equal(
    await readPendingHatch(soul, "0x1111111111111111111111111111111111111111"),
    null,
  );
  soul.requests = async () => ({
    recipient: "0x1111111111111111111111111111111111111111",
    entropyBlock: 99n,
  });
  assert.deepEqual(
    await readPendingHatch(soul, "0x1111111111111111111111111111111111111111"),
    {
      requestId: 1,
      recipient: "0x1111111111111111111111111111111111111111",
      entropyBlock: 99,
    },
  );
});

test("formatBreedPrice and readBreedBuy keep hold vs fill separate", () => {
  assert.equal(formatBreedPrice(0n), "0");
  assert.equal(formatBreedPrice("2000000000000000"), "0.002");
  const kin = {
    interface: {
      parseLog(log) {
        if (log.topics?.[0] === "held") {
          return { name: "BreedBuyHeld", args: { paid: 1n, reason: 2 } };
        }
        if (log.topics?.[0] === "filled") {
          return { name: "BreedBuyFilled", args: { paid: 1n, amountOut: 9n } };
        }
        throw new Error("no");
      },
    },
  };
  assert.equal(
    readBreedBuy({ logs: [{ topics: ["held"] }] }, kin).status,
    "held",
  );
  assert.equal(
    readBreedBuy({ logs: [{ topics: ["filled"] }] }, kin).status,
    "filled",
  );
  assert.equal(readBreedBuy({ logs: [] }, kin).status, "none");
});
