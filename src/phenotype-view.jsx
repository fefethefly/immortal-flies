import React from "react";
import { chipFill, phenotypeOf } from "./brain/flyswarm/phenotype.mjs";
import { formatExpected, formatRate } from "./brain/flyswarm/phenotype-loci.mjs";
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
    ["mark", ph.mark],
  ];
  const scarce = ph.scarcity;
  const expected = scarce ? formatExpected(scarce.expectedPer1024) : null;
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
        {traits.map(([key, row]) => {
          const locked = key === "light" && scarce?.rates.lightLocked;
          return (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                {key === "hue" ? <b style={{ background: ph.art.body }} /> : null}
                {key === "eye" ? <b style={{ background: ph.art.eye }} /> : null}
                <span>{row[lang] || row.en}</span>
                <small>
                  {locked
                    ? lang === "zh"
                      ? "骨白锁定"
                      : "albino lock"
                    : `${formatRate(row.bps)}%`}
                </small>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="pheno-summary">{ph.summary[lang]}</p>
      {expected ? (
        <p className="pheno-scarce">
          {lang === "zh"
            ? `这一组合在 1024 只 Gen0 里预期约 ${expected} 只。出现率不是定价。`
            : `This combination is expected in about ${expected} of 1024 Gen0. Occurrence is not a price.`}
        </p>
      ) : null}
      {note ? <p className="pheno-note">{note}</p> : null}
    </div>
  );
}
