import React, { useEffect, useRef, useState } from "react";
import { PhenotypeReadout } from "../phenotype-view.jsx";
import {
  explainLifeError,
  formatBreedPrice,
  hatchPhase,
  loadLifeDeployment,
  loadMarketDeployment,
  networkOf,
  openLifeMarket,
  openLifeReader,
  readOpenListing,
  readBorn,
  readBreedBuy,
  readBreedRequested,
  readHatchRequested,
  readHeadBlock,
  readKinBreedPrice,
  readParentCooldown,
  formatCooldown,
  readPendingHatch,
  readPendingBreed,
} from "./chain.mjs";
import { useHatchWatch } from "./hatch-watch.mjs";
import { HatchWait } from "./hatch-wait.jsx";
import {
  habitatShowsHatch,
  hatchActionKey,
  hatchWaitStage,
} from "./hatch-wait.mjs";
import {
  BirthCardButton,
  BirthCardDialog,
  useBirthCard,
} from "./birth-card.jsx";
import { KinBoard } from "./kin.jsx";
import { grindCrossover } from "./descent.mjs";
import {
  labelOf,
  matchSoul,
  normalizeGiven,
  peekPendingGiven,
  setGivenName,
  setPendingGiven,
  takePendingGiven,
} from "./names.mjs";
import {
  decorateSoul,
  hydrateColony,
  querySoulId,
  shortAddr,
} from "./souls.mjs";
import { SiteLink } from "../site-chrome.jsx";
import { JournalBoard } from "./journal-board.jsx";
import { formatAsk } from "./market.mjs";
import { withNet } from "./net.mjs";
import { connectChosenLife, useWalletPick } from "./wallet-pick.jsx";
import {
  asBytes32,
  checkReplay,
  decodeHead,
  downloadArchive,
  encodeArchiveRef,
  mergeInputs,
  readJournalRecord,
  readStimulusFromReceipt,
  recallInputs,
  rememberInputs,
  snapshotJournal,
} from "./journal.mjs";

export function useLifeWorld(fieldCount) {
  const [deployment, setDeployment] = useState(undefined);
  const [souls, setSouls] = useState([]);
  const [error, setError] = useState("");
  const [rosterError, setRosterError] = useState(false);

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
            fieldCount,
          };
          const taggedId = querySoulId(window.location.search);
          const { roster, rosterError: missed } = await hydrateColony(
            reader.soul,
            extras,
            taggedId,
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
  }, [fieldCount]);

  return { deployment, souls, setSouls, error, setError, rosterError };
}

