import React from "react";
import { chipFill, phenotypeOf } from "./brain/flyswarm/phenotype.mjs";
import "./phenotype.css";

export function PhenotypeReadout({
  fly,
  locale = "en",
  compact = false,
  caption,
  note,
}) {
  if (!fly) return null;
  const ph = fly.phenotype || phenotypeOf(fly);
  const lang = locale === "zh" ? "zh" : "en";
  const traits = [
    ["hue", ph.hue],
    ["sat", ph.sat],
    ["light", ph.light],
    ["eye", ph.eye],
    ["size", ph.size],
    ["stripes", ph.stripes],
  ];
  return (
    <div
      className={`pheno ${compact ? "is-compact" : ""}`}
      data-testid="phenotype-readout"
      style={{ "--pheno-body": ph.art.body, "--pheno-eye": ph.art.eye }}
    >
      <header className="pheno-head">
        <span>GENOME / READOUT</span>
        <small>{ph.decoder}</small>
      </header>
      {caption ? <p className="pheno-claim">{caption}</p> : null}
      <div
        className="pheno-chips"
        role="img"
        aria-label={
          lang === "zh"
            ? "64 个基因组格子，不是神经元"
            : "64 genome chips, not neurons"
        }
      >
        {ph.chips.map((chip) => (
          <i
            key={chip.i}
            className={`locus-${chip.locus}`}
            style={{ background: chipFill(chip, ph) }}
            title={`${chip.locus} · ${chip.i} · ${chip.value}`}
          />
        ))}
      </div>
      <dl className="pheno-traits">
        {traits.map(([key, row]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              {key === "hue" ? <b style={{ background: ph.art.body }} /> : null}
              {key === "eye" ? <b style={{ background: ph.art.eye }} /> : null}
              {row[lang] || row.en}
            </dd>
          </div>
        ))}
      </dl>
      <p className="pheno-summary">{ph.summary[lang]}</p>
      {note ? <p className="pheno-note">{note}</p> : null}
    </div>
  );
}
