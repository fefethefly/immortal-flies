import { useEffect, useRef, useState } from "react";
import {
  createRequestScope,
  readWalletRequests,
  startPendingPoll,
  watchWallet,
} from "./request-state.mjs";
import {
  HATCH_HASH_WINDOW,
  hatchPhase,
  networkOf,
  openLifeReader,
  openReadProvider,
} from "./chain.mjs";
import { subscribeActiveWallet } from "./wallets.mjs";

export function useHatchWatch(deployment, onWallet) {
  const [wallet, setWallet] = useState("");
  const [pending, setPending] = useState(null);
  const [used, setUsed] = useState(false);
  const [blockNow, setBlockNow] = useState(0);

  const [breedPending, setBreedPending] = useState(null);
  const [walletEpoch, setWalletEpoch] = useState(0);
  const [provider, setProvider] = useState(null);
  const scope = useRef(createRequestScope()).current;
  const walletCallback = useRef(onWallet);
  walletCallback.current = onWallet;

  useEffect(
    () =>
      subscribeActiveWallet((state) => {
        setProvider(state.provider || null);
      }),
    [],
  );

  useEffect(() => {
    const reset = () => {
      setWallet("");
      walletCallback.current?.("");
      setPending(null);
      setBreedPending(null);
      setUsed(false);
      setBlockNow(0);
      setWalletEpoch((epoch) => epoch + 1);
    };
    if (!deployment || !provider) {
      scope.invalidate();
      reset();
      return () => scope.invalidate();
    }
    return watchWallet(provider, {
      scope,
      onReset: reset,
      async onAccount(address, guard) {
        if (!address) return;
        setWallet(address);
        walletCallback.current?.(address);
        const reader = await openLifeReader(deployment);
        if (!reader || !guard.isCurrent()) return;
        const state = await readWalletRequests(reader, address);
        if (!guard.isCurrent()) return;
        if ("pending" in state) setPending(state.pending);
        if ("breedPending" in state) setBreedPending(state.breedPending);
        if ("used" in state) setUsed(state.used);
      },
    });
  }, [deployment, provider, scope]);

  useEffect(() => {
    if (!deployment) return undefined;
    const guard = scope.capture();
    return startPendingPoll({
      pending,
      breedPending,
      readHead: async () => {
        const provider = await openReadProvider(networkOf(deployment.chainId));
        return provider.getBlockNumber();
      },
      onHead: (now) => {
        if (guard.isCurrent()) setBlockNow(now);
      },
    });
  }, [
    deployment,
    pending?.requestId,
    breedPending?.requestId,
    walletEpoch,
    scope,
  ]);

  return {
    scope,
    walletEpoch,
    breedPending,
    setBreedPending,
    wallet,
    setWallet,
    pending,
    setPending,
    used,
    setUsed,
    blockNow,
    setBlockNow,
    phase: hatchPhase(pending, blockNow),
    deadline: pending ? pending.entropyBlock + HATCH_HASH_WINDOW : 0,
  };
}
