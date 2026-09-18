import React, { useEffect, useRef } from "react";
import { drawFlyArt, fitSpan, sizeFactor } from "./fly-sprite.mjs";

/** 图鉴缩略图：与出生卡同一套正面萌系形象。 */
export function MarketThumb({ soul, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !soul?.phenotype?.art) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    function paint() {
      const box = canvas.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(box.width * dpr));
      canvas.height = Math.max(1, Math.floor(box.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      const art = soul.phenotype.art;
      const span = fitSpan(box.width, box.height, { pad: 0.97 }) * sizeFactor(art);
      drawFlyArt(ctx, art, box.width * 0.5, box.height * 0.5, span, {
        flying: false,
        view: "portrait",
        ignoreScale: true,
      });
    }

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [soul]);

  return (
    <canvas
      ref={ref}
      className={`life-market-thumb${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={soul?.givenName || `#${soul?.tokenId ?? ""}`}
    />
  );
}
