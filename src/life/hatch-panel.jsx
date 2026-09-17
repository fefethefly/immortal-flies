import React, { useEffect, useRef, useState } from "react";
import { PhenotypeReadout } from "../phenotype-view.jsx";
import { LocaleContext, useTx } from "../locale-context.jsx";
import { birthHref } from "./birth-card.mjs";
import { BirthCardDialog } from "./birth-card.jsx";
import {
  explainLifeError,
  hatchPhase,
  loadLifeDeployment,
  networkOf,
  readBorn,
  readHatchRequested,
  readHeadBlock,
  readPendingHatch,
} from "./chain.mjs";
import { useHatchWatch } from "./hatch-watch.mjs";
import {
  normalizeGiven,
  peekPendingGiven,
  setGivenName,
  setPendingGiven,
  takePendingGiven,
} from "./names.mjs";
import { decorateSoul } from "./souls.mjs";
import { connectChosenLife, useWalletPick } from "./wallet-pick.jsx";

export function HatchPanel({ compact = false, onBorn, fieldCount = 1400 }) {
  const { locale } = React.useContext(LocaleContext);
  const tx = useTx();
  const [deployment, setDeployment] = useState(undefined);
  const {
    scope,
    walletEpoch,
    wallet,
    setWallet,
    pending,
    setPending,
    used,
    setUsed,
    blockNow,
    setBlockNow,
    phase,
    deadline,
  } = useHatchWatch(deployment);
  const [born, setBorn] = useState(null);
  const [showCard, setShowCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [given, setGiven] = useState("");
  const [needRetry, setNeedRetry] = useState(false);
  const autoFor = useRef(0);
  const { pick, dialog } = useWalletPick();

  useEffect(() => {
    loadLifeDeployment()
      .then((data) => setDeployment(data))
      .catch(() => setDeployment(null));
  }, []);

  useEffect(() => {
    const draft = peekPendingGiven();
    if (draft) setGiven(draft);
  }, []);

  useEffect(() => {
    autoFor.current = 0;
    setBusy(false);
    setError("");
    setNeedRetry(false);
    setBorn(null);
    setShowCard(false);
    const draft = peekPendingGiven();
    if (draft) setGiven(draft);
  }, [walletEpoch]);

  useEffect(() => {
    if (phase !== "ready" || !pending || busy || used) return;
    if (autoFor.current === pending.requestId) return;
    autoFor.current = pending.requestId;
    setNeedRetry(false);
    complete();
  }, [phase, pending?.requestId, busy, used, walletEpoch]);

  async function withSoul(run) {
    let guard = null;
    setBusy(true);
    setError("");
    try {
      const session = await connectChosenLife(
        pick,
        deployment,
        networkOf(deployment.chainId),
      );
      if (!session) return;
      guard = scope.capture();
      setWallet(session.address);
      const hatched = await session.soul.hatched(session.address);
      guard.check();
      setUsed(Boolean(hatched));
      const live = await readPendingHatch(session.soul, session.address);
      guard.check();
      setPending(live);
      await run(session, guard.check);
    } catch (err) {
      if (guard && !guard.isCurrent()) return;
      setError(explainLifeError(err, tx));
      if (phase === "ready") setNeedRetry(true);
    } finally {
      if (!guard || guard.isCurrent()) setBusy(false);
    }
  }

  function request() {
    const name = normalizeGiven(given);
    if (!name) {
      setError(tx("hatch.nameNeed"));
      return;
    }
    setPendingGiven(name);
    return withSoul(async ({ soul, address }, check) => {
      const hatched = await soul.hatched(address);
      check();
      if (hatched) throw new Error(tx("hatch.limit"));
      const receipt = await (await soul.requestHatch(name)).wait();
      check();
      const next = readHatchRequested(receipt, soul);
      setPending(next);
      setBlockNow(receipt.blockNumber || next.entropyBlock - 2);
      setBorn(null);
      setShowCard(false);
    });
  }

  function complete() {
    return withSoul(async ({ soul, address, network: net }, check) => {
      const live = await readPendingHatch(soul, address);
      const now = await readHeadBlock(net, blockNow);
      check();
      setPending(live);
      setBlockNow(now);
      const nextPhase = hatchPhase(live, now);
      if (!live) throw new Error(tx("hatch.needRequest"));
      if (nextPhase === "wait") throw new Error(tx("hatch.notReady"));
      if (nextPhase === "expired")
        throw new Error(tx("hatch.expired", { id: live.requestId }));
      const receipt = await (await soul.hatch(live.requestId)).wait();
      check();
      const event = readBorn(receipt, soul);
      const named = takePendingGiven() || normalizeGiven(given);
      check();
      if (named) setGivenName(deployment.chainId, event.life, named);
      const root = await soul.genesisRoot();
      check();
      const card = decorateSoul(
        {
          ...event,
          givenName: named,
          bornBlock: receipt.blockNumber,
          generation: 0,
        },
        { genesisRoot: root, chainId: deployment.chainId, fieldCount },
      );
      setBorn(card);
      setPending(null);
      setUsed(true);
      setShowCard(true);
      onBorn?.(card);
    });
  }

  function expire() {
    return withSoul(async ({ soul, address, network: net }, check) => {
      const live = await readPendingHatch(soul, address);
      const now = await readHeadBlock(net, blockNow);
      check();
      setPending(live);
      setBlockNow(now);
      if (!live) throw new Error(tx("hatch.needRequest"));
      if (hatchPhase(live, now) !== "expired")
        throw new Error(tx("hatch.notReady"));
      await (await soul.expireHatch(live.requestId)).wait();
      check();
      setPending(null);
    });
  }

  return (
    <section
      className={`hatch${compact ? " is-hero" : ""}`}
      aria-label={tx("hatch.aria")}
    >
      {compact ? (
        <span className="eyebrow">SOUL / LIVE</span>
      ) : (
        <>
          <span className="eyebrow">SOUL / FREE HATCH</span>
          <h2>
            {tx("hatch.title")} <small>{tx("hatch.kicker")}</small>
          </h2>
        </>
      )}
      {deployment === undefined ? (
        <p>{tx("hatch.loading")}</p>
      ) : !deployment ? (
        <p className="hatch-note">{tx("hatch.undeployed")}</p>
      ) : (
        <>
          <p className="hatch-note">
            {tx(compact ? "hatch.kicker" : "hatch.liveHint")}
          </p>
          <label className="hatch-name">
            {tx("hatch.name")}
            <input
              value={given}
              maxLength={24}
              disabled={used}
              onChange={(event) => setGiven(event.target.value)}
              placeholder={tx("hatch.nameHint")}
            />
          </label>
          <div className="hatch-actions">
            <button
              className="primary"
              disabled={busy || used || Boolean(pending)}
              onClick={request}
            >
              {tx("hatch.request")}
            </button>
            {needRetry && phase === "ready" ? (
              <button className="ghost" disabled={busy} onClick={complete}>
                {tx("hatch.autoRetry")}
              </button>
            ) : null}
            {phase === "expired" ? (
              <button className="ghost" disabled={busy} onClick={expire}>
                {tx("hatch.expire")}
              </button>
            ) : null}
          </div>
          {wallet ? (
            <p className="hatch-meta">
              {wallet} · {deployment.address}
              {used ? ` · ${tx("hatch.already")}` : ""}
            </p>
          ) : null}
          {pending ? (
            <p className="hatch-meta">
              {phase === "ready"
                ? tx("hatch.ready", { id: pending.requestId, deadline })
                : phase === "expired"
                  ? tx("hatch.expired", { id: pending.requestId })
                  : tx("hatch.pending", {
                      id: pending.requestId,
                      block: pending.entropyBlock,
                    })}{" "}
              {blockNow
                ? tx("life.blockNow", { n: blockNow })
                : tx("life.waitingBlock")}
            </p>
          ) : null}
        </>
      )}
      {born ? (
        <>
          {compact ? (
            <p className="hatch-meta">
              {tx("hatch.born", { id: born.tokenId })}
            </p>
          ) : (
            <PhenotypeReadout
              fly={{ genome: born.genome, phenotype: born.phenotype }}
              locale={locale}
              caption={tx("hatch.born", { id: born.tokenId })}
              note={tx("pheno.note")}
            />
          )}
          <a
            className="hatch-go"
            href={birthHref(
              born,
              typeof location !== "undefined" ? location.origin : "",
              locale,
            )}
          >
            {tx("hatch.goSee", { id: born.tokenId })}
          </a>
          <button
            className="ghost"
            type="button"
            onClick={() => setShowCard(true)}
          >
            {tx("birth.open")}
          </button>
          {showCard ? (
            <BirthCardDialog
              soul={born}
              souls={[born]}
              locale={locale}
              tx={tx}
              onClose={() => setShowCard(false)}
            />
          ) : null}
        </>
      ) : null}
      {error ? (
        <p className="pit-error" role="alert">
          {error}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
