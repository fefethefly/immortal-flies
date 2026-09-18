/**
 * fly-traits.mjs —— 图鉴卡片上的性状行。
 *
 * 参考图的每张卡有两行带色点的性状（体色 / 眼色）和一行「第 N 代 · 存活」。
 * 这里的文字与色点全部来自 `phenotype`（NFT 基因组的确定性读出），
 * 不额外编造稀有度或状态。
 */

function pick(locale) {
  return locale === "zh" ? "zh" : "en";
}

function row(locale, zh, en) {
  return pick(locale) === "zh" ? zh : en;
}

/** 体色行：色点 = 实际体色，文字 = 「<色相>身」/「<hue> body」。 */
export function bodyTrait(soul, locale = "en") {
  const phenotype = soul?.phenotype;
  const hue = phenotype?.hue;
  if (!hue) return null;
  const light = phenotype.light;
  const sat = phenotype.sat;
  const detail =
    pick(locale) === "zh"
      ? [light?.zh, sat?.zh].filter(Boolean).join(" · ")
      : [light?.en, sat?.en].filter(Boolean).join(" · ");
  return {
    key: "body",
    color: phenotype.art?.body || "#8a6a2a",
    text: row(locale, `${hue.zh || hue.en}身`, `${hue.en || hue.id} body`),
    detail,
  };
}

/** 眼色行：色点 = 实际眼色，文字 = 复眼名（朱砂眼 / cinnabar eyes）。左右异色时给两色点。 */
export function eyeTrait(soul, locale = "en") {
  const phenotype = soul?.phenotype;
  const eye = phenotype?.eye;
  if (!eye) return null;
  const stripes = phenotype.stripes;
  const mark = phenotype.mark;
  const split = phenotype.eyePair?.id === "split";
  const other = phenotype.eyeOther;
  const detailParts =
    pick(locale) === "zh"
      ? [
          split ? phenotype.eyePair.zh : null,
          phenotype.sex?.zh,
          phenotype.wingShape?.zh,
          phenotype.wingMark?.zh,
          stripes?.zh,
          mark?.zh,
        ].filter(Boolean)
      : [
          split ? phenotype.eyePair.en : null,
          phenotype.sex?.en,
          phenotype.wingShape?.en,
          phenotype.wingMark?.en,
          stripes?.en,
          mark?.en,
        ].filter(Boolean);
  return {
    key: "eye",
    color: phenotype.art?.eyeLeft || phenotype.art?.eye || eye.hex || "#b57660",
    color2: split
      ? phenotype.art?.eyeRight || other?.hex || "#b57660"
      : undefined,
    text: split
      ? row(
          locale,
          `${eye.zh} / ${other?.zh || other?.en || ""}`,
          `${eye.en} / ${other?.en || other?.id || ""}`,
        )
      : row(locale, eye.zh || eye.en, eye.en || eye.id),
    detail: detailParts.join(" · "),
  };
}

export function traitSwatches(soul, locale = "en") {
  return [bodyTrait(soul, locale), eyeTrait(soul, locale)].filter(Boolean);
}

/** 卡片编号：出生卡、名册与市场统一用四位补零。 */
export function catalogIndex(soul) {
  const id = Number(soul?.tokenId ?? soul?.seed ?? 0) || 0;
  return `#${String(id).padStart(4, "0")}`;
}

/**
 * 「第 N 代 · 存活」。未出生的预览样本不写存活，沿用预览徽标。
 * 状态只分「已出生 / 未出生」两种，不拿代数换算稀有度。
 */
export function vitalOf(soul) {
  const generation = Math.max(0, Math.floor(Number(soul?.generation) || 0));
  return {
    generation,
    statusKey: soul?.preview ? "ledger.previewBadge" : "ledger.card.alive",
  };
}

/** 图鉴计数：卡片网格右上角的「共 N 种」。 */
export function catalogCount(souls, locale = "en") {
  const list = Array.isArray(souls) ? souls : [];
  const kinds = new Set();
  for (const soul of list) {
    const art = soul?.phenotype?.art;
    if (!art) continue;
    kinds.add(
      `${art.body}|${art.eye}|${art.eyeLeft || art.eye}|${art.eyeRight || art.eye}|${art.stripes}|${art.mark}|${art.wingMark}|${art.wingShape}|${art.wingVein}|${art.sex}`,
    );
  }
  return row(
    locale,
    `${kinds.size} 种形态 · 共 ${list.length} 只`,
    `${kinds.size} forms · ${list.length} souls`,
  );
}
