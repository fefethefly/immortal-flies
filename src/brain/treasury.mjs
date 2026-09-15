import { integer, identifier, requireValue } from "./codec.mjs";
import { emptyBook, fillBook, navOf } from "./book.mjs";
import { MIN_BNB } from "../swarm.mjs";

/**
 * Venue fee → hive vault → compound / buyback.
 * Tax is a protocol fee on the organism venue, not a token transfer tax.
 * Deposits never count as profit. Buyback only spends realized surplus.
 */
export const TREASURY_POLICY = Object.freeze({
  id: "hive-80",
  version: "1",
  feeBps: 500,
  vaultBps: 8000,
  reserveBps: 2000,
  compoundBps: 7000,
  buybackBps: 3000,
});

export function createTreasury({ policy = TREASURY_POLICY } = {}) {
  requireValue(policy.vaultBps + policy.reserveBps === 10000, "TREASURY_SPLIT");
  requireValue(policy.compoundBps + policy.buybackBps === 10000, "SURPLUS_SPLIT");
  return {
    schema: "iff.treasury/1",
    policy: { ...policy },
    book: emptyBook(),
    shares: 0,
    deposited: 0,
    feesIn: 0,
    reserve: 0,
    highWater: 0,
    buybackBudget: 0,
    compounded: 0,
    admissions: [],
  };
}

export function collectVenueFee(treasury, notional) {
  integer(notional, 0, Number.MAX_SAFE_INTEGER, "成交名义");
  const tax = Math.trunc((notional * treasury.policy.feeBps) / 10000);
  const toVault = Math.trunc((tax * treasury.policy.vaultBps) / 10000);
  const toReserve = tax - toVault;
  treasury.book.bnb += toVault;
  treasury.reserve += toReserve;
  treasury.feesIn += tax;
  treasury.highWater += toVault;
  return { tax, toVault, toReserve };
}

/** External capital. Mints shares against current vault NAV. Not yield. */
export function injectCapital(treasury, amount, owner, price) {
  integer(amount, 1, Number.MAX_SAFE_INTEGER, "注资");
  identifier(owner);
  integer(price, 1, Number.MAX_SAFE_INTEGER, "标记价格");
  const nav = navOf(treasury.book, price);
  const shares = treasury.shares === 0 || nav === 0 ? amount : Math.trunc((amount * treasury.shares) / nav);
  requireValue(shares > 0, "SHARE_DUST", "注资过小，不能铸份额");
  treasury.book.bnb += amount;
  treasury.shares += shares;
  treasury.deposited += amount;
  treasury.highWater += amount;
  const row = { schema: "iff.capital/1", kind: "deposit", owner, amount, shares, audit: "SIM" };
  treasury.admissions.unshift(row);
  treasury.admissions = treasury.admissions.slice(0, 200);
  return row;
}

export function redeemCapital(treasury, shares, owner, price) {
  integer(shares, 1, treasury.shares || 1, "份额");
  identifier(owner);
  integer(price, 1, Number.MAX_SAFE_INTEGER, "标记价格");
  const nav = navOf(treasury.book, price);
  const amount = Math.trunc((shares * nav) / treasury.shares);
  requireValue(amount > 0 && amount <= treasury.book.bnb, "REDEEM_CASH", "金库现金不足以赎回");
  treasury.book.bnb -= amount;
  treasury.shares -= shares;
  treasury.deposited = Math.max(0, treasury.deposited - amount);
  treasury.highWater = Math.max(0, treasury.highWater - amount);
  const row = { schema: "iff.capital/1", kind: "redeem", owner, amount, shares, audit: "SIM" };
  treasury.admissions.unshift(row);
  return row;
}

export function tradeHive(treasury, intent, price, tick) {
  return fillBook(treasury.book, price, intent, tick, "hive");
}

export function surplusOf(treasury, price) {
  return Math.max(0, navOf(treasury.book, price) - treasury.highWater);
}

/**
 * Only realized NAV above high-water may be split.
 * Buyback is a budget, not a dividend, not a promise of token price.
 */
export function realizeSurplus(treasury, price) {
  integer(price, 1, Number.MAX_SAFE_INTEGER, "标记价格");
  const surplus = surplusOf(treasury, price);
  if (surplus < MIN_BNB) return { surplus: 0, compound: 0, buyback: 0 };
  const buybackWanted = Math.trunc((surplus * treasury.policy.buybackBps) / 10000);
  const buyback = Math.min(treasury.book.bnb, buybackWanted);
  const compound = surplus - buyback;
  treasury.book.bnb -= buyback;
  treasury.buybackBudget += buyback;
  treasury.compounded += compound;
  treasury.highWater = navOf(treasury.book, price);
  return { surplus, compound, buyback };
}

export function treasurySnapshot(treasury, price) {
  return {
    schema: treasury.schema,
    policy: `${treasury.policy.id}@${treasury.policy.version}`,
    nav: navOf(treasury.book, price),
    cash: treasury.book.bnb,
    inventory: treasury.book.token,
    shares: treasury.shares,
    deposited: treasury.deposited,
    feesIn: treasury.feesIn,
    reserve: treasury.reserve,
    highWater: treasury.highWater,
    surplus: surplusOf(treasury, price),
    buybackBudget: treasury.buybackBudget,
    compounded: treasury.compounded,
    trades: treasury.book.trades,
    realized: treasury.book.realized,
  };
}
