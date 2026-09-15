import React, { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { explorerToken, flapToken } from "./token.mjs";

export function shortCa(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isLiveToken(token) {
  return token?.status === "live" && Boolean(token.address);
}

export function SealBar({ token, tx, compact = false }) {
  const live = isLiveToken(token);
  const ticker = `$${token?.symbol || "IFS"}`;
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!live) return;
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* private mode */
    }
  }
  if (compact) {
    return (
      <div className="seal-slim" aria-label={tx("public.ca")}>
        <b>{ticker}</b>
        <code title={live ? token.address : undefined}>{live ? shortCa(token.address) : tx("public.caPending")}</code>
        <button type="button" disabled={!live} onClick={copy}>
          {copied ? tx("public.copied") : tx("public.copy")}
        </button>
      </div>
    );
  }
  return (
    <section className="seal-bar" aria-label={tx("public.ca")}>
      <div className="seal-mark">
        <span>{ticker}</span>
        <b>BSC</b>
      </div>
      <div className="seal-ca">
        <small>{tx("public.ca")}</small>
        {live ? (
          <code title={token.address}>{shortCa(token.address)}</code>
        ) : (
          <code className="pending">{tx("public.caPending")}</code>
        )}
      </div>
      <p className="seal-hint">{tx("public.caHint")}</p>
      <div className="seal-actions">
        <button type="button" disabled={!live} onClick={copy}>
          {copied ? tx("public.copied") : tx("public.copy")}
        </button>
        {live ? (
          <>
            <a href={explorerToken(token.address, token.chainId)} target="_blank" rel="noreferrer">
              BscScan
            </a>
            <a href={token.flapUrl || flapToken(token.address)} target="_blank" rel="noreferrer">
              Flap
            </a>
          </>
        ) : null}
        {token?.twitter ? (
          <a className="x-link" href={token.twitter} target="_blank" rel="noreferrer">
            {tx("public.openX")}
            <ArrowUpRight size={13} />
          </a>
        ) : null}
      </div>
    </section>
  );
}
