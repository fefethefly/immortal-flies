import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MaxUint256, getAddress, parseEther } from "ethers";
import { SiteLink, SitePage } from "../site-chrome.jsx";
import { useLocale } from "../use-locale.mjs";
import {
  explainHostError,
  hubHasSpendLimits,
  loadHubDeployment,
  loadRunnerListing,
  openIfsToken,
  openLifeHub,
  openLifeReader,
  readHostPurse,
  readHostSnapshot,
} from "./chain.mjs";
import { useLifeWorld } from "./desk.jsx";
import {
  MAINNET_HIVE,
  MAINNET_IFS,
  acceptancePolicy,
  archiveUrl,
  capLeft,
  dailyLeft,
  formatCountdown,
  formatIfs,
  isLiveIfs,
  isMockIfsNetwork,
  isZeroAddr,
  isZeroHash,
  lineageUrl,
  liveRunnerForToken,
  nativeSymbol,
  parseBindForm,
  parseLineage,
  segmentPhase,
  segmentsRemaining,
  spentToday,
  tankFuel,
  validUntilOf,
  windowLeftSec,
} from "./host.mjs";
import { labelOf } from "./names.mjs";
import { withNet } from "./net.mjs";
import { querySoulId, shortAddr } from "./souls.mjs";
import { useConnectedWallet } from "./use-connected-wallet.mjs";
import { connectChosenLife } from "./wallet-pick.jsx";
import "./life.css";

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

async function ensureIfsAllowance(token, spender, owner, amount) {
  const current = await token.allowance(owner, spender);
  if (current >= amount) return;
  await (await token.approve(spender, MaxUint256)).wait();
}

function fmtRoot(value) {
  const hex = String(value || "");
  if (isZeroHash(hex)) return "—";
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}

function formatWhen(sec, locale) {
  const n = Number(sec || 0);
  if (!n) return "";
  try {
    return new Date(n * 1000).toLocaleString(
      locale === "zh" ? "zh-CN" : "en-GB",
    );
  } catch {
    return String(n);
  }
}

const PHASE_COPY = {
  idle: "host.statusIdle",
  open: "host.statusOpen",
  window: "host.statusWindow",
  ready: "host.statusReady",
  challenged: "host.statusChallenged",
  settled: "host.statusSettled",
  slashed: "host.statusSlashed",
  void: "host.statusVoid",
};

