/** Read official MaleCNS groups. Do not invent cell types here. */

export function countGroup(state, graph, name) {
  const active = new Set(state.spikes || []);
  const ids = graph.metadata.groups[name] || [];
  let n = 0;
  for (const i of ids) if (active.has(i)) n += 1;
  return n;
}

/**
 * Approach / retreat from measured motor sides and sensory seeds.
 * lastAction is ethology, not a trading instruction.
 */
export function decodeEthology(state, graph) {
  const food = countGroup(state, graph, "food");
  const threat = countGroup(state, graph, "threat");
  const light = countGroup(state, graph, "light");
  const left = countGroup(state, graph, "left");
  const right = countGroup(state, graph, "right");
  const motor = left + right;
  const sensory = food + threat + light;
  let action = "REST";
  if (!state.spikes?.length) {
    action = "REST";
  } else if (threat > food && (threat > 0 || motor > 0)) {
    action = "AVOID";
  } else if (food > 0 && motor > 0) {
    action = "FORAGE";
  } else if (motor > 0 || light > 0) {
    action = "EXPLORE";
  } else if (food > 0) {
    action = "FORAGE";
  } else if (sensory > 0) {
    action = "EXPLORE";
  }
  return {
    schema: "iff.ethology/1",
    action,
    food,
    threat,
    light,
    left,
    right,
    turn: Math.sign(right - left),
    dataset: graph.manifest?.dataset || graph.metadata?.dataset || "unknown",
  };
}
