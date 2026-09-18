import React, { useEffect, useRef, useState } from "react";
import { drawFlyArt, fitSpan, flyPhase, sizeFactor } from "./fly-sprite.mjs";
import { hungerOf } from "./habitat-sim.mjs";
import { labelOf, normalizeGiven, setGivenName, trueNameOf } from "./names.mjs";

const TAU = Math.PI * 2;

function drawHolo(canvas, { soul, body, yaw, spinning, reduced }) {
  const ctx = canvas.getContext("2d");
  const box = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(box.width * dpr));
  canvas.height = Math.max(1, Math.floor(box.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = box.width;
  const h = box.height;
  ctx.clearRect(0, 0, w, h);
  const well = ctx.createRadialGradient(
    w * 0.5,
    h * 0.55,
    8,
    w * 0.5,
    h * 0.5,
    w * 0.55,
  );
  well.addColorStop(0, "rgba(48, 92, 96, 0.38)");
  well.addColorStop(0.55, "rgba(14, 22, 20, 0.42)");
  well.addColorStop(1, "rgba(6, 7, 5, 0)");
  ctx.fillStyle = well;
  ctx.fillRect(0, 0, w, h);
  if (!soul) return;
  const hunger = body ? hungerOf(body.energy) : "sated";
  const collapsed = hunger === "collapsed";
  const tired = hunger === "faint" || collapsed;
  const flying = Boolean(
    body &&
      (body.mode === "fly" ||
        body.mode === "hover" ||
        body.mode === "takeoff") &&
      !tired,
  );
  ctx.save();
  ctx.translate(w * 0.5, h * 0.5);
  ctx.rotate(Math.sin(yaw) * 0.08);
  ctx.translate(-w * 0.5, -h * 0.5);
  drawFlyArt(
    ctx,
    soul.phenotype.art,
    w * 0.5,
    h * 0.5,
    fitSpan(w, h, { pad: 0.92 }) * sizeFactor(soul.phenotype.art),
    {
      flying,
      phase:
        flying && !reduced
          ? flyPhase((body?.flap || 0) * 0.16, soul.tokenId)
          : 0,
      tired,
      collapsed,
      view: "portrait",
      ignoreScale: true,
    },
  );
  ctx.restore();
  ctx.strokeStyle = "rgba(140, 224, 226, 0.32)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.78, w * 0.3, 8, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = "rgba(140, 224, 226, 0.1)";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.78, w * 0.22, 5, 0, 0, TAU);
  ctx.stroke();
  const scan = (Date.now() / 28) % h;
  if (!reduced) {
    ctx.fillStyle = spinning
      ? "rgba(160, 230, 232, 0.1)"
      : "rgba(160, 230, 232, 0.05)";
    ctx.fillRect(0, scan, w, 2);
  }
}

export function SpecimenHologram({
  soul,
  bodyReader,
  locale,
  tx,
  wallet,
  onNamed,
  onRename,
}) {
  const canvasRef = useRef(null);
  const energyRef = useRef(null);
  const thrustRef = useRef(null);
  const turnRef = useRef(null);
  const hungerRef = useRef(null);
  const barRef = useRef(null);
  const camera = useRef({ yaw: 0.7, pitch: 0.28, spinning: true });
  const drag = useRef(null);
  const [given, setGiven] = useState(soul?.givenName || "");
  const [naming, setNaming] = useState(false);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    setGiven(soul?.givenName || "");
  }, [soul?.life, soul?.givenName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let frame = 0;
    let running = true;
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    function draw() {
      if (!running) return;
      frame = requestAnimationFrame(draw);
      if (camera.current.spinning && !reduced && !drag.current) {
        camera.current.yaw += 0.008;
      }
      const body = bodyReader?.current?.();
      drawHolo(canvas, {
        soul,
        body,
        yaw: camera.current.yaw,
        pitch: camera.current.pitch,
        spinning: camera.current.spinning,
        reduced,
      });
      const hunger = body ? hungerOf(body.energy) : "sated";
      if (energyRef.current)
        energyRef.current.textContent = String(Math.round(body?.energy || 0));
      if (thrustRef.current)
        thrustRef.current.textContent = (body?.thrust || 0).toFixed(2);
      if (turnRef.current) {
        turnRef.current.textContent = `${(((body?.heading || 0) * 180) / Math.PI).toFixed(0)}°`;
      }
      if (barRef.current) {
        barRef.current.style.setProperty(
          "--e",
          `${Math.min(100, ((body?.energy || 0) / 1000) * 100)}%`,
        );
      }
      if (hungerRef.current) {
        hungerRef.current.dataset.hunger = hunger;
        hungerRef.current.lastChild &&
          (hungerRef.current.lastChild.textContent = tx(
            `habitat.hunger.${hunger}`,
          ));
      }
    }
    draw();
    return () => {
      running = false;
      cancelAnimationFrame(frame);
    };
  }, [soul, bodyReader, tx]);

  function onPointerDown(event) {
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      yaw: camera.current.yaw,
      pitch: camera.current.pitch,
    };
  }
  function onPointerMove(event) {
    if (!drag.current) return;
    camera.current.yaw =
      drag.current.yaw + (event.clientX - drag.current.x) * 0.01;
    camera.current.pitch = Math.max(
      -0.7,
      Math.min(
        0.8,
        drag.current.pitch + (event.clientY - drag.current.y) * 0.008,
      ),
    );
  }
  function onPointerUp() {
    drag.current = null;
  }

  const mine = Boolean(
    wallet && soul && soul.owner.toLowerCase() === wallet.toLowerCase(),
  );

  async function saveName() {
    if (!soul) return;
    const clean = normalizeGiven(given);
    if (!clean) return;
    if (onRename) {
      setNaming(true);
      setNameError("");
      try {
        const next = await onRename(clean);
        onNamed?.(next || { ...soul, givenName: clean });
      } catch (err) {
        setNameError(err?.shortMessage || err?.message || String(err));
      } finally {
        setNaming(false);
      }
      return;
    }
    setGivenName(soul.chainId, soul.life, clean);
    onNamed?.({ ...soul, givenName: clean });
  }

  return (
    <section className="life-holo" aria-label={tx("habitat.specimen")}>
      <h3>
        {tx("habitat.specimen")} <small>HOLOGRAM</small>
      </h3>
      <p className="life-note">{tx("habitat.specimenHint")}</p>
      <canvas
        ref={canvasRef}
        className="life-holo-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={() => {
          camera.current.spinning = !camera.current.spinning;
        }}
        role="img"
        aria-label={soul ? labelOf(soul, locale) : tx("habitat.specimen")}
      />
      {soul ? (
        <>
          <p className="life-holo-name">
            <strong>#{soul.tokenId}</strong> {labelOf(soul, locale)}
            <small>{trueNameOf(soul.life, locale)}</small>
          </p>
          <div className="life-hunger" ref={hungerRef} data-hunger="sated">
            <i ref={barRef} />
            <span>{tx("habitat.hunger.sated")}</span>
          </div>
          <dl className="life-vitals">
            <div>
              <dt>{tx("habitat.vital.energy")}</dt>
              <dd ref={energyRef}>0</dd>
            </div>
            <div>
              <dt>{tx("habitat.vital.thrust")}</dt>
              <dd ref={thrustRef}>0.00</dd>
            </div>
            <div>
              <dt>{tx("habitat.vital.turn")}</dt>
              <dd ref={turnRef}>0°</dd>
            </div>
          </dl>
          {mine ? (
            <label>
              {tx("life.givenName")}
              <input
                value={given}
                maxLength={24}
                onChange={(event) => setGiven(event.target.value)}
                placeholder={trueNameOf(soul.life, locale)}
              />
            </label>
          ) : null}
          {mine ? (
            <button
              className="ghost"
              type="button"
              disabled={naming}
              onClick={saveName}
            >
              {tx("life.rename")}
            </button>
          ) : null}
          {nameError ? (
            <p className="pit-error" role="alert">
              {nameError}
            </p>
          ) : null}
        </>
      ) : (
        <p className="life-note">{tx("habitat.specimenEmpty")}</p>
      )}
    </section>
  );
}
