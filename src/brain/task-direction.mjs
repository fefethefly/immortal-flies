import { integer, requireValue } from "./codec.mjs";
import { LOCAL_RELAY } from "./task-local-relay.mjs";

// Candidate observation encoding only; NOT accepted by sensory-groups/1.
export const DIRECTION_ENCODING = Object.freeze({
  id: "local-body-direction/1", schema: "iff.direction-observation/1",
  radius: LOCAL_RELAY.localRadius, headingBinDegrees: 45,
  projection: "signed-l1-permille-truncate", intensity: "local-quadratic/1",
});
const AXES = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const empty = () => ({ intensity: 0, directionValid: false, forward: 0, right: 0 });
const trunc = value => Math.trunc(value) || 0; // Canonicalize negative zero.

/** Encode observeLocal().observations, not global truth or motor instructions.
 * Heading bins match runtime's movement axes: 0 points +x, +y is screen-down.
 * Integer L1 normalization intentionally differs from Euclidean unit vectors.
 * At most one locally observed target per modality; ties are chosen upstream.
 * This is an engineered oracle-like positional sensor, not biological sensing.
 */
export function encodeDirection(observations, body) {
  requireValue(body && typeof body === "object", "DIRECTION_BODY");
  integer(body.x, 0, 10000, "body.x"); integer(body.y, 0, 10000, "body.y");
  integer(body.heading, 0, 359, "heading");
  requireValue(Array.isArray(observations) && observations.length <= 2, "DIRECTION_OBSERVATIONS");
  const headingBin = Math.floor(body.heading / DIRECTION_ENCODING.headingBinDegrees);
  const [hx, hy] = AXES[headingBin];
  const channels = { food: empty(), threat: empty(), light: empty() }, seen = new Set();
  for (const observation of observations) {
    requireValue(observation && ["food", "threat"].includes(observation.channel), "DIRECTION_CHANNEL");
    const { channel, x, y } = observation;
    requireValue(!seen.has(channel), "DIRECTION_DUPLICATE"); seen.add(channel);
    integer(x, 0, 10000, "observation.x"); integer(y, 0, 10000, "observation.y");
    const dx = x - body.x, dy = y - body.y, d2 = dx * dx + dy * dy;
    const radius2 = DIRECTION_ENCODING.radius ** 2;
    requireValue(d2 < radius2, "DIRECTION_NOT_LOCAL");
    const forward = dx * hx + dy * hy, right = -dx * hy + dy * hx;
    const norm = Math.abs(forward) + Math.abs(right);
    channels[channel] = {
      intensity: Math.floor(900 * (radius2 - d2) / radius2),
      directionValid: norm > 0,
      forward: norm ? trunc(1000 * forward / norm) : 0,
      right: norm ? trunc(1000 * right / norm) : 0,
    };
  }
  return { schema: DIRECTION_ENCODING.schema, encoder: DIRECTION_ENCODING.id, channels };
}
