import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { sampleIdentityTransition } from "./home-chain-identity.mjs";

gsap.registerPlugin(ScrollTrigger);

export function ImmersiveStage({
  page,
  graph,
  frame,
  reduced,
  paused,
  world,
  copy,
  explorer,
  fieldRef,
  projectionRef,
}) {
  const canvas = useRef(null),
    instance = useRef(null),
    progress = useRef(0),
    latest = useRef(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  latest.current = { frame, reduced, paused, world, explorer };
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setReady(false);
    import("./home-first-contact-scene.mjs")
      .then(({ createImmersiveScene }) => {
        if (cancelled) return;
        try {
          instance.current = createImmersiveScene(
            canvas.current,
            graph,
            () => {
              const bounds =
                projectionRef.current?.parentElement?.getBoundingClientRect();
              const heroBrain = page.current
                ?.querySelector(".hero-connectome-art")
                ?.getBoundingClientRect();
              const identity = page.current
                ?.querySelector(".cinema-continuity-art")
                ?.getBoundingClientRect();
              return {
                ...latest.current,
                progress: progress.current,
                heroBrainBounds: heroBrain
                  ? {
                      x: (heroBrain.left + heroBrain.width / 2) / innerWidth,
                      y: (heroBrain.top + heroBrain.height / 2) / innerHeight,
                      width: heroBrain.width / innerWidth,
                      height: heroBrain.height / innerHeight,
                    }
                  : null,
                identityBounds: identity
                  ? {
                      x: (identity.left + identity.width / 2) / innerWidth,
                      y: (identity.top + identity.height / 2) / innerHeight,
                      width: identity.width / innerWidth,
                    }
                  : null,
                encounterBounds: bounds
                  ? {
                      x: (bounds.left + bounds.width / 2) / innerWidth,
                      y: (bounds.top + bounds.height / 2) / innerHeight,
                      width: bounds.width / innerWidth,
                      height: bounds.height / innerHeight,
                    }
                  : null,
              };
            },
            () => {
              setReady(false);
              setFailed(true);
            },
            ({ x, y, width }) => {
              const el = projectionRef.current,
                field = fieldRef.current;
              if (!el || !field) return;
              el.style.setProperty("--fly-x", `${x}px`);
              el.style.setProperty(
                "--fly-y",
                `${y - field.getBoundingClientRect().top}px`,
              );
              el.style.setProperty("--target-width", `${width}px`);
            },
          );
          const created = instance.current;
          created.ready.then(() => {
            if (!cancelled) setReady(created.isAvailable());
          });
        } catch {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      instance.current?.destroy();
      instance.current = null;
    };
  }, [graph]);
  useEffect(() => {
    const root = page.current;
    const sceneIndex = {
      hero: 0,
      continuity: 0.5,
      observe: 1,
      memory: 2,
      horizon: 3,
      worlds: 4,
      begin: 5,
    };
    let stops = [],
      indices = [],
      scheduled = 0;
    const measure = () => {
      const sections = [...root.querySelectorAll("[data-scene]")];
      indices = sections.map((element) => sceneIndex[element.dataset.scene]);
      stops = sections.map((element, i) =>
        Math.max(
          0,
          element.getBoundingClientRect().top +
            window.scrollY -
            (i === 0 ? 0 : innerHeight * 0.12),
        ),
      );
      update();
    };
    const update = () => {
      const y = window.scrollY;
      let i = 0;
      while (i < stops.length - 1 && y >= stops[i + 1]) i++;
      const next = stops[i + 1];
      // Hold each composition while its copy is being read. Travel through
      // the last 45% of the distance to the next scene, without scroll capture.
      const local =
        next === undefined
          ? 0
          : Math.max(0, Math.min(1, (y - stops[i]) / (next - stops[i] || 1)));
      progress.current =
        (indices[i] ?? 0) +
        ((indices[i + 1] ?? indices[i]) - indices[i]) *
          Math.max(0, (local - 0.55) / 0.45);
      root.style.setProperty(
        "--journey-progress",
        String(Math.min(1, progress.current / 5)),
      );
      root.style.setProperty(
        "--identity-focus",
        String(sampleIdentityTransition(progress.current).focus),
      );
    };
    const trigger = ScrollTrigger.create({
      trigger: root,
      start: "top top",
      end: "bottom bottom",
      onUpdate: update,
      onRefresh: measure,
    });
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(measure);
    });
    observer.observe(root);
    window.addEventListener("resize", measure, { passive: true });
    document.fonts.ready.then(() => {
      if (root.isConnected) measure();
    });
    measure();
    return () => {
      trigger.kill();
      observer.disconnect();
      cancelAnimationFrame(scheduled);
      window.removeEventListener("resize", measure);
    };
  }, [page, copy]);
  useEffect(() => {
    instance.current?.redraw();
  }, [paused, reduced, world, frame, explorer]);
  return (
    <div
      className="immersive-stage"
      data-ready={ready}
      data-failed={failed}
      aria-hidden="true"
    >
      <canvas ref={canvas} />
      {!ready && (
        <div className="immersive-stage-fallback">
          <img src="/assets/first-contact/lifeform.webp" alt="" />
          {failed && (
            <span className="field-fallback-note">{copy.glFallback}</span>
          )}
        </div>
      )}
      <div className="immersive-vignette" />
    </div>
  );
}
