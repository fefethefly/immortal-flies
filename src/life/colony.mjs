/**
 * Colony ledger views —— 纯函数层：群体普查、图鉴筛选、Gen0 图谱、血脉榜。
 *
 * 只读 roster（decorateSoul 之后的 soul cards）。出现率是解码器表的读数，不是定价。
 */
import {
  EYES,
  EYE_PAIRS,
  HUES,
  LIGHTS,
  MARKS,
  SATS,
  SEXES,
  SIZES,
  STRIPES,
  WING_MARKS,
  WING_SHAPES,
  WING_VEINS,
  comboCatalog,
} from "../brain/flyswarm/phenotype-loci.mjs";
import { labelOf, trueNameOf } from "./names.mjs";

export const COLONY_SORTS = Object.freeze([
  "new",
  "old",
  "gen",
  "kids",
  "rare",
]);

export const ATLAS_LOCI = Object.freeze([
  { id: "hue", table: HUES },
  { id: "sat", table: SATS },
  { id: "light", table: LIGHTS },
  { id: "eye", table: EYES },
  { id: "size", table: SIZES },
  { id: "stripes", table: STRIPES },
  { id: "mark", table: MARKS },
  { id: "wingMark", table: WING_MARKS },
  { id: "wingShape", table: WING_SHAPES },
  { id: "wingVein", table: WING_VEINS },
  { id: "sex", table: SEXES },
]);

/** 繁衍交叉只研磨前 10 个位点；性别每代重掷。 */
export const KIN_LOCI = Object.freeze(ATLAS_LOCI.slice(0, 10));

/** 普查图还包含不进 tokenURI 的复眼镶嵌。 */
export const DIVERSITY_LOCI = Object.freeze([
  ...ATLAS_LOCI,
  { id: "eyePair", table: EYE_PAIRS },
]);

function locusValue(phenotype, locus) {
  const row = phenotype?.[locus];
  if (!row) return "";
  if (locus === "stripes") return String(row.count);
  return String(row.id);
}

export function kidsOf(souls) {
  const kids = new Map();
  for (const soul of souls || []) {
    for (const parent of [
      Number(soul.parentA) || 0,
      Number(soul.parentB) || 0,
    ]) {
      if (parent > 0) kids.set(parent, (kids.get(parent) || 0) + 1);
    }
  }
  return kids;
}

/** tokenId -> 有多少只果蝇以它为祖先（独特后代数，即竞品 Biggest families 的口径）。 */
export function descendantCounts(souls) {
  const byId = new Map(
    (souls || []).map((soul) => [Number(soul.tokenId), soul]),
  );
  const descendants = new Map();
  for (const soul of souls || []) {
    const seen = new Set();
    let frontier = [
      Number(soul.parentA) || 0,
      Number(soul.parentB) || 0,
    ].filter((id) => id > 0);
    while (frontier.length) {
      const next = [];
      for (const id of frontier) {
        if (seen.has(id)) continue;
        seen.add(id);
        descendants.set(id, (descendants.get(id) || 0) + 1);
        const parent = byId.get(id);
        if (!parent) continue;
        for (const grand of [
          Number(parent.parentA) || 0,
          Number(parent.parentB) || 0,
        ]) {
          if (grand > 0) next.push(grand);
        }
      }
      frontier = next;
    }
  }
  return descendants;
}

export function censusOf(souls) {
  let gen0 = 0;
  let bred = 0;
  let highest = 0;
  let rare = 0;
  const wallets = new Set();
  for (const soul of souls || []) {
    const generation = Number(soul.generation) || 0;
    if (generation === 0) gen0 += 1;
    else bred += 1;
    if (generation > highest) highest = generation;
    if (soul.owner) wallets.add(String(soul.owner).toLowerCase());
    const expected = soul.phenotype?.scarcity?.expectedPer1024;
    if (typeof expected === "number" && expected < 1) rare += 1;
  }
  return {
    total: (souls || []).length,
    gen0,
    bred,
    highest,
    rare,
    wallets: wallets.size,
  };
}

export function hasColonyFilters(view = {}) {
  return Boolean(
    view.query ||
      view.hue ||
      view.eye ||
      view.size ||
      view.stripes ||
      view.mark ||
      view.generation ||
      view.mineOnly,
  );
}

