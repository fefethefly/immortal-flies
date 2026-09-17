export const WALLET_RDNS_KEY = "iff.wallet.rdns";

export const WALLET_CATALOG = Object.freeze([
  {
    id: "metamask",
    rdns: "io.metamask",
    name: "MetaMask",
    mark: "MM",
    desktop: "https://metamask.io/download",
    mobile: (url) => {
      const page = new URL(url);
      return `https://metamask.app.link/dapp/${page.host}${page.pathname}${page.search}`;
    },
  },
  {
    id: "tokenpocket",
    rdns: "pro.tokenpocket",
    name: "TokenPocket",
    mark: "TP",
    desktop: "https://www.tokenpocket.pro/en/download/pc",
    mobile: (url) =>
      `tpdapp://open?params=${encodeURIComponent(JSON.stringify({ url, chain: "BSC" }))}`,
  },
  {
    id: "trust",
    rdns: "com.trustwallet.app",
    name: "Trust Wallet",
    mark: "TW",
    desktop: "https://trustwallet.com/browser-extension",
    mobile: (url) =>
      `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(url)}`,
  },
  {
    id: "okx",
    rdns: "com.okex.wallet",
    name: "OKX Wallet",
    mark: "OKX",
    desktop: "https://www.okx.com/web3/download",
    mobile: (url) =>
      `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}`,
  },
  {
    id: "binance",
    rdns: "com.binance.wallet",
    name: "Binance Wallet",
    mark: "BNB",
    desktop: "https://www.binance.com/en/web3wallet",
    mobile: (url) =>
      `bnc://app.binance.com/cedefi/dapp?url=${encodeURIComponent(url)}`,
  },
  {
    id: "bitget",
    rdns: "com.bitget.web3ext",
    name: "Bitget Wallet",
    mark: "BG",
    desktop: "https://web3.bitget.com/en/wallet-download",
    mobile: (url) =>
      `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}`,
  },
  {
    id: "rabby",
    rdns: "io.rabby",
    name: "Rabby",
    mark: "RB",
    desktop: "https://rabby.io",
  },
]);

const listeners = new Set();
let active = { provider: null, info: null };

export function isMobileBrowser(host = globalThis) {
  const ua = host.navigator?.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

export function guessLegacyName(ethereum) {
  if (!ethereum) return "Browser wallet";
  if (ethereum.isTokenPocket || ethereum.isTp) return "TokenPocket";
  if (ethereum.isOkxWallet || ethereum.isOKExWallet) return "OKX Wallet";
  if (ethereum.isTrust || ethereum.isTrustWallet) return "Trust Wallet";
  if (ethereum.isBitKeep || ethereum.isBitget) return "Bitget Wallet";
  if (ethereum.isBinance) return "Binance Wallet";
  if (ethereum.isRabby) return "Rabby";
  if (ethereum.isUniswapWallet || ethereum.isUniswap) return "Uniswap Wallet";
  if (ethereum.isCoinbaseWallet) return "Coinbase Wallet";
  if (ethereum.isMetaMask && !ethereum.isBraveWallet) return "MetaMask";
  return "Browser wallet";
}

export function catalogByRdns(rdns) {
  return WALLET_CATALOG.find((row) => row.rdns === rdns) || null;
}

export function discoverInjected(host = globalThis) {
  const win = host.window ?? host;
  if (!win?.addEventListener) return [];
  const found = new Map();
  const onAnnounce = (event) => {
    const { info, provider } = event.detail || {};
    if (!info?.uuid || !provider) return;
    found.set(info.uuid, {
      id: info.rdns || info.uuid,
      rdns: info.rdns || "",
      name: info.name || "Wallet",
      icon: info.icon || "",
      mark: catalogByRdns(info.rdns)?.mark || initials(info.name),
      provider,
    });
  };
  win.addEventListener("eip6963:announceProvider", onAnnounce);
  win.dispatchEvent(new Event("eip6963:requestProvider"));
  win.removeEventListener("eip6963:announceProvider", onAnnounce);
  if (!found.size && win.ethereum) {
    const list = Array.isArray(win.ethereum.providers)
      ? win.ethereum.providers
      : [win.ethereum];
    list.forEach((provider, index) => {
      const name = guessLegacyName(provider);
      found.set(`legacy-${index}`, {
        id: `legacy-${index}`,
        rdns: "",
        name,
        icon: "",
        mark: initials(name),
        provider,
      });
    });
  }
  return [...found.values()];
}

export function pageUrl(host = globalThis) {
  return host.location?.href || "https://immortalflies.com/";
}

export function walletAppUrl(wallet, url) {
  return wallet.mobile?.(url || pageUrl()) || "";
}

export function openWalletApp(
  wallet,
  url,
  assign = (href) => {
    globalThis.location.assign(href);
  },
) {
  const href = walletAppUrl(wallet, url);
  if (!href) return "";
  assign(href);
  return href;
}

export function readStoredRdns(store) {
  try {
    const storage = store ?? globalThis.localStorage;
    const value = storage?.getItem(WALLET_RDNS_KEY);
    return value || "";
  } catch {
    return "";
  }
}

export function writeStoredRdns(rdns, store) {
  try {
    const storage = store ?? globalThis.localStorage;
    if (!rdns) storage?.removeItem(WALLET_RDNS_KEY);
    else storage?.setItem(WALLET_RDNS_KEY, rdns);
  } catch {
    /* private mode */
  }
}

export function recallAnnouncedWallet(host = globalThis, store) {
  const rdns = readStoredRdns(store);
  if (!rdns) return null;
  return discoverInjected(host).find((row) => row.rdns === rdns) || null;
}

export function getActiveWallet() {
  return active;
}

export function setActiveWallet(provider, info) {
  active = { provider: provider || null, info: info || null };
  if (info?.rdns) writeStoredRdns(info.rdns);
  listeners.forEach((fn) => fn(active));
  return active;
}

export function subscribeActiveWallet(fn) {
  listeners.add(fn);
  fn(active);
  return () => listeners.delete(fn);
}

function initials(name) {
  const parts = String(name || "W")
    .replace(/wallet/i, "")
    .trim()
    .split(/\s+/);
  if (parts[0]?.length >= 2 && parts.length === 1) return parts[0].slice(0, 3);
  return parts
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}
