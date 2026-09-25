import React, { useEffect, useRef, useState } from "react";
import { SitePage } from "../site-chrome.jsx";
import { useLocale } from "../use-locale.mjs";
import { connectLife, openLifeReader, queryLatestLog } from "./chain.mjs";
import { connectChosenLife, useWalletPick } from "./wallet-pick.jsx";
import {
  getActiveWallet,
  hydrateActiveWallet,
  subscribeActiveWallet,
} from "./wallets.mjs";
import { LifeDesk, useLifeWorld } from "./desk.jsx";
import {
  applyStimulus,
  createHabitat,
  dropFood,
  dropGust,
  feedBody,
  fitCamera,
  focusCamera,
  projectHabitat,
  resetCamera,
  stepHabitat,
  syncHabitat,
  unprojectHabitat,
} from "./habitat-sim.mjs";
import { drawHabitatWorld } from "./habitat-render.mjs";
import { withBirthQuery } from "./birth-card.mjs";
import { labelOf, matchSoul, setGivenName } from "./names.mjs";
import { pickFocusedSoul, querySoulId, shortAddr } from "./souls.mjs";
import { isOwnedSoul } from "./habitat-care.mjs";
import {
  habitatRoster,
  habitatSelection,
  habitatVitals,
} from "./habitat-observation.mjs";
import { habitatText } from "./habitat-copy.mjs";
import { HabitatInspector, HabitatRename } from "./habitat-inspector.jsx";
import {
  habitatArchiveAlert,
  habitatStorageKey,
  loadHabitat,
  saveHabitat,
} from "./habitat-storage.mjs";
import "./life.css";
import "./habitat.css";

const SPEEDS = [0.5, 1, 2];

