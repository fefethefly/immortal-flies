import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { hatchPhase, readPendingBreed } from "../src/life/chain.mjs";
import { createRequestScope, watchWallet, startPendingPoll, readWalletRequests } from "../src/life/request-state.mjs";

const address = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const kin = {
  pendingRequest: async (owner) => { assert.equal(owner, address); return 7n; },
  requests: async (id) => { assert.equal(id, 7); return [address, 1n, 2n, 100n]; },
};

test("refresh restores breed without a pending hatch and observes expiry boundary", async () => {
  const state = await readWalletRequests({ kin, soul: { pendingRequest: async () => 0n, hatched: async () => true } }, address);
  assert.equal(state.pending, null);
  assert.equal(state.used, true);
  assert.deepEqual(state.breedPending, { requestId: 7, recipient: address, parentA: 1, parentB: 2, entropyBlock: 100, paid: "0" });
  assert.equal(hatchPhase(state.breedPending, 100), "wait");
  assert.equal(hatchPhase(state.breedPending, 101), "ready");
  assert.equal(hatchPhase(state.breedPending, 356), "ready");
  assert.equal(hatchPhase(state.breedPending, 357), "expired");
  assert.equal(await readPendingBreed(null, address), null);
  assert.equal(await readPendingBreed({ ...kin, requests: async () => ["0x0000000000000000000000000000000000000000", 0n, 0n, 0n] }, address), null);
});

test("a failed hatch read does not discard restored breed", async () => {
  const state = await readWalletRequests({ kin, soul: { pendingRequest: async () => { throw Error("offline"); }, hatched: async () => true } }, address);
  assert.equal(state.breedPending.requestId, 7);
  assert.equal(state.used, true);
});

test("one nonoverlapping poller supports hatch-only, breed-only, or both and suppresses stopped results", async () => {
  for (const [pending, breedPending] of [[{}, null], [null, {}], [{}, {}]]) {
    const head = deferred();
    const values = [];
    const timers = new Map();
    let reads = 0;
    const stop = startPendingPoll({ pending, breedPending, readHead: () => { reads++; return head.promise; }, onHead: (n) => values.push(n), schedule: (fn) => { timers.set(1, fn); return 1; }, cancel: (id) => timers.delete(id) });
    assert.equal(reads, 1);
    assert.equal(timers.size, 0);
    head.resolve(101);
    await flush();
    assert.deepEqual(values, [101]);
    assert.equal(timers.size, 1);
    stop();
    assert.equal(timers.size, 0);
  }
  const head = deferred();
  let committed = false;
  const stop = startPendingPoll({ breedPending: {}, readHead: () => head.promise, onHead: () => { committed = true; } });
  stop(); head.resolve(200); await flush();
  assert.equal(committed, false);
});

test("wallet account/chain events reset immediately and stale async callbacks cannot commit", async () => {
  const ethereum = new EventEmitter();
  const initial = deferred();
  ethereum.request = () => initial.promise;
  const scope = createRequestScope();
  const accounts = [];
  let resets = 0;
  const stop = watchWallet(ethereum, { scope, onReset: () => resets++, onAccount: (account) => accounts.push(account) });
  const old = scope.capture();
  ethereum.emit("accountsChanged", [other]);
  await flush();
  assert.equal(resets, 2);
  assert.equal(old.isCurrent(), false);
  assert.throws(old.check, /Wallet session changed/);
  initial.resolve([address]); await flush();
  assert.deepEqual(accounts, [other]);
  ethereum.request = async () => [other];
  ethereum.emit("chainChanged", "0x61"); await flush();
  assert.equal(resets, 3);
  assert.deepEqual(accounts, [other, other]);
  ethereum.emit("accountsChanged", []); await flush();
  assert.equal(resets, 4);
  assert.equal(accounts.at(-1), "");
  const last = scope.capture();
  stop();
  assert.equal(last.isCurrent(), false);
  assert.equal(ethereum.listenerCount("accountsChanged"), 0);
  assert.equal(ethereum.listenerCount("chainChanged"), 0);
});


test("poll retries RPC failures and stays idle without either request", async () => {
  let reads = 0;
  let retry;
  const heads = [];
  const readHead = async () => { if (++reads === 1) throw Error("RPC down"); return 357; };
  startPendingPoll({ readHead, onHead: (n) => heads.push(n) });
  assert.equal(reads, 0);
  const stop = startPendingPoll({ breedPending: {}, readHead, onHead: (n) => heads.push(n), schedule: (fn) => { retry = fn; return 1; }, cancel: () => {} });
  await flush();
  assert.equal(reads, 1);
  assert.deepEqual(heads, []);
  await retry();
  assert.deepEqual(heads, [357]);
  stop();
});

test("wallet change while restoration is in flight cannot publish the previous account", async () => {
  const ethereum = new EventEmitter();
  ethereum.request = async () => [address];
  const reading = deferred();
  const committed = [];
  const stop = watchWallet(ethereum, {
    scope: createRequestScope(), onReset: () => {},
    async onAccount(account, guard) {
      if (account === address) await reading.promise;
      if (guard.isCurrent()) committed.push(account);
    },
  });
  await flush();
  ethereum.emit("accountsChanged", [other]);
  reading.resolve();
  await flush();
  assert.deepEqual(committed, [other]);
  stop();
});
