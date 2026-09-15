import React from "react";
import "./locale.css";

export function LocaleSwitch({ locale, onChange }) {
  return (
    <div
      className="locale-switch"
      role="group"
      aria-label={locale === "zh" ? "语言" : "Language"}
    >
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => onChange("en")}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={locale === "zh"}
        onClick={() => onChange("zh")}
      >
        中文
      </button>
    </div>
  );
}

export function RichText({ text, tags }) {
  return text.split(/(\{[^}]+\})/g).map((part, i) => {
    const match = part.match(/^\{([^}]+)\}$/);
    if (!match) return <React.Fragment key={i}>{part}</React.Fragment>;
    return <React.Fragment key={i}>{tags[match[1]] ?? part}</React.Fragment>;
  });
}

export function SiteLinks({ locale, tx, current }) {
  const items = [
    ["/", "nav.home", "home"],
    ["/swarm.html", "nav.pit", "pit"],
    ["/brain.html", "nav.canon", "canon"],
    ["/economy.html", "nav.economy", "economy"],
    ["/blueprint.html", "nav.blueprint", "blueprint"],
  ];
  return (
    <>
      {items.map(([href, key, id]) => (
        <a
          key={id}
          href={href}
          aria-current={current === id ? "page" : undefined}
        >
          {tx(key)}
        </a>
      ))}
    </>
  );
}
