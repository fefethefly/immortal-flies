import React, { useEffect, useRef, useState } from "react";
import { usePrefersReduced } from "./rite.jsx";

/** Published MaleCNS census: brain + VNC, Berg et al. 2025. */
export const MALE_CNS_CENSUS = 166691;

function CountUp({ value }) {
  const reduce = usePrefersReduced();
  const node = useRef(null);
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return undefined;
    }
    const el = node.current;
    if (!el || typeof IntersectionObserver !== "function") {
      setShown(value);
      return undefined;
    }
    let frame = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        const start = performance.now();
        const duration = 1600;
        const tick = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - (1 - t) ** 3;
          setShown(Math.round(value * eased));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, reduce]);
  return (
    <strong ref={node} className="home-census-num">
      {shown.toLocaleString("en-US")}
    </strong>
  );
}

export function HomeCensus({ tx }) {
  return (
    <section
      className="home-census"
      data-reveal="wait"
      aria-label={tx("public.censusKicker")}
    >
      <header>
        <span>{tx("public.censusKicker")}</span>
        <small>{tx("public.censusSource")}</small>
      </header>
      <div className="home-census-hero">
        <CountUp value={MALE_CNS_CENSUS} />
        <em>{tx("public.censusNeurons")}</em>
      </div>
      <ul>
        <li>{tx("public.censusProtocol")}</li>
        <li>{tx("public.censusBook")}</li>
        <li>{tx("public.censusWorld")}</li>
      </ul>
      <p>{tx("public.censusNote")}</p>
    </section>
  );
}
