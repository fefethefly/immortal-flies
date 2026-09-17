import { integer, requireValue } from "./codec.mjs";

// Candidate side routing plan only; NOT consumed by sensory-groups/1.
// Evidence for the side split comes from official MaleCNS annotations:
// selected food neurons carry rootSide (57R/23L of 80; raw somaSide empty),
// selected threat neurons carry somaSide (42L/37R of 80). Light has no
// bilateral split in the selected group and no annotation distinguishes front
// from back, so light channels and the forward component are never routed.
export const DIRECTION_MAPPING = Object.freeze({
  id: "side-route/1", schema: "iff.direction-mapping/1",
  routedComponent: "right", unsupported: ["forward", "light"],
  drive: "round(|right| * intensity / 1000), uniform per routed side",
});

/** Pure data plan from iff.direction-observation/1 + caller-provided sides.
 * sides: { [channel]: { left: number[], right: number[] } }; index arrays must
 * be integer, disjoint and in range. Routing groups are validated even when a
 * channel is silent, so miswired callers fail fast. No world, graph or runtime
 * access; no RNG; no motor groups or movement semantics. Nothing here drives
 * neurons by itself — callers wire plans into their own experimental runtime.
 */
export function planSideStimulation(frame, sides) {
  requireValue(frame?.schema === "iff.direction-observation/1" && frame.encoder === "local-body-direction/1", "MAPPING_FRAME");
  requireValue(sides && typeof sides === "object", "MAPPING_SIDES");
  const routing = {};
  for (const channel of ["food", "threat"]) {
    const groups = sides[channel];
    requireValue(groups && Array.isArray(groups.left) && Array.isArray(groups.right), "MAPPING_GROUPS");
    const seen = new Set();
    for (const index of [...groups.left, ...groups.right]) {
      integer(index, 0, 2 ** 31 - 1, "neuronIndex");
      requireValue(!seen.has(index), "MAPPING_SIDE_OVERLAP"); seen.add(index);
    }
    routing[channel] = groups;
  }
  const plan = {};
  for (const channel of ["food", "threat"]) {
    const record = frame.channels[channel] || null;
    plan[channel] = { channel, stimulated: false, drive: 0, left: [], right: [] };
    if (!record || !record.directionValid || record.right === 0) continue;
    const side = record.right > 0 ? routing[channel].right : routing[channel].left;
    const drive = Math.round(Math.abs(record.right) * record.intensity / 1000);
    if (!drive) continue;
    requireValue(side.length > 0, "MAPPING_EMPTY_SIDE");
    const sorted = [...side].sort((a, b) => a - b);
    plan[channel] = { channel, stimulated: true, drive, side: record.right > 0 ? "right" : "left",
      left: record.right > 0 ? [] : sorted, right: record.right > 0 ? sorted : [] };
  }
  return { schema: DIRECTION_MAPPING.schema, mapping: DIRECTION_MAPPING.id, plan };
}
