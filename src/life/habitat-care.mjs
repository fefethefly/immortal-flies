export function isOwnedSoul(soul, wallet) {
  const addr = String(wallet || "").toLowerCase();
  const owner = String(soul?.owner || "").toLowerCase();
  return Boolean(addr && owner && owner === addr);
}

export function careSoulOf(souls = [], wallet, selected) {
  if (!String(wallet || "").trim()) return null;
  const mine = souls.filter((soul) => isOwnedSoul(soul, wallet));
  if (!mine.length) return null;
  return mine.find((soul) => soul.tokenId === selected?.tokenId) || mine[0];
}

export function habitatCareSoul({
  souls = [],
  wallet,
  selected,
  walletReady = false,
} = {}) {
  if (!walletReady) return null;
  return careSoulOf(souls, wallet, selected);
}