export function filterColony(souls, view = {}) {
  const { query, locale, wallet } = view;
  let rows = souls || [];
  if (view.mineOnly && wallet) {
    const mine = String(wallet).toLowerCase();
    rows = rows.filter(
      (soul) => String(soul.owner || "").toLowerCase() === mine,
    );
  }
  for (const locus of ["hue", "eye", "size", "mark"]) {
    if (!view[locus]) continue;
    rows = rows.filter(
      (soul) => locusValue(soul.phenotype, locus) === String(view[locus]),
    );
  }
  if (view.stripes !== "" && view.stripes != null) {
    rows = rows.filter(
      (soul) => locusValue(soul.phenotype, "stripes") === String(view.stripes),
    );
  }
  if (view.generation === "0") {
    rows = rows.filter((soul) => (Number(soul.generation) || 0) === 0);
  } else if (view.generation === "1+") {
    rows = rows.filter((soul) => (Number(soul.generation) || 0) >= 1);
  }
  if (query && query.trim()) {
    const q = String(query).trim().toLowerCase();
    rows = rows.filter((soul) => {
      const label = labelOf(soul, locale).toLowerCase();
      const trueName = (
        soul.trueName || trueNameOf(soul.life, locale)
      ).toLowerCase();
      return (
        String(soul.tokenId) === q ||
        `#${soul.tokenId}` === q ||
        label.includes(q) ||
        trueName.includes(q) ||
        String(soul.givenName || "")
          .toLowerCase()
          .includes(q) ||
        (q.length >= 4 &&
          String(soul.life || "")
            .toLowerCase()
            .includes(q))
      );
    });
  }
  return rows;
}

function rareKey(soul) {
  const expected = soul?.phenotype?.scarcity?.expectedPer1024;
  return typeof expected === "number" ? expected : Infinity;
}

export function sortColony(souls, sort = "new", kids) {
  const childCounts = kids || kidsOf(souls);
  const rows = [...(souls || [])];
  if (sort === "old") {
    rows.sort((a, b) => a.tokenId - b.tokenId);
  } else if (sort === "gen") {
    rows.sort(
      (a, b) =>
        (Number(b.generation) || 0) - (Number(a.generation) || 0) ||
        a.tokenId - b.tokenId,
    );
  } else if (sort === "kids") {
    rows.sort(
      (a, b) =>
        (childCounts.get(b.tokenId) || 0) - (childCounts.get(a.tokenId) || 0) ||
        a.tokenId - b.tokenId,
    );
  } else if (sort === "rare") {
    rows.sort((a, b) => rareKey(a) - rareKey(b) || a.tokenId - b.tokenId);
  } else {
    rows.sort((a, b) => b.tokenId - a.tokenId);
  }
  return rows;
}

export function paginate(rows, page = 1, size = 24) {
  const total = Math.max(1, Math.ceil((rows.length || 0) / size));
  const current = Math.min(Math.max(1, Number(page) || 1), total);
  return {
    page: current,
    pages: total,
    slice: rows.slice((current - 1) * size, current * size),
  };
}

export function parseColonyView(search = "") {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const sort = params.get("sort");
  const generation = params.get("gen");
  return {
    query: params.get("q") || "",
    hue: params.get("hue") || "",
    eye: params.get("eye") || "",
    size: params.get("size") || "",
    stripes: params.get("stripes") || "",
    mark: params.get("mark") || "",
    generation: generation === "0" || generation === "1+" ? generation : "",
    sort: COLONY_SORTS.includes(sort) ? sort : "new",
  };
}

export function writeColonyView(view, search = "") {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const keepNet = params.get("net");
  const out = new URLSearchParams();
  if (keepNet) out.set("net", keepNet);
  if (view.query) out.set("q", view.query);
  for (const key of ["hue", "eye", "size", "stripes", "mark"]) {
    if (view[key]) out.set(key, String(view[key]));
  }
  if (view.generation) out.set("gen", view.generation);
  if (view.sort && view.sort !== "new") out.set("sort", view.sort);
  const text = out.toString();
  return text ? `?${text}` : "";
}

