import React, { useEffect, useRef } from "react";
import { catalogSprite, loadCatalogFly } from "./catalog-portrait.mjs";
import { MarketThumb } from "./market-thumb.jsx";

/** Raster collectible portrait, tinted from the shared catalog plate. */
export function CatalogPortrait({ soul, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    let gone = false;
    loadCatalogFly()
      .then(() => {
        if (gone || !ref.current) return;
        const sprite = catalogSprite(soul?.phenotype?.art || {});
        if (!sprite) return;
        const canvas = ref.current;
        canvas.width = canvas.height = 420;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, 420, 420);
        ctx.drawImage(sprite, 0, 0);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [soul]);
  if (!soul?.phenotype?.art)
    return <MarketThumb soul={soul} className={className} />;
  return (
    <canvas
      ref={ref}
      width={420}
      height={420}
      className={`life-market-thumb catalog-portrait ${className}`}
      role="img"
      aria-label={`${soul?.givenName || `#${soul?.tokenId ?? soul?.seed ?? ""}`} · collectible illustration`}
    />
  );
}
