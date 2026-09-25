import { isOwnedSoul } from "./habitat-care.mjs";
import { hungerOf, HABITAT_ENERGY } from "./habitat-sim.mjs";

export function habitatRoster(souls, mineOnly, wallet) {
  return mineOnly ? souls.filter((soul) => isOwnedSoul(soul, wallet)) : souls;
}

export function habitatSelection(souls, selected) {
  return souls.find((soul) => soul.life === selected?.life) || souls[0] || null;
}

export function habitatVitals(body) {
  if (!body) return null;
  return {
    tokenId: body.tokenId,
    energy: Math.round(body.energy),
    percent: Math.round((body.energy / HABITAT_ENERGY.max) * 100),
    hunger: hungerOf(body.energy),
    activity: body.dragged
      ? "held"
      : ["walk", "land", "down"].includes(body.mode)
        ? "rest"
        : "fly",
  };
}
