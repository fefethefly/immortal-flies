import test from "node:test";
import assert from "node:assert/strict";
import {
  connectOfficialPit,
  PitRunnerDown,
  PIT_RUNNER_LISTING,
} from "../src/pit-live.mjs";

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => body,
  };
}

function fetchMap(routes) {
  return async (url) => {
    const key = String(url);
    const hit = routes[key];
    if (typeof hit === "function") return hit();
    if (hit) return hit;
    throw new Error(`unexpected fetch ${key}`);
  };
}

const LISTING = {
  status: "LIVE",
  url: "https://pit.example",
  health: "https://pit.example/health",
  dataset: "malecns-full",
  size: 1,
};

const VIEW = {
  model: "iff-pit-colony-v1",
  flies: [{ id: 0, status: "alive" }],
  hive: { equity: 1000, cash: 1000 },
  host: { kind: "full", dataset: "malecns-full", neurons: 8, size: 1 },
  market: { fill: "SIM", quote: "LIVE", mark: "USD" },
};

test("connectOfficialPit reads the listed Railway pit", async () => {
  const fetchImpl = fetchMap({
    [PIT_RUNNER_LISTING]: json(LISTING),
    [LISTING.health]: json({ ok: true, service: "iff-pit-runner", size: 1 }),
    [`${LISTING.url}/v1/pit`]: json(VIEW),
    [`${LISTING.url}/v1/venue/quotes`]: json({ enabled: true, assets: [] }),
    [`${LISTING.url}/v1/world`]: json({ ok: true }),
  });
  const connected = await connectOfficialPit(fetchImpl);
  assert.equal(connected.mode, "live");
  assert.equal(connected.view.host.kind, "full");
  assert.equal(connected.view.hive.equity, 1000);
});

test("UNDEPLOYED listing stays local", async () => {
  const fetchImpl = fetchMap({
    [PIT_RUNNER_LISTING]: json({ status: "UNDEPLOYED", url: "" }),
  });
  const connected = await connectOfficialPit(fetchImpl);
  assert.equal(connected.mode, "local");
  assert.equal(connected.listing, null);
});

test("LIVE listing with a down host does not open a private book", async () => {
  const fetchImpl = fetchMap({
    [PIT_RUNNER_LISTING]: json(LISTING),
    [LISTING.health]: json({ ok: false, service: "iff-pit-runner" }),
  });
  await assert.rejects(
    () => connectOfficialPit(fetchImpl),
    (err) => err instanceof PitRunnerDown && err.code === "PIT_RUNNER_DOWN",
  );
});

test("LIVE listing with a failed pit view still refuses a private book", async () => {
  const fetchImpl = fetchMap({
    [PIT_RUNNER_LISTING]: json(LISTING),
    [LISTING.health]: json({ ok: true, service: "iff-pit-runner" }),
    [`${LISTING.url}/v1/pit`]: json({ error: "no" }, 503),
    [`${LISTING.url}/v1/venue/quotes`]: json({ enabled: false }),
    [`${LISTING.url}/v1/world`]: json({ ok: true }),
  });
  await assert.rejects(
    () => connectOfficialPit(fetchImpl),
    (err) => err instanceof PitRunnerDown,
  );
});
