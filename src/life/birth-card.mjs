import { formatExpected } from "../brain/flyswarm/phenotype-loci.mjs";
import { catalogIndex, traitSwatches } from "./fly-traits.mjs";
import { labelOf, trueNameOf } from "./names.mjs";

export const CARD_W = 1400;
export const CARD_H = 1400;
export const CARD_SERIES = "IMMORTAL FRUIT FLIES";
export const TRAIT_LOCI = Object.freeze([
  "hue",
  "sat",
  "light",
  "eye",
  "size",
  "stripes",
  "mark",
]);
const FORM_LOCI = Object.freeze(["hue", "eye", "size"]);
const FINISH_LOCI = Object.freeze(["sat", "light", "stripes", "mark"]);
const BADGE_ORDER = Object.freeze([
  "eye",
  "mark",
  "hue",
  "stripes",
  "size",
  "sat",
  "light",
]);
const BADGE_SKIP = Object.freeze({
  eye: "wild",
  mark: "none",
  size: "typical",
  sat: "muted",
  light: "mid",
  stripes: "2",
});

export function locusId(soul, key) {
  return soul?.phenotype?.[key]?.id || "";
}

export function traitLine(soul, locale = "en") {
  return joinLoci(soul, TRAIT_LOCI, locale);
}

export function formLine(soul, locale = "en") {
  return joinLoci(soul, FORM_LOCI, locale);
}

export function finishLine(soul, locale = "en") {
  return joinLoci(soul, FINISH_LOCI, locale);
}

function joinLoci(soul, keys, locale) {
  if (!soul?.phenotype) return "";
  return keys
    .map((key) => {
      const row = soul.phenotype[key];
      return row?.[locale] || row?.en || "";
    })
    .filter(Boolean)
    .join(" · ");
}

function skipBadge(key, row) {
  return BADGE_SKIP[key] != null && String(row?.id) === BADGE_SKIP[key];
}

export function catalogTag(key, row, locale = "en") {
  if (!row) return "";
  if (locale === "zh") return row.zh || row.en || "";
  if (key === "eye") {
    if (row.id === "wild") return "WILD-TYPE";
    const stem = String(row.en || row.id)
      .replace(/ eyes$/i, "")
      .replace(/-type$/i, "");
    return `${stem.toUpperCase().replace(/\s+/g, "-")}-EYED`;
  }
  if (key === "mark") {
    if (row.id === "bar") return "DORSAL-BAR";
    if (row.id === "spots") return "TWIN-SPOTTED";
    return "UNMARKED";
  }
  if (key === "stripes") return `${row.count ?? row.id}-STRIPED`;
  return String(row.id || row.en || "")
    .toUpperCase()
    .replace(/\s+/g, "-");
}

export function catalogTags(soul, locale = "en") {
  const rows = TRAIT_LOCI.map((key) => {
    const row = soul?.phenotype?.[key];
    if (!row) return null;
    return { key, row, bps: Number(row.bps) || 10000 };
  }).filter(Boolean);
  const ranked = [...rows].sort((a, b) => {
    const skipA = skipBadge(a.key, a.row) ? 1 : 0;
    const skipB = skipBadge(b.key, b.row) ? 1 : 0;
    if (skipA !== skipB) return skipA - skipB;
    if (a.bps !== b.bps) return a.bps - b.bps;
    return BADGE_ORDER.indexOf(a.key) - BADGE_ORDER.indexOf(b.key);
  });
  const picks = ranked
    .filter((item) => !skipBadge(item.key, item.row))
    .slice(0, 2);
  if (!picks.length && ranked[0]) picks.push(ranked[0]);
  return picks.map((item) => catalogTag(item.key, item.row, locale));
}

export function catalogBadge(soul, locale = "en") {
  return catalogTags(soul, locale).join(" · ");
}

export function rarityOf(soul) {
  const n = soul?.phenotype?.scarcity?.expectedPer1024;
  if (!Number.isFinite(n)) return "";
  return `≈${formatExpected(n)}/1024`;
}

const CJK = /[\u4e00-\u9fff]/;

export function displayName(soul, locale = "en") {
  const given = soul?.givenName || "";
  const trueName = trueNameOf(soul?.life, locale);
  if (given && (locale !== "en" || !CJK.test(given))) return given;
  return trueName;
}

export function parentsOf(soul, souls = []) {
  const find = (id) => {
    const n = Number(id) || 0;
    if (!n) return null;
    return souls.find((item) => item.tokenId === n) || { tokenId: n };
  };
  return {
    parentA: find(soul?.parentA),
    parentB: find(soul?.parentB),
  };
}

export function mixOf(child, parentA, parentB) {
  if (!child?.phenotype || !parentA?.phenotype || !parentB?.phenotype)
    return null;
  const parts = TRAIT_LOCI.map((key) => {
    const c = locusId(child, key);
    const a = locusId(parentA, key);
    const b = locusId(parentB, key);
    let source = "new";
    if (c && a && b && c === a && c === b) source = "both";
    else if (c && a && c === a) source = "a";
    else if (c && b && c === b) source = "b";
    return { key, source, id: c };
  });
  const count = (source) =>
    parts.filter((part) => part.source === source).length;
  return {
    parts,
    a: count("a"),
    b: count("b"),
    both: count("both"),
    novel: count("new"),
  };
}

