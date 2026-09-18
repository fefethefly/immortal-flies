import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MaxUint256, getAddress, parseEther } from "ethers";
import { SiteLink, SitePage } from "../site-chrome.jsx";
import { useLocale } from "../use-locale.mjs";
import {
  connectLife,
  explainHostError,
  hubHasSpendLimits,
  loadHubDeployment,
  loadRunnerListing,
  openIfsToken,
  openLifeHub,
  openLifeReader,
  readHostSnapshot,
} from "./chain.mjs";
import { useLifeWorld } from "./desk.jsx";
import {
  MAINNET_HIVE,
  MAINNET_IFS,
  acceptancePolicy,
  archiveUrl,
  dailyLeft,
  formatIfs,
  isLiveIfs,
  isMockIfsNetwork,
  isZeroAddr,
  isZeroHash,
  lineageUrl,
  parseBindForm,
  spentToday,
  validUntilOf,
} from "./host.mjs";
import { labelOf } from "./names.mjs";
import { withNet } from "./net.mjs";
import { querySoulId, shortAddr } from "./souls.mjs";
import { recallAnnouncedWallet } from "./wallets.mjs";
import { connectChosenLife, useWalletPick } from "./wallet-pick.jsx";
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

export function HostPage() {
  const [locale, setLocale, tx] = useLocale("meta.hostTitle", "meta.hostDesc");
  const { deployment, souls, error, rosterError } = useLifeWorld(0);
  const [hubDep, setHubDep] = useState(undefined);
  const [runnerListing, setRunnerListing] = useState(undefined);
  const [wallet, setWallet] = useState("");
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
  const [capsOk, setCapsOk] = useState(null);
  const { pick, dialog } = useWalletPick();
  const [focusId, setFocusId] = useState(() =>
    querySoulId(typeof window === "undefined" ? "" : window.location.search),
  );

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
    if (!runnerListing?.url) return undefined;
    let gone = false;
    fetch(`${String(runnerListing.url).replace(/\/$/, "")}/status`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (gone || !data?.runner) return;
        setRunner((current) => current || data.runner);
      })
      .catch(() => {});
    return () => {
      gone = true;
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

  const selected = mine.find((soul) => Number(soul.tokenId) === Number(tokenId));
  const testnet = Number(deployment?.chainId) === 97;
  const liveHub = Boolean(hubDep?.address);
  const booting = hubDep === undefined || deployment === undefined;
  const policy = acceptancePolicy(hubDep?.chainId || deployment?.chainId);
  const mockIfs =
    liveHub &&
    (isMockIfsNetwork(hubDep?.chainId) || !isLiveIfs(hubDep?.ifs));
  const tank = snap?.tank;
  const bound = tank && !isZeroAddr(tank.runner);
  const todaySpent = spentToday(
    snap?.userDaySpend,
    snap?.userSpendDay,
    snap?.spendDay,
  );
  const leftToday = snap
    ? dailyLeft(snap.maxUserDaily, todaySpent)
    : null;
  const archiveHref =
    runnerListing?.url && snap?.lastSettledId && !isZeroHash(snap.lastSettledId)
      ? archiveUrl(runnerListing.url, snap.lastSettledId)
      : "";
  const lineageHref =
    runnerListing?.url && tokenId ? lineageUrl(runnerListing.url, tokenId) : "";

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

  const refreshSnap = useCallback(
    async (sessionWallet, id) => {
      if (!deployment || !hubDep?.address || !id) {
        setSnap(null);
        return;
      }
      const reader = await openLifeReader(deployment);
      if (!reader) return;
      const hub = await openLifeHub(hubDep.address, reader.provider);
      setSnap(await readHostSnapshot(hub, id, sessionWallet));
    },
    [deployment, hubDep],
  );

  useEffect(() => {
    if (!liveHub || !tokenId) {
      setSnap(null);
      return undefined;
    }
    let gone = false;
    refreshSnap(wallet, tokenId).catch(() => {
      if (!gone) setSnap(null);
    });
    return () => {
      gone = true;
    };
  }, [liveHub, tokenId, wallet, refreshSnap]);

  async function withSession(job) {
    if (!deployment || !hubDep?.address) {
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
      await refreshSnap(session.address, tokenId);
      return result;
    } catch (err) {
      setNote(explainHostError(err, tx));
      return null;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!deployment || !hubDep?.address || wallet) return undefined;
    const recalled = recallAnnouncedWallet();
    if (!recalled?.provider) return undefined;
    let gone = false;
    connectLife(recalled.provider, deployment)
      .then((session) => {
        if (gone || !session) return;
        setWallet(session.address);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [deployment, hubDep, wallet]);

  async function onConnect() {
    await withSession(async () => null);
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
              {shortAddr(hubDep.address)} · {policy.payIfUnchallenged ? "pay-if-unchallenged" : ""}
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
            <button type="button" onClick={onConnect} disabled={busy || !liveHub}>
              {wallet ? shortAddr(wallet) : tx("life.connect")}
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
          {!tokenId ? (
            <p className="life-note host-empty">{tx("host.empty")}</p>
          ) : (
            <div className="life-host-grid">
              <article className="life-host-card">
                <h2>{tx("host.tank")}</h2>
                {selected ? (
                  <p>
                    #{selected.tokenId} {selected.givenName || labelOf(selected, locale)}
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
                  <button type="button" disabled={busy} onClick={() => onFuel("owner")}>
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
                  <button type="button" className="ghost" disabled={busy} onClick={onDrain}>
                    {tx("host.drainGo")}
                  </button>
                  {snap && BigInt(snap.refunds || 0) > 0n ? (
                    <button type="button" disabled={busy} onClick={onClaimRefund}>
                      {tx("host.claimRefund", { n: formatIfs(snap.refunds) })}
                    </button>
                  ) : null}
                </div>
              </article>
              <article className="life-host-card">
                <h2>{bound ? tx("host.rebind") : tx("host.bind")}</h2>
                <p className="life-note">{tx("host.bindLead")}</p>
                {runnerListing?.url ? (
                  <p className="life-meta">
                    {tx("host.officialRunner")}{" "}
                    <a href={runnerListing.url} target="_blank" rel="noreferrer">
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
              <article className="life-host-card">
                <h2>{tx("host.archive")}</h2>
                <p className="life-note">{tx("host.archiveLead")}</p>
                {archiveHref ? (
                  <a className="life-cross" href={archiveHref} target="_blank" rel="noreferrer">
                    {tx("host.openArchive")}
                  </a>
                ) : (
                  <p className="life-meta">{tx("host.noArchive")}</p>
                )}
                {lineageHref ? (
                  <a className="life-cross" href={lineageHref} target="_blank" rel="noreferrer">
                    {tx("host.openLineage")}
                  </a>
                ) : null}
              </article>
            </div>
          )}
        </section>
      </main>
    </SitePage>
  );
}
