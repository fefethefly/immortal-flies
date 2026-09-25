import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  Sun,
  Leaf,
  Wind,
  RotateCcw,
  Download,
  X,
  Orbit,
  Fingerprint,
  Network,
  Check,
  ChevronRight,
  History,
} from "lucide-react";
import { HOME_STIMULI } from "./home-life-session.mjs";
import { summarizeHomeRecord } from "./home-field-state.mjs";
import { fieldCopy } from "./home-field-copy.mjs";
import "./home-life-field.css";

const MODES = ["world", "individual", "neural"];
const VIEW_ICONS = [Orbit, Fingerprint, Network];
const SIGNAL_ICONS = { light: Sun, food: Leaf, threat: Wind };

function ResponseTrace({ record, index, copy }) {
  const values = record?.frames || [];
  const max = Math.max(1, ...values.map((f) => f.spikes.length));
  const points = values
    .map((f, i) => `${i * 12},${56 - (f.spikes.length / max) * 48}`)
    .join(" ");
  return (
    <svg
      className="field-response-trace"
      viewBox="0 0 288 64"
      role="img"
      aria-label={copy.chart}
    >
      <path className="field-trace-grid" d="M0 56H288M0 32H288M0 8H288" />
      {!!values.length && (
        <>
          <polyline className="field-trace-reference" points={points} />
          <polyline
            points={values
              .slice(0, index + 1)
              .map((f, i) => `${i * 12},${56 - (f.spikes.length / max) * 48}`)
              .join(" ")}
          />
          <path className="field-playhead" d={`M${index * 12} 0V64`} />
          <circle
            cx={index * 12}
            cy={56 - (values[index].spikes.length / max) * 48}
            r="3"
          />
        </>
      )}
    </svg>
  );
}

function BodyPath({ record, index, text }) {
  const values = record.frames;
  const xs = values.map((f) => f.body.x),
    ys = values.map((f) => f.body.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys);
  const span = Math.max(80, Math.max(...xs) - minX, Math.max(...ys) - minY);
  const midX = (minX + Math.max(...xs)) / 2;
  const midY = (minY + Math.max(...ys)) / 2;
  const point = (f) => [
    144 + ((f.body.x - midX) / span) * 78,
    55 - ((f.body.y - midY) / span) * 78,
  ];
  const current = point(values[index]);
  return (
    <svg
      className="field-body-path"
      viewBox="0 0 288 110"
      role="img"
      aria-label={text.map}
    >
      <defs>
        <pattern
          id="field-path-grid"
          width="24"
          height="22"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M24 0H0V22"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".12"
          />
        </pattern>
      </defs>
      <rect width="288" height="110" fill="url(#field-path-grid)" />
      <polyline
        className="field-path-future"
        points={values.map((f) => point(f).join(",")).join(" ")}
      />
      <polyline
        points={values
          .slice(0, index + 1)
          .map((f) => point(f).join(","))
          .join(" ")}
      />
      <circle cx={current[0]} cy={current[1]} r="4" />
      <circle
        cx={current[0]}
        cy={current[1]}
        r="10"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".3"
      />
    </svg>
  );
}

