import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CARD_H,
  CARD_W,
  describeBirth,
  wantsBirthCard,
  withBirthQuery,
} from "./birth-card.mjs";
import { canvasToBlob, renderBirthPng } from "./birth-card-draw.mjs";
import "./birth-card.css";

function originOf() {
  return typeof location !== "undefined" ? location.origin : "";
}

function rememberQuery(tokenId, open, locale) {
  if (typeof window === "undefined") return;
  const next = withBirthQuery(window.location.href, tokenId, open, locale);
  window.history.replaceState({}, "", next);
}

async function shareCard(canvas, card) {
  const blob = await canvasToBlob(canvas);
  const file = new File([blob], card.filename, { type: "image/png" });
  const payload = {
    title: card.childTitle,
    text: `${card.shareText}\n${card.shareUrl}`,
    url: card.shareUrl,
    files: [file],
  };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent || "");
  if (
    mobile &&
    !navigator.webdriver &&
    navigator.share &&
    navigator.canShare?.(payload)
  ) {
    await navigator.share(payload);
    return "shared";
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = card.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
  try {
    await Promise.race([
      navigator.clipboard.writeText(`${card.shareText}\n${card.shareUrl}`),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("clipboard")), 500);
      }),
    ]);
  } catch {
    /* clipboard blocked */
  }
  return "saved";
}

async function copyShareUrl(url) {
  await Promise.race([
    navigator.clipboard.writeText(url),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("clipboard")), 500);
    }),
  ]);
}

export function BirthCardDialog({ soul, souls = [], locale, tx, onClose }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const card = soul
    ? describeBirth(soul, souls, {
        locale,
        origin: originOf(),
        tx,
      })
    : null;

  useEffect(() => {
    if (!card || !canvasRef.current) return undefined;
    renderBirthPng(card, canvasRef.current).catch(() => {});
    rememberQuery(card.soul.tokenId, true, locale);
    return undefined;
  }, [
    locale,
    card?.soul?.tokenId,
    card?.header,
    card?.childSub,
    card?.childTitle,
    card?.plateName,
    card?.badge,
    card?.accession,
    card?.formLine,
    card?.finishLine,
    card?.traits,
    card?.footer,
    card?.mixLine,
    card?.bred,
  ]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!card) return null;

  async function onShare() {
    setBusy(true);
    setStatus("");
    try {
      const board = canvasRef.current
        ? await renderBirthPng(card, canvasRef.current)
        : await renderBirthPng(card);
      const next = await shareCard(board, card);
      setStatus(tx(next === "shared" ? "birth.shared" : "birth.saved"));
    } catch (err) {
      if (err?.name === "AbortError") {
        setStatus("");
      } else {
        setStatus(tx("birth.failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    setBusy(true);
    setStatus("");
    try {
      await copyShareUrl(card.shareUrl);
      setStatus(tx("birth.copied"));
    } catch {
      setStatus(tx("birth.copyFailed"));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    rememberQuery(card.soul.tokenId, false, locale);
    onClose?.();
  }

  return createPortal(
    <div className="birth-veil" role="presentation" onClick={close}>
      <div
        className="birth-stage"
        role="dialog"
        aria-modal="true"
        aria-labelledby="birth-card-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="birth-lead">{card.lead}</p>
        <canvas
          ref={canvasRef}
          className="birth-card"
          width={CARD_W}
          height={CARD_H}
          role="img"
          aria-label={card.childTitle}
        />
        <div className="birth-actions">
          <button
            className="birth-share"
            type="button"
            disabled={busy}
            onClick={onShare}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 1.2 12 5h-2.2v5.4H6.2V5H4L8 1.2ZM2.2 12.6h11.6V14H2.2v-1.4Z"
              />
            </svg>
            {tx("birth.save")}
          </button>
          <button
            className="birth-copy"
            type="button"
            disabled={busy}
            onClick={onCopy}
          >
            {tx("birth.copyLink")}
          </button>
        </div>
        <p className="birth-url">{card.shareUrl}</p>
        <p id="birth-card-title" className="birth-status">
          {status || card.childSub}
        </p>
        <button className="birth-close" type="button" onClick={close}>
          {tx("birth.close")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function BirthCardButton({ onClick, tx, disabled }) {
  return (
    <button
      className="ghost"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {tx("birth.open")}
    </button>
  );
}

export function useBirthCard(souls) {
  const [soul, setSoul] = useState(null);

  useEffect(() => {
    const id = wantsBirthCard(window.location.search);
    if (!id) return;
    const hit = souls.find((item) => item.tokenId === id);
    if (hit) setSoul(hit);
  }, [souls]);

  return [soul, setSoul];
}
