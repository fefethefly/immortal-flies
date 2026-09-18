import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  EYES,
  HUES,
  MARKS,
  SIZES,
  STRIPES,
  formatExpected,
} from "../brain/flyswarm/phenotype-loci.mjs";
import { PhenotypeReadout } from "../phenotype-view.jsx";
import { SiteLink, SitePage } from "../site-chrome.jsx";
import { useLocale } from "../use-locale.mjs";
import { loadLifeDeployment, openLifeReader } from "./chain.mjs";
import {
  ATLAS_LOCI,
  KIN_LOCI,
  boardsOf,
  censusOf,
  colonyDetailKey,
  filterColony,
  hasColonyFilters,
  kidsOf,
  locusTally,
  paginate,
  parseColonyView,
  rarestGen0Combos,
  soulFromDetailKey,
  sortColony,
  unseenCombos,
  writeColonyView,
} from "./colony.mjs";
import { sampleDescent } from "./predict.mjs";
import { expectedCrossoverLoci, traitsOfSeed } from "./descent.mjs";
import { previewSpecimens } from "./preview.mjs";
import { KinBoard } from "./kin.jsx";
import {
  FlyCatalogChip,
  FlyIndex,
  FlyTraitRows,
  FlyVital,
} from "./fly-card.jsx";
import { CatalogPortrait as MarketThumb } from "./catalog-portrait.jsx";
import { labelOf } from "./names.mjs";
import { withNet } from "./net.mjs";
import { hydrateColony, querySoulId, shortAddr } from "./souls.mjs";
import { useConnectedWallet } from "./use-connected-wallet.mjs";
import "./life.css";
import "./colony.css";

const PAGE_SIZE = 24;
const SIM_SAMPLES = 6;
const BOARD_LIMIT = 6;

function useColonyWorld() {
  const [deployment, setDeployment] = useState(undefined);
  const [souls, setSouls] = useState([]);
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState(false);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let gone = false;
    loadLifeDeployment()
      .then(async (data) => {
        if (gone) return;
        setDeployment(data);
        if (!data) return;
        try {
          const reader = await openLifeReader(data);
          if (!reader?.soul) return;
          const genesisRoot =
            (await reader.soul.genesisRoot().catch(() => data.genesisRoot)) ||
            data.genesisRoot;
          const extras = {
            genesisRoot,
            chainId: data.chainId,
            fieldCount: 1,
          };
          const taggedId = querySoulId(window.location.search);
          const { roster, rosterError: missed } = await hydrateColony(
            reader.soul,
            extras,
            taggedId,
            (done, total) => {
              if (!gone) setProgress({ done, total });
            },
          );
          if (!gone) {
            setSouls(roster);
            setRosterError(missed);
          }
        } catch {
          if (!gone) setRosterError(true);
        }
      })
      .catch((err) => {
        if (!gone) {
          setDeployment(null);
          setError(err.message || String(err));
        }
      });
    return () => {
      gone = true;
    };
  }, []);

  return { deployment, souls, setSouls, error, rosterError, progress };
}

function traitLabel(row, locale) {
  return locale === "zh" ? row.zh : row.en;
}

function soulTitle(soul, locale) {
  if (!soul) return "";
  if (soul.preview) {
    const hue = soul.phenotype?.hue;
    const hueName = hue ? hue[locale] || hue.en : "";
    return `${hueName} #${soul.seed}`.trim();
  }
  return `${soul.givenName || labelOf(soul, locale)} #${soul.tokenId}`;
}

function cardChromeClick(event) {
  return Boolean(
    event.target.closest("a, button, summary, input, select, textarea"),
  );
}

function ColonyCensus({ census, tx }) {
  const rows = [
    ["total", census.total],
    ["gen0", census.gen0],
    ["bred", census.bred],
    ["gen", census.highest],
    ["rare", census.rare],
    ["wallets", census.wallets],
  ];
  return (
    <div className="life-census" aria-label={tx("ledger.census")}>
      <h3>
        {tx("ledger.census")} <small>CENSUS</small>
      </h3>
      {rows.map(([key, value]) => (
        <div key={key}>
          <strong>{value}</strong>
          <small>{tx(`ledger.census.${key}`)}</small>
        </div>
      ))}
    </div>
  );
}

