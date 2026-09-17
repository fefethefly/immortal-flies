import { readPendingHatch, readPendingBreed } from "./chain.mjs";

// Each wallet/deployment change invalidates every outstanding read or receipt callback.
export function createRequestScope() {
  let revision = 0;
  return {
    invalidate() { revision++; },
    capture() {
      const captured = revision;
      const isCurrent = () => captured === revision;
      return {
        isCurrent,
        check() { if (!isCurrent()) throw new Error("Wallet session changed"); },
      };
    },
  };
}

export async function readWalletRequests(reader, address) {
  const results = await Promise.allSettled([
    readPendingHatch(reader.soul, address),
    readPendingBreed(reader.kin, address),
    reader.soul.hatched(address),
  ]);
  // A failing module must not hide the other module's recoverable request.
  return Object.fromEntries(results.flatMap((result, index) => result.status === "fulfilled"
    ? [[["pending", "breedPending", "used"][index], index === 2 ? Boolean(result.value) : result.value]]
    : []));
}

export function watchWallet(ethereum, { scope, onReset, onAccount }) {
  let stopped = false;
  async function reload(accounts) {
    scope.invalidate();
    const guard = scope.capture();
    onReset();
    try {
      const list = accounts ?? await ethereum.request({ method: "eth_accounts" });
      if (!stopped && guard.isCurrent()) await onAccount(list?.[0] || "", guard);
    } catch { /* wallet stays reset; explicit connect can retry */ }
  }
  const onAccounts = (accounts) => { void reload(accounts); };
  const onChain = () => { void reload(); };
  const onDisconnect = () => { void reload([]); };
  ethereum.on?.("accountsChanged", onAccounts);
  ethereum.on?.("chainChanged", onChain);
  ethereum.on?.("disconnect", onDisconnect);
  void reload();
  return () => {
    stopped = true;
    scope.invalidate();
    ethereum.removeListener?.("accountsChanged", onAccounts);
    ethereum.removeListener?.("chainChanged", onChain);
    ethereum.removeListener?.("disconnect", onDisconnect);
  };
}

// Exactly one timer, irrespective of request kind; slow RPCs never overlap.
export function startPendingPoll({ pending, breedPending, readHead, onHead, schedule = setTimeout, cancel = clearTimeout }) {
  if (!pending && !breedPending) return () => {};
  let stopped = false;
  let timer;
  async function tick() {
    try {
      const now = await readHead();
      if (!stopped) onHead(now);
    } catch { /* retain last successful head and retry */ }
    if (!stopped) timer = schedule(tick, 2000);
  }
  void tick();
  return () => { stopped = true; if (timer !== undefined) cancel(timer); };
}
