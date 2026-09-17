import React, { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { explorerAddress, explorerToken, flapToken } from "./token.mjs";

export function shortCa(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isLiveToken(token) {
  return token?.status === "live" && Boolean(token.address);
}

function useCopyCa(address) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* private mode */
    }
  }
  return [copied, copy];
}

export function SiteCa({ token, tx }) {
  const live = isLiveToken(token);
  const [copied, copy] = useCopyCa(live ? token.address : null);
  if (!token) return null;
  return (
    <button
      type="button"
      className={`site-ca${live ? "" : " is-pending"}${copied ? " is-copied" : ""}`}
      disabled={!live}
      onClick={copy}
      title={live ? token.address : tx("public.caHint")}
      aria-label={
        live ? `${tx("public.ca")} ${token.address}` : tx("public.caPending")
      }
    >
      <small aria-live="polite">
        {copied ? tx("public.copied") : tx("public.ca")}
      </small>
      <code>{live ? shortCa(token.address) : tx("public.caPending")}</code>
    </button>
  );
}

export function SealBar({ token, tx, compact = false }) {
  const live = isLiveToken(token);
  const ticker = `$${token?.symbol || "IFS"}`;
  const [copied, copy] = useCopyCa(live ? token.address : null);
  if (compact) {
    return (
      <div className="seal-slim" aria-label={tx("public.ca")}>
        <b>{ticker}</b>
        <code title={live ? token.address : undefined}>
          {live ? shortCa(token.address) : tx("public.caPending")}
        </code>
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
      {token?.vault || token?.ops ? (
        <div className="seal-split">
          {token.vault ? (
            <a
              href={explorerAddress(token.vault, token.chainId)}
              target="_blank"
              rel="noreferrer"
            >
              <small>{tx("public.hive")}</small>
              <code title={token.vault}>{shortCa(token.vault)}</code>
            </a>
          ) : null}
          {token.ops ? (
            <a
              href={explorerAddress(token.ops, token.chainId)}
              target="_blank"
              rel="noreferrer"
            >
              <small>{tx("public.ops")}</small>
              <code title={token.ops}>{shortCa(token.ops)}</code>
            </a>
          ) : null}
          <p>{tx("public.splitHint")}</p>
        </div>
      ) : null}
      <div className="seal-actions">
        <button type="button" disabled={!live} onClick={copy}>
          {copied ? tx("public.copied") : tx("public.copy")}
        </button>
        {live ? (
          <>
            <a
              href={explorerToken(token.address, token.chainId)}
              target="_blank"
              rel="noreferrer"
            >
              BscScan
            </a>
            <a
              href={token.flapUrl || flapToken(token.address)}
              target="_blank"
              rel="noreferrer"
            >
              Flap
            </a>
          </>
        ) : null}
        {token?.twitter ? (
          <a
            className="x-link"
            href={token.twitter}
            target="_blank"
            rel="noreferrer"
          >
            {tx("public.openX")}
            <ArrowUpRight size={13} />
          </a>
        ) : null}
      </div>
    </section>
  );
}
