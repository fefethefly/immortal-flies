import React, { useEffect, useRef } from "react";
import {
  createSwarmFieldRenderer,
  nearestFieldHit,
} from "./swarm-field.mjs";

export function HomeSwarmField({
  view,
  focusId,
  guestNodeId,
  onFocus,
  onHostEmpty,
  label,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const latest = useRef({ view, focusId, guestNodeId });
  latest.current = { view, focusId, guestNodeId };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const engine = createSwarmFieldRenderer(canvas, () => latest.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  function pick(event) {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) return;
    const box = canvas.getBoundingClientRect();
    const hit = nearestFieldHit(
      engine.hits,
      event.clientX - box.left,
      event.clientY - box.top,
    );
    if (!hit) return;
    if (hit.kind === "fly" && hit.nodeId) onFocus?.(hit.nodeId);
    if (hit.kind === "perch") onHostEmpty?.(hit.regionId);
  }

  return (
    <div className="mesh-field">
      <canvas
        ref={canvasRef}
        className="mesh-field-canvas"
        onClick={pick}
        role="img"
        aria-label={label}
      />
    </div>
  );
}
