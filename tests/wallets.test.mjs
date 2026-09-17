import test from "node:test";
import assert from "node:assert/strict";
import {
  WALLET_CATALOG,
  discoverInjected,
  guessLegacyName,
  pageUrl,
  readStoredRdns,
  recallAnnouncedWallet,
  walletAppUrl,
  writeStoredRdns,
} from "../src/life/wallets.mjs";

test("recommended catalog never auto-opens Uniswap", () => {
  assert.equal(
    WALLET_CATALOG.some((row) => /uniswap/i.test(row.name + row.id)),
    false,
  );
});

test("discoverInjected lists EIP-6963 wallets and never requests accounts", () => {
  const host = new EventTarget();
  let requested = false;
  const provider = {
    request() {
      requested = true;
      throw new Error("should not request");
    },
  };
  host.addEventListener("eip6963:requestProvider", () => {
    host.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { uuid: "mm", rdns: "io.metamask", name: "MetaMask", icon: "" },
          provider,
        },
      }),
    );
    host.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: {
            uuid: "uni",
            rdns: "org.uniswap.app",
            name: "Uniswap Wallet",
            icon: "",
          },
          provider: { request() {} },
        },
      }),
    );
  });
  const found = discoverInjected(host);
  assert.deepEqual(
    found.map((row) => row.rdns),
    ["io.metamask", "org.uniswap.app"],
  );
  assert.equal(requested, false);
});

test("discoverInjected falls back to window.ethereum without locking onto it", () => {
  const host = new EventTarget();
  host.ethereum = { isUniswapWallet: true, request() {} };
  const found = discoverInjected(host);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, "Uniswap Wallet");
  assert.equal(found[0].provider, host.ethereum);
});

test("MetaMask mobile link opens the current page in the app", () => {
  const metamask = WALLET_CATALOG.find((row) => row.id === "metamask");
  assert.equal(
    walletAppUrl(metamask, "https://immortalflies.com/?lang=zh"),
    "https://metamask.app.link/dapp/immortalflies.com/?lang=zh",
  );
});

test("recall prefers the wallet the user last chose", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  writeStoredRdns("io.metamask", storage);
  assert.equal(readStoredRdns(storage), "io.metamask");
  const host = new EventTarget();
  host.addEventListener("eip6963:requestProvider", () => {
    host.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { uuid: "mm", rdns: "io.metamask", name: "MetaMask" },
          provider: { id: "mm" },
        },
      }),
    );
  });
  assert.equal(recallAnnouncedWallet(host, storage).provider.id, "mm");
});

test("pageUrl and legacy names stay deterministic", () => {
  assert.equal(
    pageUrl({ location: { href: "https://example.com/habitat.html" } }),
    "https://example.com/habitat.html",
  );
  assert.equal(guessLegacyName({ isMetaMask: true }), "MetaMask");
  assert.equal(guessLegacyName({ isUniswapWallet: true }), "Uniswap Wallet");
});
