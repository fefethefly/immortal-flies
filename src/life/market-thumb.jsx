import React, { useEffect, useRef } from "react";
import { projectFlyCloud, stampCloud } from "./fly-cloud.mjs";

export function MarketThumb({ soul }) {
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
      const k = Math.min(box.width, box.height) * 0.0044;
      stampCloud(
        ctx,
        projectFlyCloud(soul.phenotype.art, {
          flap: 0.22,
          sweep: 0.05,
          project: (x, y, z) => ({
            x: box.width * 0.5 + (x * 0.86 + z * 0.48) * k,
            y: box.height * 0.58 + (y * 0.9 - z * 0.26) * k,
            z,
          }),
        }),
        { px: Math.max(1, k * 0.58) },
      );
    }

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [soul]);

  return <canvas ref={ref} className="life-market-thumb" role="img" />;
}