function LocusBars({ locus, locale, tx }) {
  const scale = Math.max(
    ...locus.traits.map((row) => Math.max(row.pct, row.expectedPct)),
    1,
  );
  return (
    <div className="colony-locus">
      <h4>
        {locus.locus} <small>{tx("ledger.atlasN", { n: locus.n })}</small>
      </h4>
      <ul>
        {locus.traits.map((row) => (
          <li key={row.id}>
            <span className="colony-locus-name">{row[locale] || row.en}</span>
            <span className="colony-bars">
              <i
                className="is-seen"
                style={{ width: `${(row.pct / scale) * 100}%` }}
              />
              <i
                className="is-expected"
                style={{ width: `${(row.expectedPct / scale) * 100}%` }}
              />
            </span>
            <span className="colony-locus-nums">
              <b>{row.pct ? `${row.pct.toFixed(1)}%` : "—"}</b>
              <small>{row.expectedPct.toFixed(1)}%</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ColonyDetail({
  soul,
  souls,
  kids,
  onClose,
  onPick,
  onPredict,
  locale,
  tx,
}) {
  const preview = Boolean(soul.preview);
  const panelRef = useRef(null);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const childCount = kids.get(Number(soul.tokenId)) || 0;
  const gen = Number(soul.generation) || 0;
  return (
    <div
      className="life-market-buy"
      role="dialog"
      aria-modal="true"
      aria-labelledby="colony-detail-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="life-market-buy-card colony-detail"
        tabIndex={-1}
        style={{ "--pheno-body": soul.phenotype?.art?.body || "#8a6a2a" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="colony-detail-title">{soulTitle(soul, locale)}</h2>
        <p className="life-meta">
          {preview ? (
            <>
              {tx("ledger.previewBadge")} · {tx("ledger.detail.gen", { n: 0 })}
            </>
          ) : (
            <>
              {tx("ledger.detail.gen", { n: gen })} ·{" "}
              {tx("ledger.card.kids", { n: childCount })} ·{" "}
              {tx("ledger.detail.owner")} {shortAddr(soul.owner)}
              {soul.bornBlock
                ? ` · ${tx("ledger.detail.birth", { n: soul.bornBlock })}`
                : ""}
            </>
          )}
        </p>
        <p className="life-meta">
          {tx("ledger.detail.seed")} {soul.seed} ·{" "}
          {tx("ledger.card.per1024", {
            n: formatExpected(
              soul.phenotype?.scarcity?.expectedPer1024 ??
                soul.expectedPer1024 ??
                Infinity,
            ),
          })}
        </p>
        <figure className="colony-detail-art">
          <MarketThumb soul={soul} />
        </figure>
        <FlyTraitRows soul={soul} locale={locale} />
        <FlyVital soul={soul} locale={locale} tx={tx} />
        {preview ? (
          <p className="life-note">{tx("ledger.detail.unborn")}</p>
        ) : null}
        <PhenotypeReadout fly={soul} locale={locale} />
        {preview ? null : (
          <KinBoard
            souls={souls}
            selected={soul}
            setSelected={onPick}
            locale={locale}
            tx={tx}
          />
        )}
        <div className="life-kin-row">
          {preview ? null : (
            <>
              <button type="button" onClick={() => onPredict(soul)}>
                {tx("ledger.card.predict")}
              </button>
              <SiteLink
                href={withNet(`/habitat.html?soul=${soul.tokenId}`)}
                className="ghost"
              >
                {tx("ledger.card.open")}
              </SiteLink>
            </>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            {tx("ledger.detail.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PredictorRow({ row, fromParent }) {
  const scale = Math.max(row.pct, 1);
  return (
    <li className={fromParent ? "is-from-parent" : undefined}>
      <span className="colony-locus-name">
        {row.label}
        {fromParent ? <em>{fromParent}</em> : null}
      </span>
      <span className="colony-bars">
        <i
          className="is-seen"
          style={{ width: `${(row.pct / scale) * 100}%` }}
        />
      </span>
      <span className="colony-locus-nums">
        <b>{row.pct >= 0.05 ? `${row.pct.toFixed(1)}%` : "<0.1%"}</b>
      </span>
    </li>
  );
}

export function ColonyPage() {
  const [locale, setLocale, tx] = useLocale(
    "meta.colonyTitle",
    "meta.colonyDesc",
  );
  const { deployment, souls, error, rosterError, progress } = useColonyWorld();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const { wallet, dialog, connect } = useConnectedWallet(deployment, tx);

  const firstView = parseColonyView(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const [query, setQuery] = useState(firstView.query);
  const [hue, setHue] = useState(firstView.hue);
  const [eye, setEye] = useState(firstView.eye);
  const [size, setSize] = useState(firstView.size);
  const [stripes, setStripes] = useState(firstView.stripes);
  const [mark, setMark] = useState(firstView.mark);
  const [generation, setGeneration] = useState(firstView.generation);
  const [sort, setSort] = useState(firstView.sort);
  const [mineOnly, setMineOnly] = useState(
    () =>
      typeof window !== "undefined" && window.location.hash === "#mine",
  );
  const [page, setPage] = useState(1);
  const [detailKey, setDetailKey] = useState("");
  const [parentA, setParentA] = useState("");
  const [parentB, setParentB] = useState("");
  const [simResult, setSimResult] = useState(null);
  const [simNote, setSimNote] = useState("");
  const [kinCount, setKinCount] = useState(null);
  const [previewPage, setPreviewPage] = useState(1);

  const focusId = useMemo(
    () =>
      querySoulId(typeof window === "undefined" ? "" : window.location.search),
    [],
  );
  const focusOpened = useRef(false);
  const predictRef = useRef(null);

  const kids = useMemo(() => kidsOf(souls), [souls]);
  const census = useMemo(() => censusOf(souls), [souls]);
  const tally = useMemo(() => locusTally(souls), [souls]);
  const rarest = useMemo(() => rarestGen0Combos(souls), [souls]);
  const unseen = useMemo(() => unseenCombos(souls), [souls]);
  const boards = useMemo(() => boardsOf(souls, BOARD_LIMIT), [souls]);
  const previews = useMemo(() => previewSpecimens(), []);
  const spotlight = useMemo(() => previews.slice(0, 6), [previews]);
  const view = useMemo(
    () => ({ query, hue, eye, size, stripes, mark, generation, sort }),
    [query, hue, eye, size, stripes, mark, generation, sort],
  );

  const shown = useMemo(
    () =>
      sortColony(
        filterColony(souls, { ...view, locale, wallet, mineOnly }),
        sort,
        kids,
      ),
    [souls, view, locale, wallet, mineOnly, sort, kids],
  );
  const paged = useMemo(() => paginate(shown, page, PAGE_SIZE), [shown, page]);
  const previewRows = useMemo(
    () =>
      sortColony(
        filterColony(previews, {
          locale,
          hue,
          eye,
          size,
          stripes,
          mark,
          generation,
        }),
        sort,
      ),
    [previews, locale, hue, eye, size, stripes, mark, generation, sort],
  );
  const previewPaged = useMemo(
    () => paginate(previewRows, previewPage, 18),
    [previewRows, previewPage],
  );

  useEffect(() => {
    setPage(1);
  }, [
    query,
    hue,
    eye,
    size,
    stripes,
    mark,
    generation,
    sort,
    mineOnly,
    wallet,
  ]);

  useEffect(
    () => setPreviewPage(1),
    [hue, eye, size, stripes, mark, generation, sort],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = writeColonyView(view, window.location.search);
    const path = `${window.location.pathname}${next}`;
    const now = `${window.location.pathname}${window.location.search}`;
    if (now !== path) window.history.replaceState(null, "", path);
  }, [view]);

  useEffect(() => {
    if (!deployment?.kin) return undefined;
    let gone = false;
    openLifeReader(deployment)
      .then(async (reader) => {
        if (
          gone ||
          !reader?.kin ||
          typeof reader.kin.requestCount !== "function"
        ) {
          return;
        }
        try {
          const count = Number(await reader.kin.requestCount());
          if (!gone) setKinCount(count);
        } catch {
          /* kin counter unread */
        }
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [deployment?.kin]);

  useEffect(() => {
    if (focusOpened.current || !souls.length || !focusId) return;
    const hit = souls.find((soul) => Number(soul.tokenId) === focusId);
    if (hit) {
      focusOpened.current = true;
      setDetailKey(colonyDetailKey(hit));
    }
  }, [souls, focusId]);

  useEffect(() => {
    if (!focusId) return;
    document
      .querySelector(".life-market-card.is-focus")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusId, paged.slice.length]);

  async function onConnect() {
    setNote("");
    try {
      await connect();
    } catch (err) {
      setNote(err?.shortMessage || err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  function clearFilters() {
    setQuery("");
    setHue("");
    setEye("");
    setSize("");
    setStripes("");
    setMark("");
    setGeneration("");
    setMineOnly(false);
    if (typeof window !== "undefined" && window.location.hash === "#mine") {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(null, "", url);
    }
  }

  function toggleMine() {
    const next = !mineOnly;
    setMineOnly(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next) url.hash = "mine";
      else url.hash = "";
      window.history.replaceState(null, "", url);
    }
    document
      .getElementById("explore")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (next && !wallet) onConnect();
  }

  const detailSoul = soulFromDetailKey(detailKey, { souls, previews });

  function openDetail(soul) {
    setDetailKey(colonyDetailKey(soul));
  }

  const cardA = parentA
    ? souls.find((soul) => String(soul.tokenId) === String(parentA)) || null
    : null;
  const cardB = parentB
    ? souls.find((soul) => String(soul.tokenId) === String(parentB)) || null
    : null;

  const parentTraitIds = useMemo(() => {
    if (!cardA?.seed || !cardB?.seed) return null;
    return [traitsOfSeed(cardA.seed), traitsOfSeed(cardB.seed)];
  }, [cardA?.seed, cardB?.seed]);
  const analytical = useMemo(() => {
    if (!parentTraitIds) return null;
    const rows = expectedCrossoverLoci(parentTraitIds[0], parentTraitIds[1]);
    return Object.fromEntries(rows.map((row) => [row.locus, row.rows]));
  }, [parentTraitIds]);

  function onPredict(soul) {
    const id = String(soul.tokenId);
    if (!parentA || parentA === id) setParentA(id);
    else if (!parentB || parentB === id) setParentB(id);
    else setParentA(id);
    setDetailKey("");
    requestAnimationFrame(() => {
      predictRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function runSim() {
    setSimNote("");
    if (!cardA || !cardB) {
      setSimResult(null);
      setSimNote(tx("ledger.needTwo"));
      return;
    }
    if (Number(cardA.tokenId) === Number(cardB.tokenId)) {
      setSimResult(null);
      setSimNote(tx("ledger.needTwo"));
      return;
    }
    try {
      const result = sampleDescent({
        parentA: cardA,
        parentB: cardB,
        collection: deployment?.address,
        requestId: (kinCount ?? 0) + 1,
        chainId: deployment?.chainId,
        genesisRoot: undefined,
        count: SIM_SAMPLES,
      });
      setSimResult(result);
    } catch (err) {
      setSimResult(null);
      setSimNote(err?.message || String(err));
    }
  }

  function locusRows(locus) {
    const table = KIN_LOCI.find((row) => row.id === locus)?.table || [];
    const rows = analytical?.[locus] || [];
    return rows.map((row) => {
      const trait = table.find((item) => String(item.id) === String(row.id));
      return { ...row, label: trait ? traitLabel(trait, locale) : row.id };
    });
  }

  const holdsBoth =
    Boolean(wallet && cardA && cardB) &&
    cardA.owner?.toLowerCase() === wallet.toLowerCase() &&
    cardB.owner?.toLowerCase() === wallet.toLowerCase();
  const ownersDiffer =
    Boolean(cardA?.owner && cardB?.owner) &&
    cardA.owner.toLowerCase() !== cardB.owner.toLowerCase();

  const testnet = Number(deployment?.chainId) === 97;
  const booting = deployment === undefined;
  const loading = booting || (progress && progress.done < progress.total);

  const parentOptions = useMemo(
    () =>
      [...souls]
        .sort((a, b) => a.tokenId - b.tokenId)
        .map((soul) => (
          <option key={soul.tokenId} value={soul.tokenId}>
            #{soul.tokenId} {soul.givenName || labelOf(soul, locale)} · Gen
            {Number(soul.generation) || 0}
          </option>
        )),
    [souls, locale],
  );

  return (
    <SitePage
      current="colony"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      className="life-page"
    >
      {dialog}
      <main className="life-shell is-colony">
        <header className="colony-cover">
          <div className="colony-cover-title">
            <span className="colony-cover-kicker">THE IMMORTAL COLLECTION</span>
            <h1>
              {locale === "zh" ? "萌果蝇图鉴" : "Tiny flies, big wonders"}
            </h1>
          </div>
          <p className="colony-cover-stats">
            <span>
              <b>{census.total}</b>
              {tx("ledger.census.total")}
            </span>
            <span>
              <b>{census.gen0}</b>
              {tx("ledger.census.gen0")}
            </span>
            <span>
              <b>{census.bred}</b>
              {tx("ledger.census.bred")}
            </span>
            <span>
              <b>{census.rare}</b>
              {tx("ledger.census.rare")}
            </span>
            <a href="#preview" className="colony-cover-seal">
              ✧ <b>{previews.length}</b>
              <span>{locale === "zh" ? "种预览" : "previews"}</span>
            </a>
          </p>
        </header>
        <aside className="life-rail">
          <div className="life-kin colony-wallet">
            <button type="button" onClick={onConnect} disabled={busy}>
              {wallet ? shortAddr(wallet) : tx("life.connect")}
            </button>
            {wallet ? (
              <>
                <p className="life-meta">
                  {tx("life.mineCount", {
                    n: souls.filter(
                      (soul) =>
                        soul.owner?.toLowerCase() === wallet.toLowerCase(),
                    ).length,
                  })}
                </p>
                <label className="colony-mine">
                  <input
                    type="checkbox"
                    checked={mineOnly}
                    onChange={(event) => setMineOnly(event.target.checked)}
                  />
                  {tx("ledger.mine")}
                </label>
              </>
            ) : null}
          </div>
          <details className="colony-ledger-info">
            <summary>
              {locale === "zh" ? "群体台账" : "Colony ledger"}
              <span>
                {census.total}{" "}
                {locale === "zh" ? "只链上果蝇" : "on-chain souls"} ↗
              </span>
            </summary>
            <span className="eyebrow">COLONY / LEDGER</span>
            <h1>
              {tx("ledger.title")} <small>{tx("ledger.kicker")}</small>
            </h1>
            <p>{tx("ledger.lead")}</p>
            <p className="life-note">{tx("ledger.boundary")}</p>
            {testnet ? <p className="life-note">{tx("life.testnet")}</p> : null}
            {booting ? (
              <p className="life-meta">● …</p>
            ) : loading ? (
              <p className="life-meta">
                {tx("ledger.reading", {
                  done: progress?.done ?? 0,
                  total: progress?.total ?? 0,
                })}
              </p>
            ) : null}
            {deployment === null ? (
              <>
                <p className="life-note">{tx("life.colonyMiss")}</p>
                <SiteLink href="/colony.html?net=test" className="life-cross">
                  {tx("ledger.openTestnet")}
                </SiteLink>
              </>
            ) : null}
            {rosterError ? (
              <p className="life-note">{tx("life.colonyMiss")}</p>
            ) : null}
            <ColonyCensus census={census} tx={tx} />
            <div className="life-cross-row">
              <SiteLink href={withNet("/habitat.html")} className="life-cross">
                {tx("ledger.toHabitat")}
              </SiteLink>
              <SiteLink href={withNet("/market.html")} className="life-cross">
                {tx("ledger.toMarket")}
              </SiteLink>
              <SiteLink href={withNet("/host.html")} className="life-cross">
                {tx("ledger.toHost")}
              </SiteLink>
            </div>
            {note ? <p className="pit-error">{note}</p> : null}
            {error ? <p className="pit-error">{error}</p> : null}
          </details>
        </aside>
        <section className="life-stage is-colony">
          <nav className="colony-tabs" aria-label={tx("nav.label")}>
            <a href="#explore">{tx("ledger.tab.explore")}</a>
            <button
              type="button"
              className={`colony-tab-mine${mineOnly ? " is-on" : ""}`}
              aria-pressed={mineOnly}
              onClick={toggleMine}
            >
              ★ {tx("ledger.tab.mine")}
            </button>
            <a href="#preview">{tx("ledger.tab.preview")}</a>
            <a href="#atlas">{tx("ledger.tab.atlas")}</a>
            <a href="#predict">{tx("ledger.tab.predict")}</a>
            <a href="#boards">{tx("ledger.tab.boards")}</a>
          </nav>

          <section
            id="explore"
            className="colony-section"
            aria-label={tx("ledger.exploreTitle")}
          >
            <header className="life-market-head">
              <div>
                <span className="eyebrow">ROSTER</span>
                <h2>{tx("ledger.exploreTitle")}</h2>
              </div>
              <div className="life-market-tools">
                <FlyCatalogChip souls={souls} locale={locale} />
                <small>
                  {tx("ledger.shown", { n: shown.length, total: souls.length })}
                </small>
              </div>
            </header>
            <div className="life-market-filters">
              <label>
                {tx("ledger.search")}
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="#1 / name / lifeId"
                />
              </label>
              <label>
                {tx("ledger.filterHue")}
                <select
                  value={hue}
                  onChange={(event) => setHue(event.target.value)}
                >
                  <option value="">{tx("ledger.filterAny")}</option>
                  {HUES.map((row) => (
                    <option key={row.id} value={row.id}>
                      {traitLabel(row, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("ledger.filterEye")}
                <select
                  value={eye}
                  onChange={(event) => setEye(event.target.value)}
                >
                  <option value="">{tx("ledger.filterAny")}</option>
                  {EYES.map((row) => (
                    <option key={row.id} value={row.id}>
                      {traitLabel(row, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("ledger.filterSize")}
                <select
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                >
                  <option value="">{tx("ledger.filterAny")}</option>
                  {SIZES.map((row) => (
                    <option key={row.id} value={row.id}>
                      {traitLabel(row, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("ledger.filterStripes")}
                <select
                  value={stripes}
                  onChange={(event) => setStripes(event.target.value)}
                >
                  <option value="">{tx("ledger.filterAny")}</option>
                  {STRIPES.map((row) => (
                    <option key={row.id} value={row.id}>
                      {traitLabel(row, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("ledger.filterMark")}
                <select
                  value={mark}
                  onChange={(event) => setMark(event.target.value)}
                >
                  <option value="">{tx("ledger.filterAny")}</option>
                  {MARKS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {traitLabel(row, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tx("ledger.filterGen")}
                <select
                  value={generation}
                  onChange={(event) => setGeneration(event.target.value)}
                >
                  <option value="">{tx("ledger.filterAny")}</option>
                  <option value="0">{tx("ledger.filterGen0")}</option>
                  <option value="1+">{tx("ledger.filterGen1")}</option>
                </select>
              </label>
              <label>
                {tx("ledger.sort")}
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="new">{tx("ledger.sortNew")}</option>
                  <option value="old">{tx("ledger.sortOld")}</option>
                  <option value="gen">{tx("ledger.sortGen")}</option>
                  <option value="kids">{tx("ledger.sortKids")}</option>
                  <option value="rare">{tx("ledger.sortRare")}</option>
                </select>
              </label>
              {hasColonyFilters({
                ...view,
                mineOnly,
              }) ? (
                <button type="button" className="ghost" onClick={clearFilters}>
                  {tx("ledger.clearFilters")}
                </button>
              ) : null}
            </div>
            {booting || loading ? (
              <p className="life-thought">
                {tx("ledger.reading", {
                  done: progress?.done ?? 0,
                  total: progress?.total ?? 0,
                })}
              </p>
            ) : paged.slice.length ? (
              <>
                <ol className="life-market-grid">
                  {paged.slice.map((soul) => {
                    const focused = focusId === Number(soul.tokenId);
                    const open = detailKey === colonyDetailKey(soul);
                    return (
                      <li
                        key={soul.tokenId}
                        className={`life-market-card is-clickable${focused ? " is-focus" : ""}${open ? " is-open" : ""}`}
                        style={{
                          "--pheno-body":
                            soul.phenotype?.art?.body || "#8a6a2a",
                        }}
                        onClick={(event) => {
                          if (cardChromeClick(event)) return;
                          openDetail(soul);
                        }}
                      >
                        <FlyIndex soul={soul} />
                        <span className="colony-rarity">
                          {Number.isFinite(
                            soul.phenotype?.scarcity?.expectedPer1024,
                          )
                            ? `≈${formatExpected(soul.phenotype.scarcity.expectedPer1024)}/1024`
                            : "—"}
                        </span>
                        <MarketThumb soul={soul} />
                        <strong>
                          <button
                            type="button"
                            className="colony-card-name"
                            onClick={() => openDetail(soul)}
                          >
                            {soul.givenName || labelOf(soul, locale)}
                          </button>
                        </strong>
                        <FlyTraitRows soul={soul} locale={locale} />
                        <FlyVital soul={soul} locale={locale} tx={tx} />
                        <details className="colony-card-data">
                          <summary>
                            {locale === "zh"
                              ? "详情与操作"
                              : "Details & actions"}
                          </summary>
                          <p>
                            {soul.phenotype?.summary?.[locale] ||
                              soul.phenotype?.summary?.en ||
                              "—"}
                          </p>
                          <dl>
                            <div>
                              <dt>
                                {tx("ledger.card.kids", { n: "" }).trim()}
                              </dt>
                              <dd>{kids.get(Number(soul.tokenId)) || 0}</dd>
                            </div>
                            <div>
                              <dt>{tx("ledger.card.holder")}</dt>
                              <dd>{shortAddr(soul.owner)}</dd>
                            </div>
                            <div>
                              <dt>≈/1024</dt>
                              <dd>
                                {formatExpected(
                                  soul.phenotype?.scarcity?.expectedPer1024 ??
                                    Infinity,
                                )}
                              </dd>
                            </div>
                          </dl>
                          <div className="life-kin-row">
                            <button
                              type="button"
                              onClick={() => openDetail(soul)}
                            >
                              {tx("ledger.card.detail")}
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => onPredict(soul)}
                            >
                              {tx("ledger.card.predict")}
                            </button>
                            <SiteLink
                              href={withNet(
                                `/habitat.html?soul=${soul.tokenId}`,
                              )}
                              className="ghost"
                            >
                              {tx("ledger.card.open")}
                            </SiteLink>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ol>
                <div className="colony-pages">
                  <button
                    type="button"
                    className="ghost"
                    disabled={paged.page <= 1}
                    onClick={() => setPage(paged.page - 1)}
                  >
                    {tx("ledger.pagePrev")}
                  </button>
                  <small>
                    {tx("ledger.page", { a: paged.page, b: paged.pages })}
                  </small>
                  <button
                    type="button"
                    className="ghost"
                    disabled={paged.page >= paged.pages}
                    onClick={() => setPage(paged.page + 1)}
                  >
                    {tx("ledger.pageNext")}
                  </button>
                </div>
              </>
            ) : (
              <p className="life-thought">
                {locale === "zh"
                  ? souls.length
                    ? "没有匹配的果蝇，试试其他筛选。"
                    : "尚未读取到链上果蝇。先看看下方的未出生形态图鉴。"
                  : souls.length
                    ? "No flies match these filters."
                    : "No on-chain flies loaded yet. Explore the unborn collection below."}
                {souls.length && hasColonyFilters({ ...view, mineOnly }) ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="ghost"
                      onClick={clearFilters}
                    >
                      {tx("ledger.clearFilters")}
                    </button>
                  </>
                ) : null}
              </p>
            )}
          </section>

          <section
            id="preview"
            className="colony-section"
            aria-label={tx("ledger.previewTitle")}
          >
            <header className="life-market-head">
              <div>
                <span className="eyebrow">UNBORN / PREVIEW</span>
                <h2>{tx("ledger.previewTitle")}</h2>
              </div>
              <div className="life-market-tools">
                <small>
                  {tx("ledger.shownLooks", {
                    n: previewRows.length,
                    total: previews.length,
                  })}
                </small>
              </div>
            </header>
            {spotlight.length ? (
              <div className="colony-spotlight-wrap">
                <p className="colony-spotlight-lead">
                  ✦{" "}
                  {locale === "zh"
                    ? "稀世形态 · 每 1024 只里最稀缺的 6 种"
                    : "Rarest forms · the 6 scarcest per 1024"}
                </p>
                <ol className="colony-spotlight">
                  {spotlight.map((soul, index) => {
                    const open = detailKey === colonyDetailKey(soul);
                    return (
                      <li
                        key={`s-${soul.seed}`}
                        className={`life-market-card is-preview is-spotlight is-clickable${open ? " is-open" : ""}`}
                        style={{
                          "--pheno-body":
                            soul.phenotype?.art?.body || "#8a6a2a",
                          "--spot": index,
                        }}
                        onClick={(event) => {
                          if (cardChromeClick(event)) return;
                          openDetail(soul);
                        }}
                      >
                        <i
                          className="colony-spotlight-ring"
                          aria-hidden="true"
                        />
                        <span className="colony-spotlight-rank">
                          {locale === "zh"
                            ? `稀世 · ${index + 1}`
                            : `RARE · ${index + 1}`}
                        </span>
                        <FlyIndex soul={soul} />
                        <span className="colony-rarity">
                          ≈{formatExpected(soul.expectedPer1024)}/1024
                        </span>
                        <MarketThumb soul={soul} />
                        <strong>
                          <button
                            type="button"
                            className="colony-card-name"
                            onClick={() => openDetail(soul)}
                          >
                            {soul.phenotype.hue[locale] ||
                              soul.phenotype.hue.en}
                          </button>
                        </strong>
                        <FlyTraitRows soul={soul} locale={locale} />
                        <p className="colony-unborn">
                          {locale === "zh"
                            ? "第0代 · 未出生"
                            : "Gen 0 · Unborn"}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
            <p className="colony-lead">{tx("ledger.previewLead")}</p>
            {previewRows.length ? (
              <>
                <ol className="life-market-grid colony-preview-grid">
                  {previewPaged.slice.map((soul) => {
                    const open = detailKey === colonyDetailKey(soul);
                    return (
                      <li
                        key={`p-${soul.seed}`}
                        className={`life-market-card is-preview is-clickable${open ? " is-open" : ""}`}
                        style={{
                          "--pheno-body":
                            soul.phenotype?.art?.body || "#8a6a2a",
                        }}
                        onClick={(event) => {
                          if (cardChromeClick(event)) return;
                          openDetail(soul);
                        }}
                      >
                        <FlyIndex soul={soul} />
                        <span className="colony-rarity">
                          ≈{formatExpected(soul.expectedPer1024)}/1024
                        </span>
                        <MarketThumb soul={soul} />
                        <strong>
                          <button
                            type="button"
                            className="colony-card-name"
                            onClick={() => openDetail(soul)}
                          >
                            {soul.phenotype.hue[locale] ||
                              soul.phenotype.hue.en}
                          </button>
                        </strong>
                        <FlyTraitRows soul={soul} locale={locale} />
                        <p className="colony-unborn">
                          {locale === "zh"
                            ? "第0代 · 未出生"
                            : "Gen 0 · Unborn"}
                        </p>
                        <details className="colony-card-data">
                          <summary>
                            {locale === "zh" ? "查看基因" : "View traits"}
                          </summary>
                          <p className="colony-art-note">
                            {locale === "zh"
                              ? "收藏插画 · 条纹与斑纹以以下基因为准"
                              : "Collectible illustration · exact stripe and mark traits below"}
                          </p>
                          <p>
                            {soul.phenotype.summary?.[locale] ||
                              soul.phenotype.summary?.en}
                          </p>
                          <dl>
                            <div>
                              <dt>Gen</dt>
                              <dd>Gen0</dd>
                            </div>
                            <div>
                              <dt>{tx("ledger.detail.seed")}</dt>
                              <dd>{soul.seed}</dd>
                            </div>
                            <div>
                              <dt>≈/1024</dt>
                              <dd>{formatExpected(soul.expectedPer1024)}</dd>
                            </div>
                          </dl>
                          <div className="life-kin-row">
                            <button
                              type="button"
                              onClick={() => openDetail(soul)}
                            >
                              {tx("ledger.card.detail")}
                            </button>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ol>
                <div className="colony-pages colony-preview-pages">
                  <button
                    type="button"
                    className="ghost"
                    disabled={previewPaged.page <= 1}
                    onClick={() => setPreviewPage(previewPaged.page - 1)}
                  >
                    {tx("ledger.pagePrev")}
                  </button>
                  <small>
                    {tx("ledger.page", {
                      a: previewPaged.page,
                      b: previewPaged.pages,
                    })}
                  </small>
                  <button
                    type="button"
                    className="ghost"
                    disabled={previewPaged.page >= previewPaged.pages}
                    onClick={() => setPreviewPage(previewPaged.page + 1)}
                  >
                    {tx("ledger.pageNext")}
                  </button>
                </div>
              </>
            ) : (
              <p className="life-thought">
                {tx("ledger.empty")}{" "}
                <button type="button" className="ghost" onClick={clearFilters}>
                  {tx("ledger.clearFilters")}
                </button>
              </p>
            )}
          </section>

          <section
            id="atlas"
            className="colony-section"
            aria-label={tx("ledger.atlasTitle")}
          >
            <header className="life-market-head">
              <div>
                <span className="eyebrow">GEN0 / ATLAS</span>
                <h2>{tx("ledger.atlasTitle")}</h2>
              </div>
              <div className="life-market-tools">
                <small>
                  <i className="colony-dot is-seen" /> {tx("ledger.atlasSeen")}{" "}
                  · <i className="colony-dot is-expected" />{" "}
                  {tx("ledger.atlasExpected")}
                </small>
              </div>
            </header>
            <p className="colony-lead">{tx("ledger.atlasLead")}</p>
            {census.gen0 ? (
              <div className="colony-loci">
                {tally.map((locus) => (
                  <LocusBars
                    key={locus.locus}
                    locus={locus}
                    locale={locale}
                    tx={tx}
                  />
                ))}
              </div>
            ) : (
              <p className="life-thought">{tx("ledger.atlasEmpty")}</p>
            )}
            {rarest.length ? (
              <div className="colony-atlas-lists">
                <section>
                  <h3>{tx("ledger.atlasRarest")}</h3>
                  <p className="life-note">{tx("ledger.atlasRarestLead")}</p>
                  <ol>
                    {rarest.map((soul) => (
                      <li key={soul.tokenId}>
                        <button type="button" onClick={() => openDetail(soul)}>
                          {soulTitle(soul, locale)}
                        </button>
                        <small>
                          {tx("ledger.card.per1024", {
                            n: formatExpected(
                              soul.phenotype?.scarcity?.expectedPer1024,
                            ),
                          })}
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
                <section>
                  <h3>{tx("ledger.atlasUnseen")}</h3>
                  <p className="life-note">{tx("ledger.atlasUnseenLead")}</p>
                  <ol>
                    {unseen.map((row) => (
                      <li key={row.key}>
                        <span>{comboLabel(row.parts, locale)}</span>
                        <small>
                          {tx("ledger.card.per1024", {
                            n: formatExpected(row.expectedPer1024),
                          })}
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            ) : null}
          </section>

          <section
            id="predict"
            ref={predictRef}
            className="colony-section"
            aria-label={tx("ledger.predictTitle")}
          >
            <header className="life-market-head">
              <div>
                <span className="eyebrow">KIN / PREDICT</span>
                <h2>{tx("ledger.predictTitle")}</h2>
              </div>
            </header>
            <p className="colony-lead">{tx("ledger.predictLead")}</p>
            <div className="colony-predict">
              <div className="colony-predict-form">
                <label>
                  {tx("ledger.parentA")}
                  <select
                    value={parentA}
                    onChange={(event) => setParentA(event.target.value)}
                  >
                    <option value="">{tx("ledger.pickParent")}</option>
                    {parentOptions}
                  </select>
                </label>
                <label>
                  {tx("ledger.parentB")}
                  <select
                    value={parentB}
                    onChange={(event) => setParentB(event.target.value)}
                  >
                    <option value="">{tx("ledger.pickParent")}</option>
                    {parentOptions}
                  </select>
                </label>
                <button
                  type="button"
                  className="primary"
                  disabled={
                    !cardA || !cardB || cardA.tokenId === cardB?.tokenId
                  }
                  onClick={runSim}
                >
                  {tx("ledger.simulate", { n: SIM_SAMPLES })}
                </button>
                {cardA && cardB ? (
                  <p className="life-note">
                    {holdsBoth
                      ? tx("ledger.walletOk")
                      : tx("ledger.walletWarn")}
                  </p>
                ) : (
                  <p className="life-note">{tx("ledger.needTwo")}</p>
                )}
                {ownersDiffer ? (
                  <p className="life-note">{tx("ledger.walletWarn")}</p>
                ) : null}
                {simNote ? <p className="pit-error">{simNote}</p> : null}
                {simResult ? (
                  <div className="colony-decided">
                    <h3>{tx("ledger.decided")}</h3>
                    <ul>
                      <li>
                        {tx("ledger.decidedGen", { n: simResult.generation })}
                      </li>
                      <li>{tx("ledger.decidedLine")}</li>
                      {kinCount != null ? (
                        <li>
                          {tx("ledger.decidedRequest", {
                            n: simResult.requestId,
                          })}
                        </li>
                      ) : null}
                    </ul>
                    <h3>{tx("ledger.undecided")}</h3>
                    <p className="life-note">{tx("ledger.undecidedLead")}</p>
                    <p className="life-note">
                      {tx("ledger.method", { n: simResult.draws })}
                    </p>
                    {simResult.rarest ? (
                      <p className="life-meta">
                        {tx("ledger.rarestSample", {
                          n: formatExpected(simResult.rarest.expectedPer1024),
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="colony-predict-out">
                {simResult ? (
                  <>
                    <p className="life-market-tools colony-predict-legend">
                      <small>
                        <i className="colony-dot is-seen" />{" "}
                        {tx("ledger.ruleSeen")} · A/B ={" "}
                        {tx("ledger.ruleParent")}
                      </small>
                    </p>
                    <div className="colony-loci">
                      {KIN_LOCI.map(({ id }, locusIndex) => {
                        const traitA = parentTraitIds?.[0]?.[locusIndex];
                        const traitB = parentTraitIds?.[1]?.[locusIndex];
                        return (
                          <div key={id} className="colony-locus">
                            <h4>{id}</h4>
                            <ul>
                              {locusRows(id).map((row) => (
                                <PredictorRow
                                  key={row.id}
                                  row={row}
                                  fromParent={
                                    Number(row.id) === traitA
                                      ? "A"
                                      : Number(row.id) === traitB
                                        ? "B"
                                        : null
                                  }
                                />
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                    {simResult.samples.length ? (
                      <div className="colony-samples-wrap">
                        <h3>{tx("ledger.samples")}</h3>
                        <ol className="colony-samples">
                          {simResult.samples.map((sample) => (
                            <li key={sample.seed}>
                              <MarketThumb
                                soul={{ phenotype: sample.phenotype }}
                              />
                              <small>
                                {sample.phenotype.summary?.[locale] ||
                                  sample.phenotype.summary?.en}
                              </small>
                              <small>
                                Gen{sample.generation} ·{" "}
                                {tx("ledger.card.per1024", {
                                  n: formatExpected(sample.expectedPer1024),
                                })}
                              </small>
                              <small>
                                {tx("ledger.sampleMutated", {
                                  n: sample.mutations,
                                })}
                              </small>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    {cardA ? (
                      <SiteLink
                        href={withNet(`/habitat.html?soul=${cardA.tokenId}`)}
                        className="life-cross"
                      >
                        {tx("ledger.goBreed")}
                      </SiteLink>
                    ) : null}
                  </>
                ) : (
                  <p className="life-thought">{tx("ledger.predictLead")}</p>
                )}
              </div>
            </div>
          </section>

          <section
            id="boards"
            className="colony-section"
            aria-label={tx("ledger.boardsTitle")}
          >
            <header className="life-market-head">
              <div>
                <span className="eyebrow">LINEAGE / BOARDS</span>
                <h2>{tx("ledger.boardsTitle")}</h2>
              </div>
            </header>
            <p className="colony-lead">{tx("ledger.boardsLead")}</p>
            {boards.families.length || boards.deepest.length ? (
              <div className="colony-boards">
                <section>
                  <h3>{tx("ledger.boardFamilies")}</h3>
                  <p className="life-note">{tx("ledger.boardFamiliesLead")}</p>
                  <ol>
                    {boards.families.map((row) => (
                      <li key={row.soul.tokenId}>
                        <button
                          type="button"
                          onClick={() => openDetail(row.soul)}
                        >
                          {soulTitle(row.soul, locale)}
                        </button>
                        <small>
                          {tx("ledger.boardKids", { n: row.descendants })}
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
                <section>
                  <h3>{tx("ledger.boardDeep")}</h3>
                  <p className="life-note">&nbsp;</p>
                  <ol>
                    {boards.deepest.map((soul) => (
                      <li key={soul.tokenId}>
                        <button type="button" onClick={() => openDetail(soul)}>
                          {soulTitle(soul, locale)}
                        </button>
                        <small>
                          {tx("ledger.boardGen", {
                            n: Number(soul.generation) || 0,
                          })}
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
                <section>
                  <h3>{tx("ledger.boardRare")}</h3>
                  <p className="life-note">{tx("ledger.boardRareLead")}</p>
                  <ol>
                    {boards.rarest.map((soul) => (
                      <li key={soul.tokenId}>
                        <button type="button" onClick={() => openDetail(soul)}>
                          {soulTitle(soul, locale)}
                        </button>
                        <small>
                          {tx("ledger.card.per1024", {
                            n: formatExpected(
                              soul.phenotype?.scarcity?.expectedPer1024,
                            ),
                          })}
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            ) : (
              <p className="life-thought">{tx("ledger.boardEmpty")}</p>
            )}
          </section>
        </section>
      </main>
      {detailSoul ? (
        <ColonyDetail
          soul={detailSoul}
          souls={souls}
          kids={kids}
          onClose={() => setDetailKey("")}
          onPick={(next) => openDetail(next)}
          onPredict={onPredict}
          locale={locale}
          tx={tx}
        />
      ) : null}
    </SitePage>
  );
}

function comboLabel(parts, locale) {
  const order = ["hue", "sat", "light", "eye", "size", "stripes", "mark"];
  const names = order.map((locus) => {
    const table = ATLAS_LOCI.find((row) => row.id === locus)?.table || [];
    const row = table.find((item) => String(item.id) === String(parts[locus]));
    return row ? traitLabel(row, locale) : parts[locus];
  });
  return names.join(" · ");
}
