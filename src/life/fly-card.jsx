import React from "react";
import {
  catalogCount,
  catalogIndex,
  traitSwatches,
  vitalOf,
} from "./fly-traits.mjs";

/**
 * 图鉴卡片的公共零件。参考图每张卡的读法：
 * 编号 → 形象 → 名字 → 两行带色点的性状 → 第 N 代 · 存活。
 * 色点取 NFT 基因组的实际体色/眼色，页面外壳仍是品牌暗金。
 */
export function FlyTraitRows({ soul, locale = "en", className = "" }) {
  const rows = traitSwatches(soul, locale);
  if (!rows.length) return null;
  return (
    <ul className={`fly-traits${className ? ` ${className}` : ""}`}>
      {rows.map((row) => (
        <li key={row.key}>
          {row.color2 ? (
            <span className="fly-traits-pair" aria-hidden="true">
              <i
                className="fly-traits-dot"
                style={{ background: row.color }}
              />
              <i
                className="fly-traits-dot"
                style={{ background: row.color2 }}
              />
            </span>
          ) : (
            <i
              className="fly-traits-dot"
              style={{ background: row.color }}
              aria-hidden="true"
            />
          )}
          <span>{row.text}</span>
          {row.detail ? <small>{row.detail}</small> : null}
        </li>
      ))}
    </ul>
  );
}

export function FlyVital({ soul, locale = "en", tx, generation }) {
  const vital = vitalOf(soul);
  const gen = generation ?? vital.generation;
  const label =
    locale === "zh" ? `第${gen}代` : gen === 0 ? "Gen 0" : `Gen ${gen}`;
  const status = tx
    ? tx(vital.statusKey)
    : locale === "zh"
      ? "存活"
      : "alive";
  return (
    <p className="fly-vital">
      {label} · <b>{status}</b>
    </p>
  );
}

export function FlyIndex({ soul }) {
  return <span className="fly-index">{catalogIndex(soul)}</span>;
}

export function FlyCatalogChip({ souls, locale = "en" }) {
  const list = Array.isArray(souls) ? souls : [];
  if (!list.length) return null;
  return <span className="fly-catalog-chip">{catalogCount(list, locale)}</span>;
}
