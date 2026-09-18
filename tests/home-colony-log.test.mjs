import test from "node:test";
import assert from "node:assert/strict";
import { COLONY_LOG_LIMIT, colonyLog } from "../src/home-colony-log.mjs";
import { BNB_UNIT, TOKEN_UNIT, createSwarm, tickSwarm } from "../src/swarm.mjs";
import { t } from "../src/i18n.mjs";

function tx(key, vars) {
  return t("en", key, vars);
}

test("colony log stays blank when the book has no fills", () => {
  assert.deepEqual(
    colonyLog({ tick: 2813, trades: [], prices: [11170, 11200] }, tx),
    [],
  );
  assert.deepEqual(colonyLog({ tick: 0, trades: undefined }, tx), []);
});

test("colony log lists paper fills only, with stable keys and real ticks", () => {
  const trades = [
    { tick: 2813, flyId: 4, side: "BUY", amount: BNB_UNIT },
    { tick: 2804, flyId: 7, side: "SELL", amount: TOKEN_UNIT * 8 },
    { tick: 2799, flyId: 4, side: "HOLD", amount: 1 },
  ];
  const rows = colonyLog({ tick: 2813, trades, market: { mark: "IFS" } }, tx);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tick, 2813);
  assert.equal(rows[0].fresh, true);
  assert.equal(rows[1].tick, 2804);
  assert.equal(rows[1].fresh, false);
  assert.equal(rows[0].kind, "ACT");
  assert.match(rows[0].text, /BNB/);
  assert.doesNotMatch(rows[0].text, /IFL/);
  assert.match(rows[1].text, /IFS/);
  assert.doesNotMatch(rows[1].text, /IFL/);
  assert.ok(!rows.some((row) => row.kind === "HOLD" || row.kind === "SENSE"));
  const later = colonyLog({ tick: 2814, trades, market: { mark: "IFS" } }, tx);
  assert.equal(later[0].key, rows[0].key);
  assert.equal(later[0].fresh, false);
  assert.equal(later[1].key, rows[1].key);
});

test("colony log names the Kyber asset after the book marks USD", () => {
  const rows = colonyLog(
    {
      tick: 9,
      market: { mark: "USD", assetId: "WBNB" },
      trades: [
        {
          tick: 9,
          flyId: 2,
          side: "SELL",
          amount: TOKEN_UNIT,
          assetId: "WBNB",
        },
        { tick: 8, flyId: 2, side: "BUY", amount: 5_000_000, assetId: "WBNB" },
      ],
    },
    tx,
  );
  assert.match(rows[0].text, /WBNB/);
  assert.doesNotMatch(rows[0].text, /IFL|IFS/);
  assert.match(rows[1].text, /USDT/);
});

test("colony log does not pad a live swarm to five invented lines", () => {
  let swarm = createSwarm({ seed: 3700127, size: 6, cooldownTicks: 0 });
  for (let i = 0; i < 24; i += 1) swarm = tickSwarm(swarm);
  const rows = colonyLog(swarm, tx);
  assert.ok(rows.length <= Math.min(COLONY_LOG_LIMIT, swarm.trades.length));
  assert.equal(
    rows.length,
    swarm.trades
      .filter((row) => row.side === "BUY" || row.side === "SELL")
      .slice(0, COLONY_LOG_LIMIT).length,
  );
  for (const row of rows) {
    assert.equal(row.kind, "ACT");
    assert.ok(Number.isInteger(row.tick));
    assert.ok(swarm.trades.some((trade) => trade.tick === row.tick));
  }
});

test("colony log copy is paired and names the empty tape", () => {
  assert.match(t("en", "public.logEmpty"), /blank/);
  assert.match(t("zh", "public.logEmpty"), /空白/);
  assert.match(t("en", "public.logHint"), /invented volume/);
  assert.match(t("zh", "public.logHint"), /编造/);
  assert.match(t("en", "public.evBuy", { id: 3, amt: "0.0100 BNB" }), /BNB/);
  assert.match(t("zh", "public.evBuy", { id: 3, amt: "0.0100 BNB" }), /BNB/);
  assert.doesNotMatch(t("en", "public.evSell", { id: 3, amt: "1.0 WBNB" }), /IFL/);
  assert.doesNotMatch(t("zh", "public.evSell", { id: 3, amt: "1.0 WBNB" }), /IFL/);
});