export function HabitatPage() {
  const [locale, setLocale] = useLocale(
    "meta.habitatTitle",
    "meta.habitatDesc",
  );
  const tx = (key, vars) => habitatText(locale, key, vars);
  const { deployment, souls, setSouls, error, rosterError, rosterLoading } =
    useLifeWorld(4800);
  const [selected, setSelected] = useState(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [wallet, setWallet] = useState("");
  const [walletReady, setWalletReady] = useState(false);
  const { pick, dialog } = useWalletPick((key, vars) =>
    ["wallet.desktopLead", "wallet.mobileLead"].includes(key)
      ? tx("observe.walletLead")
      : tx(key, vars),
  );
  const [tool, setTool] = useState("move");
  const [rate, setRate] = useState(1);
  const [query, setQuery] = useState("");
  const [findMiss, setFindMiss] = useState(false);
  const [paused, setPaused] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false,
  );
  const [expanded, setExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [vitals, setVitals] = useState(null);
  const [events, setEvents] = useState([]);
  const [notice, setNotice] = useState(null);
  const eventId = useRef(0);
  const visible = habitatRoster(souls, mineOnly, wallet);
  const mine = isOwnedSoul(selected, wallet);
  const care = mine ? selected : null;
  const world = useRef(createHabitat([]));
  const canvasRef = useRef(null);
  const camera = useRef(resetCamera({}));
  const drag = useRef(null);
  const hoverId = useRef(0);
  const latest = useRef({});
  const seenStim = useRef(new Map());
  const booted = useRef(null);
  const fitted = useRef(false);
  const selectedRef = useRef(null);
  const [archiveNote, setArchiveNote] = useState("new");

  function persistNow() {
    const { deployment: liveDeployment, souls: liveSouls } = latest.current;
    const key = habitatStorageKey(liveDeployment);
    if (!key || booted.current !== key || !liveSouls?.length) return;
    try {
      if (
        !saveHabitat(
          window.localStorage,
          key,
          world.current,
          liveSouls,
          seenStim.current,
        )
      ) {
        setArchiveNote("unavailable");
      }
    } catch {
      setArchiveNote("unavailable");
    }
  }

  function noteWallet(addr) {
    setWallet(addr || "");
    if (!addr) setMineOnly(false);
    setWalletReady(true);
  }

  useEffect(() => {
    hydrateActiveWallet();
    return subscribeActiveWallet((state) => {
      if (!state.provider) {
        noteWallet("");
      }
    });
  }, []);

  useEffect(() => {
    if (deployment === undefined) return undefined;
    if (!deployment?.address) {
      noteWallet("");
      return undefined;
    }
    const provider = getActiveWallet().provider;
    if (!provider) {
      noteWallet("");
      return undefined;
    }
    let gone = false;
    connectLife(provider, deployment, undefined, { silent: true })
      .then((session) => {
        if (!gone) noteWallet(session?.address || "");
      })
      .catch(() => {
        if (!gone) noteWallet("");
      });
    return () => {
      gone = true;
    };
  }, [deployment]);

  useEffect(() => {
    const key = habitatStorageKey(deployment);
    if (key && souls.length && booted.current !== key) {
      try {
        const back = loadHabitat(window.localStorage, key, souls);
        world.current = back.world;
        seenStim.current = back.seen;
        setArchiveNote(back.status);
      } catch {
        world.current = createHabitat(souls);
        seenStim.current = new Map();
        setArchiveNote("unavailable");
      }
      booted.current = key;
      world.current.rate = rate;
    }
    syncHabitat(world.current, souls);
    const id = querySoulId(window.location.search);
    const next = habitatSelection(
      habitatRoster(souls, mineOnly, wallet),
      selectedRef.current || pickFocusedSoul(souls, { queryId: id }),
    );
    setSelected(next);
    if (!fitted.current && souls.length) {
      resetCamera(camera.current);
      camera.current.zoom = 0.86;
      fitted.current = true;
    }
  }, [souls, mineOnly, wallet]);

  useEffect(() => {
    if (!deployment?.journal || !selected) return undefined;
    let gone = false;
    openLifeReader(deployment)
      .then(async (reader) => {
        if (!reader?.journal || gone) return;
        const last = await queryLatestLog(
          reader.journal,
          reader.journal.filters.Stimulus(selected.tokenId),
          deployment.fromBlock || 0,
        );
        if (!last || gone) return;
        const index = Number(last.args.inputIndex);
        if ((seenStim.current.get(selected.life) ?? -1) >= index) return;
        seenStim.current.set(selected.life, index);
        applyStimulus(
          world.current,
          selected.tokenId,
          Number(last.args.kind),
          Number(last.args.intensity),
        );
        recordEvent({ kind: "journal", tokenId: selected.tokenId });
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [deployment, selected?.tokenId]);

  selectedRef.current = selected;
  latest.current = {
    souls,
    selected,
    mineOnly,
    wallet,
    locale,
    deployment,
    paused,
  };

  function recordEvent(event) {
    const entry = { ...event, id: ++eventId.current, time: Date.now() };
    setEvents((list) => [entry, ...list].slice(0, 6));
    if (event.kind !== "ate" && event.kind !== "journal") setNotice(entry);
  }

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    function refresh() {
      const next = habitatVitals(
        world.current.bodies.find(
          (body) => body.tokenId === selectedRef.current?.tokenId,
        ),
      );
      setVitals((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    }
    refresh();
    const timer = setInterval(refresh, 250);
    return () => clearInterval(timer);
  }, [selected?.tokenId]);

  useEffect(() => {
    const save = () => persistNow();
    const timer = setInterval(save, 3000);
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", save);
      save();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    let running = true;
    let last = performance.now();
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(box.width * dpr));
      const height = Math.max(1, Math.floor(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now) {
      if (!running) return;
      frame = requestAnimationFrame(draw);
      const t = typeof now === "number" ? now : performance.now();
      const dt = Math.min(3, Math.max(0, (t - last) / (1000 / 60)));
      last = t;
      if (!latest.current.paused && !document.hidden)
        stepHabitat(world.current, dt, recordEvent);
      resize();
      const box = canvas.getBoundingClientRect();
      const {
        souls: live,
        selected: pick,
        mineOnly: only,
        wallet: addr,
        locale: lang,
      } = latest.current;
      const visible = only
        ? world.current.bodies.filter(
            (body) =>
              Boolean(addr) && body.owner.toLowerCase() === addr.toLowerCase(),
          )
        : world.current.bodies;
      drawHabitatWorld(ctx, box.width, box.height, {
        world: { ...world.current, bodies: visible },
        souls: live,
        selected: pick,
        wallet: addr,
        camera: camera.current,
        reduced,
        hoverId: hoverId.current,
        locale: lang,
      });
    }

    function onWheelNative(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const cam = camera.current;
      const box = canvas.getBoundingClientRect();
      const before = unprojectHabitat(
        event.clientX - box.left,
        event.clientY - box.top,
        cam,
        box.width,
        box.height,
      );
      cam.zoom = Math.max(
        0.5,
        Math.min(2.4, cam.zoom * (event.deltaY < 0 ? 1.1 : 0.91)),
      );
      const after = unprojectHabitat(
        event.clientX - box.left,
        event.clientY - box.top,
        cam,
        box.width,
        box.height,
      );
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
    }

    resize();
    draw();
    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      canvas.removeEventListener("wheel", onWheelNative);
    };
  }, []);

  function toWorld(event) {
    const box = canvasRef.current.getBoundingClientRect();
    return unprojectHabitat(
      event.clientX - box.left,
      event.clientY - box.top,
      camera.current,
      box.width,
      box.height,
    );
  }

  function hitBody(event) {
    const box = canvasRef.current.getBoundingClientRect();
    return visibleBodies().find((body) => {
      const point = projectHabitat(
        body.x,
        body.y,
        camera.current,
        box.width,
        box.height,
      );
      return (
        Math.hypot(
          point.x - (event.clientX - box.left),
          point.y - (event.clientY - box.top),
        ) < 34
      );
    });
  }

  function visibleBodies() {
    return mineOnly
      ? world.current.bodies.filter((body) => isOwnedSoul(body, wallet))
      : world.current.bodies;
  }

  function zoomBy(delta) {
    const cam = camera.current;
    const before = { x: cam.x, y: cam.y };
    cam.zoom = Math.max(0.5, Math.min(2.4, cam.zoom * delta));
    cam.x = before.x;
    cam.y = before.y;
  }

  function onPointerDown(event) {
    if (!event.isPrimary || event.button !== 0) return;
    const point = toWorld(event);
    if (tool === "feed") {
      placeStimulus("food", point);
      return;
    }
    if (tool === "gust") {
      placeStimulus("gust", point);
      return;
    }
    canvasRef.current.setPointerCapture?.(event.pointerId);
    const body = hitBody(event);
    if (body) {
      const soul = souls.find((item) => item.tokenId === body.tokenId);
      if (soul) pinSoul(soul, false, false);
      body.dragged = Boolean(
        wallet && body.owner.toLowerCase() === wallet.toLowerCase(),
      );
      drag.current = {
        kind: body.dragged ? "fly" : "pan",
        id: body.tokenId,
        x: event.clientX,
        y: event.clientY,
        cx: camera.current.x,
        cy: camera.current.y,
      };
      return;
    }
    drag.current = {
      kind: "pan",
      x: event.clientX,
      y: event.clientY,
      cx: camera.current.x,
      cy: camera.current.y,
    };
  }

  function onPointerMove(event) {
    if (!drag.current) {
      hoverId.current = hitBody(event)?.tokenId || 0;
      return;
    }
    if (drag.current.kind === "fly") {
      drag.current.moved = true;
      const point = toWorld(event);
      const body = world.current.bodies.find(
        (item) => item.tokenId === drag.current.id,
      );
      if (body) {
        body.x = Math.max(0.07, Math.min(0.93, point.x));
        body.y = Math.max(0.11, Math.min(0.87, point.y));
      }
      return;
    }
    const box = canvasRef.current.getBoundingClientRect();
    camera.current.x =
      drag.current.cx -
      (event.clientX - drag.current.x) / (box.width * camera.current.zoom);
    camera.current.y =
      drag.current.cy -
      (event.clientY - drag.current.y) / (box.height * camera.current.zoom);
  }

  function onPointerUp() {
    if (drag.current?.kind === "fly") {
      const body = world.current.bodies.find(
        (item) => item.tokenId === drag.current.id,
      );
      if (body) {
        body.dragged = false;
        if (drag.current.moved)
          recordEvent({ kind: "move", tokenId: body.tokenId });
      }
    }
    drag.current = null;
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] || 1;
    world.current.rate = next;
    setRate(next);
  }

  function pinSoul(soul, openCard = false, focus = true) {
    setSelected(soul);
    if (!soul) return;
    if (mineOnly && !isOwnedSoul(soul, wallet)) setMineOnly(false);
    const body = world.current.bodies.find(
      (item) => item.tokenId === soul.tokenId,
    );
    if (body && focus) focusCamera(camera.current, body, 1.15);
    window.history.replaceState(
      {},
      "",
      withBirthQuery(window.location.href, soul.tokenId, openCard, locale),
    );
  }

  function findSoul() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const soul = matchSoul(souls, q, locale);
    if (!soul) {
      setFindMiss(true);
      return;
    }
    setFindMiss(false);
    pinSoul(soul);
  }

  function placeStimulus(kind, point) {
    const x = Math.max(0.07, Math.min(0.93, point.x));
    const y = Math.max(0.11, Math.min(0.87, point.y));
    if (kind === "food") dropFood(world.current, x, y);
    else dropGust(world.current, x, y);
    recordEvent({ kind });
    persistNow();
  }

  function feedSelected() {
    const body = world.current.bodies.find(
      (item) => item.tokenId === selected?.tokenId,
    );
    if (!body) return;
    const before = body.energy;
    feedBody(world.current, selected.tokenId);
    recordEvent({
      kind: "feed",
      tokenId: selected.tokenId,
      amount: Math.round(body.energy - before),
    });
    setVitals(habitatVitals(body));
    persistNow();
  }

  async function connectMine() {
    setConnecting(true);
    setConnectError("");
    try {
      const session = await connectChosenLife(pick, deployment);
      if (!session) return;
      noteWallet(session.address);
      setMineOnly(true);
      setExpanded(true);
      const ownBodies = world.current.bodies.filter((body) =>
        isOwnedSoul(body, session.address),
      );
      fitCamera(camera.current, ownBodies);
    } catch {
      setConnectError(tx("observe.connectError"));
    } finally {
      setConnecting(false);
    }
  }

  function changeScope(only) {
    if (only && !wallet) {
      void connectMine();
      return;
    }
    setMineOnly(only);
    const scoped = habitatRoster(souls, only, wallet);
    setSelected(habitatSelection(scoped, selected));
    if (only && !scoped.length) setExpanded(true);
    fitView(only);
  }

  function fitView(only = mineOnly) {
    if (only)
      fitCamera(
        camera.current,
        world.current.bodies.filter((body) => isOwnedSoul(body, wallet)),
      );
    else {
      resetCamera(camera.current);
      camera.current.zoom = 0.86;
    }
  }

  async function rename(clean) {
    if (!care || !deployment) return;
    const session = await connectChosenLife(pick, deployment);
    if (!session) return;
    noteWallet(session.address);
    if (!isOwnedSoul(care, session.address))
      throw new Error(tx("observe.connectError"));
    await (await session.soul.setGivenName(care.tokenId, clean)).wait();
    setGivenName(deployment.chainId, care.life, clean);
    const next = { ...care, givenName: clean };
    setSouls((list) =>
      list.map((item) => (item.life === next.life ? next : item)),
    );
    setSelected(next);
  }

  const eventText = (event) =>
    tx(`observe.event.${event.kind}`, {
      id: event.tokenId,
      amount: event.amount,
    });
  const emptyKey = rosterLoading
    ? "loading"
    : rosterError || error
      ? "error"
      : mineOnly
        ? "noMine"
        : "empty";

  return (
    <SitePage
      current="habitat"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      className="life-page habitat-page"
    >
      <header className="habitat-heading">
        <div>
          <span className="observation-eyebrow">{tx("observe.eyebrow")}</span>
          <h1>
            {tx("observe.title")}
            <span>{tx("observe.subtitle")}</span>
          </h1>
        </div>
        <div className="habitat-session">
          <span className="observation-local">
            <i aria-hidden="true" />
            {tx("observe.local")}
          </span>
          <span>{wallet ? shortAddr(wallet) : tx("observe.saved")}</span>
        </div>
      </header>
      <main className="habitat-layout">
        <section
          className="observation-stage"
          aria-label={tx("habitat.canvas")}
        >
          <div className="observation-toolbar">
            <div
              className="observation-scope"
              role="group"
              aria-label={tx("observe.select")}
            >
              <button
                aria-pressed={!mineOnly}
                onClick={() => changeScope(false)}
              >
                {tx("observe.all")}
              </button>
              <button
                aria-pressed={mineOnly}
                disabled={connecting || !walletReady || !deployment}
                onClick={() => changeScope(true)}
              >
                {tx("observe.mine")}
              </button>
            </div>
            <label className="observation-picker">
              <span className="sr-only">{tx("observe.select")}</span>
              <select
                value={selected?.tokenId || ""}
                onChange={(event) =>
                  pinSoul(
                    visible.find(
                      (item) => String(item.tokenId) === event.target.value,
                    ),
                  )
                }
                disabled={!visible.length}
              >
                {!visible.length && (
                  <option value="">{tx("observe.count", { n: 0 })}</option>
                )}
                {visible.map((soul) => (
                  <option key={soul.life} value={soul.tokenId}>
                    #{soul.tokenId} {labelOf(soul, locale)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="observation-search-toggle"
              aria-expanded={searchOpen}
              aria-controls="habitat-search"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              {tx("observe.searchToggle")} <span aria-hidden="true">⌕</span>
            </button>
            <form
              id="habitat-search"
              className={`observation-search${searchOpen ? " is-open" : ""}`}
              onSubmit={(event) => {
                event.preventDefault();
                findSoul();
              }}
            >
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFindMiss(false);
                }}
                placeholder={tx("observe.search")}
                aria-label={tx("observe.search")}
                aria-invalid={findMiss}
                aria-describedby={findMiss ? "habitat-find-error" : undefined}
              />
              <button type="submit">{tx("habitat.findGo")}</button>
              {findMiss && (
                <p id="habitat-find-error" role="status">
                  {tx("observe.noMatch")}
                </p>
              )}
            </form>
          </div>
          <div className="observation-world">
            <canvas
              ref={canvasRef}
              className={`observation-canvas is-${tool}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              tabIndex={0}
              role="group"
              aria-label={tx("habitat.canvas")}
              aria-describedby="habitat-tool-hint habitat-keyboard-hint"
              onKeyDown={(event) => {
                if (
                  ![
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Enter",
                    " ",
                    "Escape",
                    "+",
                    "-",
                  ].includes(event.key)
                )
                  return;
                event.preventDefault();
                if (event.key === "Escape") setTool("move");
                else if (event.key === "+") zoomBy(1.18);
                else if (event.key === "-") zoomBy(0.85);
                else if (event.key === " ") setPaused((value) => !value);
                else if (event.key === "Enter" && tool !== "move")
                  placeStimulus(
                    tool === "feed" ? "food" : "gust",
                    camera.current,
                  );
                else if (event.key.startsWith("Arrow")) {
                  const axis = ["ArrowLeft", "ArrowRight"].includes(event.key)
                    ? "x"
                    : "y";
                  const delta = ["ArrowLeft", "ArrowUp"].includes(event.key)
                    ? -0.05
                    : 0.05;
                  const body =
                    event.shiftKey &&
                    mine &&
                    world.current.bodies.find(
                      (item) => item.tokenId === selected?.tokenId,
                    );
                  if (body) {
                    body[axis] = Math.max(
                      axis === "x" ? 0.07 : 0.11,
                      Math.min(axis === "x" ? 0.93 : 0.87, body[axis] + delta),
                    );
                    recordEvent({ kind: "move", tokenId: body.tokenId });
                    persistNow();
                  } else camera.current[axis] += delta;
                }
              }}
            />
            <div className="observation-world-meta">
              <span>{tx("observe.count", { n: visible.length })}</span>
              {paused && <span>{tx("observe.paused")}</span>}
            </div>
            {!visible.length && (
              <div className="observation-empty" role="status">
                <span className="observation-empty-mark" aria-hidden="true">
                  ◎
                </span>
                <h2>{tx(`observe.${emptyKey}`)}</h2>
                <p>{tx(`observe.${emptyKey}Note`)}</p>
                {mineOnly && (
                  <button onClick={() => changeScope(false)}>
                    {tx("observe.backAll")}
                  </button>
                )}
                {(rosterError || error) && (
                  <button onClick={() => window.location.reload()}>
                    {tx("observe.retry")}
                  </button>
                )}
              </div>
            )}
            <div
              className="observation-feedback"
              role="status"
              aria-live="polite"
            >
              {notice ? eventText(notice) : ""}
            </div>
            <div className="observation-dock">
              <div
                role="group"
                aria-label={tx("observe.watch")}
                className="observation-interactions"
              >
                {[
                  ["move", "watch", "↖"],
                  ["feed", "food", "+"],
                  ["gust", "gust", "≋"],
                ].map(([id, key, icon]) => (
                  <button
                    key={id}
                    aria-pressed={tool === id}
                    onClick={() => setTool(id)}
                  >
                    <span aria-hidden="true">{icon}</span>
                    {tx(`observe.${key}`)}
                  </button>
                ))}
              </div>
              <button
                className="observation-play"
                onClick={() => setPaused(!paused)}
                aria-label={tx(paused ? "observe.resume" : "observe.pause")}
                title={tx(paused ? "observe.resume" : "observe.pause")}
              >
                <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>
              </button>
              <details className="observation-view">
                <summary
                  aria-label={tx("observe.controls")}
                  title={tx("observe.controls")}
                >
                  <span aria-hidden="true">⋯</span>
                </summary>
                <div>
                  <button
                    onClick={() => zoomBy(1.18)}
                    aria-label={tx("observe.zoomIn")}
                  >
                    ＋
                  </button>
                  <button
                    onClick={() => zoomBy(0.85)}
                    aria-label={tx("observe.zoomOut")}
                  >
                    −
                  </button>
                  <button onClick={() => fitView()}>{tx("observe.fit")}</button>
                  <button onClick={cycleSpeed}>
                    {tx("habitat.speed")} {rate}×
                  </button>
                </div>
              </details>
            </div>
            <p id="habitat-tool-hint" className="observation-hint">
              {tx(paused ? "observe.resumeHint" : `observe.hint.${tool}`)}
            </p>
          </div>
        </section>
        <HabitatInspector
          soul={selected}
          mine={mine}
          locale={locale}
          tx={tx}
          vitals={vitals?.tokenId === selected?.tokenId ? vitals : null}
          expanded={expanded}
          onExpand={() => setExpanded(!expanded)}
          onFeed={feedSelected}
          onFocus={() => pinSoul(selected)}
        >
          <section className="observation-events">
            <h3>
              {tx("observe.events")}
              <span>{tx("observe.local")}</span>
            </h3>
            {events.length ? (
              <ol>
                {events.map((event) => (
                  <li key={event.id}>
                    <time dateTime={new Date(event.time).toISOString()}>
                      {new Intl.DateTimeFormat(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(event.time)}
                    </time>
                    <span>{eventText(event)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p>{tx("observe.eventsEmpty")}</p>
            )}
          </section>
          {!wallet && (
            <section className="observation-connect">
              <h3>{tx("observe.guest")}</h3>
              <p>{tx("observe.guestNote")}</p>
              <button
                onClick={connectMine}
                disabled={connecting || !deployment}
              >
                {tx(connecting ? "habitat.careWait" : "observe.connect")}
              </button>
            </section>
          )}
          {connectError && (
            <p className="pit-error" role="alert">
              {connectError}
            </p>
          )}
          <LifeDesk
            locale={locale}
            tx={tx}
            fieldCount={4800}
            deployment={deployment}
            souls={souls}
            setSouls={setSouls}
            selected={care}
            setSelected={pinSoul}
            onWallet={noteWallet}
            management={
              care && (
                <HabitatRename
                  key={care.life}
                  soul={care}
                  tx={tx}
                  onRename={rename}
                />
              )
            }
            onBorn={(soul, list) => {
              syncHabitat(world.current, list || [...souls, soul]);
              pinSoul(soul, true);
              setExpanded(true);
            }}
            onStimulus={(soul, kind, intensity, inputIndex) => {
              if (Number.isSafeInteger(inputIndex)) {
                if ((seenStim.current.get(soul.life) ?? -1) >= inputIndex)
                  return;
                seenStim.current.set(soul.life, inputIndex);
              }
              applyStimulus(world.current, soul.tokenId, kind, intensity);
              persistNow();
            }}
            compact
            surface="habitat"
          />
          <details className="observation-about">
            <summary>{tx("observe.storage")}</summary>
            <p>{tx("observe.storageNote")}</p>
            <p>{tx("observe.keyboard")}</p>
          </details>
          {habitatArchiveAlert(archiveNote) && (
            <p className="life-note" role="status">
              {tx(`habitat.archive.${archiveNote}`)}
            </p>
          )}
          {rosterError && (
            <p className="life-note" role="status">
              {tx("life.colonyMiss")}
            </p>
          )}
          {error && <p className="pit-error">{error}</p>}
        </HabitatInspector>
      </main>
      <p id="habitat-keyboard-hint" className="sr-only">
        {tx("observe.keyboard")}
      </p>
      {dialog}
    </SitePage>
  );
}
