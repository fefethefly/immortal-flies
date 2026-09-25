import deployment from "../public/contract/life/ImmortalSoul.deployment.json" with { type: "json" };

// Present the shipped mainnet identity manifest, not browser wallet state or
// a mock specimen. Changing an environment must never relabel testnet as live.
if (deployment.status !== "LIVE" || deployment.chainId !== 56)
  throw new Error(
    "The homepage identity requires the live BNB mainnet manifest.",
  );

export const homeIdentity = Object.freeze({
  address: deployment.address,
  shortAddress: `${deployment.address.slice(0, 8)}…${deployment.address.slice(-6)}`,
  explorer: deployment.explorer,
  transaction: `https://bscscan.com/tx/${deployment.txHash}`,
});

const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

// A scroll-controlled artistic transition. It does not write a checkpoint or
// claim that the local demonstration has acquired an on-chain identity.
export function sampleIdentityTransition(progress) {
  const enter = ease((progress - 0.12) / 0.3);
  const leave = ease((progress - 0.62) / 0.3);
  const fold = enter * (1 - leave);
  return {
    fold,
    bodyOpacity: 1 - ease(fold / 0.8),
    particleOpacity: Math.sin(fold * Math.PI * 0.87),
    focus: ease(fold / 0.8),
  };
}
