import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  actOfSide,
  behaviorShift,
  buildHeroField,
  cameraRegister,
  causalState,
  colonyLinks,
  colonyReadout,
  colonySync,
  activeColonySync,
  crossModeOf,
  downsampleField,
  fieldFromCircuit,
  groupIndex,
  inletKindOf,
  nearestCrossFly,
  nearestNeuron,
  packetProgress,
  perchOfFly,
  pigmentRgb,
  SIGNAL_HOP,
  SIGNAL_TRAVEL,
  SYNC_LOCK,
  SYNC_STILL,
  signalGain,
  signalWave,
  stimKindOfNeuron,
  strongestEdges,
  truthLines,
  utteranceTape,
  waveSettledAt,
} from "../src/home-cross-section.mjs";
import { encodeGraph } from "../src/brain/graph.mjs";
import { createSwarm, tickSwarm } from "../src/swarm.mjs";
import { t } from "../src/i18n.mjs";

test("hero field stays finite and perch mapping is stable", () => {
  const field = buildHeroField(180);
  assert.equal(field.count, 180);
  assert.equal(field.neurons.length, 180);
  assert.ok(field.edges.length > 180);
  assert.ok(field.neurons.every((n) => Number.isFinite(n.x + n.y + n.z)));
  const again = buildHeroField(180);
  assert.deepEqual(again.neurons[17], field.neurons[17]);
  const fly = { id: 3, seed: 0x51f00d };
  assert.equal(perchOfFly(fly, field.count), perchOfFly(fly, field.count));
  assert.ok(perchOfFly(fly, field.count) < field.count);
  const small = downsampleField(field, 40);
  assert.equal(small.count, 40);
  assert.ok(small.edges.every(([a, b]) => a < 40 && b < 40 && a !== b));
});

test("camera registers and behavior language change with the tour", () => {
  assert.equal(crossModeOf(0), "neural");
  assert.equal(crossModeOf(9), "society");
  assert.equal(crossModeOf(18), "market");
  assert.equal(crossModeOf(11, "market"), "market");
  const neural = cameraRegister("neural");
  const society = cameraRegister("society");
  const market = cameraRegister("market");
  assert.ok(neural.zoom > society.zoom);
  assert.ok(society.zoom > market.zoom);
  assert.ok(neural.pitch > market.pitch);
  assert.ok(market.ribbon > neural.ribbon);
  assert.equal(actOfSide("BUY", 0), "FORAGE");
  assert.equal(actOfSide("SELL", 0), "AVOID");
  assert.equal(actOfSide("HOLD", 0), "REST");
  assert.equal(actOfSide("HOLD", 0xffff), "EXPLORE");
  const buy = behaviorShift({ id: 1, lastSide: "BUY" }, 0.4, "society");
  const hold = behaviorShift({ id: 1, lastSide: "HOLD" }, 0.4, "society");
  assert.ok(Math.hypot(buy.x, buy.z) > Math.hypot(hold.x, hold.z));
});

