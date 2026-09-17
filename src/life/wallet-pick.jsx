import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { connectLife } from "./chain.mjs";
import { useTx } from "../locale-context.jsx";
import {
  WALLET_CATALOG,
  discoverInjected,
  isMobileBrowser,
  openWalletApp,
  pageUrl,
  recallAnnouncedWallet,
  setActiveWallet,
} from "./wallets.mjs";
import "./wallet-pick.css";

function WalletMark({ wallet }) {
  if (wallet.icon) {
    return <img src={wallet.icon} alt="" width="28" height="28" />;
  }
  return <i className="wallet-mark">{wallet.mark || "?"}</i>;
}

function WalletPickDialog({ tx, onClose, onInjected, onDeeplink }) {
  const injected = discoverInjected();
  const mobile = isMobileBrowser();
  const sheet = useRef(null);
  useEffect(() => {
    const node = sheet.current?.querySelector("button, a");
    node?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const apps = WALLET_CATALOG.filter((row) => row.mobile);
  const installs = WALLET_CATALOG.filter((row) => row.desktop);
  return createPortal(
    <div className="wallet-veil" onClick={onClose}>
      <div
        ref={sheet}
        className="wallet-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-pick-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="wallet-pick-title">{tx("wallet.pickTitle")}</h2>
        <p>{tx(mobile ? "wallet.mobileLead" : "wallet.desktopLead")}</p>
        {injected.length ? (
          <section>
            <h3>{tx("wallet.installed")}</h3>
            {injected.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                className="wallet-row"
                onClick={() => onInjected(wallet)}
              >
                <WalletMark wallet={wallet} />
                <span>{wallet.name}</span>
                <small>{tx("wallet.use")}</small>
              </button>
            ))}
          </section>
        ) : mobile ? null : (
          <p>{tx("wallet.none")}</p>
        )}
        {mobile ? (
          <section>
            <h3>{tx("wallet.apps")}</h3>
            {apps.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                className="wallet-row"
                onClick={() => onDeeplink(wallet)}
              >
                <WalletMark wallet={wallet} />
                <span>{wallet.name}</span>
                <small>{tx("wallet.openApp")}</small>
              </button>
            ))}
          </section>
        ) : injected.length ? null : (
          <section>
            <h3>{tx("wallet.install")}</h3>
            {installs.map((wallet) => (
              <a
                key={wallet.id}
                className="wallet-row"
                href={wallet.desktop}
                target="_blank"
                rel="noreferrer"
              >
                <WalletMark wallet={wallet} />
                <span>{wallet.name}</span>
                <small>{tx("wallet.get")}</small>
              </a>
            ))}
          </section>
        )}
        <button type="button" className="wallet-cancel" onClick={onClose}>
          {tx("wallet.cancel")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function useWalletPick() {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const pending = useRef(null);

  const finish = useCallback((value) => {
    setOpen(false);
    pending.current?.(value);
    pending.current = null;
  }, []);

  const pick = useCallback(() => {
    return new Promise((resolve) => {
      const recalled = recallAnnouncedWallet();
      if (recalled) {
        setActiveWallet(recalled.provider, recalled);
        resolve({
          kind: "injected",
          provider: recalled.provider,
          info: recalled,
        });
        return;
      }
      pending.current = resolve;
      setOpen(true);
    });
  }, []);

  const dialog = open ? (
    <WalletPickDialog
      tx={tx}
      onClose={() => finish(null)}
      onInjected={(wallet) => {
        setActiveWallet(wallet.provider, wallet);
        finish({
          kind: "injected",
          provider: wallet.provider,
          info: wallet,
        });
      }}
      onDeeplink={(wallet) => {
        openWalletApp(wallet, pageUrl());
        finish({ kind: "deeplink" });
      }}
    />
  ) : null;

  return { pick, dialog };
}

export async function connectChosenLife(pick, deployment, network) {
  const choice = await pick();
  if (!choice || choice.kind !== "injected") return null;
  return connectLife(choice.provider, deployment, network);
}
