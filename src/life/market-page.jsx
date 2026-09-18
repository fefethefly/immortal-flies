import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EYES, HUES, MARKS } from "../brain/flyswarm/phenotype-loci.mjs";
import { SiteLink, SitePage } from "../site-chrome.jsx";
import { useLocale } from "../use-locale.mjs";
import {
  explainMarketError,
  loadMarketActivity,
  loadMarketDeployment,
  loadOpenListings,
  openLifeMarket,
  openLifeReader,
  readMarketRefund,
  readOpenListing,
  readPendingBreed,
} from "./chain.mjs";
import { useLifeWorld } from "./desk.jsx";
import {
  MIN_ASK_BNB,
  askFee,
  askProceeds,
  askWei,
  breedTouchesListing,
  externalAskUrl,
  filterListed,
  formatAsk,
  hasMarketFilters,
  isSelfAsk,
  listingForToken,
  listingKey,
  matchListed,
  parseMarketView,
  shortLife,
  sortListed,
  writeMarketView,
} from "./market.mjs";
import { MarketThumb } from "./market-thumb.jsx";
import { FlyTraitRows, FlyVital } from "./fly-card.jsx";
import { labelOf } from "./names.mjs";
import { withNet } from "./net.mjs";
import { mergeSoul, querySoulId, readSoulCard, shortAddr } from "./souls.mjs";
import { useConnectedWallet } from "./use-connected-wallet.mjs";
import { connectChosenLife } from "./wallet-pick.jsx";
import "./life.css";

function traitLabel(row, locale) {
  return locale === "zh" ? row.zh : row.en;
}

function joinListings(rows, souls) {
  const byId = new Map((souls || []).map((soul) => [soul.tokenId, soul]));
  return (rows || []).map((row) => ({
    ...row,
    soul: byId.get(row.tokenId) || row.soul || null,
  }));
}

function firstMarketView() {
  return parseMarketView(
    typeof window === "undefined" ? "" : window.location.search,
  );
}

