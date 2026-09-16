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
      if (!url.hash) window.scrollTo(0, 0);
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