export function HostPage() {
  const [locale, setLocale, tx] = useLocale("meta.hostTitle", "meta.hostDesc");
  const { deployment, souls, error, rosterError } = useLifeWorld(0);
  const [hubDep, setHubDep] = useState(undefined);
  const [runnerListing, setRunnerListing] = useState(undefined);
  const [runnerLive, setRunnerLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [fuelAmt, setFuelAmt] = useState("10");
  const [drainAmt, setDrainAmt] = useState("");
  const [runner, setRunner] = useState("");
  const [fee, setFee] = useState("1");
  const [steps, setSteps] = useState("1000");
  const [spendCap, setSpendCap] = useState("100");
  const [validHours, setValidHours] = useState("");
  const [snap, setSnap] = useState(null);
  const [purse, setPurse] = useState(null);
  const [lineage, setLineage] = useState(null);
  const [capsOk, setCapsOk] = useState(null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const { wallet, setWallet, pick, dialog, connect } = useConnectedWallet(
    deployment,
    tx,
  );
  const [focusId, setFocusId] = useState(() =>
    querySoulId(typeof window === "undefined" ? "" : window.location.search),
  );

  useEffect(() => {
    const tick = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let gone = false;
    loadHubDeployment()
      .then((data) => {
        if (!gone) setHubDep(data);
      })
      .catch(() => {
        if (!gone) setHubDep(null);
      });
    loadRunnerListing()
      .then((data) => {
        if (!gone) setRunnerListing(data);
      })
      .catch(() => {
        if (!gone) setRunnerListing(null);
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    const listed = runnerListing?.address || "";
    if (listed) {
      setRunner((current) => current || listed);
    }
    if (!runnerListing?.url) {
      setRunnerLive(null);
      return undefined;
    }
    const base = String(runnerListing.url).replace(/\/$/, "");
    let gone = false;
    const pull = () =>
      fetch(`${base}/status`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (gone) return;
          setRunnerLive(data || null);
          if (data?.runner) setRunner((current) => current || data.runner);
        })
        .catch(() => {
          if (!gone) setRunnerLive(false);
        });
    pull();
    const timer = setInterval(pull, 15000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [runnerListing]);

  const mine = useMemo(() => {
    if (!wallet) return [];
    const mineAddr = wallet.toLowerCase();
    return souls.filter((soul) => soul.owner?.toLowerCase() === mineAddr);
  }, [souls, wallet]);

  useEffect(() => {
    if (!focusId || tokenId) return;
    setTokenId(String(focusId));
  }, [focusId, tokenId]);

  const selected = mine.find(
    (soul) => Number(soul.tokenId) === Number(tokenId),
  );
  const testnet = Number(deployment?.chainId) === 97;
  const liveHub = Boolean(hubDep?.address);
  const booting = hubDep === undefined || deployment === undefined;
  const policy = acceptancePolicy(hubDep?.chainId || deployment?.chainId);
  const mockIfs =
    liveHub && (isMockIfsNetwork(hubDep?.chainId) || !isLiveIfs(hubDep?.ifs));
  const tank = snap?.tank;
  const bound = tank && !isZeroAddr(tank.runner);
  const todaySpent = spentToday(
    snap?.userDaySpend,
    snap?.userSpendDay,
    snap?.spendDay,
  );
  const leftToday = snap ? dailyLeft(snap.maxUserDaily, todaySpent) : null;
  const live = liveRunnerForToken(runnerLive, tokenId);
  const lease = snap?.lease;
  const phase = snap?.paused
    ? "idle"
    : segmentPhase(lease, nowSec) === "idle" &&
        snap?.lastSettledId &&
        !isZeroHash(snap.lastSettledId)
      ? "settled"
      : segmentPhase(lease, nowSec);
  const until = lease?.challengeUntil || live?.challengeUntil || 0;
  const leftWindow = windowLeftSec(until, nowSec);
  const currentSeg =
    lease?.id ||
    live?.segmentId ||
    (isZeroHash(snap?.lastSettledId) ? "" : snap?.lastSettledId);
  const archiveHref =
    runnerListing?.url && currentSeg && !isZeroHash(currentSeg)
      ? archiveUrl(runnerListing.url, currentSeg)
      : "";
  const lastArchiveHref =
    runnerListing?.url && snap?.lastSettledId && !isZeroHash(snap.lastSettledId)
      ? archiveUrl(runnerListing.url, snap.lastSettledId)
      : "";
  const lineageHref =
    runnerListing?.url && tokenId ? lineageUrl(runnerListing.url, tokenId) : "";
  const rows = lineage?.segments ? [...lineage.segments].reverse() : [];

  useEffect(() => {
    if (!deployment || !hubDep?.address) {
      setCapsOk(null);
      return undefined;
    }
    let gone = false;
    openLifeReader(deployment)
      .then(async (reader) => {
        if (!reader || gone) return;
        const hub = await openLifeHub(hubDep.address, reader.provider);
        const ok = await hubHasSpendLimits(hub);
        if (!gone) setCapsOk(ok);
      })
      .catch(() => {
        if (!gone) setCapsOk(false);
      });
    return () => {
      gone = true;
    };
  }, [deployment, hubDep]);

  const refreshBoard = useCallback(
    async (sessionWallet, id) => {
      if (!deployment || !hubDep?.address) {
        setSnap(null);
        setPurse(null);
        return;
      }
      const reader = await openLifeReader(deployment);
      if (!reader) return;
      const hub = await openLifeHub(hubDep.address, reader.provider);
      const ifs = hubDep.ifs ? openIfsToken(hubDep.ifs, reader.provider) : null;
      const [nextSnap, nextPurse] = await Promise.all([
        id ? readHostSnapshot(hub, id, sessionWallet) : Promise.resolve(null),
        sessionWallet
          ? readHostPurse(hub, {
              wallet: sessionWallet,
              provider: reader.provider,
              ifs,
            })
          : Promise.resolve(null),
      ]);
      setSnap(nextSnap);
      setPurse(nextPurse);
    },
    [deployment, hubDep],
  );

  useEffect(() => {
    if (!liveHub) {
      setSnap(null);
      setPurse(null);
      return undefined;
    }
    let gone = false;
    const pull = () =>
      refreshBoard(wallet, tokenId).catch(() => {
        if (!gone && tokenId) setSnap(null);
      });
    pull();
    const timer = setInterval(pull, 20000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [liveHub, tokenId, wallet, refreshBoard]);

  useEffect(() => {
    if (!lineageHref) {
      setLineage(null);
      return undefined;
    }
    let gone = false;
    const pull = () =>
      fetch(lineageHref)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!gone) setLineage(data ? parseLineage(data) : { segments: [] });
        })
        .catch(() => {
          if (!gone) setLineage({ segments: [] });
        });
    pull();
    const timer = setInterval(pull, 20000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [lineageHref]);

  async function withSession(job) {
    if (!deployment) {
      setNote(tx("host.loading"));
      return null;
    }
    if (!hubDep?.address) {
      setNote(tx("host.off"));
      return null;
    }
    setBusy(true);
    setNote("");
    setFlash("");
    try {
      const session = await connectChosenLife(pick, deployment);
      if (!session) return null;
      setWallet(session.address);
      const hub = await openLifeHub(hubDep.address, session.signer);
      const ifs = openIfsToken(hubDep.ifs, session.signer);
      const result = await job({ ...session, hub, ifs });
      await refreshBoard(session.address, tokenId);
      return result;
    } catch (err) {
      setNote(explainHostError(err, tx));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onConnect() {
    setNote("");
    setFlash("");
    try {
      const session = await connect();
      if (!session) return;
      setBusy(true);
      await refreshBoard(session.address, tokenId);
    } catch (err) {
      setNote(explainHostError(err, tx));
    } finally {
      setBusy(false);
    }
  }

  async function onRefresh() {
    setBusy(true);
    setNote("");
    try {
      await refreshBoard(wallet, tokenId);
      setFlash(tx("host.okRefresh"));
    } catch (err) {
      setNote(explainHostError(err, tx));
    } finally {
      setBusy(false);
    }
  }

  function pickSoul(id) {
    setTokenId(String(id));
    setFocusId(Number(id));
    pinSoulParam(id);
  }

  async function onFuel(kind) {
    const id = Number(tokenId);
    const amount = parseEther(String(fuelAmt || "0"));
    if (!id || amount <= 0n) {
      setNote(tx("host.needFuel"));
      return;
    }
    await withSession(async ({ hub, ifs, address }) => {
      const hubAddr = await hub.getAddress();
      await ensureIfsAllowance(ifs, hubAddr, address, amount);
      const sent =
        kind === "gift" ? hub.giftFuel(id, amount) : hub.refuel(id, amount);
      await (await sent).wait();
      setFlash(tx("host.okFuel"));
    });
  }

  async function onDrain() {
    const id = Number(tokenId);
    const amount = parseEther(String(drainAmt || tank?.ownerFuel || "0"));
    if (!id || amount <= 0n) {
      setNote(tx("host.needFuel"));
      return;
    }
    await withSession(async ({ hub }) => {
      await (await hub.drainOwnerFuel(id, amount)).wait();
      setFlash(tx("host.okDrain"));
    });
  }

  async function onClaimRefund() {
    await withSession(async ({ hub }) => {
      await (await hub.claimRefund()).wait();
      setFlash(tx("host.okRefund"));
    });
  }

  async function onWithdrawWage() {
    await withSession(async ({ hub }) => {
      await (await hub.withdrawEarnings()).wait();
      setFlash(tx("host.okWage"));
    });
  }

  async function onBind() {
    const id = Number(tokenId);
    const form = parseBindForm({ runner, fee, steps, spendCap, validHours });
    if (!id || !form.runner || !form.steps || !form.fee || !form.spendCap) {
      setNote(tx("host.badOrder"));
      return;
    }
    await withSession(async ({ hub, soul }) => {
      await (
        await hub.bindRunner(
          id,
          form.runner,
          parseEther(form.fee || "0"),
          form.steps,
          parseEther(form.spendCap || "0"),
          validUntilOf(form.validHours),
        )
      ).wait();
      const current = await soul.authorizedRunner(id);
      if (getAddress(current) !== getAddress(form.runner)) {
        await (await soul.setRunner(id, form.runner)).wait();
      }
      setFlash(tx("host.okBind"));
    });
  }

  const refundAmt = purse?.refunds || snap?.refunds || "0";
  const wageAmt = purse?.earnings || "0";
  const sym = nativeSymbol(hubDep?.chainId || deployment?.chainId);

  return (
    <SitePage
      current="host"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      className="life-page"
    >
      {dialog}
      <main className="life-shell is-host">
        <aside className="life-rail">
          <span className="eyebrow">HOST / PRIVATE TRACK</span>
          <h1>
            {tx("host.title")} <small>{tx("host.kicker")}</small>
          </h1>
          <p>{tx("host.lead")}</p>
          <p className="life-note">{tx("host.boundary")}</p>
          <p className="life-note">{tx("host.notMesh")}</p>
          <p className="life-note">{tx("host.policy")}</p>
          <p className="life-note">{tx("host.policyArbiter")}</p>
          <p className="life-note">{tx("host.revenue")}</p>
          {capsOk === false ? (
            <p className="life-note">{tx("host.staleHub")}</p>
          ) : null}
          {liveHub && (testnet || mockIfs) ? (
            <p className="life-note">{tx("host.mockIfs")}</p>
          ) : liveHub ? (
            <p className="life-meta">
              {tx("host.liveIfs", {
                ifs: shortAddr(hubDep?.ifs || MAINNET_IFS),
                hive: shortAddr(hubDep?.hive || MAINNET_HIVE),
              })}
            </p>
          ) : null}
          {testnet ? <p className="life-note">{tx("life.testnet")}</p> : null}
          {booting ? (
            <p className="life-meta">{tx("host.loading")}</p>
          ) : liveHub ? (
            <p className="life-meta">
              {shortAddr(hubDep.address)} ·{" "}
              {policy.payIfUnchallenged ? "pay-if-unchallenged" : ""}
            </p>
          ) : (
            <>
              <p className="life-note">{tx("host.off")}</p>
              <SiteLink href="/host.html?net=test" className="life-cross">
                {tx("host.openTestnet")}
              </SiteLink>
            </>
          )}
          <SiteLink href={withNet("/habitat.html")} className="life-cross">
            {tx("host.toHabitat")}
          </SiteLink>
          <SiteLink href="/#mesh" className="life-cross">
            {tx("host.toMesh")}
          </SiteLink>
          <div className="life-kin">
            <button type="button" onClick={onConnect} disabled={busy}>
              {wallet ? shortAddr(wallet) : tx("life.connect")}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={onRefresh}
            >
              {tx("host.refresh")}
            </button>
            {wallet ? (
              <p className="life-meta">
                {tx("life.mineCount", { n: mine.length })}
              </p>
            ) : null}
            {mine.length ? (
              <label>
                {tx("host.mySoul")}
                <select
                  value={tokenId}
                  onChange={(event) => pickSoul(event.target.value)}
                >
                  <option value="">{tx("host.pickSoul")}</option>
                  {mine.map((soul) => (
                    <option key={soul.tokenId} value={soul.tokenId}>
                      #{soul.tokenId} {soul.givenName || labelOf(soul, locale)}
                    </option>
                  ))}
                </select>
              </label>
            ) : wallet ? (
              <p className="life-note">{tx("host.noMine")}</p>
            ) : null}
            {leftToday != null ? (
              <p className="life-meta">
                {tx("host.daily", {
                  n: formatIfs(leftToday),
                  cap: formatIfs(snap.maxUserDaily),
                })}
              </p>
            ) : snap ? (
              <p className="life-meta">{tx("host.dailyOpen")}</p>
            ) : null}
          </div>
          {note ? <p className="pit-error">{note}</p> : null}
          {flash ? <p className="life-meta">{flash}</p> : null}
          {error ? <p className="pit-error">{error}</p> : null}
          {rosterError ? (
            <p className="life-note">{tx("life.colonyMiss")}</p>
          ) : null}
        </aside>
        <section className="life-stage is-host">
          <p className="eyebrow host-dash-kicker">{tx("host.dash")}</p>
          <div className="life-host-grid">
            <article className="life-host-card">
              <h2>{tx("host.wallet")}</h2>
              {wallet ? (
                <dl>
                  <div>
                    <dt>{tx("life.connect")}</dt>
                    <dd>{shortAddr(wallet)}</dd>
                  </div>
                  <div>
                    <dt>{tx("host.native", { sym })}</dt>
                    <dd>
                      {formatIfs(purse?.native)} {sym}
                    </dd>
                  </div>
                  <div>
                    <dt>{tx("host.ifsBal")}</dt>
                    <dd>{formatIfs(purse?.ifs)} IFS</dd>
                  </div>
                  <div>
                    <dt>{tx("host.wage")}</dt>
                    <dd>{formatIfs(wageAmt)} IFS</dd>
                  </div>
                  {purse?.operator?.status ? (
                    <>
                      <div>
                        <dt>{tx("host.opBond")}</dt>
                        <dd>{formatIfs(purse.operator.bond)} IFS</dd>
                      </div>
                      <div>
                        <dt>{tx("host.opExposure")}</dt>
                        <dd>{formatIfs(purse.operator.exposure)} IFS</dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              ) : (
                <p className="life-note">{tx("host.empty")}</p>
              )}
              <p className="life-note">{tx("host.wageLead")}</p>
              <div className="life-kin-row">
                {BigInt(wageAmt) > 0n ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onWithdrawWage}
                  >
                    {tx("host.withdrawWage")}
                  </button>
                ) : null}
                {BigInt(refundAmt) > 0n ? (
                  <button type="button" disabled={busy} onClick={onClaimRefund}>
                    {tx("host.claimRefund", { n: formatIfs(refundAmt) })}
                  </button>
                ) : null}
              </div>
            </article>
            {tokenId ? (
              <article className="life-host-card">
                <h2>{tx("host.status")}</h2>
                <p className={`host-phase is-${phase}`}>
                  {tx(PHASE_COPY[phase] || "host.statusIdle")}
                </p>
                <dl>
                  <div>
                    <dt>{tx("host.segmentId")}</dt>
                    <dd>{currentSeg ? fmtRoot(currentSeg) : "—"}</dd>
                  </div>
                  {leftWindow != null &&
                  (phase === "window" || phase === "ready") ? (
                    <div>
                      <dt>{tx("host.countdown")}</dt>
                      <dd>
                        {phase === "window"
                          ? formatCountdown(leftWindow)
                          : "0s"}
                      </dd>
                    </div>
                  ) : null}
                  {lease?.fee ? (
                    <div>
                      <dt>{tx("host.feeSeg")}</dt>
                      <dd>{formatIfs(lease.fee)} IFS</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{tx("host.fuelTotal")}</dt>
                    <dd>{formatIfs(tankFuel(tank))} IFS</dd>
                  </div>
                  <div>
                    <dt>{tx("host.capLeft")}</dt>
                    <dd>{formatIfs(capLeft(tank))} IFS</dd>
                  </div>
                  <div>
                    <dt>{tx("host.segmentsLeft")}</dt>
                    <dd>{segmentsRemaining(tank)}</dd>
                  </div>
                  <div>
                    <dt>{tx("host.orderUntil")}</dt>
                    <dd>
                      {tank?.validUntil
                        ? formatWhen(tank.validUntil, locale)
                        : tx("host.orderOpen")}
                    </dd>
                  </div>
                </dl>
                <p className="life-meta">
                  {runnerLive && runnerLive !== false
                    ? tx("host.runnerLive")
                    : runnerListing?.url
                      ? tx("host.runnerDown")
                      : ""}
                  {live?.tick ? ` · ${tx("host.runnerTick")} ${live.tick}` : ""}
                </p>
                {live?.error ? (
                  <p className="pit-error">
                    {tx("host.runnerErr")}: {String(live.error)}
                  </p>
                ) : null}
                {archiveHref ? (
                  <a
                    className="life-cross"
                    href={archiveHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx("host.openArchive")}
                  </a>
                ) : null}
              </article>
            ) : null}
            {tokenId ? (
              <article className="life-host-card">
                <h2>{tx("host.tank")}</h2>
                {selected ? (
                  <p>
                    #{selected.tokenId}{" "}
                    {selected.givenName || labelOf(selected, locale)}
                  </p>
                ) : (
                  <p>#{tokenId}</p>
                )}
                <dl>
                  <div>
                    <dt>{tx("host.ownerFuel")}</dt>
                    <dd>{formatIfs(tank?.ownerFuel)} IFS</dd>
                  </div>
                  <div>
                    <dt>{tx("host.giftFuel")}</dt>
                    <dd>{formatIfs(tank?.giftFuel)} IFS</dd>
                  </div>
                  <div>
                    <dt>{tx("host.reserved")}</dt>
                    <dd>{formatIfs(tank?.reserved)} IFS</dd>
                  </div>
                  <div>
                    <dt>{tx("host.spent")}</dt>
                    <dd>{formatIfs(tank?.spent)} IFS</dd>
                  </div>
                  <div>
                    <dt>{tx("host.bound")}</dt>
                    <dd>
                      {bound
                        ? `${shortAddr(tank.runner)} · ${formatIfs(tank.fee)} / ${tank.steps}`
                        : tx("host.unbound")}
                    </dd>
                  </div>
                </dl>
                <label>
                  {tx("host.fuel")}
                  <input
                    value={fuelAmt}
                    onChange={(event) => setFuelAmt(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <div className="life-kin-row">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onFuel("owner")}
                  >
                    {tx("host.refuel")}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => onFuel("gift")}
                  >
                    {tx("host.gift")}
                  </button>
                </div>
                <label>
                  {tx("host.drain")}
                  <input
                    value={drainAmt}
                    onChange={(event) => setDrainAmt(event.target.value)}
                    placeholder={formatIfs(tank?.ownerFuel)}
                    inputMode="decimal"
                  />
                </label>
                <div className="life-kin-row">
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={onDrain}
                  >
                    {tx("host.drainGo")}
                  </button>
                </div>
              </article>
            ) : null}
            {tokenId ? (
              <article className="life-host-card">
                <h2>{bound ? tx("host.rebind") : tx("host.bind")}</h2>
                <p className="life-note">{tx("host.bindLead")}</p>
                {runnerListing?.url ? (
                  <p className="life-meta">
                    {tx("host.officialRunner")}{" "}
                    <a
                      href={runnerListing.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {runnerListing.url.replace(/^https?:\/\//, "")}
                    </a>
                  </p>
                ) : null}
                <label>
                  {tx("host.runner")}
                  <input
                    value={runner}
                    onChange={(event) => setRunner(event.target.value)}
                    placeholder="0x…"
                  />
                </label>
                <label>
                  {tx("host.fee")}
                  <input
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label>
                  {tx("host.steps")}
                  <input
                    value={steps}
                    onChange={(event) => setSteps(event.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  {tx("host.spendCap")}
                  <input
                    value={spendCap}
                    onChange={(event) => setSpendCap(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label>
                  {tx("host.validHours")}
                  <input
                    value={validHours}
                    onChange={(event) => setValidHours(event.target.value)}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </label>
                <button type="button" disabled={busy} onClick={onBind}>
                  {bound ? tx("host.rebind") : tx("host.bind")}
                </button>
              </article>
            ) : null}
            {tokenId ? (
              <article className="life-host-card">
                <h2>{tx("host.bills")}</h2>
                <dl>
                  <div>
                    <dt>{tx("host.accepted")}</dt>
                    <dd>{snap?.work.accepted ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{tx("host.disputed")}</dt>
                    <dd>{snap?.work.disputed ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{tx("host.slashed")}</dt>
                    <dd>{snap?.work.slashed ?? 0}</dd>
                  </div>
                  <div>
                    <dt>{tx("host.lastRoot")}</dt>
                    <dd>{fmtRoot(snap?.lastFinalRoot)}</dd>
                  </div>
                  <div>
                    <dt>{tx("host.lastSeg")}</dt>
                    <dd>{fmtRoot(snap?.lastSettledId)}</dd>
                  </div>
                </dl>
              </article>
            ) : null}
            {tokenId ? (
              <article className="life-host-card">
                <h2>{tx("host.lineage")}</h2>
                <p className="life-note">{tx("host.archiveLead")}</p>
                {rows.length ? (
                  <ol className="host-lineage">
                    {rows.map((row) => (
                      <li key={row.segmentId}>
                        <span>
                          {tx("host.lineageNonce", { n: row.nonce })} ·{" "}
                          {fmtRoot(row.segmentId)}
                        </span>
                        {runnerListing?.url ? (
                          <a
                            href={archiveUrl(runnerListing.url, row.segmentId)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {tx("host.openArchive")}
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="life-meta">{tx("host.lineageEmpty")}</p>
                )}
                {lastArchiveHref ? (
                  <a
                    className="life-cross"
                    href={lastArchiveHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx("host.openArchive")}
                  </a>
                ) : null}
                {lineageHref ? (
                  <a
                    className="life-cross"
                    href={lineageHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tx("host.openLineage")}
                  </a>
                ) : null}
              </article>
            ) : null}
          </div>
        </section>
      </main>
    </SitePage>
  );
}
