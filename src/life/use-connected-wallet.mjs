import { useCallback, useEffect, useState } from "react";
import { connectLife } from "./chain.mjs";
import {
  getActiveWallet,
  hydrateActiveWallet,
  subscribeActiveWallet,
} from "./wallets.mjs";
import { useWalletPick } from "./wallet-pick.jsx";

export function useConnectedWallet(deployment, tx) {
  const { pick, dialog } = useWalletPick(tx);
  const [wallet, setWallet] = useState("");
  const [provider, setProvider] = useState(
    () => getActiveWallet().provider || null,
  );

  useEffect(() => {
    hydrateActiveWallet();
    return subscribeActiveWallet((state) => {
      setProvider(state.provider || null);
      if (!state.provider) setWallet("");
    });
  }, []);

  useEffect(() => {
    if (!deployment?.address || !provider) {
      if (!provider) setWallet("");
      return undefined;
    }
    let gone = false;
    connectLife(provider, deployment, undefined, { silent: true })
      .then((session) => {
        if (!gone && session) setWallet(session.address);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [deployment, provider]);

  const connect = useCallback(async () => {
    const choice = await pick({ force: true });
    if (!choice || choice.kind !== "injected") return null;
    if (!deployment?.address) return null;
    const session = await connectLife(choice.provider, deployment);
    if (session) setWallet(session.address);
    return session;
  }, [deployment, pick]);

  return { wallet, setWallet, provider, pick, dialog, connect };
}
