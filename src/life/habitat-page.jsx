import React, { useEffect, useRef, useState } from "react";
import { SiteLink, SitePage } from "../site-chrome.jsx";
import { useLocale } from "../use-locale.mjs";
import { openLifeReader, queryLatestLog } from "./chain.mjs";
import { connectChosenLife, useWalletPick } from "./wallet-pick.jsx";
import { LifeDesk, useLifeWorld } from "./desk.jsx";
import {
  applyStimulus,
  createHabitat,
  dropFood,
  dropGust,
  feedBody,
  fitCamera,
  focusCamera,
  resetCamera,
  stepHabitat,
  syncHabitat,
  thoughtOf,
  unprojectHabitat,
} from "./habitat-sim.mjs";
import { drawHabitatWorld } from "./habitat-render.mjs";
import { withBirthQuery } from "./birth-card.mjs";
import { matchSoul, setGivenName } from "./names.mjs";
import { withNet } from "./net.mjs";
import { pickFocusedSoul, querySoulId } from "./souls.mjs";
import { SpecimenHologram } from "./specimen.jsx";
import {
  habitatStorageKey,
  loadHabitat,
  saveHabitat,
} from "./habitat-storage.mjs";
import "./life.css";

const SPEEDS = [0.5, 1, 2];

export function HabitatPage() {
  const [locale, setLocale, tx] = useLocale(
    "meta.habitatTitle",
    "meta.habitatDesc",
  );
  const { deployment, souls, setSouls, error, rosterError } =
    useLifeWorld(4800);
  const [selected, setSelected] = useState(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [wallet, setWallet] = useState("");
  const { pick, dialog } = useWalletPick();
  const [tool, setTool] = useState("move");
  const [rate, setRate] = useState(1);
  const [query, setQuery] = useState("");
  const [findMiss, setFindMiss] = useState(false);
  const bodyReader = useRef(() => null);
  const world = useRef(createHabitat([]));
  const canvasRef = useRef(null);
  const camera = useRef(resetCamera({}));
  const drag = useRef(null);
  const hoverId = useRef(0);
  const latest = useRef({});
  const seenStim = useRef(new Map());
  const booted = useRef(null);
  const pinned = useRef(0);
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
    const next = pickFocusedSoul(souls, {
      queryId: id,
      current: selectedRef.current,
    });
    setSelected(next);
    if (next && pinned.current !== next.tokenId) {
      pinned.current = next.tokenId;
      const body = world.current.bodies.find(
        (item) => item.tokenId === next.tokenId,
      );
      if (body) focusCamera(camera.current, body, 1.08);
    }
  }, [souls]);

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
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [deployment, selected?.tokenId]);

  selectedRef.current = selected;
  latest.current = { souls, selected, mineOnly, wallet, locale, deployment };

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
  bodyReader.current = () =>
    world.current.bodies.find((item) => item.tokenId === selected?.tokenId) ||
    null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    let running = true;
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(box.width * dpr));
      canvas.height = Math.max(1, Math.floor(box.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (!running) return;
      frame = requestAnimationFrame(draw);
      if (!reduced && !document.hidden) stepHabitat(world.current, 1);
      resize();
      const box = canvas.getBoundingClientRect();
      const {
        souls: live,
        selected: pick,
        mineOnly: only,
        wallet: addr,
        locale: lang,
      } = latest.current;
      const visible =
        only && addr
          ? world.current.bodies.filter(
              (body) => body.owner.toLowerCase() === addr.toLowerCase(),
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

  function hitRadius() {
    const box = canvasRef.current.getBoundingClientRect();
    return 22 / (box.width * camera.current.zoom);
  }

  function hitBody(event) {
    const point = toWorld(event);
    const r = hitRadius();
    return world.current.bodies.find(
      (body) => Math.hypot(body.x - point.x, body.y - point.y) < r,
    );
  }

  function visibleBodies() {
    return mineOnly && wallet
      ? world.current.bodies.filter(
          (body) => body.owner.toLowerCase() === wallet.toLowerCase(),
        )
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
    const point = toWorld(event);
    if (tool === "feed") {
      dropFood(world.current, point.x, point.y);
      if (selected) feedBody(world.current, selected.tokenId);
      return;
    }
    if (tool === "gust") {
      dropGust(world.current, point.x, point.y);
      return;
    }
    const body = hitBody(event);
    if (body) {
      const soul = souls.find((item) => item.tokenId === body.tokenId);
      if (soul) pinSoul(soul);
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
      const point = toWorld(event);
      const body = world.current.bodies.find(
        (item) => item.tokenId === drag.current.id,
      );
      if (body) {
        body.x = point.x;
        body.y = point.y;
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
      if (body) body.dragged = false;
    }
    drag.current = null;
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] || 1;
    world.current.rate = next;
    setRate(next);
  }

  function pinSoul(soul, openCard = false) {
    setSelected(soul);
    if (!soul) return;
    pinned.current = soul.tokenId;
    const body = world.current.bodies.find(
      (item) => item.tokenId === soul.tokenId,
    );
    if (body) focusCamera(camera.current, body, 1.08);
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

  return (
    <SitePage
      current="habitat"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      className="life-page"
    >
      <main className="life-shell is-habitat is-locked">
        <section className="life-stage">
          <div className="life-tools">
            <div className="life-tools-cluster">
              <button
                className={tool === "feed" ? "is-on" : ""}
                onClick={() => setTool("feed")}
              >
                {tx("habitat.feed")}
              </button>
              <button
                className={tool === "move" ? "is-on" : ""}
                onClick={() => setTool("move")}
              >
                {tx("habitat.move")}
              </button>
              <button
                className={tool === "gust" ? "is-on" : ""}
                onClick={() => setTool("gust")}
              >
                {tx("habitat.gust")}
              </button>
              <button onClick={cycleSpeed}>
                {tx("habitat.speed")} {rate}×
              </button>
            </div>
            <div className="life-tools-cluster">
              <button onClick={() => zoomBy(1.18)}>
                {tx("habitat.zoomIn")}
              </button>
              <button onClick={() => zoomBy(0.85)}>
                {tx("habitat.zoomOut")}
              </button>
              <button
                onClick={() => fitCamera(camera.current, visibleBodies())}
              >
                {tx("habitat.fit")}
              </button>
              <button
                onClick={() => {
                  const mine = world.current.bodies.filter(
                    (body) =>
                      wallet &&
                      body.owner.toLowerCase() === wallet.toLowerCase(),
                  );
                  fitCamera(
                    camera.current,
                    mine.length ? mine : visibleBodies(),
                  );
                  setMineOnly(true);
                }}
              >
                {tx("habitat.fitMine")}
              </button>
              <label className="life-check">
                <input
                  type="checkbox"
                  checked={mineOnly}
                  onChange={(event) => setMineOnly(event.target.checked)}
                />
                {tx("habitat.mineOnly")}
              </label>
            </div>
            <form
              className="life-find"
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
                placeholder={tx("habitat.find")}
                aria-label={tx("habitat.find")}
              />
              <button type="submit">{tx("habitat.findGo")}</button>
            </form>
          </div>
          <canvas
            ref={canvasRef}
            className={`life-canvas is-${tool}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onDoubleClick={(event) => {
              const point = toWorld(event);
              dropFood(world.current, point.x, point.y);
              if (selected) feedBody(world.current, selected.tokenId);
            }}
            role="img"
            aria-label={tx("habitat.canvas")}
          />
          <p className="life-thought">
            {findMiss
              ? tx("habitat.findMiss")
              : selected
                ? thoughtOf(selected, locale, bodyReader.current())
                : tx("habitat.hint")}
          </p>
        </section>
        <aside className="life-rail">
          <span className="eyebrow">HABITAT / COLONY</span>
          <h1>
            {tx("habitat.title")} <small>{tx("habitat.kicker")}</small>
          </h1>
          <p>{tx("habitat.lead")}</p>
          <p className="life-note" role="status">
            {tx(`habitat.archive.${archiveNote}`)}
          </p>
          {selected ? (
            <SiteLink
              href={withNet(`/field.html?soul=${selected.tokenId}`)}
              className="life-cross"
            >
              {tx("habitat.toPerch", { id: selected.tokenId })}
            </SiteLink>
          ) : null}
          <SiteLink
            href={withNet(
              selected ? `/market.html?soul=${selected.tokenId}` : "/market.html",
            )}
            className="life-cross"
          >
            {tx("habitat.toMarket")}
          </SiteLink>
          <SiteLink href="/#mesh" className="life-cross">
            {tx("habitat.toMesh")}
          </SiteLink>
          <SpecimenHologram
            soul={selected}
            bodyReader={bodyReader}
            locale={locale}
            tx={tx}
            wallet={wallet}
            onRename={async (clean) => {
              if (!selected || !deployment)
                return { ...selected, givenName: clean };
              const session = await connectChosenLife(pick, deployment);
              if (!session) return selected;
              setWallet(session.address);
              await (
                await session.soul.setGivenName(selected.tokenId, clean)
              ).wait();
              setGivenName(deployment.chainId, selected.life, clean);
              const next = { ...selected, givenName: clean };
              setSouls((list) =>
                list.map((item) =>
                  item.tokenId === next.tokenId ? next : item,
                ),
              );
              setSelected(next);
              return next;
            }}
            onNamed={(next) => {
              setSouls((list) =>
                list.map((item) =>
                  item.tokenId === next.tokenId ? next : item,
                ),
              );
              setSelected(next);
            }}
          />
          <LifeDesk
            locale={locale}
            tx={tx}
            fieldCount={4800}
            deployment={deployment}
            souls={souls}
            setSouls={setSouls}
            selected={selected}
            setSelected={pinSoul}
            onWallet={setWallet}
            onBorn={(soul, list) => {
              syncHabitat(world.current, list || [...souls, soul]);
              pinSoul(soul, true);
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
            hideSpecimen
          />
          {rosterError ? (
            <p className="life-note">{tx("life.colonyMiss")}</p>
          ) : null}
          {error ? <p className="pit-error">{error}</p> : null}
        </aside>
      </main>
      {dialog}
    </SitePage>
  );
}