export function birthHref(soul, origin = "", locale = "") {
  const id = Number(soul?.tokenId) || 0;
  const base = String(origin || "").replace(/\/+$/, "");
  const url = new URL(`${base || "https://local.test"}/habitat.html`);
  url.searchParams.set("soul", String(id));
  url.searchParams.set("card", "1");
  if (locale === "en" || locale === "zh") url.searchParams.set("lang", locale);
  if (!origin) return `${url.pathname}${url.search}`;
  return `${base}/habitat.html${url.search}`;
}

export function birthFileName(soul) {
  const id = Number(soul?.tokenId) || 0;
  const slug = String(soul?.givenName || trueNameOf(soul?.life, "en") || "soul")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `iff-birth-${id}${slug ? `-${slug}` : ""}.png`;
}

export function describeBirth(
  soul,
  souls,
  { locale = "en", origin = "", chainName = "", tx },
) {
  const { parentA, parentB } = parentsOf(soul, souls);
  const bred = Boolean(parentA && parentB && soul?.generation > 0);
  const mix = bred ? mixOf(soul, parentA, parentB) : null;
  const name = displayName(soul, locale);
  const href = birthHref(soul, origin, locale);
  const host = (() => {
    try {
      return new URL(href).host;
    } catch {
      return origin.replace(/^https?:\/\//, "") || "local";
    }
  })();
  const mixLine = mix
    ? tx("birth.mix", {
        a: mix.a,
        aid: parentA.tokenId,
        b: mix.b,
        bid: parentB.tokenId,
        both: mix.both,
        n: mix.novel,
      })
    : tx("birth.seed");
  return {
    soul,
    parentA: bred ? parentA : null,
    parentB: bred ? parentB : null,
    mix,
    bred,
    locale,
    name,
    trueName: trueNameOf(soul?.life, locale),
    label: labelOf(soul, locale),
    traits: traitLine(soul, locale),
    formLine: formLine(soul, locale),
    finishLine: finishLine(soul, locale),
    series: tx("birth.series"),
    badge: catalogBadge(soul, locale),
    plateName: name,
    tokenMark: `#${soul.tokenId}`,
    plateIndex: catalogIndex(soul),
    traitRows: traitSwatches(soul, locale),
    rarityLine: rarityOf(soul),
    vitalLine: `${
      locale === "zh" ? `第${soul.generation || 0}代` : `Gen ${soul.generation || 0}`
    } · ${tx("ledger.card.alive")}`,
    accession: tx(bred ? "birth.accession.bred" : "birth.accession.hatched", {
      n: soul.generation || 0,
    }),
    parentLine: bred
      ? tx("birth.childOf", {
          n: soul.generation,
          a: parentA.tokenId,
          b: parentB.tokenId,
        })
      : "",
    header: tx("birth.header"),
    lead: tx("birth.lead"),
    childTitle: `#${soul.tokenId} ${name}`,
    childSub: bred
      ? tx("birth.childOf", {
          n: soul.generation,
          a: parentA.tokenId,
          b: parentB.tokenId,
        })
      : tx("birth.gen0"),
    parentACaption: parentA?.phenotype
      ? `#${parentA.tokenId} ${displayName(parentA, locale)}`
      : parentA
        ? `#${parentA.tokenId}`
        : "",
    parentBCaption: parentB?.phenotype
      ? `#${parentB.tokenId} ${displayName(parentB, locale)}`
      : parentB
        ? `#${parentB.tokenId}`
        : "",
    parentATraits: traitLine(parentA, locale),
    parentBTraits: traitLine(parentB, locale),
    mixLine,
    footer: tx(bred ? "birth.footer.breed" : "birth.footer.hatch", {
      host,
      chain:
        chainName ||
        tx(
          Number(soul?.chainId) === 56
            ? "birth.chain.main"
            : "birth.chain.test",
        ),
    }),
    shareUrl: href,
    filename: birthFileName(soul),
    shareText: tx("birth.copy", {
      name,
      id: soul.tokenId,
      line: bred
        ? tx("birth.childOf", {
            n: soul.generation,
            a: parentA.tokenId,
            b: parentB.tokenId,
          })
        : tx("birth.gen0"),
    }),
  };
}

export function wantsBirthCard(search = "") {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return params.get("card") === "1" ? Number(params.get("soul")) || 0 : 0;
}

export function withBirthQuery(href, tokenId, open, locale) {
  const url = new URL(href, "https://local.test");
  url.searchParams.set("soul", String(tokenId));
  if (open) url.searchParams.set("card", "1");
  else url.searchParams.delete("card");
  if (locale === "en" || locale === "zh") url.searchParams.set("lang", locale);
  return `${url.pathname}${url.search}`;
}