export function LifeDesk({
  locale,
  tx,
  fieldCount,
  deployment,
  souls,
  setSouls,
  selected,
  setSelected,
  onBorn,
  onWallet,
  onStimulus,
  compact,
  hideSpecimen,
  surface = "full",
}) {
  const habitat = surface === "habitat";
  const {
    scope,
    walletEpoch,
    breedPending,
    setBreedPending,
    wallet,
    setWallet,
    pending,
    setPending,
    used,
    setUsed,
    blockNow,
    setBlockNow,
    phase,
  } = useHatchWatch(deployment, onWallet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipient, setRecipient] = useState("");
  const [runner, setRunner] = useState("");
  const [kind, setKind] = useState(0);
  const [given, setGiven] = useState("");
  const [query, setQuery] = useState("");
  const [findMiss, setFindMiss] = useState(false);
  const [mate, setMate] = useState("");
  const [breedPriceWei, setBreedPriceWei] = useState(0n);
  const [breedCool, setBreedCool] = useState({ cooldown: 0, remaining: 0 });
  const [breedBuyNote, setBreedBuyNote] = useState("");
  const [birth, setBirth] = useBirthCard(souls);
  const [needRetry, setNeedRetry] = useState(false);
  const [record, setRecord] = useState(null);
  const [replay, setReplay] = useState({ status: "idle" });
  const [journalUnread, setJournalUnread] = useState(false);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalTick, setJournalTick] = useState(0);
  const autoFor = useRef(0);
  const { pick, dialog } = useWalletPick(tx);
  const [ask, setAsk] = useState(null);
  const network = deployment ? networkOf(deployment.chainId) : null;
  const mine = souls.filter(
    (soul) => wallet && soul.owner.toLowerCase() === wallet.toLowerCase(),
  );
  const mates = mine.filter((soul) => soul.tokenId !== selected?.tokenId);
  const breedPhase = hatchPhase(breedPending, blockNow);
  const hatchStage = hatchWaitStage({ busy, pending, phase, needRetry });
  const breedReady = breedPhase === "ready";
  const shown = query.trim()
    ? souls.filter((soul) => matchSoul([soul], query, locale))
    : souls;

  useEffect(() => {
    autoFor.current = 0;
    setBusy(false);
    setError("");
    setNeedRetry(false);
    setGiven(peekPendingGiven());
    setMate("");
    setRecipient("");
    setRunner("");
    setRecord(null);
    setReplay({ status: "idle" });
    setJournalUnread(false);
    setJournalLoading(false);
    setBreedBuyNote("");
  }, [walletEpoch]);

  useEffect(() => {
    if (habitat || !deployment?.kin) {
      setBreedPriceWei(0n);
      return undefined;
    }
    let gone = false;
    openLifeReader(deployment)
      .then(async (reader) => {
        if (!reader?.kin || gone) return;
        const price = await readKinBreedPrice(reader.kin);
        if (!gone) setBreedPriceWei(price);
      })
      .catch(() => {
        if (!gone) setBreedPriceWei(0n);
      });
    return () => {
      gone = true;
    };
  }, [deployment, habitat]);

  useEffect(() => {
    if (habitat || !deployment?.kin || !selected?.tokenId || !mate) {
      setBreedCool({ cooldown: 0, remaining: 0 });
      return undefined;
    }
    let gone = false;
    openLifeReader(deployment)
      .then(async (reader) => {
        if (!reader?.kin || gone) return;
        const next = await readParentCooldown(
          reader.kin,
          selected.tokenId,
          Number(mate),
        );
        if (!gone) setBreedCool(next);
      })
      .catch(() => {
        if (!gone) setBreedCool({ cooldown: 0, remaining: 0 });
      });
    return () => {
      gone = true;
    };
  }, [deployment, selected?.tokenId, mate, breedPending, habitat]);

  useEffect(() => {
    if (!deployment || !selected?.tokenId) {
      setAsk(null);
      return undefined;
    }
    let gone = false;
    loadMarketDeployment()
      .then(async (marketDep) => {
        if (!marketDep?.address || gone) return;
        const reader = await openLifeReader(deployment);
        if (!reader || gone) return;
        const market = await openLifeMarket(marketDep.address, reader.provider);
        const row = await readOpenListing(market, selected.tokenId);
        if (!gone) setAsk(row);
      })
      .catch(() => {
        if (!gone) setAsk(null);
      });
    return () => {
      gone = true;
    };
  }, [deployment, selected?.tokenId]);

  useEffect(() => {
    if (habitat || !deployment?.journal || !selected) {
      setRecord(null);
      setReplay({ status: "idle" });
      setJournalUnread(false);
      setJournalLoading(false);
      return undefined;
    }
    let gone = false;
    setJournalUnread(false);
    setJournalLoading(true);
    setReplay({ status: "idle" });
    openLifeReader(deployment)
      .then(async (reader) => {
        if (!reader?.journal || gone) return;
        const epoch = Number(
          await reader.soul?.controlEpoch(selected.tokenId).catch(() => 0),
        );
        const head = decodeHead(
          await Promise.race([
            reader.journal.heads(selected.tokenId),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), 8000),
            ),
          ]),
        );
        if (gone) return;
        const snap = snapshotJournal(head, {
          cached: recallInputs(deployment.chainId, selected.tokenId),
          chainId: deployment.chainId,
          journalAddr: reader.journal.target,
          tokenId: selected.tokenId,
          epoch,
        });
        if (snap.inputs.length) {
          rememberInputs(deployment.chainId, selected.tokenId, snap.inputs);
        }
        setRecord(snap);
        setJournalLoading(false);
        if (snap.inputs.length) {
          setReplay({ status: "pending" });
          try {
            const checked = await checkReplay(selected, snap.inputs);
            if (!gone) setReplay(checked);
          } catch {
            if (!gone) setReplay({ status: "nograph" });
          }
        } else {
          setReplay({
            status: head.inputCount ? "eventsMiss" : "idle",
          });
        }
        readJournalRecord(reader.journal, selected.tokenId, {
          fromBlock: selected.bornBlock || deployment.fromBlock || 0,
          cached: snap.inputs,
          chainId: deployment.chainId,
          epoch,
        })
          .then((next) => {
            if (gone) return;
            setRecord(next);
            if (next.inputs.length > snap.inputs.length) {
              rememberInputs(deployment.chainId, selected.tokenId, next.inputs);
              setReplay({ status: "pending" });
              return checkReplay(selected, next.inputs).then(
                (checked) => !gone && setReplay(checked),
                () => !gone && setReplay({ status: "nograph" }),
              );
            }
            return undefined;
          })
          .catch(() => {});
      })
      .catch(() => {
        if (!gone) {
          setJournalLoading(false);
          setJournalUnread(true);
          setReplay({ status: "idle" });
        }
      });
    return () => {
      gone = true;
    };
  }, [
    deployment,
    selected?.tokenId,
    selected?.life,
    selected?.seed,
    journalTick,
    habitat,
  ]);

  useEffect(() => {
    if (phase !== "ready" || !pending || busy || used) return;
    if (autoFor.current === pending.requestId) return;
    autoFor.current = pending.requestId;
    setNeedRetry(false);
    complete();
  }, [phase, pending?.requestId, busy, used, walletEpoch]);

  async function withSession(run) {
    let guard = null;
    setBusy(true);
    setError("");
    try {
      const session = await connectChosenLife(pick, deployment);
      if (!session) return;
      guard = scope.capture();
      setWallet(session.address);
      onWallet?.(session.address);
      const hatched = await session.soul.hatched(session.address);
      guard.check();
      setUsed(Boolean(hatched));
      const live = await readPendingHatch(session.soul, session.address);
      guard.check();
      setPending(live);
      const liveBreed = await readPendingBreed(session.kin, session.address);
      guard.check();
      setBreedPending(liveBreed);
      if (live || liveBreed) {
        const now = await readHeadBlock(session.network, blockNow);
        guard.check();
        setBlockNow(now);
      }
      guard.check();
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
    return withSession(async ({ soul, address }, check) => {
      const hatched = await soul.hatched(address);
      check();
      if (hatched) throw new Error(tx("hatch.limit"));
      const receipt = await (await soul.requestHatch(name)).wait();
      check();
      const next = readHatchRequested(receipt, soul);
      setPending(next);
      setSelected(null);
      setBlockNow(receipt.blockNumber || next.entropyBlock - 2);
    });
  }

  function absorb(card) {
    setSouls((list) => {
      const next = [
        ...list.filter((item) => item.tokenId !== card.tokenId),
        card,
      ].sort((a, b) => a.tokenId - b.tokenId);
      onBorn?.(card, next);
      return next;
    });
    setSelected(card);
    setBirth(card);
  }

  function complete() {
    return withSession(async ({ soul, network: net, address }, check) => {
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
      const genesisRoot = await soul.genesisRoot();
      check();
      const onchainName = await soul.givenName(event.tokenId).catch(() => "");
      check();
      const named = onchainName || takePendingGiven() || normalizeGiven(given);
      if (named) setGivenName(net.chainId, event.life, named);
      absorb(
        decorateSoul(
          {
            ...event,
            givenName: named,
            bornBlock: receipt.blockNumber,
            generation: 0,
          },
          { genesisRoot, chainId: net.chainId, fieldCount },
        ),
      );
      setPending(null);
      setUsed(true);
      setNeedRetry(false);
    });
  }

  function expire() {
    return withSession(async ({ soul, address, network: net }, check) => {
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

  function transfer() {
    return withSession(async ({ soul, address }, check) => {
      if (!selected) throw new Error(tx("life.needFly"));
      const txr = await soul.transferFrom(
        address,
        recipient.trim(),
        selected.tokenId,
      );
      await txr.wait();
      check();
      setAsk(null);
      setRecipient("");
      setSouls((list) =>
        list.map((item) =>
          item.tokenId === selected.tokenId
            ? { ...item, owner: recipient.trim() }
            : item,
        ),
      );
    });
  }

  function assignRunner() {
    return withSession(async ({ soul }, check) => {
      if (!selected) throw new Error(tx("life.needFly"));
      await (await soul.setRunner(selected.tokenId, runner.trim())).wait();
    });
  }

  function stimulate() {
    return withSession(async ({ soul, journal }, check) => {
      if (!selected) throw new Error(tx("life.needFly"));
      if (!journal) throw new Error(tx("life.noJournal"));
      const epoch = await soul.controlEpoch(selected.tokenId);
      const head = await journal.heads(selected.tokenId);
      check();
      const receipt = await (
        await journal.submitStimulus(
          selected.tokenId,
          epoch,
          kind,
          640,
          head.inputCount,
        )
      ).wait();
      check();
      const written = readStimulusFromReceipt(receipt, journal) || {
        index: Number(head.inputCount) + 1,
        kind,
        intensity: 640,
        epoch: Number(epoch),
      };
      const inputs = rememberInputs(
        deployment.chainId,
        selected.tokenId,
        mergeInputs(record?.inputs, [written]),
      );
      const nextHead = decodeHead(await journal.heads(selected.tokenId));
      check();
      setRecord({
        head: nextHead,
        inputs,
        checkpoint: record?.checkpoint || null,
      });
      onStimulus?.(selected, kind, 640, written.index);
      setReplay({ status: "pending" });
      try {
        const checked = await checkReplay(selected, inputs);
        check();
        setReplay(checked);
      } catch {
        check();
        setReplay({ status: "nograph" });
      }
    });
  }

  function sealCheckpoint() {
    return withSession(async ({ soul, journal }, check) => {
      if (!selected) throw new Error(tx("life.needFly"));
      if (!journal) throw new Error(tx("life.noJournal"));
      if (!replay?.archive) throw new Error(tx("life.journal.needReplay"));
      const epoch = await soul.controlEpoch(selected.tokenId);
      const head = await journal.heads(selected.tokenId);
      check();
      if (!Number(head.inputCount))
        throw new Error(tx("life.journal.needInputs"));
      if (
        Number(head.inputCount) !== (replay.archive.payload.inputs?.length || 0)
      ) {
        throw new Error(tx("life.journal.needReplay"));
      }
      const uri = encodeArchiveRef({
        sha256: replay.archive.sha256,
        stateRoot: replay.archive.stateRoot,
        life: selected.life,
        inputCount: Number(head.inputCount),
        graphId: replay.graphId,
      });
      await (
        await journal.checkpoint(
          selected.tokenId,
          epoch,
          head.checkpointRoot,
          head.inputCount,
          asBytes32(replay.archive.stateRoot),
          asBytes32(replay.archive.sha256),
          uri,
        )
      ).wait();
      check();
      downloadArchive(selected, replay.archive);
      setJournalTick((n) => n + 1);
    });
  }

  function requestBreed() {
    return withSession(async ({ kin }, check) => {
      if (!kin) throw new Error(tx("life.noKin"));
      if (!selected || !mate) throw new Error(tx("kin.breedNeed"));
      const price = await readKinBreedPrice(kin);
      check();
      setBreedPriceWei(price);
      setBreedBuyNote("");
      const cool = await readParentCooldown(
        kin,
        selected.tokenId,
        Number(mate),
      );
      check();
      setBreedCool(cool);
      if (cool.remaining > 0) {
        throw new Error(
          tx("kin.cooldownWait", { t: formatCooldown(cool.remaining) }),
        );
      }
      const receipt = await (
        await kin.requestBreed(selected.tokenId, Number(mate), { value: price })
      ).wait();
      check();
      const next = readBreedRequested(receipt, kin);
      setBreedPending(next);
      setBlockNow(receipt.blockNumber || next.entropyBlock - 2);
    });
  }

  function completeBreed() {
    return withSession(async ({ kin, soul, address, network: net }, check) => {
      if (!kin) throw new Error(tx("life.noKin"));
      const live = await readPendingBreed(kin, address);
      const now = await readHeadBlock(net, blockNow);
      check();
      setBreedPending(live);
      setBlockNow(now);
      if (!live) throw new Error(tx("kin.breedNeed"));
      if (hatchPhase(live, now) === "expired")
        throw new Error(tx("hatch.expired", { id: live.requestId }));
      if (hatchPhase(live, now) !== "ready")
        throw new Error(tx("kin.breedWait"));
      let breedArg = [];
      if (typeof kin.CROSSOVER_RULE === "function") {
        // 交叉规则模块：链下研磨全中候选，合约一次解码验证。
        const collection = await soul.getAddress();
        const [genomeA, genomeB, block] = await Promise.all([
          soul.getGenome(live.parentA),
          soul.getGenome(live.parentB),
          kin.runner?.provider?.getBlock(live.entropyBlock),
        ]);
        check();
        if (!block?.hash) throw new Error(tx("kin.breedWait"));
        const grind = grindCrossover({
          seedA: Number(genomeA.seed),
          seedB: Number(genomeB.seed),
          collection,
          requestId: live.requestId,
          entropy: block.hash,
        });
        breedArg = [live.requestId, grind.n];
      }
      const receipt = await (await kin.breed(...breedArg)).wait();
      check();
      const event = readBorn(receipt, soul);
      const [genesisRoot, descent] = await Promise.all([
        soul.genesisRoot(),
        soul.getDescent(event.tokenId),
      ]);
      check();
      const parentA = Number(descent.parentA);
      const parentB = Number(descent.parentB);
      const generation = Number(descent.generation);
      const parentLifeA = souls.find((item) => item.tokenId === parentA)?.life;
      const parentLifeB = souls.find((item) => item.tokenId === parentB)?.life;
      absorb(
        decorateSoul(
          {
            ...event,
            bornBlock: receipt.blockNumber,
            parentA,
            parentB,
            parentLifeA,
            parentLifeB,
            generation,
          },
          { genesisRoot, chainId: net.chainId, fieldCount },
        ),
      );
      const buy = readBreedBuy(receipt, kin);
      if (buy.status === "held") {
        setBreedBuyNote(tx("kin.buyHeld", { id: event.tokenId }));
      } else if (buy.status === "filled") {
        setBreedBuyNote(tx("kin.buyFilled", { id: event.tokenId }));
      } else {
        setBreedBuyNote("");
      }
      setBreedPending(null);
    });
  }

  function expireBreed() {
    return withSession(async ({ kin, address, network: net }, check) => {
      if (!kin) throw new Error(tx("life.noKin"));
      const live = await readPendingBreed(kin, address);
      const now = await readHeadBlock(net, blockNow);
      check();
      setBreedPending(live);
      setBlockNow(now);
      if (!live) throw new Error(tx("kin.breedNeed"));
      if (hatchPhase(live, now) !== "expired")
        throw new Error(tx("kin.breedWait"));
      await (await kin.expireBreed(live.requestId)).wait();
      check();
      setBreedPending(null);
    });
  }

  function findInRoster(event) {
    event?.preventDefault();
    const hit = matchSoul(souls, query, locale);
    if (!hit) {
      setFindMiss(true);
      return;
    }
    setFindMiss(false);
    setSelected(hit);
  }

  const showHatch =
    !habitat ||
    habitatShowsHatch({ used, pending, hatchStage, needRetry });

  if (deployment === undefined) {
    return <p className="life-note">{tx("hatch.loading")}</p>;
  }
  if (!deployment) {
    return <p className="life-note">{tx("hatch.undeployed")}</p>;
  }

  return (
    <div
      className={`life-desk ${compact || habitat ? "is-compact" : ""}${habitat ? " is-habitat" : ""}`}
    >
      {habitat ? null : (
        <header className="life-chip">
          <small>{network.name}</small>
          <strong>{deployment.chainId === 56 ? "MAINNET" : "TESTNET"}</strong>
          <span>{shortAddr(deployment.address)}</span>
        </header>
      )}
      {habitat || hatchStage ? null : (
        <p className="life-note">{tx("life.deskLead")}</p>
      )}
      {habitat || !used ? null : (
        <p className="life-note">{tx("hatch.already")}</p>
      )}
      {habitat || !wallet ? null : (
        <p className="life-meta">{shortAddr(wallet)}</p>
      )}
      {habitat && !wallet ? (
        <div className="life-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || !deployment}
            onClick={() =>
              connectChosenLife(pick, deployment).then((session) => {
                if (!session) return;
                setWallet(session.address);
                onWallet?.(session.address);
              })
            }
          >
            {tx("habitat.connect")}
          </button>
        </div>
      ) : null}
      {habitat && !selected ? (
        <nav className="life-cross-row" aria-label={tx("habitat.careKicker")}>
          <SiteLink href={withNet("/field.html")} className="life-cross">
            {tx("habitat.toHatch")}
          </SiteLink>
          <SiteLink href={withNet("/market.html")} className="life-cross">
            {tx("habitat.toMarket")}
          </SiteLink>
        </nav>
      ) : null}

      {habitat && selected ? (
        <section className="life-care" aria-label={tx("habitat.careKicker")}>
          {mine.length > 1 ? (
            <div className="life-mine-picks" role="tablist">
              {mine.map((soul) => (
                <button
                  key={soul.tokenId}
                  type="button"
                  role="tab"
                  aria-selected={selected.tokenId === soul.tokenId}
                  className={selected.tokenId === soul.tokenId ? "is-on" : ""}
                  onClick={() => setSelected(soul)}
                >
                  #{soul.tokenId}
                </button>
              ))}
            </div>
          ) : null}
          <p className="life-note">{tx("habitat.careEnergy")}</p>
          <div className="life-send">
            <p className="life-care-label">{tx("habitat.transferLead")}</p>
            <label>
              {tx("life.recipient")}
              <input
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="0x…"
              />
            </label>
            <button
              className="ghost"
              type="button"
              disabled={busy || !recipient}
              onClick={transfer}
            >
              {tx("life.transfer")}
            </button>
            {ask ? (
              <p className="life-note">{tx("market.deskTransferWarn")}</p>
            ) : null}
          </div>
          <BirthCardButton tx={tx} onClick={() => setBirth(selected)} />
          <nav className="life-cross-row">
            <SiteLink
              href={withNet(`/field.html?soul=${selected.tokenId}`)}
              className="life-cross"
            >
              {tx("habitat.toPerch", { id: selected.tokenId })}
            </SiteLink>
            <SiteLink
              href={withNet(`/market.html?soul=${selected.tokenId}`)}
              className="life-cross"
            >
              {tx(ask ? "market.fromDeskListed" : "habitat.toMarket")}
            </SiteLink>
            <SiteLink
              href={withNet(`/host.html?soul=${selected.tokenId}`)}
              className="life-cross"
            >
              {tx("habitat.toHost")}
            </SiteLink>
          </nav>
        </section>
      ) : null}

      {showHatch && (!habitat || !used) ? (
        <label>
          {tx("hatch.name")}
          <input
            value={given}
            maxLength={24}
            disabled={used || Boolean(pending) || busy}
            onChange={(event) => setGiven(event.target.value)}
            placeholder={tx("hatch.nameHint")}
          />
        </label>
      ) : null}
      {showHatch ? (
        <>
          <HatchWait
            stage={hatchStage}
            pending={pending}
            blockNow={blockNow}
            compact={compact || habitat}
            tx={tx}
          />
          <div className="life-actions">
            <button
              type="button"
              className="primary"
              disabled={busy || used || Boolean(pending)}
              onClick={request}
            >
              {tx(hatchActionKey(hatchStage))}
            </button>
            {needRetry && phase === "ready" ? (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={complete}
              >
                {tx("hatch.autoRetry")}
              </button>
            ) : null}
            {phase === "expired" ? (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={expire}
              >
                {tx("hatch.expire")}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {breedPending ? (
        <section className="life-breed-pending">
          <p className="life-note">
            {breedPhase === "expired"
              ? tx("hatch.expired", { id: breedPending.requestId })
              : tx("kin.pending", {
                  id: breedPending.requestId,
                  block: breedPending.entropyBlock,
                })}{" "}
            {blockNow
              ? tx("life.blockNow", { n: blockNow })
              : tx("life.waitingBlock")}
          </p>
          <div className="life-actions">
            {breedPhase === "expired" ? (
              <button className="ghost" disabled={busy} onClick={expireBreed}>
                {tx("hatch.expire")}
              </button>
            ) : (
              <button
                className="ghost"
                disabled={busy || !breedReady}
                onClick={completeBreed}
              >
                {tx("kin.complete")}
              </button>
            )}
          </div>
        </section>
      ) : null}
      {breedBuyNote ? <p className="life-note">{breedBuyNote}</p> : null}

      {habitat ? null : (
        <section className="life-list" aria-label={tx("life.colony")}>
          <h3>
            {tx("life.colony")} <small>{souls.length}</small>
          </h3>
          <form className="life-find is-roster" onSubmit={findInRoster}>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setFindMiss(false);
              }}
              placeholder={tx("habitat.find")}
              aria-label={tx("habitat.find")}
            />
            <button type="submit">{tx("habitat.findGo")}</button>
          </form>
          {findMiss ? (
            <p className="life-note">{tx("habitat.findMiss")}</p>
          ) : null}
          {souls.length === 0 ? (
            <p className="life-note">{tx("life.emptyColony")}</p>
          ) : shown.length === 0 ? (
            <p className="life-note">{tx("habitat.findMiss")}</p>
          ) : (
            <ol>
              {shown.map((soul) => (
                <li key={soul.tokenId}>
                  <button
                    className={selected?.tokenId === soul.tokenId ? "is-on" : ""}
                    onClick={() => setSelected(soul)}
                  >
                    <i style={{ background: soul.phenotype.art.body }} />#
                    {soul.tokenId} {labelOf(soul, locale)}
                    <em>
                      {soul.generation ? `G${soul.generation} · ` : ""}
                      {soul.phenotype.summary[locale] ||
                        soul.phenotype.summary.en}
                    </em>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {habitat || !mine.length ? null : (
        <p className="life-note">{tx("life.mineCount", { n: mine.length })}</p>
      )}

      {habitat || !selected ? null : (
        <KinBoard
          souls={souls}
          selected={selected}
          setSelected={setSelected}
          locale={locale}
          tx={tx}
        />
      )}
      {habitat || deployment?.chainId !== 97 ? null : (
        <p className="life-note">{tx("life.testnet")}</p>
      )}
      {habitat || !deployment?.kin ? null : (
        <p className="life-note">
          {breedPriceWei === 0n
            ? tx("kin.feeFree")
            : tx("kin.feePay", { n: formatBreedPrice(breedPriceWei) })}
          {breedCool.remaining > 0
            ? ` ${tx("kin.cooldownWait", { t: formatCooldown(breedCool.remaining) })}`
            : ""}
        </p>
      )}

      {habitat || !selected ? null : (
        <section className="life-specimen">
          {hideSpecimen ? null : (
            <PhenotypeReadout
              fly={{ genome: selected.genome, phenotype: selected.phenotype }}
              locale={locale}
              compact
              caption={tx("hatch.born", { id: selected.tokenId })}
              note={tx("life.specimenNote")}
            />
          )}
          <p className="life-meta">
            {shortAddr(selected.owner)} · perch {selected.perch}
            {selected.givenName ? ` · ${selected.givenName}` : ""}
          </p>
          <BirthCardButton tx={tx} onClick={() => setBirth(selected)} />
          {deployment.journal ? (
            <JournalBoard
              tx={tx}
              record={record}
              replay={replay}
              unread={journalUnread}
              loading={journalLoading && !record}
              busy={busy}
              canWrite={Boolean(wallet)}
              onSeal={sealCheckpoint}
              onDownload={() =>
                replay?.archive && downloadArchive(selected, replay.archive)
              }
            />
          ) : null}
          {mates.length ? (
            <>
              <label>
                {tx("kin.mate")}
                <select
                  value={mate}
                  onChange={(event) => setMate(event.target.value)}
                >
                  <option value="">{tx("kin.mateHint")}</option>
                  {mates.map((soul) => (
                    <option key={soul.tokenId} value={soul.tokenId}>
                      #{soul.tokenId} {labelOf(soul, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="life-actions">
                <button
                  className="ghost"
                  disabled={
                    busy ||
                    !mate ||
                    Boolean(breedPending) ||
                    breedCool.remaining > 0
                  }
                  onClick={requestBreed}
                >
                  {tx("kin.request")}
                </button>
              </div>
            </>
          ) : null}
          <label>
            {tx("life.recipient")}
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="0x…"
            />
          </label>
          <button
            className="ghost"
            disabled={busy || !recipient}
            onClick={transfer}
          >
            {tx("life.transfer")}
          </button>
          {ask ? (
            <p className="life-note">{tx("market.deskTransferWarn")}</p>
          ) : null}
          {selected ? (
            <>
              {ask ? (
                <p className="life-note">
                  {tx("market.deskAsk", { n: formatAsk(ask.price) })}
                </p>
              ) : null}
              <SiteLink
                href={withNet(`/market.html?soul=${selected.tokenId}`)}
                className="life-cross"
              >
                {tx(ask ? "market.fromDeskListed" : "market.fromDesk")}
              </SiteLink>
              <SiteLink
                href={withNet(`/host.html?soul=${selected.tokenId}`)}
                className="life-cross"
              >
                {tx("host.fromDesk")}
              </SiteLink>
            </>
          ) : null}
          <label>
            {tx("life.runner")}
            <input
              value={runner}
              onChange={(event) => setRunner(event.target.value)}
              placeholder="0x…"
            />
          </label>
          <button
            className="ghost"
            disabled={busy || !runner}
            onClick={assignRunner}
          >
            {tx("life.setRunner")}
          </button>
          <div className="life-stim">
            {[0, 1, 2].map((id) => (
              <button
                key={id}
                className={kind === id ? "is-on" : ""}
                onClick={() => setKind(id)}
              >
                {tx(`life.stim.${id}`)}
              </button>
            ))}
            <button className="primary" disabled={busy} onClick={stimulate}>
              {tx("life.feed")}
            </button>
          </div>
        </section>
      )}

      {error ? (
        <p className="pit-error" role="alert">
          {error}
        </p>
      ) : null}
      {birth ? (
        <BirthCardDialog
          soul={birth}
          souls={souls}
          locale={locale}
          tx={tx}
          onClose={() => setBirth(null)}
        />
      ) : null}
      {dialog}
    </div>
  );
}
