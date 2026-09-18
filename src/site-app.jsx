import React, { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SiteGoContext, isSitePath, normalizePath } from "./site-chrome.jsx";

const PAGES = {
  "/": lazy(() =>
    import("./public-page.jsx").then((m) => ({ default: m.HomePage })),
  ),
  "/swarm.html": lazy(() =>
    import("./swarm-page.jsx").then((m) => ({ default: m.PitPage })),
  ),
  "/brain.html": lazy(() =>
    import("./brain-page.jsx").then((m) => ({ default: m.CanonPage })),
  ),
  "/economy.html": lazy(() =>
    import("./economy-page.jsx").then((m) => ({ default: m.EconomyPage })),
  ),
  "/blueprint.html": lazy(() =>
    import("./blueprint-page.jsx").then((m) => ({ default: m.BlueprintPage })),
  ),
  "/field.html": lazy(() =>
    import("./life/field-page.jsx").then((m) => ({ default: m.FieldPage })),
  ),
  "/habitat.html": lazy(() =>
    import("./life/habitat-page.jsx").then((m) => ({ default: m.HabitatPage })),
  ),
  "/host.html": lazy(() =>
    import("./life/host-page.jsx").then((m) => ({ default: m.HostPage })),
  ),
  "/market.html": lazy(() =>
    import("./life/market-page.jsx").then((m) => ({ default: m.MarketPage })),
  ),
  "/colony.html": lazy(() =>
    import("./life/colony-page.jsx").then((m) => ({ default: m.ColonyPage })),
  ),
  "/live.html": lazy(() =>
    import("./fly-live/page.jsx").then((m) => ({ default: m.FlyLivePage })),
  ),
  "/protocol.html": lazy(() =>
    import("./protocol-page.jsx").then((m) => ({ default: m.ProtocolPage })),
  ),
};

function SiteApp() {
  const [path, setPath] = useState(() => normalizePath(location.pathname));

  const go = useCallback((href) => {
    const url = new URL(href, location.href);
    const next = normalizePath(url.pathname);
    if (!isSitePath(url.pathname)) {
      location.assign(url.href);
      return;
    }
    const apply = () => {
      const dest = next + url.search + url.hash;
      if (`${location.pathname}${location.search}${location.hash}` !== dest) {
        history.pushState({}, "", dest);
      }
      setPath(next);
      if (!url.hash) {
        window.scrollTo(0, 0);
        return;
      }
      const id = decodeURIComponent(url.hash.slice(1));
      const jump = (n = 0) => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({
            behavior: reduced ? "auto" : "smooth",
            block: "start",
          });
          return;
        }
        if (n < 24) requestAnimationFrame(() => jump(n + 1));
      };
      jump();
    };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof document.startViewTransition === "function" && !reduced) {
      document.startViewTransition(apply);
      return;
    }
    apply();
  }, []);

  useEffect(() => {
    const onPop = () => setPath(normalizePath(location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    function onClick(event) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      if (event.button && event.button !== 0) return;
      const link = event.target.closest?.("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) {
        return;
      }
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || !isSitePath(url.pathname)) return;
      event.preventDefault();
      go(url.pathname + url.search + url.hash);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [go]);

  const Page = PAGES[path] || PAGES["/"];
  return (
    <SiteGoContext.Provider value={go}>
      <Suspense fallback={<div className="site-boot" />}>
        <Page />
      </Suspense>
    </SiteGoContext.Provider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SiteApp />
  </React.StrictMode>,
);
