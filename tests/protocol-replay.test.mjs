import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { hash } from "../src/brain/codec.mjs";
import { buildBundle, verifyBundle, scenario, materialize } from "../scripts/protocol-replay-core.mjs";
import { fingerprints } from "../scripts/protocol-replay.mjs";

const file = new URL("../reports/protocol-replay-smoke-v1.json", import.meta.url);
test("saved protocol package: embedded graph, all arms, source binding and full replay", async () => {
  const sources = await fingerprints(), saved = JSON.parse(await readFile(file, "utf8"));
  assert.deepEqual(await buildBundle(sources), saved);
  assert.equal((await verifyBundle(saved, sources)).replayedArms, 4);
  const { graph } = await materialize(scenario());
  assert.notEqual(graph.datasetHash, `0x${"11".repeat(32)}`);
  assert.notEqual(graph.metadataHash, `0x${"22".repeat(32)}`);
  assert.ok(Object.values(saved.runs).every(r => r.outcome.collected === 0));
  const actual = await hash(saved.plan);
  assert.equal(actual, saved.planHash);
});
test("verification rejects corruption, changed sources, omitted arms and rehashed false evidence", async () => {
  const sources = await fingerprints(), saved = JSON.parse(await readFile(file, "utf8"));
  const broken = structuredClone(saved); broken.runs.relay.traces[0].after.x++;
  await assert.rejects(verifyBundle(broken, sources), /bundle hash/);
  const { bundleHash, ...payload } = broken;
  broken.bundleHash = await hash(payload);
  await assert.rejects(verifyBundle(broken, sources), /full replay mismatch/);
  await assert.rejects(verifyBundle(saved, { ...sources, "unexpected.mjs": "bad" }), /source fingerprints/);
  const missing = structuredClone(saved); delete missing.runs.scrambled;
  const { bundleHash: old, ...rest } = missing; missing.bundleHash = await hash(rest);
  await assert.rejects(verifyBundle(missing, sources), /full replay mismatch/);
  const unsupported = scenario(); unsupported.config.rounds = 33;
  await assert.rejects(materialize(unsupported), /unsupported smoke scenario/);
});
test("CLI creates then independently verifies a package and refuses overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iff-protocol-replay-"));
  const cli = new URL("../scripts/protocol-replay.mjs", import.meta.url).pathname;
  const target = join(dir, "bundle.json");
  try {
    const invoke = verb => execFileSync(process.execPath, [cli, verb, target], { encoding: "utf8", timeout: 15000, stdio: "pipe" });
    assert.equal(JSON.parse(invoke("build")).verified, true);
    const before = await readFile(target, "utf8");
    assert.equal(JSON.parse(invoke("verify")).stateSteps, 256);
    assert.throws(() => invoke("build"));
    assert.equal(await readFile(target, "utf8"), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
