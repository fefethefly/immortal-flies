import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowUpRight, ChevronDown, Grid2X2, X } from "lucide-react";
import { LocaleContext } from "./locale-context.jsx";
import { SiteCa } from "./seal-bar.jsx";
import { loadOfficialToken } from "./token.mjs";
import "./chrome.css";

function XMark() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.59l-5.16-6.74L5.2 22H1.93l8.02-9.16L1.5 2h6.76l4.66 6.18L18.244 2Zm-1.16 18h1.81L7 3.9H5.06L17.084 20Z"
      />
    </svg>
  );
}

export function SocialX({ href, tx, className = "bar-x" }) {
  if (!href) return null;
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={tx("public.openX")}
    >
      <XMark />
      <span>{tx("public.openX")}</span>
    </a>
  );
}

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
  {
    verb: "nav.docsGroup",
    items: [
      ["/docs.html", "nav.docs", "docs", "01"],
      ["/protocol.html", "nav.protocol", "protocol", "02"],
    ],
  },
];

export const NAV = NAV_GROUPS.flatMap((group) => group.items);

const PRIMARY_NAV = ["canon", "habitat", "colony", "market", "blueprint"];
const NAV_COPY = {
  zh: {
    all: "全部应用",
    close: "收起应用",
    label: "产品导航",
    title: "探索 IMMORTAL",
    note: "从神经结构，到一个生命，再到开放世界。",
    groups: ["生命与资产", "研究与实验", "协议与文档"],
    names: { canon: "连接组", pit: "交易实验", blueprint: "研究蓝图" },
    details: {
      home: "数字生命的起点",
      habitat: "观察生命与环境",
      field: "孵化与管理你的果蝇",
      host: "托管生命与运行节点",
      market: "浏览链上生命市场",
      colony: "查看群体、基因与谱系",
      canon: "全量神经图与模拟实验",
      blueprint: "架构、进展与研究方向",
      pit: "感知、决策与纸面交易",
      economy: "代币与协议经济",
      docs: "产品说明与使用指南",
      protocol: "状态、身份与重放验证",
    },
  },
  en: {
    all: "All apps",
    close: "Close apps",
    label: "Product navigation",
    title: "Explore IMMORTAL",
    note: "From a connectome, to a life, to open worlds.",
    groups: ["Lives & assets", "Research & experiments", "Protocol & docs"],
    names: { canon: "Connectome", pit: "Trading lab", blueprint: "Research" },
    details: {
      home: "Where digital life begins",
      habitat: "Observe lives and environments",
      field: "Hatch and manage your fly",
      host: "Host lives and run a node",
      market: "Explore the on-chain life market",
      colony: "Lives, genomes and lineages",
      canon: "Full graph and neural experiments",
      blueprint: "Architecture, progress and research",
      pit: "Perception and paper trading",
      economy: "Token and protocol economics",
      docs: "Product guides and documentation",
      protocol: "State, identity and replay checks",
    },
  },
};

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
  "/docs": "/docs.html",
  "/docs.html": "/docs.html",
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

export function SiteNav({ tx, locale, current, utility }) {
  const go = useSiteGo();
  const text = NAV_COPY[locale] || NAV_COPY.en;
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const toggle = useRef(null);
  useEffect(() => setOpen(false), [current, locale]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const onPointerDown = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);
  const navLink = ([href, key, id], inDirectory = false) => (
    <a
      key={id}
      href={href}
      aria-current={current === id ? "page" : undefined}
      onClick={(event) => {
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
          setOpen(false);
        }
        goFromClick(go, href, event);
      }}
    >
      {inDirectory ? (
        <>
          <span>
            {text.names[id] || tx(key)}
            <small>{text.details[id]}</small>
          </span>
          <ArrowUpRight size={14} aria-hidden="true" />
        </>
      ) : text.names[id] || tx(key)}
    </a>
  );
  return (
    <div
      ref={root}
      className="global-navigation"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <nav className="home-primary-nav" aria-label={text.label}>
        {PRIMARY_NAV.map((id) => navLink(NAV.find((item) => item[2] === id)))}
      </nav>
      <button
        ref={toggle}
        className="home-apps-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="global-app-directory"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={16} /> : <Grid2X2 size={15} />}
        <span>{open ? text.close : text.all}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      <div className="home-app-directory" id="global-app-directory" hidden={!open}>
        <div className="home-directory-intro">
          <span>IMMORTAL / INDEX</span>
          <h2>{text.title}</h2>
          <p>{text.note}</p>
        </div>
        <nav className="home-directory-groups" aria-label={text.all}>
          {NAV_GROUPS.map((group, index) => (
            <section key={group.verb} aria-labelledby={`global-nav-group-${index}`}>
              <h3 id={`global-nav-group-${index}`}>
                <span>0{index + 1}</span>
                {text.groups[index]}
              </h3>
              {group.items.map((item) => navLink(item, true))}
            </section>
          ))}
        </nav>
        {utility && <div className="home-directory-utility">{utility}</div>}
      </div>
    </div>
  );
}

export function SiteBrand({ href = "/", className = "" }) {
  const go = useSiteGo();
  return (
    <a
      className={`site-brand living-brand ${className}`.trim()}
      href={href}
      aria-label="IMMORTAL Fruit Flies"
      onClick={(event) => goFromClick(go, href, event)}
    >
      <svg className="living-brand-symbol" viewBox="0 0 30 36" fill="none" aria-hidden="true">
        <path d="M15 3v30M3 9l24 18M27 9 3 27M2 18h26" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="15" cy="18" r="6" stroke="currentColor" />
        <circle cx="15" cy="18" r="2" fill="currentColor" />
      </svg>
      IMMORTAL
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
  const [remote, setRemote] = useState(null);
  useEffect(() => {
    if (token?.twitter) return;
    let gone = false;
    loadOfficialToken()
      .then((next) => {
        if (!gone) setRemote(next);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [token]);
  const twitter = token?.twitter || remote?.twitter;
  return (
    <>
      <header className="site-bar">
        <div className="site-bar-lead"><SiteBrand href="/" /></div>
        <SiteNav
          tx={tx}
          locale={locale}
          current={current}
          utility={<><SiteCa token={token} tx={tx} /><SocialX href={twitter} tx={tx} /></>}
        />
        <div className="site-bar-tools">
          <button
            className="living-language"
            type="button"
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            aria-label={locale === "zh" ? "Switch to English" : "切换中文"}
          >
            {locale === "zh" ? "EN" : "中文"}
          </button>
          <SiteLink className="site-bar-hatch" href="/field.html">
            {locale === "zh" ? "孵化你的果蝇" : "Hatch your fly"}
            <ArrowUpRight size={15} aria-hidden="true" />
          </SiteLink>
        </div>
      </header>
      {trailing && <div className="site-bar-context">{trailing}</div>}
    </>
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