test("causal caption and tape read the live paper swarm", () => {
  let swarm = createSwarm({ seed: 3700127, size: 8, cooldownTicks: 0 });
  for (let i = 0; i < 24; i += 1) swarm = tickSwarm(swarm);
  const fly = swarm.flies.find((row) => row.status === "alive");
  const cause = causalState(swarm, fly);
  assert.equal(typeof cause.id, "number");
  assert.ok(["FORAGE", "AVOID", "REST", "EXPLORE"].includes(cause.act));
  assert.ok(["BUY", "SELL", "HOLD"].includes(cause.side));
  assert.equal(cause.tick, swarm.tick);
  assert.equal(typeof cause.heard, "number");
  assert.equal(cause.heard, swarm.flies.filter((row) => row.status === "alive").length);
  const tape = utteranceTape(swarm, fly);
  assert.deepEqual(
    tape.slice(0, 2).map((row) => row.kind),
    ["SENSE", "ACT"],
  );
  assert.ok(["MEMORY", "FILL", "RELAY"].includes(tape[2].kind));
  const read = colonyReadout(swarm, fly, "zh");
  assert.equal(read.alive + read.total - read.alive, swarm.flies.length);
  assert.equal(read.sides.BUY + read.sides.HOLD + read.sides.SELL, read.alive);
  assert.equal(read.tick, swarm.tick);
  assert.ok(read.look.length > 0);
  assert.equal(cause.buy + cause.hold + cause.sell, read.alive);
  assert.equal(t("en", "home.crossTitle").includes("immortal flies"), true);
  assert.equal(t("zh", "home.crossHatch").includes("孵化"), true);
  assert.equal(nearestCrossFly([], 0, 0), null);
  assert.equal(
    nearestCrossFly(
      [
        { x: 10, y: 10, r: 8, id: 4 },
        { x: 80, y: 80, r: 8, id: 9 },
      ],
      12,
      11,
    ).id,
    4,
  );
  swarm.trades = [
    { flyId: fly.id, side: "BUY", tick: swarm.tick, amount: 1 },
    ...swarm.trades,
  ];
  assert.equal(utteranceTape(swarm, fly).find((row) => row.kind === "FILL")?.audit, "SIM");
  assert.equal(utteranceTape(swarm, fly).find((row) => row.kind === "RELAY")?.key, "home.crossRelay");
  assert.equal(utteranceTape(swarm, fly).find((row) => row.kind === "SYNC")?.key, "home.crossSync");
  assert.equal(t("en", "home.crossRelay", { id: 3, side: "BUY", n: 16 }).includes("heard"), true);
  assert.equal(t("zh", "home.crossRelay", { id: 3, side: "BUY", n: 16 }).includes("听见"), true);
  assert.equal(t("en", "home.crossSync", { n: 16 }).includes("locked"), true);
  assert.equal(t("zh", "home.crossSync", { n: 16 }).includes("静止"), true);
  assert.equal(t("en", "home.crossHatchClose").includes("Close"), true);
});

function fixtureCircuit() {
  const nodes = Array.from({ length: 8 }, (_, i) => ({
    id: `n${i}`,
    sign: i % 2 ? -1 : 1,
    type: "X",
    side: i < 4 ? "L" : "R",
    class: "",
    position: [i * 0.2 - 0.7, (i % 3) * 0.2 - 0.2, 0.1],
  }));
  return encodeGraph(
    {
      schema: "iff.connectome/1",
      nodes,
      groups: {
        food: [0, 1],
        threat: [6, 7],
        light: [2, 3],
        left: [0, 1, 2, 3],
        right: [4, 5, 6, 7],
      },
    },
    [
      { pre: 0, post: 2, weight: 12 },
      { pre: 0, post: 3, weight: 4 },
      { pre: 2, post: 4, weight: 9 },
      { pre: 3, post: 5, weight: 8 },
      { pre: 4, post: 6, weight: 11 },
      { pre: 5, post: 7, weight: 7 },
      { pre: 6, post: 1, weight: 5 },
      { pre: 7, post: 0, weight: 6 },
    ],
  );
}

test("circuit field keeps real perches and strongest edges", () => {
  const graph = fixtureCircuit();
  assert.ok(strongestEdges(graph, 1).length >= 4);
  const field = fieldFromCircuit(graph, 8);
  assert.equal(field.source, "malecns-circuit");
  assert.equal(field.count, 8);
  assert.equal(field.of, 165733);
  assert.ok(field.neurons.every((n) => Number.isFinite(n.x + n.y + n.z)));
  assert.ok(field.groups.food.includes(0));
  assert.equal(stimKindOfNeuron(field.neurons[0]), "food");
  assert.equal(stimKindOfNeuron(field.neurons[6]), "threat");
  assert.equal(inletKindOf(3), "food");
  assert.equal(inletKindOf(-2), "threat");
  assert.equal(inletKindOf(0), "light");
  assert.ok(groupIndex(field, "food").length >= 1);
  const hit = nearestNeuron(
    [
      { x: 0, y: 0, i: 2 },
      { x: 40, y: 10, i: 5 },
    ],
    3,
    1,
  );
  assert.equal(hit.i, 2);
});