/** 每个位点的「已观测 vs 公布率」对照。默认只数 Gen0——公布率表是 Gen0 口径。 */
export function locusTally(souls, { generation = 0 } = {}) {
  const rows = (souls || []).filter(
    (soul) => (Number(soul.generation) || 0) === Number(generation),
  );
  const n = rows.length;
  return DIVERSITY_LOCI.map(({ id, table }) => {
    const counts = new Map();
    for (const soul of rows) {
      const value = locusValue(soul.phenotype, id);
      if (value !== "") counts.set(value, (counts.get(value) || 0) + 1);
    }
    const traits = table.map((row) => ({
      id: String(row.id),
      en: row.en,
      zh: row.zh,
      bps: row.bps,
      seen: counts.get(String(row.id)) || 0,
      pct: n ? ((counts.get(String(row.id)) || 0) / n) * 100 : 0,
      expectedPct: row.bps / 100,
    }));
    return { locus: id, n, traits };
  });
}

export function comboKeyOf(phenotype) {
  if (!phenotype?.hue) return "";
  return [
    phenotype.hue.id,
    phenotype.sat.id,
    phenotype.light.id,
    phenotype.eye.id,
    phenotype.size.id,
    phenotype.stripes.count,
    phenotype.mark.id,
  ].join("|");
}

export function rarestSouls(souls, limit = 6) {
  return [...(souls || [])]
    .filter(
      (soul) => typeof soul.phenotype?.scarcity?.expectedPer1024 === "number",
    )
    .sort((a, b) => rareKey(a) - rareKey(b) || a.tokenId - b.tokenId)
    .slice(0, limit);
}

/** 已孵出的组合里最稀的几只（Gen0 口径）。 */
export function rarestGen0Combos(souls, limit = 6) {
  const seen = new Map();
  for (const soul of souls || []) {
    if ((Number(soul.generation) || 0) !== 0) continue;
    const key = comboKeyOf(soul.phenotype);
    if (!key || seen.has(key)) continue;
    seen.set(key, soul);
  }
  return [...seen.values()]
    .sort((a, b) => rareKey(a) - rareKey(b))
    .slice(0, limit);
}

/** 公布率最高、但链上还没有人孵出的组合——「理论里有、现实里还没见」。 */
export function unseenCombos(souls, limit = 8) {
  const seen = new Set(
    (souls || [])
      .filter((soul) => (Number(soul.generation) || 0) === 0)
      .map((soul) => comboKeyOf(soul.phenotype))
      .filter(Boolean),
  );
  return comboCatalog()
    .rows.filter((row) => !seen.has(row.key))
    .slice(0, limit)
    .map((row) => {
      const [hue, sat, light, eye, size, stripes, mark] = row.key.split("|");
      return {
        key: row.key,
        comboP: row.p,
        expectedPer1024: row.p * 1024,
        parts: { hue, sat, light, eye, size, stripes, mark },
      };
    });
}

/** 详情弹窗的主键：预览标本用 seed，链上灵魂用 tokenId，避免两边编号撞车。 */
export function colonyDetailKey(soul) {
  if (!soul) return "";
  if (soul.preview) return `p:${Number(soul.seed) || 0}`;
  return `s:${Number(soul.tokenId) || 0}`;
}

export function soulFromDetailKey(key, { souls = [], previews = [] } = {}) {
  const raw = String(key || "");
  if (raw.startsWith("p:")) {
    const seed = Number(raw.slice(2));
    if (!seed) return null;
    return previews.find((row) => Number(row.seed) === seed) || null;
  }
  if (raw.startsWith("s:")) {
    const id = Number(raw.slice(2));
    if (!id) return null;
    return souls.find((row) => Number(row.tokenId) === id) || null;
  }
  const id = Number(raw);
  if (!id) return null;
  return souls.find((row) => Number(row.tokenId) === id) || null;
}

export function boardsOf(souls, limit = 6) {
  const byId = new Map(
    (souls || []).map((soul) => [Number(soul.tokenId), soul]),
  );
  const kids = kidsOf(souls);
  const descendants = descendantCounts(souls);
  const families = [...descendants.entries()]
    .filter(([id]) => byId.has(id))
    .sort(([idA, a], [idB, b]) => b - a || idA - idB)
    .slice(0, limit)
    .map(([id, count]) => ({ soul: byId.get(id), descendants: count }));
  const deepest = [...(souls || [])]
    .filter((soul) => (Number(soul.generation) || 0) > 0)
    .sort(
      (a, b) =>
        (Number(b.generation) || 0) - (Number(a.generation) || 0) ||
        a.tokenId - b.tokenId,
    )
    .slice(0, limit);
  return { kids, families, deepest, rarest: rarestSouls(souls, limit) };
}