function pinSoulParam(id) {
  if (typeof window === "undefined") return;
  const token = Number(id);
  if (!token) return;
  const q = new URLSearchParams(window.location.search);
  q.set("soul", String(token));
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}?${q.toString()}`,
  );
}

async function ensureApproved(soul, marketAddr, owner, tokenId) {
  const [approved, all] = await Promise.all([
    soul.getApproved(tokenId),
    soul.isApprovedForAll(owner, marketAddr),
  ]);
  if (String(approved).toLowerCase() === marketAddr.toLowerCase() || all) {
    return;
  }
  await (await soul.approve(marketAddr, tokenId)).wait();
}

export function MarketPage() {
  const [locale, setLocale, tx] = useLocale(
    "meta.marketTitle",
    "meta.marketDesc",
  );
  const { deployment, souls, setSouls, error, rosterError } = useLifeWorld(0);
  const [marketDep, setMarketDep] = useState(undefined);
  const [rawAsks, setRawAsks] = useState([]);
  const [asksReady, setAsksReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pendingBreed, setPendingBreed] = useState(null);
  const [feeBps, setFeeBps] = useState(200);
  const [tokenId, setTokenId] = useState("");
  const [price, setPrice] = useState(MIN_ASK_BNB);
  const firstView = firstMarketView();
  const [body, setBody] = useState(firstView.body);
  const [eyes, setEyes] = useState(firstView.eyes);
  const [mark, setMark] = useState(firstView.mark);
  const [generation, setGeneration] = useState(firstView.generation);
  const [buying, setBuying] = useState(null);
  const [query, setQuery] = useState(firstView.query);
  const [sort, setSort] = useState(firstView.sort);
  const [activity, setActivity] = useState([]);
  const [heldRefund, setHeldRefund] = useState("0");
  const [flash, setFlash] = useState("");
  const { wallet, setWallet, pick, dialog, connect } = useConnectedWallet(
    deployment,
    tx,
  );
  const [focusId, setFocusId] = useState(() =>
    querySoulId(typeof window === "undefined" ? "" : window.location.search),
  );

  const soulsRef = useRef([]);
  soulsRef.current = souls;
  const extras = useMemo(
    () => ({
      genesisRoot: deployment?.genesisRoot,
      chainId: deployment?.chainId,
      fieldCount: 1,
    }),
    [deployment],
  );

  const refreshAsks = useCallback(
    async (dep, { quiet } = {}) => {
      if (!dep?.address || !deployment?.address) {
        setRawAsks([]);
        setAsksReady(true);
        return;
      }
      if (!quiet) setAsksReady(false);
      const reader = await openLifeReader(deployment);
      if (!reader) {
        setAsksReady(true);
        return;
      }
      const market = await openLifeMarket(dep.address, reader.provider);
      const hintIds = soulsRef.current.map((soul) => soul.tokenId);
      if (focusId) hintIds.push(focusId);
      const rows = await loadOpenListings(market, dep.fromBlock || 0, hintIds);
      setRawAsks(rows);
      setActivity(
        await loadMarketActivity(market, dep.fromBlock || 0).catch(() => []),
      );
      try {
        setFeeBps(Number(await market.feeBps()));
      } catch {
        setFeeBps(200);
      }
      if (reader.soul) {
        const cards = await Promise.all(
          rows.map((row) =>
            readSoulCard(reader.soul, row.tokenId, extras).catch(() => null),
          ),
        );
        const extra = cards.filter(Boolean);
        if (extra.length) {
          setSouls((current) => {
            const have = new Set(current.map((soul) => soul.tokenId));
            const add = extra.filter((card) => !have.has(card.tokenId));
            return add.length ? [...current, ...add] : current;
          });
        }
      }
      setAsksReady(true);
    },
    [deployment, extras, focusId, setSouls],
  );

  useEffect(() => {
    let gone = false;
    loadMarketDeployment()
      .then((data) => {
        if (!gone) setMarketDep(data);
      })
      .catch(() => {
        if (!gone) setMarketDep(null);
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    if (marketDep === undefined || deployment === undefined) return undefined;
    let gone = false;
    refreshAsks(marketDep).catch(() => {
      if (!gone) {
        setRawAsks([]);
        setAsksReady(true);
      }
    });
    return () => {
      gone = true;
    };
  }, [deployment, marketDep, refreshAsks]);

  useEffect(() => {
    if (!focusId || tokenId) return;
    setTokenId(String(focusId));
  }, [focusId, tokenId]);

  const asks = useMemo(() => joinListings(rawAsks, souls), [rawAsks, souls]);
  const mine = useMemo(() => {
    if (!wallet) return [];
    const mineAddr = wallet.toLowerCase();
    return souls.filter((soul) => soul.owner?.toLowerCase() === mineAddr);
  }, [souls, wallet]);
  const myAsks = useMemo(() => {
    if (!wallet) return [];
    const mineAddr = wallet.toLowerCase();
    return asks.filter((row) => row.seller?.toLowerCase() === mineAddr);
  }, [asks, wallet]);
  const shown = useMemo(
    () =>
      sortListed(
        matchListed(
          filterListed(asks, { body, eyes, mark, generation }),
          query,
        ),
        sort,
      ),
    [asks, body, eyes, mark, generation, query, sort],
  );
  const listingRisk = breedTouchesListing(pendingBreed, tokenId);
  const listedMine = asks.find(
    (row) => Number(row.tokenId) === Number(tokenId) && isSelfAsk(row, wallet),
  );
  const railSoul = mine.find(
    (soul) => Number(soul.tokenId) === Number(tokenId),
  );
  const previewWei = askWei(price);
  const previewOk = previewWei >= askWei(MIN_ASK_BNB);
  const filteredOut =
    asks.length > 0 &&
    shown.length === 0 &&
    hasMarketFilters({ body, eyes, mark, generation, query });
  const testnet = Number(deployment?.chainId) === 97;
  const liveMarket = Boolean(marketDep?.address);
  const booting = marketDep === undefined || deployment === undefined;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = writeMarketView(
      { query, sort, body, eyes, mark, generation },
      window.location.search,
    );
    const path = `${window.location.pathname}${next}`;
    const now = `${window.location.pathname}${window.location.search}`;
    if (now !== path) window.history.replaceState(null, "", path);
  }, [query, sort, body, eyes, mark, generation]);

  useEffect(() => {
    if (!asksReady || !focusId) return;
    document
      .querySelector(".life-market-card.is-focus")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [asksReady, focusId, shown.length]);

  useEffect(() => {
    if (!liveMarket || !marketDep) return undefined;
    const tick = () => {
      if (document.visibilityState !== "visible" || busy) return;
      refreshAsks(marketDep, { quiet: true }).catch(() => {});
    };
    const id = window.setInterval(tick, 45000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [busy, liveMarket, marketDep, refreshAsks]);

  async function withSession(job) {
    if (!deployment || !marketDep?.address) {
      setNote(tx("market.off"));
      return null;
    }
    setBusy(true);
    setNote("");
    setFlash("");
    try {
      const session = await connectChosenLife(pick, deployment);
      if (!session) return null;
      setWallet(session.address);
      const market = await openLifeMarket(marketDep.address, session.signer);
      setPendingBreed(await readPendingBreed(session.kin, session.address));
      setHeldRefund(await readMarketRefund(market, session.address));
      const result = await job({ ...session, market });
      setHeldRefund(await readMarketRefund(market, session.address));
      await refreshAsks(marketDep);
      return result;
    } catch (err) {
      setNote(explainMarketError(err, tx));
      return null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!wallet || !deployment || !marketDep?.address) {
      if (!wallet) {
        setPendingBreed(null);
        setHeldRefund("0");
      }
      return undefined;
    }
    let gone = false;
    openLifeReader(deployment)
      .then(async (reader) => {
        if (!reader || gone) return;
        const market = await openLifeMarket(marketDep.address, reader.provider);
        const [breed, refund] = await Promise.all([
          readPendingBreed(reader.kin, wallet),
          readMarketRefund(market, wallet),
        ]);
        if (gone) return;
        setPendingBreed(breed);
        setHeldRefund(refund);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [wallet, deployment, marketDep]);

  useEffect(() => {
    if (!buying) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) setBuying(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [buying, busy]);

  async function onConnect() {
    setNote("");
    setFlash("");
    try {
      await connect();
    } catch (err) {
      setNote(explainMarketError(err, tx));
    } finally {
      setBusy(false);
    }
  }

  async function onList(id, nextPrice, mode) {
    const wei = askWei(nextPrice);
    if (wei < askWei(MIN_ASK_BNB)) {
      setNote(tx("market.minPrice", { n: MIN_ASK_BNB }));
      return;
    }
    await withSession(async ({ soul, market, address }) => {
      const marketAddr = await market.getAddress();
      await ensureApproved(soul, marketAddr, address, id);
      const sent =
        mode === "relist" ? market.relist(id, wei) : market.list(id, wei);
      await (await sent).wait();
      setFocusId(Number(id));
      pinSoulParam(id);
      setFlash(tx(mode === "relist" ? "market.okRelist" : "market.okList"));
    });
  }

  async function onCancel(id) {
    await withSession(async ({ market }) => {
      await (await market.cancel(id)).wait();
      setFlash(tx("market.okCancel"));
    });
  }

  async function onSweep(id) {
    await withSession(async ({ market }) => {
      await (await market.sweep(id)).wait();
    });
  }

  async function onOpenBuy(row) {
    setNote("");
    setFlash("");
    if (!deployment || !marketDep?.address) {
      setBuying(row);
      return;
    }
    try {
      const reader = await openLifeReader(deployment);
      if (!reader) {
        setBuying(row);
        return;
      }
      const market = await openLifeMarket(marketDep.address, reader.provider);
      const live = await readOpenListing(market, row.tokenId);
      if (!live) {
        setBuying(null);
        setNote(tx("market.notListed"));
        await refreshAsks(marketDep);
        return;
      }
      setBuying({ ...row, ...live, soul: row.soul });
      if (String(live.price) !== String(row.price)) {
        setNote(tx("market.priceMoved", { n: formatAsk(live.price) }));
      }
    } catch {
      setBuying(row);
    }
  }

  async function onBuy() {
    if (!buying) return;
    const row = buying;
    await withSession(async ({ market, soul, address, provider }) => {
      const live = await readOpenListing(market, row.tokenId);
      if (!live) {
        setBuying(null);
        setNote(tx("market.notListed"));
        return;
      }
      if (isSelfAsk(live, address)) {
        setBuying({ ...row, ...live, soul: row.soul });
        setNote(tx("market.selfBuy"));
        return;
      }
      if (String(live.price) !== String(row.price)) {
        setBuying({ ...row, ...live, soul: row.soul });
        setNote(tx("market.priceMoved", { n: formatAsk(live.price) }));
        return;
      }
      const bal = await provider.getBalance(address);
      if (bal < BigInt(live.price)) {
        setNote(tx("market.needBnb", { n: formatAsk(live.price) }));
        return;
      }
      await (
        await market.buy(live.tokenId, { value: BigInt(live.price) })
      ).wait();
      const card = await readSoulCard(soul, live.tokenId, extras).catch(
        () => null,
      );
      if (card) setSouls((current) => mergeSoul(current, card));
      setBuying(null);
      setFocusId(Number(live.tokenId));
      pinSoulParam(live.tokenId);
      setFlash(tx("market.okBuy", { id: live.tokenId }));
    });
  }

  async function copyListing(id) {
    const path = withNet(`/market.html?soul=${id}`);
    const href = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(href);
      setFlash(tx("market.copied"));
    } catch {
      setNote(href);
    }
  }

  function clearFilters() {
    setBody("");
    setEyes("");
    setMark("");
    setGeneration("");
    setQuery("");
  }

  async function onWithdraw() {
    await withSession(async ({ market }) => {
      await (await market.withdrawRefund()).wait();
      setFlash(tx("market.okRefund"));
    });
  }

  return (
    <SitePage
      current="market"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      className="life-page"
    >
      {dialog}
      <main className="life-shell is-market">
        <aside className="life-rail">
          <span className="eyebrow">MARKET / ASK</span>
          <h1>
            {tx("market.title")} <small>{tx("market.kicker")}</small>
          </h1>
          <p>{tx("market.lead")}</p>
          <p className="life-note">{tx("market.boundary")}</p>
          {testnet ? <p className="life-note">{tx("life.testnet")}</p> : null}
          {booting ? (
            <p className="life-meta">{tx("market.loading")}</p>
          ) : liveMarket ? (
            <p className="life-meta">
              {tx("market.fee", { n: (feeBps / 100).toFixed(2) })} ·{" "}
              {shortAddr(marketDep.hive || marketDep.address)}
            </p>
          ) : (
            <>
              <p className="life-note">{tx("market.off")}</p>
              <SiteLink href="/market.html?net=test" className="life-cross">
                {tx("market.openTestnet")}
              </SiteLink>
            </>
          )}
          <SiteLink href={withNet("/habitat.html")} className="life-cross">
            {tx("market.toHabitat")}
          </SiteLink>
          <SiteLink href={withNet("/host.html")} className="life-cross">
            {tx("market.toHost")}
          </SiteLink>
          <div className="life-kin">
            <button type="button" onClick={onConnect} disabled={busy}>
              {wallet ? shortAddr(wallet) : tx("life.connect")}
            </button>
            {wallet ? (
              <p className="life-meta">
                {tx("life.mineCount", { n: mine.length })}
              </p>
            ) : null}
            {pendingBreed ? (
              <p className="life-note">
                {tx(listingRisk ? "market.breedWarnThis" : "market.breedWarn")}
              </p>
            ) : null}
            {BigInt(heldRefund || 0) > 0n ? (
              <div className="life-kin-row">
                <p className="life-note">
                  {tx("market.refundHeld", { n: formatAsk(heldRefund) })}
                </p>
                <button type="button" disabled={busy} onClick={onWithdraw}>
                  {tx("market.refund")}
                </button>
              </div>
            ) : null}
            {mine.length ? (
              <label>
                {tx("market.mySoul")}
                <select
                  value={tokenId}
                  onChange={(event) => setTokenId(event.target.value)}
                >
                  <option value="">{tx("market.pickSoul")}</option>
                  {mine.map((soul) => {
                    const ask = listingForToken(asks, soul.tokenId);
                    return (
                      <option key={soul.tokenId} value={soul.tokenId}>
                        #{soul.tokenId}{" "}
                        {soul.givenName || labelOf(soul, locale)}
                        {ask ? ` · ${formatAsk(ask.price)} BNB` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : wallet ? (
              <p className="life-note">{tx("market.noMine")}</p>
            ) : null}
            {wallet ? (
              <label>
                {tx("market.price")}
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  inputMode="decimal"
                />
              </label>
            ) : null}
            {wallet && previewOk ? (
              <p className="life-meta">
                {tx("market.askSplit", {
                  fee: formatAsk(askFee(previewWei, feeBps)),
                  keep: formatAsk(askProceeds(previewWei, feeBps)),
                })}
              </p>
            ) : null}
            {railSoul && Number(railSoul.generation) === 0 ? (
              <p className="life-note">{tx("market.gen0Sell")}</p>
            ) : null}
            {wallet && tokenId ? (
              <div className="life-kin-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !liveMarket}
                  onClick={() =>
                    onList(
                      Number(tokenId),
                      price,
                      listedMine ? "relist" : "list",
                    )
                  }
                >
                  {listedMine ? tx("market.relist") : tx("market.list")}
                </button>
                {listedMine ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCancel(Number(tokenId))}
                  >
                    {tx("market.cancel")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {myAsks.length ? (
              <div className="life-market-mine">
                <h3>{tx("market.myAsks")}</h3>
                <ol>
                  {myAsks.map((row) => (
                    <li key={row.tokenId}>
                      <button
                        type="button"
                        onClick={() => {
                          setTokenId(String(row.tokenId));
                          setPrice(formatAsk(row.price));
                          setFocusId(Number(row.tokenId));
                          pinSoulParam(row.tokenId);
                        }}
                      >
                        #{row.tokenId} · {formatAsk(row.price)} BNB
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => onCancel(row.tokenId)}
                      >
                        {tx("market.cancel")}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {flash ? <p className="life-note">{flash}</p> : null}
            {note ? <p className="pit-error">{note}</p> : null}
            {error ? <p className="pit-error">{error}</p> : null}
            {rosterError ? (
              <p className="life-note">{tx("life.colonyMiss")}</p>
            ) : null}
          </div>
        </aside>
        <section className="life-stage is-market">
          <header className="life-market-head">
            <div>
              <span className="eyebrow">ON SALE</span>
              <h2>{tx("market.onSale")}</h2>
            </div>
            <div className="life-market-tools">
              <small>
                {tx("market.shown", { n: shown.length })} ·{" "}
                {tx("market.noFloor")}
              </small>
              <button
                type="button"
                className="ghost"
                disabled={!liveMarket || !asksReady}
                onClick={() => refreshAsks(marketDep, { quiet: true })}
              >
                {tx("market.refresh")}
              </button>
            </div>
          </header>
          <div className="life-market-filters">
            <label>
              {tx("market.filterBody")}
              <select
                value={body}
                onChange={(event) => setBody(event.target.value)}
              >
                <option value="">{tx("market.filterAny")}</option>
                {HUES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {traitLabel(row, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("market.filterEyes")}
              <select
                value={eyes}
                onChange={(event) => setEyes(event.target.value)}
              >
                <option value="">{tx("market.filterAny")}</option>
                {EYES.map((row) => (
                  <option key={row.id} value={row.id}>
                    {traitLabel(row, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("market.filterMark")}
              <select
                value={mark}
                onChange={(event) => setMark(event.target.value)}
              >
                <option value="">{tx("market.filterAny")}</option>
                {MARKS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {traitLabel(row, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tx("market.filterGen")}
              <select
                value={generation}
                onChange={(event) => setGeneration(event.target.value)}
              >
                <option value="">{tx("market.filterAny")}</option>
                <option value="0">Gen0</option>
                <option value="1+">Gen1+</option>
              </select>
            </label>
            <label>
              {tx("market.sort")}
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="new">{tx("market.sortNew")}</option>
                <option value="price">{tx("market.sortPrice")}</option>
                <option value="priceDesc">{tx("market.sortPriceDesc")}</option>
              </select>
            </label>
            <label>
              {tx("market.search")}
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="#1 / lifeId"
              />
            </label>
            {hasMarketFilters({ body, eyes, mark, generation, query }) ? (
              <button type="button" className="ghost" onClick={clearFilters}>
                {tx("market.clearFilters")}
              </button>
            ) : null}
          </div>
          {booting || !asksReady ? (
            <p className="life-thought">{tx("market.loading")}</p>
          ) : shown.length ? (
            <ol className="life-market-grid">
              {shown.map((row) => {
                const soul = row.soul;
                const mineAsk = isSelfAsk(row, wallet);
                const stale =
                  soul?.owner &&
                  row.seller &&
                  soul.owner.toLowerCase() !== row.seller.toLowerCase();
                const href = externalAskUrl(
                  deployment?.chainId,
                  deployment?.address,
                  row.tokenId,
                );
                const focused = focusId === row.tokenId;
                return (
                  <li
                    key={listingKey({
                      chainId: deployment?.chainId,
                      collection: deployment?.address,
                      tokenId: row.tokenId,
                      lifeId: row.lifeId,
                    })}
                    className={`life-market-card${focused ? " is-focus" : ""}`}
                    style={{
                      "--pheno-body": soul?.phenotype?.art?.body || "#8a6a2a",
                    }}
                  >
                    <MarketThumb soul={soul} />
                    <strong>
                      {soul?.givenName ||
                        (soul ? labelOf(soul, locale) : `#${row.tokenId}`)}{" "}
                      <em>#{row.tokenId}</em>
                    </strong>
                    <FlyTraitRows soul={soul} locale={locale} />
                    <FlyVital soul={soul} locale={locale} tx={tx} />
                    <p>
                      {soul?.phenotype?.summary?.[locale] ||
                        soul?.phenotype?.summary?.en ||
                        "—"}
                    </p>
                    <dl>
                      <div>
                        <dt>lifeId</dt>
                        <dd>{shortLife(row.lifeId)}</dd>
                      </div>
                      <div>
                        <dt>Gen</dt>
                        <dd>Gen{Number(soul?.generation) || 0}</dd>
                      </div>
                      <div>
                        <dt>{tx("market.price")}</dt>
                        <dd>{formatAsk(row.price)} BNB</dd>
                      </div>
                      <div>
                        <dt>{tx("market.seller")}</dt>
                        <dd>{shortAddr(row.seller)}</dd>
                      </div>
                    </dl>
                    <div className="life-kin-row">
                      {mineAsk ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setTokenId(String(row.tokenId));
                              setPrice(formatAsk(row.price));
                              setFocusId(Number(row.tokenId));
                              pinSoulParam(row.tokenId);
                            }}
                          >
                            {tx("market.relist")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onCancel(row.tokenId)}
                          >
                            {tx("market.cancel")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="primary"
                          disabled={busy || !liveMarket}
                          onClick={() => onOpenBuy(row)}
                        >
                          {tx("market.buy")}
                        </button>
                      )}
                      <SiteLink
                        href={withNet(`/habitat.html?soul=${row.tokenId}`)}
                        className="ghost"
                      >
                        {tx("market.see")}
                      </SiteLink>
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => copyListing(row.tokenId)}
                    >
                      {tx("market.copyLink")}
                    </button>
                    {href ? (
                      <a
                        className="life-cross"
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {tx("market.element")}
                      </a>
                    ) : null}
                    {stale ? (
                      <button
                        type="button"
                        className="ghost"
                        disabled={busy}
                        onClick={() => onSweep(row.tokenId)}
                      >
                        {tx("market.sweep")}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="life-thought">
              {tx(
                filteredOut
                  ? "market.noMatch"
                  : liveMarket
                    ? "market.empty"
                    : "market.off",
              )}
              {filteredOut ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className="ghost"
                    onClick={clearFilters}
                  >
                    {tx("market.clearFilters")}
                  </button>
                </>
              ) : null}
            </p>
          )}
          {activity.length ? (
            <section className="life-market-tape">
              <h3>{tx("market.activity")}</h3>
              <p className="life-note">{tx("market.activityLead")}</p>
              <ol>
                {activity.map((row) => (
                  <li key={`${row.kind}-${row.tokenId}-${row.block}`}>
                    <SiteLink
                      href={withNet(`/market.html?soul=${row.tokenId}`)}
                    >
                      #{row.tokenId}
                    </SiteLink>
                    <span>{tx(`market.act.${row.kind}`)}</span>
                    {row.kind === "sold" ||
                    row.kind === "listed" ||
                    row.kind === "relisted" ? (
                      <em>{formatAsk(row.price)} BNB</em>
                    ) : null}
                    {row.seller ? (
                      <span className="who">
                        {tx("market.seller")} {shortAddr(row.seller)}
                      </span>
                    ) : null}
                    {row.kind === "sold" && row.buyer ? (
                      <span className="who">
                        {tx("market.buyer")} {shortAddr(row.buyer)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </section>
      </main>
      {buying ? (
        <div
          className="life-market-buy"
          role="dialog"
          aria-modal="true"
          aria-labelledby="market-buy-title"
          onClick={() => {
            if (!busy) setBuying(null);
          }}
        >
          <div
            className="life-market-buy-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="market-buy-title">{tx("market.buyTitle")}</h2>
            <MarketThumb soul={buying.soul} />
            <FlyTraitRows soul={buying.soul} locale={locale} />
            <FlyVital soul={buying.soul} locale={locale} tx={tx} />
            <p>{tx("market.buyConfirm", { id: buying.tokenId })}</p>
            <p className="life-meta">
              {buying.soul?.givenName ||
                (buying.soul
                  ? labelOf(buying.soul, locale)
                  : `#${buying.tokenId}`)}{" "}
              · #{buying.tokenId} · {shortLife(buying.lifeId)}
            </p>
            <p className="life-meta">
              {buying.soul?.phenotype?.summary?.[locale] ||
                buying.soul?.phenotype?.summary?.en ||
                ""}
            </p>
            <p className="life-meta">
              {tx("market.seller")} {shortAddr(buying.seller)} ·{" "}
              {formatAsk(buying.price)} BNB
            </p>
            <p className="life-note">
              {tx("market.buySplit", {
                price: formatAsk(buying.price),
                fee: formatAsk(askFee(buying.price, feeBps)),
                keep: formatAsk(askProceeds(buying.price, feeBps)),
              })}
            </p>
            {Number(buying.soul?.generation) === 0 ? (
              <p className="life-note">{tx("market.gen0Buy")}</p>
            ) : null}
            <div className="life-kin-row">
              {isSelfAsk(buying, wallet) ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setTokenId(String(buying.tokenId));
                    setPrice(formatAsk(buying.price));
                    setBuying(null);
                  }}
                >
                  {tx("market.relist")}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={onBuy}
                >
                  {tx("market.buyGo")}
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => setBuying(null)}
              >
                {tx("market.buyBack")}
              </button>
            </div>
            {note ? <p className="pit-error">{note}</p> : null}
          </div>
        </div>
      ) : null}
    </SitePage>
  );
}
