import React, { useEffect, useMemo, useRef, useState } from "react";
import { SiteLink, SitePage } from "../site-chrome.jsx";
import { useLocale } from "../use-locale.mjs";
import { withBirthQuery } from "./birth-card.mjs";
import { LifeDesk, useLifeWorld } from "./desk.jsx";
import { withNet } from "./net.mjs";
import { pickFocusedSoul, querySoulId } from "./souls.mjs";
import { createFieldRenderer, nearestFieldSoul } from "./field-render.mjs";
import { thoughtOf } from "./habitat-sim.mjs";
import "./life.css";

export function FieldPage() {
  const [locale, setLocale, tx] = useLocale(
    "meta.fieldTitle",
    "meta.fieldDesc",
  );
  const [field, setField] = useState(null);
  const { deployment, souls, setSouls, error, rosterError } = useLifeWorld(
    field?.count,
  );
  const [selected, setSelected] = useState(null);
  const [wallet, setWallet] = useState("");
  const [camera] = useState({ yaw: 0.7, pitch: 0.34, zoom: 0.96 });
  const pulses = useRef({});
  const hoverId = useRef(0);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const drag = useRef(null);
  const reduced = useMemo(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    fetch("/life-field/neurons.json")
      .then((response) => response.json())
      .then(setField)
      .catch(() => setField({ count: 0, transmitters: [], neurons: [] }));
  }, []);

  useEffect(() => {
    const id = querySoulId(window.location.search);
    setSelected((current) => {
      const next = pickFocusedSoul(souls, { queryId: id, current });
      if (next?.perch != null) pulses.current[next.perch] = 1;
      return next;
    });
  }, [souls]);

  const latest = useRef({});
  latest.current = {
    field,
    souls,
    selected,
    camera,
    pulses: pulses.current,
    reduced,
    wallet,
    hoverId: hoverId.current,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !field) return undefined;
    const engine = createFieldRenderer(canvas, () => latest.current);
    engineRef.current = engine;
    function onWheelNative(event) {
      event.preventDefault();
      camera.zoom = Math.max(
        0.55,
        Math.min(2.4, camera.zoom + event.deltaY * -0.001),
      );
    }
    canvas.addEventListener("wheel", onWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", onWheelNative);
      engine.destroy();
      engineRef.current = null;
    };
  }, [field]);

  function pinSoul(soul, openCard = false) {
    setSelected(soul);
    if (!soul) return;
    if (soul.perch != null) pulses.current[soul.perch] = 1;
    window.history.replaceState(
      {},
      "",
      withBirthQuery(window.location.href, soul.tokenId, openCard, locale),
    );
  }

  function pick(event) {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const box = canvas.getBoundingClientRect();
    const hit = nearestFieldSoul(
      engine.hits,
      event.clientX - box.left,
      event.clientY - box.top,
    );
    if (!hit) return;
    const soul = souls.find((item) => item.tokenId === hit.tokenId);
    if (soul) pinSoul(soul);
  }

  function onPointerDown(event) {
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      yaw: camera.yaw,
      pitch: camera.pitch,
    };
  }
  function onPointerMove(event) {
    if (drag.current) {
      camera.yaw = drag.current.yaw + (event.clientX - drag.current.x) * 0.005;
      camera.pitch = Math.max(
        -0.8,
        Math.min(
          0.9,
          drag.current.pitch + (event.clientY - drag.current.y) * 0.004,
        ),
      );
      return;
    }
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const box = canvas.getBoundingClientRect();
    const hit = nearestFieldSoul(
      engine.hits,
      event.clientX - box.left,
      event.clientY - box.top,
    );
    hoverId.current = hit?.tokenId || 0;
    latest.current.hoverId = hoverId.current;
  }
  function onPointerUp() {
    drag.current = null;
  }

  return (
    <SitePage
      current="field"
      locale={locale}
      setLocale={setLocale}
      tx={tx}
      className="life-page"
    >
      <main className="life-shell is-locked">
        <aside className="life-rail">
          <span className="eyebrow">COLONY / PERCH</span>
          <h1>
            {tx("field.title")} <small>{tx("field.kicker")}</small>
          </h1>
          <p>{tx("field.lead")}</p>
          {selected ? (
            <SiteLink
              href={withNet(`/habitat.html?soul=${selected.tokenId}`)}
              className="life-cross"
            >
              {tx("field.toHabitat", { id: selected.tokenId })}
            </SiteLink>
          ) : null}
          <SiteLink
            href={withNet(
              selected ? `/market.html?soul=${selected.tokenId}` : "/market.html",
            )}
            className="life-cross"
          >
            {tx("field.toMarket")}
          </SiteLink>
          <SiteLink href="/#mesh" className="life-cross">
            {tx("field.toMesh")}
          </SiteLink>
          <LifeDesk
            locale={locale}
            tx={tx}
            fieldCount={field?.count || 1}
            deployment={deployment}
            souls={souls}
            setSouls={setSouls}
            selected={selected}
            setSelected={pinSoul}
            onWallet={setWallet}
            onBorn={(soul) => pinSoul(soul, true)}
          />
          {rosterError ? (
            <p className="life-note">{tx("life.colonyMiss")}</p>
          ) : null}
          {error ? <p className="pit-error">{error}</p> : null}
        </aside>
        <section className="life-stage">
          <canvas
            ref={canvasRef}
            className="life-canvas"
            onClick={pick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            role="img"
            aria-label={tx("field.canvas")}
          />
          <footer className="life-legend">
            {(field?.transmitters || []).map((row) => (
              <span key={row.id}>
                <i style={{ background: row.hex }} />
                {locale === "zh" ? row.zh : row.en}
              </span>
            ))}
            <small>
              {field
                ? tx("field.shown", { n: field.count })
                : tx("hatch.loading")}
            </small>
          </footer>
          {selected ? (
            <p className="life-thought">{thoughtOf(selected, locale)}</p>
          ) : null}
        </section>
      </main>
    </SitePage>
  );
}