export function LifeField({
  fieldRef,
  projectionRef,
  locale,
  copy,
  mode,
  onMode,
  life,
  graph,
  loadState,
  onRetry,
  reduced,
  onRotation,
}) {
  const text = fieldCopy[locale] || fieldCopy.en;
  const [panel, setPanel] = useState("interact");
  const [kind, setKind] = useState("food");
  const [about, setAbout] = useState(false);
  const [dragged, setDragged] = useState(false);
  const drag = useRef(null),
    rotation = useRef(0),
    panelRef = useRef(null),
    opener = useRef(null);
  const focused = mode !== "world";
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current !== mode) {
      if (mode === "world") {
        opener.current?.focus({ preventScroll: true });
        fieldRef.current?.scrollIntoView({
          block: "start",
          behavior: reduced ? "instant" : "smooth",
        });
      } else if (previousMode.current === "world")
        fieldRef.current
          ?.querySelector(".field-focus-heading > button")
          ?.focus({ preventScroll: true });
      if (previousMode.current === "world" && mode !== "world") {
        fieldRef.current?.scrollIntoView({
          block: "start",
          behavior: reduced ? "instant" : "smooth",
        });
      }
    }
    previousMode.current = mode;
  }, [mode]);
  const record = life.activeRecord;
  const summary = record ? summarizeHomeRecord(record) : null;
  const last = life.records.at(-1);
  const reviewed =
    life.status === "reviewing" ||
    life.status === "replaying" ||
    life.status === "verified";
  const stateMessage =
    loadState !== "ready"
      ? copy[loadState]
      : life.status === "error"
        ? copy.sequenceError
        : life.status === "reviewing"
          ? text.review
          : copy[life.status];
  const chooseMode = (next) => {
    onMode(next);
    if (next === "world") {
      setAbout(false);
      opener.current?.focus({ preventScroll: true });
    }
  };
  const openHistory = () => {
    setPanel("history");
    onMode(mode === "world" ? "individual" : mode);
  };
  useEffect(() => {
    const escape = (event) => {
      if (
        event.key !== "Escape" ||
        document.querySelector(".living-hatch-dialog")
      )
        return;
      if (about) setAbout(false);
      else if (focused) chooseMode("world");
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [about, focused]);
  useGSAP(
    () => {
      if (reduced) return;
      gsap.from(".field-intro > *", {
        y: 22,
        opacity: 0,
        stagger: 0.09,
        duration: 1,
        ease: "power3.out",
      });
    },
    {
      scope: fieldRef,
      dependencies: [locale, focused, reduced],
      revertOnUpdate: true,
    },
  );
  useGSAP(
    () => {
      if (reduced || !focused) return;
      gsap.from(panelRef.current, {
        x: 26,
        opacity: 0,
        duration: 0.65,
        ease: "power3.out",
      });
    },
    { dependencies: [focused, reduced], revertOnUpdate: true },
  );
  return (
    <section
      ref={fieldRef}
      className={`life-field ${focused ? "is-focused" : ""}`}
      data-scene="hero"
      data-view={mode}
      id="observe"
      aria-label={text.field}
    >
      <div className="field-coordinate" aria-hidden="true">
        <span>IMM / OBSERVATORY</span>
        <span>ENV. 001</span>
      </div>
      <div className="field-status">
        <i className="living-led" />
        <span>{text.local}</span>
        <small>{text.present}</small>
      </div>
      {!focused ? (
        <div className="field-intro">
          <p className="living-kicker">{text.eyebrow}</p>
          <h1>
            {text.title[0]}
            <br />
            <span>{text.title[1]}</span>
          </h1>
          <p className="field-lead">{text.intro}</p>
          <button
            ref={opener}
            className="field-enter"
            onClick={() => chooseMode("individual")}
          >
            {text.enter}
            <ArrowUpRight size={18} />
          </button>
          <span className="field-intro-foot">
            {text.model}
            <span />
            {text.nameNote}
          </span>
        </div>
      ) : (
        <div className="field-focus-heading">
          <button onClick={() => chooseMode("world")}>
            <ArrowLeft size={14} />
            {text.back}
          </button>
          <h1>
            {text.name}
            <span>{locale === "zh" ? "LUMEN" : "OBS. 001"}</span>
          </h1>
          <p>
            {text.nameNote} <span>·</span>{" "}
            {reviewed ? text.recordedView : text.model}
          </p>
        </div>
      )}

      <button
        ref={projectionRef}
        className="field-target"
        aria-label={focused ? text.orbit : text.inspect}
        onPointerDown={(event) => {
          if (!focused) return;
          drag.current = { x: event.clientX, start: rotation.current };
          setDragged(false);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const delta = event.clientX - drag.current.x;
          if (Math.abs(delta) > 5) setDragged(true);
          rotation.current = drag.current.start + delta * 0.006;
          onRotation(rotation.current);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          if (!focused || !["ArrowLeft", "ArrowRight"].includes(event.key))
            return;
          event.preventDefault();
          rotation.current += event.key === "ArrowLeft" ? -0.15 : 0.15;
          onRotation(rotation.current);
        }}
        onClick={() => {
          if (!focused && !dragged) chooseMode("individual");
        }}
      >
        <span className="field-target-corner" />
        <span className="field-target-corner" />
        <span className="field-target-corner" />
        <span className="field-target-corner" />
        <span className="field-target-label">
          <i />
          <strong>{text.name}</strong>
          <span>{focused ? text.orbit : text.hint}</span>
          {!focused && <ArrowUpRight size={14} />}
        </span>
      </button>
      <div className="field-spatial-label field-spatial-a" aria-hidden="true">
        <span>◎</span>
        {text.field}
        <small>SENSORY ENVIRONMENT</small>
      </div>
      <div className="field-spatial-label field-spatial-b" aria-hidden="true">
        <span>+</span>
        {text.trace}
        <small>EXPERIENCE / {String(life.total).padStart(3, "0")}</small>
      </div>

      {focused && (
        <aside
          ref={panelRef}
          className="field-inspector"
          aria-label={text.name}
        >
          <div className="field-panel-tabs" role="group" aria-label={text.name}>
            <button
              aria-pressed={panel === "interact"}
              onClick={() => setPanel("interact")}
            >
              {text.controls}
            </button>
            <button
              aria-pressed={panel === "history"}
              onClick={() => setPanel("history")}
            >
              {text.history}
              <span>{life.total}</span>
            </button>
          </div>
          <div className="field-panel-content">
            {panel === "interact" ? (
              <>
                <h2>{text.stimulus}</h2>
                <p className="field-panel-intro">{text.prompt}</p>
                <div
                  className="field-signals"
                  role="group"
                  aria-label={copy.send}
                >
                  {HOME_STIMULI.map((id) => {
                    const Icon = SIGNAL_ICONS[id];
                    return (
                      <button
                        key={id}
                        aria-pressed={kind === id}
                        disabled={life.busy}
                        onClick={() => setKind(id)}
                      >
                        <Icon size={21} strokeWidth={1.2} />
                        <span>{copy.kinds[id]}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  className="field-send"
                  onClick={() => life.stimulate(kind)}
                  disabled={!graph || life.busy || life.status === "error"}
                >
                  <span>{life.busy ? copy[life.status] : copy.send}</span>
                  <ArrowRight size={17} />
                </button>
                <div className="field-readout">
                  <span>{text.readout}</span>
                  <strong>{copy.actions[life.frame.action]}</strong>
                  <code>T{String(life.frame.tick).padStart(4, "0")}</code>
                </div>
                {mode === "neural" && (
                  <ResponseTrace
                    record={record}
                    index={life.frameIndex}
                    copy={copy}
                  />
                )}
                <div className="field-response-numbers">
                  <span>
                    {text.firing}
                    <strong>{life.frame.spikes.length.toLocaleString()}</strong>
                  </span>
                  <span>
                    {text.heading}
                    <strong>{life.frame.body.heading}°</strong>
                  </span>
                  <span>
                    {text.position}
                    <strong>
                      {life.frame.body.x}, {life.frame.body.y}
                    </strong>
                  </span>
                </div>
                <button
                  className="field-neural-link"
                  onClick={() =>
                    chooseMode(mode === "neural" ? "individual" : "neural")
                  }
                >
                  <Network size={15} />
                  {mode === "neural" ? text.organism : text.neural}
                  <ArrowUpRight size={15} />
                </button>
              </>
            ) : (
              <>
                <h2>{text.history}</h2>
                <p className="field-panel-intro">{text.historyIntro}</p>
                {life.records.length ? (
                  <>
                    <div className="field-event-list" aria-label={text.history}>
                      {[...life.records].reverse().map((row) => (
                        <button
                          key={row.historyRoot}
                          className={record === row ? "is-selected" : ""}
                          disabled={life.busy || life.status === "error"}
                          aria-pressed={record === row}
                          onClick={() => life.seek(row, row.frames.length - 1)}
                        >
                          <span className="field-event-dot" />
                          <span>
                            <strong>{text.kindDescriptions[row.kind]}</strong>
                            <small>
                              T{row.frames[0].tick} — T{row.frames.at(-1).tick}
                            </small>
                          </span>
                          {life.verified.includes(row.historyRoot) ? (
                            <Check size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </button>
                      ))}
                    </div>
                    {record && (
                      <div className="field-record-detail">
                        <div className="field-record-caption">
                          <span>{text.movement}</span>
                          <strong>
                            {summary.distance
                              ? `${summary.distance} ${text.units}`
                              : text.still}
                          </strong>
                        </div>
                        <BodyPath
                          record={record}
                          index={life.frameIndex}
                          text={text}
                        />
                        <label className="field-scrub">
                          <span>
                            {text.scrub}
                            <code>
                              {life.frameIndex} / {record.frames.length - 1}
                            </code>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max={record.frames.length - 1}
                            value={life.frameIndex}
                            disabled={life.busy || life.status === "error"}
                            onChange={(event) =>
                              life.seek(record, Number(event.target.value))
                            }
                          />
                        </label>
                        <div className="field-record-meta">
                          <span>
                            {text.peak} <b>{summary.peak.toLocaleString()}</b>
                          </span>
                          <span>
                            {summary.actions
                              .map((a) => copy.actions[a])
                              .join(" → ")}
                          </span>
                        </div>
                        <button
                          className="field-send"
                          disabled={life.busy || life.status === "error"}
                          onClick={() => life.replay(record)}
                        >
                          <RotateCcw size={15} />
                          {text.play}
                          <ArrowRight size={16} />
                        </button>
                        {life.verified.includes(record.historyRoot) && (
                          <span className="field-verified">
                            <Check size={13} />
                            {text.check}
                          </span>
                        )}
                      </div>
                    )}
                    <small className="field-retention">{text.recent}</small>
                  </>
                ) : (
                  <div className="field-empty">
                    <History size={30} strokeWidth={0.9} />
                    <h3>{text.empty}</h3>
                    <p>{text.emptyP}</p>
                    <button onClick={() => setPanel("interact")}>
                      {copy.send}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </>
            )}
            <p
              className={`field-session-status ${loadState === "failed" || life.status === "error" ? "is-error" : ""}`}
              role="status"
            >
              {stateMessage}
            </p>
            {(loadState === "failed" || life.status === "error") && (
              <button className="living-text-link" onClick={onRetry}>
                {copy.retry}
                <RotateCcw size={14} />
              </button>
            )}
            {reviewed && !life.busy && life.status !== "error" && (
              <button
                className="field-present-link"
                onClick={life.returnToPresent}
              >
                {text.presentAction}
                <ArrowRight size={12} />
              </button>
            )}
          </div>
          <div className="field-panel-footer">
            <button onClick={() => setAbout(!about)} aria-expanded={about}>
              {text.notes}
            </button>
            <button
              disabled={!last || life.busy}
              aria-label={text.save}
              title={text.save}
              onClick={life.save}
            >
              <Download size={16} />
            </button>
          </div>
        </aside>
      )}
      {about && (
        <div className="field-about">
          <button aria-label={copy.close} onClick={() => setAbout(false)}>
            <X size={17} />
          </button>
          <h3>{text.notes}</h3>
          <p>{text.note}</p>
          <a href="/brain.html">
            {copy.evidence}
            <ArrowUpRight size={13} />
          </a>
        </div>
      )}

      <div className="field-chronicle-strip">
        <button className="field-chronicle-title" onClick={openHistory}>
          <History size={16} />
          <span>{text.history}</span>
          <small>{String(life.total).padStart(2, "0")}</small>
        </button>
        <button className="field-latest-event" onClick={openHistory}>
          <i />
          <span>{last ? text.kindDescriptions[last.kind] : text.first}</span>
          <small>
            {last
              ? `${last.frames.length - 1} ${text.steps} · ${text.eventReady}`
              : text.present}
          </small>
          <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="field-bottom">
        <a href="#vision" className="field-story-link">
          {text.journey}
          <ArrowDown size={14} />
        </a>
        <div
          className="field-view-switch"
          role="group"
          aria-label={text.viewsLabel}
        >
          {MODES.map((id, i) => {
            const Icon = VIEW_ICONS[i];
            return (
              <button
                key={id}
                aria-pressed={mode === id}
                onClick={() => chooseMode(id)}
              >
                <Icon size={15} strokeWidth={1.3} />
                {text.views[i]}
              </button>
            );
          })}
        </div>
        {focused && (
          <button
            className="field-reset"
            onClick={() => {
              rotation.current = 0;
              onRotation(0);
            }}
            aria-label={text.reset}
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </section>
  );
}
