import React, { useState } from "react";
import { CatalogPortrait } from "./catalog-portrait.jsx";
import { labelOf, normalizeGiven } from "./names.mjs";
import { shortAddr } from "./souls.mjs";
import { HABITAT_ENERGY } from "./habitat-sim.mjs";

export function HabitatRename({ soul, tx, onRename }) {
  const [name, setName] = useState(soul.givenName || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="observation-rename"
      onSubmit={async (event) => {
        event.preventDefault();
        const clean = normalizeGiven(name);
        if (!clean || busy) return;
        setBusy(true);
        setError("");
        try {
          await onRename(clean);
        } catch (err) {
          setError(err.shortMessage || err.message || String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="habitat-rename">{tx("life.givenName")}</label>
      <div>
        <input
          id="habitat-rename"
          value={name}
          maxLength={24}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          disabled={busy || !name.trim() || name.trim() === soul.givenName}
        >
          {tx(busy ? "hatch.signingRequestAction" : "life.rename")}
        </button>
      </div>
      {error && (
        <p className="pit-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function HabitatInspector({
  soul,
  mine,
  locale,
  tx,
  vitals,
  expanded,
  onExpand,
  onFeed,
  onFocus,
  children,
}) {
  return (
    <aside
      className={`observation-inspector${expanded ? " is-expanded" : ""}`}
      aria-label={tx("observe.current")}
    >
      <header className="observation-subject">
        <span className="observation-eyebrow">{tx("observe.current")}</span>
        <div className="observation-subject-title">
          <h2>{soul ? labelOf(soul, locale) : tx("observe.select")}</h2>
          <button
            className="observation-drawer-toggle"
            onClick={onExpand}
            aria-expanded={expanded}
            aria-controls="habitat-details"
          >
            {tx(expanded ? "observe.collapse" : "observe.details")}{" "}
            <span aria-hidden="true">{expanded ? "⌄" : "⌃"}</span>
          </button>
        </div>
        {soul && (
          <div className="observation-subject-meta">
            <span className="observation-number">
              #{soul.tokenId.toString().padStart(3, "0")}
            </span>
            <span className={mine ? "is-owned" : ""}>
              {tx(mine ? "observe.yours" : "observe.public")}
            </span>
            <span className="observation-mobile-status">
              {vitals &&
                `${tx(`observe.activity.${vitals.activity}`)} · ${vitals.percent}%`}
            </span>
          </div>
        )}
        {soul && (
          <div className="observation-quick-actions">
            <button
              className="observation-feed"
              onClick={onFeed}
              disabled={!vitals || vitals.energy >= HABITAT_ENERGY.max}
            >
              {tx(
                vitals?.energy >= HABITAT_ENERGY.max
                  ? "observe.full"
                  : "observe.feed",
              )}{" "}
              <span aria-hidden="true">+</span>
            </button>
            <button className="observation-locate" onClick={onFocus}>
              {tx("observe.focus")} <span aria-hidden="true">↗</span>
            </button>
          </div>
        )}
      </header>
      <div className="observation-inspector-body" id="habitat-details">
        {soul && (
          <>
            <figure className="observation-portrait">
              <span className="observation-plate-index">
                SOUL / {String(soul.tokenId).padStart(3, "0")}
              </span>
              <CatalogPortrait soul={soul} />
              <figcaption>
                <span>{tx("kin.gen", { n: soul.generation || 0 })}</span>
                <span>{tx("observe.local")}</span>
              </figcaption>
            </figure>
            <section
              className="observation-vitals"
              aria-label={tx("observe.energy")}
            >
              <div>
                <span>{tx("observe.energy")}</span>
                <strong>{vitals ? `${vitals.percent}%` : "—"}</strong>
              </div>
              <progress
                aria-label={tx("observe.energy")}
                max={HABITAT_ENERGY.max}
                value={vitals?.energy || 0}
              />
              <div className="observation-state">
                <span>
                  <i aria-hidden="true" />
                  {vitals ? tx(`observe.activity.${vitals.activity}`) : "—"}
                </span>
                <span>
                  {vitals ? tx(`habitat.hunger.${vitals.hunger}`) : "—"}
                </span>
              </div>
            </section>
            <p className="observation-phenotype">
              {soul.phenotype?.summary?.[locale] || soul.phenotype?.summary?.en}
            </p>
            <p className="observation-owner">
              {tx("observe.owner")}{" "}
              <span title={soul.owner}>{shortAddr(soul.owner)}</span>
            </p>
          </>
        )}
        {children}
      </div>
    </aside>
  );
}
