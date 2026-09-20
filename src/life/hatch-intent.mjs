import { normalizeGiven } from "./names.mjs";

export function parseHatchIntent(href) {
  try {
    const url = new URL(String(href || ""), "https://immortalflies.com/");
    const flag = url.searchParams.get("hatch");
    const given = normalizeGiven(
      url.searchParams.get("given") || url.searchParams.get("name") || "",
    );
    const hashOpen = /(?:^|[&#])hatch\b/i.test(url.hash);
    return {
      open: flag === "1" || flag === "open" || hashOpen || Boolean(given),
      given,
    };
  } catch {
    return { open: false, given: "" };
  }
}

export function hatchIntentFromLocation(host = globalThis) {
  return parseHatchIntent(host.location?.href || "");
}

export function withHatchIntent(href, given) {
  const url = new URL(String(href || "/"), "https://immortalflies.com/");
  url.searchParams.set("hatch", "1");
  const clean = normalizeGiven(given);
  if (clean) url.searchParams.set("given", clean);
  else url.searchParams.delete("given");
  url.searchParams.delete("name");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function hatchIntentHref(href, given) {
  const url = new URL(String(href || "/"), "https://immortalflies.com/");
  const next = withHatchIntent(url.href, given);
  return new URL(next, url.href).href;
}

export function writeHatchIntent(given, host = globalThis) {
  if (!host.location || !host.history?.replaceState) return "";
  const next = withHatchIntent(host.location.href, given);
  const current = `${host.location.pathname}${host.location.search}${host.location.hash}`;
  if (next !== current) host.history.replaceState(host.history.state, "", next);
  return next;
}
