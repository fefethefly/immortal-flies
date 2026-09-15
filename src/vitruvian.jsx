import React from "react";

function Wing({ tilt, lift }) {
  return (
    <g transform={`translate(10,${lift}) rotate(${tilt})`}>
      <path d="M0 0 C 18 -10 46 -12 62 -4 C 68 0 66 6 58 8 C 40 12 18 8 0 2 Z" />
      <path d="M6 1 L 54 0" opacity=".85" />
      <path d="M10 0 C 22 -5 38 -6 50 -2" opacity=".45" />
      <path d="M12 2 C 24 6 36 6 48 3" opacity=".45" />
      <path d="M28 0 L 32 -5 M28 1 L 33 5" opacity=".4" />
    </g>
  );
}

function FlyBody() {
  return (
    <g className="vf-fly">
      <g className="vf-wings">
        <g transform="scale(-1,1)">
          <Wing tilt={-46} lift={-18} />
          <Wing tilt={-8} lift={-4} />
          <Wing tilt={28} lift={10} />
        </g>
        <Wing tilt={-46} lift={-18} />
        <Wing tilt={-8} lift={-4} />
        <Wing tilt={28} lift={10} />
      </g>
      <g className="vf-legs">
        <path d="M-8 2 L-22 10 L-30 28" />
        <path d="M8 2 L22 10 L30 28" />
        <path d="M-7 8 L-24 20 L-28 40" />
        <path d="M7 8 L24 20 L28 40" />
        <path d="M-6 14 L-16 32 L-14 48" />
        <path d="M6 14 L16 32 L14 48" />
      </g>
      <ellipse className="vf-eye" cx="-13" cy="-40" rx="13" ry="15" />
      <ellipse className="vf-eye" cx="13" cy="-40" rx="13" ry="15" />
      <path d="M-4 -46 Q 0 -51 4 -46" />
      <ellipse cx="0" cy="-8" rx="11.5" ry="20" />
      <path d="M-9 10 Q -13 30 0 54 Q 13 30 9 10 Z" />
      <path d="M-8 18 H8 M-7 28 H7 M-5 38 H5" opacity=".7" />
      <g className="vf-core">
        <circle cx="0" cy="-10" r="2.2" fill="currentColor" />
        <circle cx="0" cy="-22" r="1.1" fill="currentColor" />
        <circle cx="0" cy="2" r="1.1" fill="currentColor" />
        <circle cx="-6" cy="-10" r="1" fill="currentColor" />
        <circle cx="6" cy="-10" r="1" fill="currentColor" />
        <path d="M0 -22 V 6 M-8 -10 H8 M-5 -16 L5 -4 M5 -16 L-5 -4" opacity=".55" />
      </g>
    </g>
  );
}

export function FlyMark({ small = false }) {
  return (
    <svg
      className={small ? "fly-mark small" : "fly-mark"}
      viewBox="-56 -56 112 112"
      fill="none"
      aria-hidden="true"
    >
      <circle r="46" stroke="currentColor" strokeWidth="1.15" />
      <circle r="38" stroke="currentColor" strokeWidth=".55" opacity=".45" />
      <path
        d="M0 -52 V -46 M0 46 V 52 M-52 0 H -46 M46 0 H 52"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="square"
      />
      <g
        transform="scale(.42)"
        stroke="currentColor"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <FlyBody />
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
          src="/assets/fly-seal.png"
          alt=""
          draggable="false"
        />
        <svg
          className="vitruvian-seal"
          viewBox="-120 -120 240 240"
          fill="none"
          aria-hidden="true"
        >
          <rect className="vf-square" x="-86" y="-86" width="172" height="172" />
          <path className="vf-axis" d="M0 -86 V86 M-86 0 H86" />
          <g className="vf-corners">
            <path d="M-86 -86 H-74 M-86 -86 V-74" />
            <path d="M86 -86 H74 M86 -86 V-74" />
            <path d="M-86 86 H-74 M-86 86 V74" />
            <path d="M86 86 H74 M86 86 V74" />
          </g>
        </svg>
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
