/** Public listing for the hosted full-connectome paper pit. */
export const PIT_RUNNER_LISTING = "/contract/life/PitRunner.json";

export async function loadPitListing(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(PIT_RUNNER_LISTING, { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.url || json.status === "UNDEPLOYED") return null;
    return json;
  } catch {
    return null;
  }
}

export async function fetchPitHealth(listing, fetchImpl = fetch) {
  if (!listing?.url) return null;
  try {
    const res = await fetchImpl(listing.health || `${listing.url}/health`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchPitView(listing, fetchImpl = fetch) {
  const res = await fetchImpl(`${listing.url}/v1/pit`, { cache: "no-store" });
  if (!res.ok) throw new Error("PIT_VIEW");
  return res.json();
}

export async function fetchPitWorld(listing, fetchImpl = fetch) {
  const res = await fetchImpl(`${listing.url}/v1/world`, { cache: "no-store" });
  if (!res.ok) throw new Error("PIT_WORLD");
  return res.json();
}

export async function fetchPitQuotes(listing, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${listing.url}/v1/venue/quotes`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function postPitStimulus(
  listing,
  { kind = "light", intensity = 0.7 } = {},
  fetchImpl = fetch,
) {
  const res = await fetchImpl(`${listing.url}/v1/pit/stimulus`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, intensity }),
  });
  if (!res.ok) throw new Error("PIT_STIMULUS");
  return res.json();
}

export function pitIsLive(health) {
  return Boolean(health?.ok && health?.service === "iff-pit-runner");
}

export class PitRunnerDown extends Error {
  constructor(listing) {
    super("PIT_RUNNER_DOWN");
    this.code = "PIT_RUNNER_DOWN";
    this.listing = listing || null;
  }
}

/**
 * Official Railway pit if listed and healthy.
 * If the listing is LIVE but the host is down, throw — do not open a private local book.
 */
export async function connectOfficialPit(fetchImpl = fetch) {
  const listing = await loadPitListing(fetchImpl);
  if (!listing) return { mode: "local", listing: null };
  try {
    const health = await fetchPitHealth(listing, fetchImpl);
    if (!pitIsLive(health)) throw new PitRunnerDown(listing);
    const [view, quotes, world] = await Promise.all([
      fetchPitView(listing, fetchImpl),
      fetchPitQuotes(listing, fetchImpl),
      fetchPitWorld(listing, fetchImpl).catch(() => null),
    ]);
    return { mode: "live", listing, health, view, quotes, world };
  } catch (err) {
    if (err instanceof PitRunnerDown) throw err;
    throw new PitRunnerDown(listing);
  }
}

export async function fetchPitBook(listing, fetchImpl = fetch) {
  const res = await fetchImpl(`${listing.url}/v1/book`, { cache: "no-store" });
  if (!res.ok) throw new Error("PIT_BOOK");
  return res.json();
}
