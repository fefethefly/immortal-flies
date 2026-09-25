import React, { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  ArrowRight,
  Sun,
  Leaf,
  Wind,
  RotateCcw,
  Download,
  Check,
} from "lucide-react";
import overview from "../public/assets/first-contact/connectome-overview.json";
import { HOME_STIMULI } from "./home-life-session.mjs";
import { fieldCopy } from "./home-field-copy.mjs";
import { homeIdentity } from "./home-chain-identity.mjs";

const SIGNALS = { light: Sun, food: Leaf, threat: Wind };

export function goToChapter(event, href) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = document.getElementById(href.slice(1));
  if (!target) return;
  event.preventDefault();
  if (location.hash !== href) history.pushState({}, "", href);
  target.scrollIntoView({
    block: "start",
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

function ChapterLink({ href, children, ...props }) {
  return (
    <a href={href} {...props} onClick={(event) => goToChapter(event, href)}>
      {children}
    </a>
  );
}

export function Emergence({
  text,
  life,
  graph,
  loadState,
  onRetry,
  onOpening,
}) {
  const blocked = !graph || life.busy || life.status === "error";
  const failed = loadState === "failed" || life.status === "error";
  const status = failed
    ? text.contactError
    : !graph
      ? text.contactLoading
      : life.busy
        ? text.contactBusy
        : life.total
          ? text.contactRecorded
          : text.contactReady;
  return (
    <section className="cinema-emergence" id="arrival" data-scene="hero">
      <div className="cinema-hero-frame">
        <ChapterLink
          className="cinema-signature contact-chain"
          href="#continuity"
        >
          <span>{text.chainLabel}</span>
          <img
            src="/assets/first-contact/bnb-chain-yellow.svg"
            width="114"
            height="20"
            alt="BNB Chain"
          />
          <ArrowUpRight size={13} aria-hidden="true" />
        </ChapterLink>
        <div
          className="hero-connectome-art"
          role="group"
          aria-label={text.neuralAlt}
        >
          <span className="hero-connectome-label">
            <i />
            MALE CNS / CONNECTOME
          </span>
          <a href="/brain.html" className="hero-connectome-explore">
            {text.neuralExplore}
            <ArrowUpRight size={13} />
          </a>
        </div>
        <div className="hero-neural-readout">
          <div>
            <strong>{overview.neurons.toLocaleString("en-US")}</strong>
            <span>{text.fullNeurons}</span>
          </div>
          <div>
            <strong>{overview.edges.toLocaleString("en-US")}</strong>
            <span>{text.fullEdges}</span>
          </div>
          <p>{text.neuralScope}</p>
        </div>
        <div className="cinema-hero-copy">
          <span className="hero-origin-eyebrow">FROM CONNECTOME TO LIFE</span>
          <h1>
            <span>{text.title[0]}</span>
            <span>{text.title[1]}</span>
          </h1>
          <p>{text.question}</p>
          <div className="contact-actions">
            <button
              className="contact-light"
              disabled={blocked}
              onClick={() => life.stimulate("light")}
            >
              <span className="contact-light-icon">
                <Sun size={20} strokeWidth={1.2} />
              </span>
              <span>
                {life.busy
                  ? text.contactBusy
                  : life.total
                    ? text.contactAgain
                    : text.contact}
              </span>
              <ArrowUpRight size={16} strokeWidth={1.2} />
            </button>
            <ChapterLink className="contact-closer" href="#observe">
              {text.closeUp}
              <ArrowDown size={13} />
            </ChapterLink>
          </div>
          <p className="contact-status" role="status">
            {status}
            {life.total > 0 && (
              <span className="contact-live-result">
                {text.contactPeak}{" "}
                <strong>{life.activeRecord?.peak.toLocaleString()}</strong>
              </span>
            )}
          </p>
          {failed && (
            <button className="living-text-link" onClick={onRetry}>
              {text.contactRetry}
              <RotateCcw size={14} />
            </button>
          )}
        </div>

        <div className="cinema-hero-foot">
          <ChapterLink className="contact-identity-link" href="#continuity">
            <i aria-hidden="true" />
            {text.chainExplore}
            <ArrowDown size={12} aria-hidden="true" />
          </ChapterLink>
          <button className="contact-restart" onClick={onOpening}>
            <RotateCcw size={12} />
            {text.opening}
          </button>
          <ChapterLink href="#observe">
            {text.scroll}
            <ArrowDown size={13} />
          </ChapterLink>
        </div>
        <span className="cinema-art-note">{text.art}</span>
      </div>
    </section>
  );
}

export function IdentityContinuity({ text }) {
  return (
    <section
      className="cinema-continuity"
      id="continuity"
      data-scene="continuity"
      aria-labelledby="continuity-title"
    >
      <div className="cinema-continuity-art" aria-hidden="true">
        <span className="continuity-art-index">02 / CONTINUITY</span>
        <div className="continuity-seal">
          <i />
          <i />
          <span />
        </div>
        <div className="continuity-art-caption">
          <span>{text.identityLayer}</span>
          <strong>IMMORTAL SOUL</strong>
          <small>{text.continuityArt}</small>
        </div>
      </div>
      <div className="cinema-continuity-copy">
        <span className="cinema-eyebrow">A LIFE BEYOND ONE WORLD</span>
        <h2 id="continuity-title">
          {text.continuityTitle.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h2>
        <p>{text.continuityText}</p>
        <div className="continuity-proof">
          <div className="continuity-network">
            <span aria-hidden="true" />
            {text.identityNetwork}
            <small>CHAIN 56</small>
          </div>
          <dl>
            <div>
              <dt>{text.identityContract}</dt>
              <dd>
                <a
                  href={homeIdentity.explorer}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${text.identityVerify} · ${homeIdentity.address}`}
                >
                  {homeIdentity.shortAddress}
                  <ArrowUpRight size={13} />
                </a>
              </dd>
            </div>
          </dl>
          <a
            className="continuity-transaction"
            href={homeIdentity.transaction}
            target="_blank"
            rel="noreferrer"
          >
            {text.identityBirth}
            <ArrowUpRight size={13} />
          </a>
        </div>
        <p className="continuity-boundary">{text.continuityNote}</p>
        <ChapterLink className="cinema-next" href="#observe">
          {text.identityNext}
          <ArrowDown size={15} />
        </ChapterLink>
      </div>
    </section>
  );
}

export function Encounter({
  text,
  copy,
  life,
  graph,
  loadState,
  onRetry,
  mode,
  onMode,
  onRotation,
  projectionRef,
  fieldRef,
}) {
  const [kind, setKind] = useState("light");
  const angle = useRef(0),
    drag = useRef(null);
  const blocked = !graph || life.busy || life.status === "error";
  const status =
    loadState !== "ready"
      ? copy[loadState]
      : life.status === "error"
        ? copy.sequenceError
        : life.status === "reviewing"
          ? text.scrub
          : copy[life.status];
  return (
    <section
      className="cinema-encounter"
      id="observe"
      data-scene="observe"
      ref={fieldRef}
    >
      <div className="cinema-encounter-art">
        <div className="cinema-perspectives" role="group" aria-label={copy.lab}>
          <button
            aria-pressed={mode !== "neural"}
            onClick={() => onMode("individual")}
          >
            {text.body}
          </button>
          <button
            aria-pressed={mode === "neural"}
            onClick={() => onMode("neural")}
          >
            {text.brain}
            <span>↗</span>
          </button>
        </div>
        <button
          ref={projectionRef}
          className="cinema-orbit"
          aria-label={text.rotate}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, angle: angle.current };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            angle.current =
              drag.current.angle + (event.clientX - drag.current.x) * 0.005;
            onRotation(angle.current);
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key))
              return;
            event.preventDefault();
            angle.current =
              event.key === "Home"
                ? 0
                : angle.current + (event.key === "ArrowLeft" ? -0.15 : 0.15);
            onRotation(angle.current);
          }}
        >
          <span>{text.rotate}</span>
        </button>
        <div className="cinema-art-caption">
          <i />
          <span>DROSOPHILA</span>
          <span>{copy.local}</span>
        </div>
      </div>
      <div className="cinema-encounter-copy living-reveal">
        <span className="cinema-eyebrow">SENSE. RESPOND.</span>
        <h2>
          {text.encounterTitle[0]}
          <br />
          <span>{text.encounterTitle[1]}</span>
        </h2>
        <p className="cinema-paragraph">{text.encounterText}</p>
        <div className="cinema-signals">
          <p>{life.busy ? text.signalBusy : text.signal}</p>
          <div
            className="cinema-signal-options"
            role="group"
            aria-label={copy.send}
          >
            {HOME_STIMULI.map((id) => {
              const Icon = SIGNALS[id];
              return (
                <button
                  key={id}
                  aria-pressed={kind === id}
                  disabled={blocked}
                  onClick={() => {
                    setKind(id);
                    life.stimulate(id);
                  }}
                >
                  <span>
                    <Icon size={23} strokeWidth={1} />
                  </span>
                  {copy.kinds[id]}
                  <ArrowUpRight size={13} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="cinema-response">
          <div>
            <small>{text.response}</small>
            <strong>{copy.actions[life.frame.action]}</strong>
          </div>
          <div>
            <small>{text.neurons}</small>
            <strong>{life.frame.spikes.length.toLocaleString()}</strong>
          </div>
          <div>
            <small>{text.step}</small>
            <strong>{String(life.frame.tick).padStart(3, "0")}</strong>
          </div>
        </div>
        <p className="cinema-session-status" role="status">
          {status}
        </p>
        {(loadState === "failed" || life.status === "error") && (
          <button className="living-text-link" onClick={onRetry}>
            {copy.retry}
            <RotateCcw size={14} />
          </button>
        )}
        <details className="cinema-notes">
          <summary>{text.notes}</summary>
          <p>
            {copy.labNote} {copy.renderNote}
          </p>
          <a href="/brain.html">
            {copy.evidence}
            <ArrowUpRight size={13} />
          </a>
        </details>
        <ChapterLink href="#memory" className="cinema-next">
          {text.memoryTitle[0]}
          <ArrowDown size={15} />
        </ChapterLink>
      </div>
    </section>
  );
}

function NeuralTrace({ record, index, label }) {
  const values = record.frames;
  const max = Math.max(1, ...values.map((frame) => frame.spikes.length));
  const x = (i) => 12 + (i / (values.length - 1)) * 776;
  const y = (frame) => 126 - (frame.spikes.length / max) * 100;
  const path = (frames) =>
    frames.map((frame, i) => `${x(i)},${y(frame)}`).join(" ");
  return (
    <svg
      className="cinema-record-trace"
      viewBox="0 0 800 150"
      role="img"
      aria-label={label}
    >
      <path className="cinema-trace-grid" d="M12 126H788M12 76H788M12 26H788" />
      <polyline className="cinema-trace-past" points={path(values)} />
      <polyline points={path(values.slice(0, index + 1))} />
      <path className="cinema-trace-cursor" d={`M${x(index)} 8V140`} />
      <circle cx={x(index)} cy={y(values[index])} r="4" />
    </svg>
  );
}

export function Recollection({ text, copy, locale, life }) {
  const captions = fieldCopy[locale] || fieldCopy.en;
  const record = life.activeRecord || life.records.at(-1);
  const index = record
    ? Math.min(life.frameIndex, record.frames.length - 1)
    : 0;
  const blocked = life.busy || life.status === "error";
  return (
    <section className="cinema-memory" id="memory" data-scene="memory">
      <div className="cinema-memory-heading living-reveal">
        <span className="cinema-eyebrow">A TRACE OF YOU</span>
        <h2>
          {text.memoryTitle[0]}
          <br />
          {text.memoryTitle[1]}
        </h2>
        <p className="cinema-paragraph">{text.memoryText}</p>
      </div>
      <div className="cinema-archive">
        {record ? (
          <>
            <div className="cinema-archive-top">
              <span>{text.chronicle}</span>
              <span>{String(life.total).padStart(2, "0")}</span>
            </div>
            <div
              className="cinema-events"
              role="group"
              aria-label={text.chronicle}
            >
              {life.records.map((row, i) => (
                <button
                  key={row.historyRoot}
                  aria-pressed={record === row}
                  disabled={blocked}
                  onClick={() => life.seek(row, row.frames.length - 1)}
                >
                  <small>
                    {String(life.total - life.records.length + i + 1).padStart(
                      2,
                      "0",
                    )}
                  </small>
                  <span>{captions.kindDescriptions[row.kind]}</span>
                  {life.verified.includes(row.historyRoot) ? (
                    <Check size={13} />
                  ) : (
                    <span className="cinema-event-point" />
                  )}
                </button>
              ))}
            </div>
            <NeuralTrace record={record} index={index} label={copy.chart} />
            <label className="cinema-scrubber">
              <span>
                {text.scrub}
                <code>
                  {String(record.frames[index].tick).padStart(3, "0")} /{" "}
                  {record.frames.at(-1).tick}
                </code>
              </span>
              <input
                type="range"
                min="0"
                max={record.frames.length - 1}
                value={index}
                disabled={blocked}
                onChange={(event) =>
                  life.seek(record, Number(event.target.value))
                }
              />
            </label>
            <div className="cinema-archive-actions">
              <button disabled={blocked} onClick={() => life.replay(record)}>
                <RotateCcw size={15} />
                {life.status === "replaying" ? copy.replaying : text.replay}
              </button>
              <button disabled={blocked} onClick={life.save}>
                {text.save}
                <Download size={15} />
              </button>
            </div>
            <div className="cinema-archive-note" role="status">
              {life.status === "error" ? (
                copy.sequenceError
              ) : life.verified.includes(record.historyRoot) ? (
                <span>
                  <Check size={12} />
                  {text.checked}
                </span>
              ) : (
                text.retained
              )}
              <button disabled={blocked} onClick={life.returnToPresent}>
                {text.latest}
                <ArrowRight size={12} />
              </button>
            </div>
          </>
        ) : (
          <div className="cinema-empty">
            <div className="cinema-empty-line" />
            <p>{text.empty}</p>
            <span>{text.emptyText}</span>
            <ChapterLink href="#observe">
              {text.first}
              <ArrowUpRight size={16} />
            </ChapterLink>
          </div>
        )}
      </div>
      {record && (
        <small className="cinema-memory-caption">{text.trailNote}</small>
      )}
    </section>
  );
}

export function LifeHorizon({ text }) {
  return (
    <section className="cinema-horizon" id="vision" data-scene="horizon">
      <div className="cinema-horizon-copy">
        <span className="cinema-eyebrow">SMALL BEGINNINGS. OPEN ENDS.</span>
        <h2>
          {text.vision.map((line, i) => (
            <span
              key={line}
              className={`cinema-vision-line cinema-vision-line-${i}`}
            >
              {line}
            </span>
          ))}
        </h2>
        <p>{text.visionText}</p>
        <a className="living-text-link" href="/blueprint.html">
          {text.visionLink}
          <ArrowUpRight size={17} />
        </a>
        <small>{text.visionNote}</small>
      </div>
      <div className="cinema-marquee" aria-hidden="true">
        <div>
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i}>
              LIFE IS AN OPEN QUESTION <i>·</i>{" "}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
