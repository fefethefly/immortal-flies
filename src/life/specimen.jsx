import React, { useEffect, useRef, useState } from "react";
import { CatalogPortrait } from "./catalog-portrait.jsx";
import { HABITAT_ENERGY, hungerOf } from "./habitat-sim.mjs";
import { isOwnedSoul } from "./habitat-care.mjs";
import { labelOf, normalizeGiven, setGivenName, trueNameOf } from "./names.mjs";

export function SpecimenHologram({
  soul,
  bodyReader,
  locale,
  tx,
  wallet,
  onNamed,
  onRename,
  quiet,
  emptyText,
}) {
  const energyRef = useRef(null);
  const thrustRef = useRef(null);
  const turnRef = useRef(null);
  const hungerRef = useRef(null);
  const barRef = useRef(null);
  const [given, setGiven] = useState(soul?.givenName || "");
  const [naming, setNaming] = useState(false);
  const [nameError, setNameError] = useState("");
  const subject = isOwnedSoul(soul, wallet) ? soul : null;
  const mine = Boolean(subject);

  useEffect(() => {
    setGiven(subject?.givenName || "");
  }, [subject?.life, subject?.givenName]);

  useEffect(() => {
    if (!subject) return undefined;
    let frame = 0;
    let running = true;

    function tick() {
      if (!running) return;
      frame = requestAnimationFrame(tick);
      const body = bodyReader?.current?.();
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
          `${Math.min(100, ((body?.energy || 0) / HABITAT_ENERGY.max) * 100)}%`,
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
    tick();
    return () => {
      running = false;
      cancelAnimationFrame(frame);
    };
  }, [subject, bodyReader, tx]);

  async function saveName() {
    if (!subject) return;
    const clean = normalizeGiven(given);
    if (!clean) return;
    if (onRename) {
      setNaming(true);
      setNameError("");
      try {
        const next = await onRename(clean);
        onNamed?.(next || { ...subject, givenName: clean });
      } catch (err) {
        setNameError(err?.shortMessage || err?.message || String(err));
      } finally {
        setNaming(false);
      }
      return;
    }
    setGivenName(subject.chainId, subject.life, clean);
    onNamed?.({ ...subject, givenName: clean });
  }

  const renameFields = mine ? (
    <>
      <label>
        {tx("life.givenName")}
        <input
          value={given}
          maxLength={24}
          onChange={(event) => setGiven(event.target.value)}
          placeholder={trueNameOf(subject.life, locale)}
        />
      </label>
      <button
        className="ghost"
        type="button"
        disabled={naming}
        onClick={saveName}
      >
        {tx("life.rename")}
      </button>
      {nameError ? (
        <p className="pit-error" role="alert">
          {nameError}
        </p>
      ) : null}
    </>
  ) : null;

  return (
    <section
      className={`life-holo${quiet ? " is-quiet" : ""}`}
      aria-label={tx("habitat.specimen")}
      style={
        subject?.phenotype?.art?.body
          ? { "--pheno-body": subject.phenotype.art.body }
          : undefined
      }
    >
      {quiet ? null : (
        <>
          <h3>
            {tx("habitat.specimen")} <small>HOLOGRAM</small>
          </h3>
          <p className="life-note">{tx("habitat.specimenHint")}</p>
        </>
      )}
      {subject ? (
        <figure
          className="life-holo-art"
          aria-label={labelOf(subject, locale)}
        >
          <CatalogPortrait soul={subject} />
        </figure>
      ) : (
        <div className="life-holo-art is-empty" aria-hidden="true" />
      )}
      {subject ? (
        <>
          <p className="life-holo-name">
            <strong>#{subject.tokenId}</strong> {labelOf(subject, locale)}
            <small>{trueNameOf(subject.life, locale)}</small>
          </p>
          <p className="life-holo-meta">
            {tx("kin.gen", { n: subject.generation || 0 })}
            {" · "}
            {subject.phenotype?.summary?.[locale] ||
              subject.phenotype?.summary?.en ||
              ""}
          </p>
          <div className="life-hunger" ref={hungerRef} data-hunger="sated">
            <i ref={barRef} />
            <span>{tx("habitat.hunger.sated")}</span>
          </div>
          <dl className={`life-vitals${quiet ? " is-solo" : ""}`}>
            <div>
              <dt>{tx("habitat.vital.energy")}</dt>
              <dd ref={energyRef}>0</dd>
            </div>
            {quiet ? null : (
              <>
                <div>
                  <dt>{tx("habitat.vital.thrust")}</dt>
                  <dd ref={thrustRef}>0.00</dd>
                </div>
                <div>
                  <dt>{tx("habitat.vital.turn")}</dt>
                  <dd ref={turnRef}>0°</dd>
                </div>
              </>
            )}
          </dl>
          {renameFields ? (
            <div className="life-rename">{renameFields}</div>
          ) : null}
        </>
      ) : (
        <p className="life-holo-empty">
          {emptyText || tx("habitat.specimenEmpty")}
        </p>
      )}
    </section>
  );
}
