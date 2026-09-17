import React from "react";
import { kinOf } from "./kin.mjs";
import { labelOf } from "./names.mjs";

function KinCell({ soul, tag, selected, setSelected, locale, tx }) {
  const live = Boolean(soul?.life);
  return (
    <button
      type="button"
      className={soul?.tokenId === selected?.tokenId ? "is-on" : ""}
      disabled={!live}
      onClick={() => {
        if (live) setSelected(soul);
      }}
    >
      <small>{tag}</small>
      <strong>#{soul.tokenId}</strong>
      <em>{live ? labelOf(soul, locale) : tx("kin.unknown")}</em>
      <span>
        {tx("kin.gen", { n: soul.generation ?? 0 })}
        {soul.phenotype?.hue?.en ? ` · ${soul.phenotype.hue[locale] || soul.phenotype.hue.en}` : ""}
      </span>
    </button>
  );
}

export function KinBoard({ souls, selected, setSelected, locale, tx }) {
  const tree = kinOf(souls, selected?.tokenId);
  if (!tree) return null;
  return (
    <section className="life-kin" aria-label={tx("kin.title")}>
      <h3>
        {tx("kin.title")} <small>PEDIGREE</small>
      </h3>
      <p className="life-note">{tx("kin.lead")}</p>
      {tree.grandparents.length ? (
        <div className="life-kin-row">
          {tree.grandparents.map((soul) => (
            <KinCell
              key={`g-${soul.tokenId}`}
              soul={souls.find((item) => item.tokenId === soul.tokenId) || soul}
              tag={tx("kin.grand")}
              selected={selected}
              setSelected={setSelected}
              locale={locale}
              tx={tx}
            />
          ))}
        </div>
      ) : null}
      <div className="life-kin-row">
        {tree.parents.length ? (
          tree.parents.map((soul) => (
            <KinCell
              key={`p-${soul.tokenId}`}
              soul={souls.find((item) => item.tokenId === soul.tokenId) || soul}
              tag={tx("kin.parent")}
              selected={selected}
              setSelected={setSelected}
              locale={locale}
              tx={tx}
            />
          ))
        ) : (
          <p className="life-note">{tx("kin.gen0")}</p>
        )}
      </div>
      <div className="life-kin-row is-self">
        <KinCell
          soul={tree.me}
          tag={tx("kin.self")}
          selected={selected}
          setSelected={setSelected}
          locale={locale}
          tx={tx}
        />
      </div>
      <div className="life-kin-row">
        {tree.children.length ? (
          tree.children.map((soul) => (
            <KinCell
              key={`c-${soul.tokenId}`}
              soul={soul}
              tag={tx("kin.child")}
              selected={selected}
              setSelected={setSelected}
              locale={locale}
              tx={tx}
            />
          ))
        ) : (
          <p className="life-note">{tx("kin.noKids")}</p>
        )}
      </div>
    </section>
  );
}
