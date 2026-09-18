import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { BrandLockup } from "./vitruvian.jsx";
import { LocaleContext } from "./locale-context.jsx";
import { LocaleSwitch } from "./locale-switch.jsx";
import { SiteCa } from "./seal-bar.jsx";
import "./chrome.css";

export const FOCUS_FLY = "iff.focusFly";

export const NAV_GROUPS = [
  {
    verb: "nav.lifeGroup",
    items: [
      ["/", "nav.home", "home", "01"],
      ["/habitat.html", "nav.habitat", "habitat", "02"],
      ["/field.html", "nav.field", "field", "03"],
      ["/host.html", "nav.host", "host", "04"],
      ["/market.html", "nav.market", "market", "05"],
      ["/colony.html", "nav.colony", "colony", "06"],
    ],
  },
  {
    verb: "nav.exploreGroup",
    items: [
      ["/brain.html", "nav.canon", "canon", "04"],
      ["/blueprint.html", "nav.blueprint", "blueprint", "05"],
      ["/swarm.html", "nav.pit", "pit", "06"],
      ["/economy.html", "nav.economy", "economy", "07"],
    ],
  },
];

export const NAV = NAV_GROUPS.flatMap((group) => group.items);

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
  "/field": "/field.html",
  "/field.html": "/field.html",
  "/habitat": "/habitat.html",
  "/habitat.html": "/habitat.html",
  "/host": "/host.html",
  "/host.html": "/host.html",
  "/market": "/market.html",
  "/market.html": "/market.html",
  "/colony": "/colony.html",
  "/colony.html": "/colony.html",
  "/live": "/live.html",
  "/live.html": "/live.html",
  "/protocol": "/protocol.html",
  "/protocol.html": "/protocol.html",
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

export function SiteNav({ tx, current, onNavigate }) {
  const go = useSiteGo();
  return (
    <nav className="site-nav" aria-label={tx("nav.label")}>
      {NAV_GROUPS.map((group) => (
        <span key={group.verb || "home"} className="site-nav-group">
          <span className="site-nav-caption">{tx(group.verb)}</span>
          {group.items.map(([href, key, id, index]) => (
            <a
              key={id}
              href={href}
              aria-current={current === id ? "page" : undefined}
              onClick={(event) => {
                onNavigate?.();
                goFromClick(go, href, event);
              }}
            >
              <small>{index}</small>
              {tx(key)}
            </a>
          ))}
        </span>
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
      aria-label="IMMORTAL Fruit Flies"
      onClick={(event) => goFromClick(go, href, event)}
    >
      <BrandLockup small={small} />
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

export function SiteBar({ locale, setLocale, tx, current, trailing, token }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  useEffect(() => {
    setOpen(false);
  }, [current]);
  return (
    <header
      className={`site-bar${open ? " is-menu-open" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <div className="site-bar-lead">
        <SiteBrand href="/" small />
        <SiteCa token={token} tx={tx} />
      </div>
      <button
        className="site-menu-toggle"
        type="button"
        ref={toggle}
        aria-expanded={open}
        aria-controls="site-navigation"
        onClick={() => setOpen(!open)}
      >
        {tx(open ? "nav.closeMenu" : "nav.openMenu")}{" "}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div className="site-bar-tools" id="site-navigation">
        <SiteNav tx={tx} current={current} onNavigate={() => setOpen(false)} />
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
  token,
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
          token={token}
        />
        {children}
      </div>
    </LocaleContext.Provider>
  );
}
