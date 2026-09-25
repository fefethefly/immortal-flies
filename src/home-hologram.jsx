import React, { useEffect, useRef, useState } from "react";

// A lightweight projection silhouette for small instances and WebGL fallback.
// This is homepage concept art, not a token portrait or an anatomy dataset.
export function HologramGlyph() {
  return (
    <svg
      className="living-hologram-glyph"
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
    >
      <g
        transform="rotate(-28 120 120)"
        stroke="currentColor"
        strokeWidth="0.8"
      >
        <path
          className="holo-membrane"
          d="M108 105C72 70 12 64 24 101C32 122 82 139 110 120M132 105C168 70 228 64 216 101C208 122 158 139 130 120"
        />
        <path
          opacity=".55"
          d="M108 111 29 89M106 116 46 113M132 111 211 89M134 116 194 113M57 96 64 117M183 96 176 117"
        />
        <path d="M104 109 81 92 72 66M103 121 77 135 61 126M106 132 88 159 73 171M136 109 159 92 168 66M137 121 163 135 179 126M134 132 152 159 167 171" />
        <ellipse cx="120" cy="87" rx="21" ry="17" className="holo-membrane" />
        <ellipse cx="103" cy="88" rx="9" ry="13" />
        <ellipse cx="137" cy="88" rx="9" ry="13" />
        <path d="M113 73 106 57M127 73 134 57" />
        <ellipse cx="120" cy="119" rx="18" ry="24" className="holo-membrane" />
        <path
          className="holo-membrane"
          d="M108 137C90 157 103 181 120 193C137 181 150 157 132 137Z"
        />
        <path
          opacity=".55"
          d="M102 150Q120 158 138 150M103 161Q120 169 137 161M108 173Q120 179 132 173M113 183Q120 187 127 183M120 139V190"
        />
        <path
          className="holo-nerve"
          d="M109 87Q120 74 131 87M120 84V167M120 112 95 121M120 112 145 121"
        />
        <g fill="currentColor">
          <circle cx="120" cy="88" r="2.4" />
          <circle cx="120" cy="116" r="1.8" />
          <circle cx="120" cy="151" r="1.5" />
          <circle cx="106" cy="56" r="1.5" />
          <circle cx="134" cy="56" r="1.5" />
        </g>
      </g>
      <ellipse
        cx="120"
        cy="211"
        rx="65"
        ry="10"
        stroke="currentColor"
        opacity=".22"
        strokeDasharray="50 8 6 8"
      />
      <path d="M55 211h130M120 201v20" stroke="currentColor" opacity=".12" />
    </svg>
  );
}

export function HologramFly({ copy, reduced, paused }) {
  const canvas = useRef(null);
  const instance = useRef(null);
  const current = useRef({ reduced, paused });
  current.current = { reduced, paused };
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("./home-hologram-scene.mjs")
      .then(({ createHologramScene }) => {
        if (cancelled) return;
        try {
          instance.current = createHologramScene(
            canvas.current,
            () => current.current,
            () => setReady(false),
          );
          setReady(true);
        } catch {
          setReady(false);
        }
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
      instance.current?.destroy();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    instance.current?.redraw();
  }, [reduced, paused]);
  return (
    <div className="living-hologram" data-ready={ready}>
      <canvas ref={canvas} role="img" aria-label={copy.hologramAlt} />
      {!ready && (
        <div className="living-hologram-fallback">
          <HologramGlyph />
        </div>
      )}
    </div>
  );
}
