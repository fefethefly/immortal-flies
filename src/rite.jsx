import { useEffect, useState } from "react";

export function usePrefersReduced() {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function useOnStage(ref) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let visible = document.visibilityState !== "hidden";
    let intersecting = true;
    const sync = () => setOn(visible && intersecting);
    const onVis = () => {
      visible = document.visibilityState !== "hidden";
      sync();
    };
    document.addEventListener("visibilitychange", onVis);
    let io;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(
        ([entry]) => {
          intersecting = entry.isIntersecting;
          sync();
        },
        { threshold: 0.08 },
      );
      io.observe(node);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
    };
  }, [ref]);
  return on;
}

export function useReveal(dep) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver !== "function") {
      nodes.forEach((node) => node.setAttribute("data-reveal", "done"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-reveal", "in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [dep]);
}

export function tiltHandlers(reduced) {
  if (reduced) return {};
  return {
    onPointerMove(event) {
      const el = event.currentTarget;
      const box = el.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      el.style.setProperty("--tilt-x", `${(-y * 5).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(x * 6.5).toFixed(2)}deg`);
    },
    onPointerLeave(event) {
      event.currentTarget.style.setProperty("--tilt-x", "0deg");
      event.currentTarget.style.setProperty("--tilt-y", "0deg");
    },
  };
}
