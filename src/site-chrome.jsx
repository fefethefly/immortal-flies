import React, { createContext, useContext } from "react";
import { FlyMark } from "./vitruvian.jsx";
import { LocaleContext } from "./locale-context.jsx";
import { LocaleSwitch } from "./locale-switch.jsx";
import "./chrome.css";

export const FOCUS_FLY = "iff.focusFly";

export const NAV = [
  ["/", "nav.home", "home", "01"],
  ["/swarm.html", "nav.pit", "pit", "02"],
  ["/brain.html", "nav.canon", "canon", "03"],
  ["/economy.html", "nav.economy", "economy", "04"],
  ["/blueprint.html", "nav.blueprint", "blueprint", "05"],
];

const ROUTE_ALIASES = {
  "/": "/",
  "/index.html": "/",
  "/swarm": "/swarm.html",
  "/swarm.html": "/swarm.html",
  "/brain": "/brain.html",
  "/brain.html": "/brain.html",
  "/economy": "/economy.html",
  "/economy.html": "/economy.html",
  "/blueprint": "/blueprint.html",
  "/blueprint.html": "/blueprint.html",
};

export const SiteGoContext = createContext(null);

export function normalizePath(pathname) {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  return ROUTE_ALIASES[path] || path;
}

export function isSitePath(pathname) {
  return Object.hasOwn(
    ROUTE_ALIASES,
    (pathname || "/").replace(/\/+$/, "") || "/",
  );
}

export function useSiteGo() {
  return useContext(SiteGoContext);
}

function goFromClick(go, href, event) {
  if (!go || !event) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (event.button && event.button !== 0) return;
  const url = new URL(href, location.href);
  if (url.origin !== location.origin || !isSitePath(url.pathname)) return;
  event.preventDefault();
  go(url.pathname + url.search + url.hash);
}

export function rememberFly(id) {
  try {
    if (id != null) sessionStorage.setItem(FOCUS_FLY, String(id));
  } catch {
    /* private mode */
  }
}

export function recallFly() {
  try {
    const value = sessionStorage.getItem(FOCUS_FLY);
    return value == null ? null : Number(value);
  } catch {
    return null;
  }
}

export function SiteNav({ tx, current }) {
  const go = useSiteGo();
  return (
    <nav className="site-nav" aria-label={tx("nav.label")}>
      {NAV.map(([href, key, id, index]) => (
        <a
          key={id}
          href={href}
          aria-current={current === id ? "page" : undefined}
          onClick={(event) => goFromClick(go, href, event)}
        >
          <small>{index}</small>
          {tx(key)}
        </a>
      ))}
    </nav>
  );
}

export function SiteBrand({ href = "/", small }) {
  const go = useSiteGo();
  return (
    <a
      className="site-brand"
      href={href}
      onClick={(event) => goFromClick(go, href, event)}
    >
      <FlyMark small={small} />
      <span>
        IMMORTAL<small>FRUIT FLIES</small>
      </span>
    </a>
  );
}

export function SiteLink({ href, className, children, ...rest }) {
  const go = useSiteGo();
  return (
    <a
      className={className}
      href={href}
      onClick={(event) => goFromClick(go, href, event)}
      {...rest}
    >
      {children}
    </a>
  );
}

export function SiteBar({ locale, setLocale, tx, current, trailing }) {
  return (
    <header className="site-bar">
      <SiteBrand href="/" small />
      <div className="site-bar-tools">
        <SiteNav tx={tx} current={current} />
        {trailing}
        <LocaleSwitch locale={locale} onChange={setLocale} />
      </div>
    </header>
  );
}

export function SitePage({
  current,
  locale,
  setLocale,
  tx,
  trailing,
  className,
  children,
}) {
  return (
    <LocaleContext.Provider value={{ locale, tx }}>
      <div className={className}>
        <i className="site-grain" aria-hidden="true" />
        <SiteBar
          locale={locale}
          setLocale={setLocale}
          tx={tx}
          current={current}
          trailing={trailing}
        />
        {children}
      </div>
    </LocaleContext.Provider>
  );
}