test("truth strip separates live soul from paper swarm", () => {
  const meta = JSON.parse(
    readFileSync(
      new URL("../public/data/malecns-circuit/metadata.json", import.meta.url),
      "utf8",
    ),
  );
  const field = fieldFromCircuit({ metadata: meta, n: meta.nodes.length }, 240);
  assert.equal(field.source, "malecns-circuit");
  assert.equal(field.count, 240);
  assert.ok(field.neurons.every((n) => Number.isFinite(n.x + n.y + n.z)));
  const swarm = createSwarm({ seed: 9, size: 6 });
  const lines = truthLines({
    field,
    swarm,
    census: { status: "live", gen0: 7, cap: 1024, live: true },
    locale: "zh",
  });
  assert.equal(lines[0].live, true);
  assert.match(lines[0].text, /7 \/ 1024/);
  assert.match(lines[1].text, /MALECNS_CIRCUIT/);
  assert.equal(lines[2].paper, true);
  assert.match(lines[3].text, /SIM/);
  assert.equal(lines[4].paper, true);
  assert.match(lines[4].text, /报价/);
  const liveQuote = truthLines({
    field,
    swarm,
    census: { status: "live", gen0: 7, cap: 1024, live: true },
    locale: "en",
    quotes: {
      enabled: true,
      assets: [{ id: "WBNB", ok: true, usd: 600 }],
    },
  });
  assert.equal(liveQuote[4].live, true);
  assert.match(liveQuote[4].text, /KYBER LIVE/);
  const fake = truthLines({
    field: buildHeroField(40),
    swarm,
    census: { status: "off" },
    locale: "en",
  });
  assert.match(fake[0].text, /UNDEPLOYED/);
  assert.match(fake[1].text, /SYNTHETIC/);
  const unread = truthLines({
    field,
    swarm,
    census: { status: "live", unread: true, live: true, cap: 1024 },
    locale: "en",
  });
  assert.match(unread[0].text, /SOUL · MAINNET/);
});

test("a signal hop reaches every living fly and is deterministic", () => {
  const living = [0, 1, 2, 3, 4].map((id) => ({ id }));
  const perchOf = new Map(living.map((fly) => [fly.id, fly.id]));
  const adj = [[1], [0, 2], [1], [], []];
  const field = {
    neurons: [
      { x: 0, y: 0, z: 0 },
      { x: 0.05, y: 0, z: 0 },
      { x: 0.1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2.1, y: 0, z: 0 },
    ],
  };
  const links = colonyLinks(living, perchOf, adj, field);
  assert.ok(links.get(0).includes(1));
  assert.ok(links.get(3).includes(4));
  assert.equal(links.get(2).includes(3), false);
  const hops = signalWave(0, links, living.map((fly) => fly.id));
  assert.deepEqual(
    hops.map((row) => row.to).sort((a, b) => a - b),
    [1, 2, 3, 4],
  );
  assert.deepEqual(hops, signalWave(0, links, [4, 2, 0, 1, 3]));
  const isolated = signalWave(3, links, living.map((fly) => fly.id));
  assert.ok(isolated.some((row) => row.to === 0));
  const wave = { originId: 0, born: 1, hops, rgb: [10, 20, 30] };
  assert.equal(signalGain(wave, 0, 1), 1);
  assert.equal(signalGain(wave, 1, 1), 0);
  const first = hops.find((row) => row.to === 1);
  assert.ok(first);
  const arrive = 1 + (first.hop - 1) * SIGNAL_HOP + SIGNAL_TRAVEL;
  assert.ok(signalGain(wave, 1, arrive) > 0.9);
  assert.ok(packetProgress(wave, first, 1 + (first.hop - 1) * SIGNAL_HOP) === 0);
  const olive = pigmentRgb({ body: "#7fae66" });
  const wine = pigmentRgb({ body: "#8a3040" });
  assert.notDeepEqual(olive, wine);
  const fill = { kind: "fill", originId: 0, born: 1, hops, rgb: [10, 20, 30] };
  const settled = waveSettledAt(fill);
  assert.equal(colonySync({ ...fill, kind: "sense" }, settled + 0.1).phase, "idle");
  assert.equal(colonySync(fill, settled - 0.01).phase, "idle");
  assert.equal(colonySync(fill, settled + SYNC_STILL * 0.5).phase, "still");
  const locked = colonySync(fill, settled + SYNC_STILL + SYNC_LOCK * 0.4);
  assert.equal(locked.phase, "lock");
  assert.equal(locked.hold, 1);
  assert.ok(locked.beat >= 0 && locked.beat <= 1);
  assert.ok(locked.glow > 0.3);
  assert.equal(colonySync(fill, settled + SYNC_STILL + SYNC_LOCK + 0.1).phase, "fade");
  assert.equal(activeColonySync([fill], settled + SYNC_STILL + 0.2).phase, "lock");
});
