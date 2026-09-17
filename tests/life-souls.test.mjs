import test from "node:test";
import assert from "node:assert/strict";
import {
  hydrateColony,
  loadColony,
  pickFocusedSoul,
  querySoulId,
} from "../src/life/souls.mjs";

function mockSoul(cards, total = cards.length) {
  return {
    totalSupply: async () => total,
    ownerOf: async (id) => cards[id - 1].owner,
    lifeId: async (id) => cards[id - 1].life,
    getGenome: async (id) => cards[id - 1].genome,
    givenName: async (id) => cards[id - 1].givenName || "",
    getDescent: async (id) =>
      cards[id - 1].descent || { parentA: 0n, parentB: 0n, generation: 0n },
    filters: { Born: () => ({}) },
    queryFilter: async () => {
      throw new Error(
        'could not coalesce error (error={ "message": "limit exceeded" })',
      );
    },
  };
}

test("loadColony returns empty without scanning logs", async () => {
  const colony = await loadColony(mockSoul([]), {
    genesisRoot: `0x${"11".repeat(32)}`,
    chainId: 56,
    fieldCount: 8,
  });
  assert.deepEqual(colony, []);
});

test("loadColony reads sequential token ids even if getLogs is refused", async () => {
  const life = `0x${"ab".repeat(32)}`;
  const colony = await loadColony(
    mockSoul([
      {
        owner: "0x1111111111111111111111111111111111111111",
        life,
        genome: { seed: 7, bornAt: 1, bornBlock: 2 },
        givenName: "Dot",
      },
    ]),
    { genesisRoot: `0x${"11".repeat(32)}`, chainId: 56, fieldCount: 8 },
  );
  assert.equal(colony.length, 1);
  assert.equal(colony[0].tokenId, 1);
  assert.equal(colony[0].givenName, "Dot");
  assert.equal(colony[0].seed, 7);
});

test("loadColony keeps readable souls when one token read fails", async () => {
  const soul = mockSoul([
    {
      owner: "0x1111111111111111111111111111111111111111",
      life: `0x${"ab".repeat(32)}`,
      genome: { seed: 7, bornAt: 1, bornBlock: 2 },
      givenName: "Dot",
    },
    {
      owner: "0x2222222222222222222222222222222222222222",
      life: `0x${"cd".repeat(32)}`,
      genome: { seed: 8, bornAt: 1, bornBlock: 2 },
    },
  ]);
  const real = soul.ownerOf;
  soul.ownerOf = async (id) => {
    if (Number(id) === 2) throw new Error("rate limited");
    return real(id);
  };
  const colony = await loadColony(soul, {
    genesisRoot: `0x${"11".repeat(32)}`,
    chainId: 56,
    fieldCount: 8,
  });
  assert.equal(colony.length, 1);
  assert.equal(colony[0].tokenId, 1);
});

test("querySoulId only accepts positive token ids", () => {
  assert.equal(querySoulId("?soul=2&card=1"), 2);
  assert.equal(querySoulId("soul=0"), 0);
  assert.equal(querySoulId(""), 0);
});

test("pickFocusedSoul never falls back to #1 when a query id is waiting", () => {
  const first = { tokenId: 1 };
  const mine = { tokenId: 2 };
  assert.equal(pickFocusedSoul([first, mine], { queryId: 2 }).tokenId, 2);
  assert.equal(
    pickFocusedSoul([first], { queryId: 2, current: mine }).tokenId,
    2,
  );
  assert.equal(pickFocusedSoul([first], { queryId: 2 }), null);
  assert.equal(pickFocusedSoul([first, mine], { current: null }).tokenId, 1);
  assert.equal(pickFocusedSoul([first, mine], { current: mine }).tokenId, 2);
});

test("hydrateColony fetches a tagged soul missing from the roster", async () => {
  const extras = {
    genesisRoot: `0x${"11".repeat(32)}`,
    chainId: 56,
    fieldCount: 8,
  };
  const cards = [
    {
      owner: "0x1111111111111111111111111111111111111111",
      life: `0x${"ab".repeat(32)}`,
      genome: { seed: 7, bornAt: 1, bornBlock: 2 },
      givenName: "Dot",
    },
    {
      owner: "0x2222222222222222222222222222222222222222",
      life: `0x${"cd".repeat(32)}`,
      genome: { seed: 8, bornAt: 1, bornBlock: 2 },
      givenName: "Pip",
    },
  ];
  const { roster, rosterError } = await hydrateColony(
    mockSoul(cards, 1),
    extras,
    2,
  );
  assert.equal(rosterError, false);
  assert.equal(
    roster.some((item) => item.tokenId === 1),
    true,
  );
  assert.equal(
    roster.some((item) => item.tokenId === 2),
    true,
  );
  assert.equal(roster.find((item) => item.tokenId === 2).givenName, "Pip");
});

test("hydrateColony still returns a share-link soul when the roster scan fails", async () => {
  const extras = {
    genesisRoot: `0x${"11".repeat(32)}`,
    chainId: 56,
    fieldCount: 8,
  };
  const soul = mockSoul([
    {
      owner: "0x1111111111111111111111111111111111111111",
      life: `0x${"ab".repeat(32)}`,
      genome: { seed: 7, bornAt: 1, bornBlock: 2 },
      givenName: "Dot",
    },
  ]);
  soul.totalSupply = async () => {
    throw new Error("rpc refused");
  };
  const { roster, rosterError } = await hydrateColony(soul, extras, 1);
  assert.equal(rosterError, false);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].tokenId, 1);
});
