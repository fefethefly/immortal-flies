import { createFly, validateFly } from "./engine.mjs";
const KEY = "immortal-lab-v1";
export function loadLab() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      let archive = null;
      try {
        if (
          saved.archive?.format === "immortal-checkpoint" &&
          saved.archive.version === 1 &&
          /^[a-f0-9]{64}$/.test(saved.archive.sha256) &&
          typeof saved.archive.savedAt === "string" &&
          Number.isFinite(Date.parse(saved.archive.savedAt))
        ) {
          validateFly(saved.archive.state);
          archive = saved.archive;
        }
      } catch {
        /* Keep a valid current specimen even if its older archive is broken. */
      }
      return {
        fly: validateFly(saved.fly),
        events: Array.isArray(saved.events)
          ? saved.events
              .filter(
                (e) =>
                  e &&
                  typeof e.label === "string" &&
                  e.label.length < 200 &&
                  typeof e.date === "string" &&
                  Number.isFinite(Date.parse(e.date)),
              )
              .slice(0, 60)
          : [],
        archive,
      };
    }
  } catch {
    /* A broken local cache must never prevent opening the lab. */
  }
  return {
    fly: createFly(),
    events: [
      {
        label: "创世实验体诞生",
        type: "birth",
        date: new Date().toISOString(),
      },
    ],
    archive: null,
  };
}
export function saveLab(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
