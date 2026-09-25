import React from "react";
import { ArrowUpRight } from "lucide-react";
import { SiteBrand, SiteNav } from "./site-chrome.jsx";

export function HomeNavigation({ locale, setLocale, tx, hatchLabel, onHatch }) {
  return (
    <header className="living-nav home-product-nav">
      <SiteBrand href="/" />
      <SiteNav locale={locale} tx={tx} current="home" />
      <div className="living-nav-actions">
        <button
          className="living-language"
          type="button"
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          aria-label={locale === "zh" ? "Switch to English" : "切换中文"}
        >
          {locale === "zh" ? "EN" : "中文"}
        </button>
        <button className="living-nav-hatch" type="button" onClick={onHatch}>
          {hatchLabel}
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
