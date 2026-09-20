import test from "node:test";
import assert from "node:assert/strict";
import {
  WALLET_CATALOG,
  discoverInjected,
  getActiveWallet,
  guessLegacyName,
  hydrateActiveWallet,
  pageUrl,
  readStoredRdns,
  recallAnnouncedWallet,
  setActiveWallet,
  shouldSkipWalletPick,
  walletAppUrl,
  writeStoredChoice,
  writeStoredRdns,
} from "../src/life/wallets.mjs";
import {
  hatchIntentHref,
  parseHatchIntent,
  withHatchIntent,
} from "../src/life/hatch-intent.mjs";

function memoryStore() {
  const store = new Map();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
}

function resetWallet() {
  setActiveWallet(null, null);
}

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
  resetWallet();
  const storage = memoryStore();
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

test("recall keeps a live session and remembers legacy wallets without rdns", () => {
  resetWallet();
  const storage = memoryStore();
  const host = new EventTarget();
  host.ethereum = { isMetaMask: true, id: "legacy-mm" };
  writeStoredChoice({ name: "MetaMask", id: "legacy-0" }, storage);
  const recalled = recallAnnouncedWallet(host, storage);
  assert.equal(recalled.name, "MetaMask");
  assert.equal(recalled.provider, host.ethereum);

  setActiveWallet({ id: "session" }, { name: "Session", rdns: "" }, storage);
  assert.equal(recallAnnouncedWallet(host, storage).provider.id, "session");
  assert.equal(getActiveWallet().provider.id, "session");
  resetWallet();
});

test("hydrate restores the last injected wallet into the shared session", () => {
  resetWallet();
  const storage = memoryStore();
  const host = new EventTarget();
  host.addEventListener("eip6963:requestProvider", () => {
    host.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { uuid: "mm", rdns: "io.metamask", name: "MetaMask" },
          provider: { id: "hydrated" },
        },
      }),
    );
  });
  writeStoredChoice({ rdns: "io.metamask", name: "MetaMask" }, storage);
  const found = hydrateActiveWallet(host, storage);
  assert.equal(found.provider.id, "hydrated");
  assert.equal(getActiveWallet().provider.id, "hydrated");
  resetWallet();
});

test("wallet picker stays visible until the page already has a live session", () => {
  assert.equal(shouldSkipWalletPick({}, { provider: { id: "mm" } }), true);
  assert.equal(
    shouldSkipWalletPick({ force: true }, { provider: { id: "mm" } }),
    false,
  );
  assert.equal(shouldSkipWalletPick({ force: true }, null), false);
  assert.equal(shouldSkipWalletPick({}, null), false);
});

test("hatch intent survives a mobile wallet hop", () => {
  assert.deepEqual(parseHatchIntent("https://immortalflies.com/"), {
    open: false,
    given: "",
  });
  assert.deepEqual(
    parseHatchIntent("https://immortalflies.com/?hatch=1&given=Ember"),
    {
      open: true,
      given: "Ember",
    },
  );
  assert.deepEqual(parseHatchIntent("https://immortalflies.com/#hatch"), {
    open: true,
    given: "",
  });
  assert.equal(
    withHatchIntent("https://immortalflies.com/?lang=zh", "  Ember  "),
    "/?lang=zh&hatch=1&given=Ember",
  );
  assert.equal(
    hatchIntentHref("https://immortalflies.com/?lang=zh", "Moss"),
    "https://immortalflies.com/?lang=zh&hatch=1&given=Moss",
  );
  const metamask = WALLET_CATALOG.find((row) => row.id === "metamask");
  assert.match(
    walletAppUrl(
      metamask,
      hatchIntentHref("https://immortalflies.com/?lang=zh", "Moss"),
    ),
    /immortalflies\.com\/\?lang=zh&hatch=1&given=Moss/,
  );
});

test("pageUrl and legacy names stay deterministic", () => {
  assert.equal(
    pageUrl({ location: { href: "https://example.com/habitat.html" } }),
    "https://example.com/habitat.html",
  );
  assert.equal(guessLegacyName({ isMetaMask: true }), "MetaMask");
  assert.equal(guessLegacyName({ isUniswapWallet: true }), "Uniswap Wallet");
});
