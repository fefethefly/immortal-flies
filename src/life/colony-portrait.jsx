import React, { useEffect, useRef, useState } from "react";
import {
  drawColonyPortrait,
  loadColonyPlate,
  PORTRAIT_SIZE,
} from "./colony-portrait.mjs";
import { MarketThumb } from "./market-thumb.jsx";

export function ColonyPortrait({ soul, className = "" }) {
  const ref = useRef(null);
  const [status, setStatus] = useState("loading");
  const art = soul?.phenotype?.art;
  useEffect(() => {
    if (!art) return undefined;
    let gone = false;
    setStatus("loading");
    loadColonyPlate()
      .then((plate) => {
        if (gone || !ref.current) return;
        drawColonyPortrait(ref.current.getContext("2d"), plate, art);
        setStatus("ready");
      })
      .catch(() => {
        if (!gone) setStatus("error");
      });
    return () => {
      gone = true;
    };
  }, [art]);
  const fallback = status === "error" || !art;
  return (
    <>
      {fallback ? <MarketThumb soul={soul} className={className} /> : null}
      <canvas
        ref={ref}
        width={PORTRAIT_SIZE}
        height={PORTRAIT_SIZE}
        className={`life-market-thumb colony-portrait ${className}`}
        style={fallback ? { display: "none" } : undefined}
        aria-busy={status === "loading"}
        role="img"
        aria-label={`${soul?.givenName || `#${soul?.tokenId ?? soul?.seed ?? ""}`} · ${soul?.phenotype?.summary?.en || "collectible fruit fly"}`}
      />
    </>
  );
}

export function ColonyWingTrait({ soul, locale = "en" }) {
  const p = soul?.phenotype;
  const shape = p?.wingShape?.[locale] || p?.wingShape?.en;
  const mark = p?.wingMark?.[locale] || p?.wingMark?.en;
  const sex = p?.sex?.[locale] || p?.sex?.en;
  if (!shape) return null;
  return (
    <p
      className="colony-wing-trait"
      title={[shape, mark, sex].filter(Boolean).join(" · ")}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M17 17C5 15 0 6 4 3S16 5 17 17ZM17 17 5 5M10 10l-5 1M12 12l1-5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
      <span>
        {shape}
        {p.wingMark?.id !== "clear" && mark ? ` · ${mark}` : ""}
        {sex ? ` · ${sex}` : ""}
      </span>
    </p>
  );
}
