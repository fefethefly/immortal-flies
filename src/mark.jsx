import React from "react";
import { BONE, BRAND_LOCKUP, BRAND_MARK, EYE, GOLD } from "./brand.mjs";
import {
  ABDOMEN,
  ANTENNAE,
  CIRCLE_R,
  HALTERES,
  LEGS,
  SQUARE,
  STRIPES,
  TICKS,
  VEINS,
  WING_L,
  WING_L2,
  WING_R,
  WING_R2,
} from "./mark-paths.mjs";

function FlyGlyph({
  stroke = BONE,
  fill = "none",
  pose = false,
  eyes = EYE,
  spark = GOLD,
  stripes = true,
}) {
  const filled = fill !== "none";
  return (
    <g
      fill={fill}
      stroke={stroke}
      strokeWidth={filled ? 0 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {pose ? (
        <g opacity=".28">
          <path d={WING_L2} />
          <path d={WING_R2} />
        </g>
      ) : null}
      <path d={WING_L} fill={filled ? fill : "none"} opacity={filled ? 0.88 : 1} />
      <path d={WING_R} fill={filled ? fill : "none"} opacity={filled ? 0.88 : 1} />
      {filled ? null : <path d={VEINS} opacity=".45" />}
      <path d={LEGS} fill="none" strokeWidth={filled ? 2.6 : 2.2} />
      <path d={HALTERES} fill="none" strokeWidth={filled ? 2.4 : 2.2} />
      <path d={ANTENNAE} fill="none" strokeWidth={filled ? 2.2 : 2.2} />
      <ellipse cx="0" cy="-6" rx="9.5" ry="16" />
      <path d={ABDOMEN} />
      {stripes && !filled ? <path d={STRIPES} opacity=".7" /> : null}
      <ellipse cx="0" cy="-30" rx="11" ry="9" />
      <ellipse cx="-10" cy="-36" rx="7.5" ry="8.5" fill={eyes} stroke="none" />
      <ellipse cx="10" cy="-36" rx="7.5" ry="8.5" fill={eyes} stroke="none" />
      {spark ? <circle cx="0" cy="-6" r="2.2" fill={spark} stroke="none" /> : null}
    </g>
  );
}

function Frame({ square = false, stroke = GOLD }) {
  return (
    <g fill="none" stroke={stroke} strokeLinecap="square">
      <circle r={CIRCLE_R} strokeWidth="1.6" />
      <circle r="64" strokeWidth=".7" opacity=".35" />
      <path d={TICKS} strokeWidth="1.6" />
      {square ? (
        <g>
          <rect
            x={SQUARE.x}
            y={SQUARE.y}
            width={SQUARE.size}
            height={SQUARE.size}
            strokeWidth="1.2"
            opacity=".78"
          />
          <path
            d="M-58-58H-46M-58-58V-46M58-58H46M58-58V-46M-58 58H-46M-58 58V46M58 58H46M58 58V46"
            strokeWidth="1.6"
          />
        </g>
      ) : null}
    </g>
  );
}

export function FlyMark({ small = false, inherit = false, square = false }) {
  if (!inherit) {
    return (
      <img
        className={small ? "fly-mark small brand-fly" : "fly-mark brand-fly"}
        src={BRAND_MARK}
        alt=""
        draggable="false"
      />
    );
  }
  const frame = "currentColor";
  return (
    <svg
      className={small ? "fly-mark small" : "fly-mark"}
      viewBox="-100 -100 200 200"
      fill="none"
      aria-hidden="true"
    >
      <Frame square={square} stroke={frame} />
      <g transform="scale(.72)">
        <FlyGlyph
          stroke="currentColor"
          eyes="currentColor"
          spark="currentColor"
        />
      </g>
    </svg>
  );
}

export function VitruvianFly({
  annotated = false,
  dormant = false,
  reborn = false,
  neural = false,
  ticks,
  status = "AWAKE",
  label = "SOUL #0001",
}) {
  return (
    <div
      className={`vitruvian ${dormant ? "is-dormant" : ""} ${reborn ? "is-reborn" : ""} ${neural ? "is-neural" : ""}`}
      role="img"
      aria-label="维特鲁威果蝇印记"
    >
      <div className="vitruvian-frame">
        <img
          className="vf-plate"
          src={BRAND_MARK}
          alt=""
          draggable="false"
        />
      </div>
      {annotated && (
        <div className="vitruvian-notes" aria-hidden="true">
          <span className="vf-note nw">
            DROSOPHILA
            <b>MELANOGASTER</b>
          </span>
          <span className="vf-note ne">
            SPAN
            <b>1 : 1</b>
          </span>
          <span className="vf-note sw">
            {label}
            <b>{status}</b>
          </span>
          <span className="vf-note se">
            STEPS
            <b>{String(ticks ?? 0).padStart(4, "0")}</b>
          </span>
          <span className="vf-note origin">THORAX / ORIGIN</span>
        </div>
      )}
    </div>
  );
}

export function IfsAvatar({ title = "IFS" }) {
  return <img src={BRAND_MARK} alt={title} width="1024" height="1024" />;
}

export function BrandWordmark() {
  return (
    <span className="brand-wordmark">
      <b>IMMORTAL</b>
      <small>FRUIT FLIES</small>
    </span>
  );
}

export function BrandLockup({ small = false }) {
  return (
    <img
      className={small ? "site-lockup is-small" : "site-lockup"}
      src={BRAND_LOCKUP}
      alt=""
      draggable="false"
    />
  );
}
