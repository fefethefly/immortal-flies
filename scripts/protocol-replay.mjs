#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { hashBytes } from "../src/brain/codec.mjs";
import { buildBundle, verifyBundle } from "./protocol-replay-core.mjs";

const root = resolve(import.meta.dirname, "..");
export const SOURCE_PATHS = Object.freeze([
  "scripts/protocol-replay-core.mjs", "scripts/protocol-replay.mjs",
  "src/brain/task-protocol-relay.mjs", "src/brain/relay-inbox.mjs",
  "src/brain/task-local-relay.mjs", "src/brain/runtime.mjs", "src/brain/codec.mjs",
  "src/brain/graph.mjs", "src/brain/adapters.mjs", "src/brain/ethology.mjs",
]);
export async function fingerprints() {
  return Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async path =>
    [path, await hashBytes(await readFile(join(root, path)))])));
}
async function main() {
  const [command, output, ...extra] = process.argv.slice(2);
  assert.ok(["build", "verify"].includes(command) && extra.length === 0,
    "Usage: node protocol-replay.mjs build|verify [absolute bundle path]");
  const file = resolve(output ?? join(root, "reports/protocol-replay-smoke-v1.json"));
  const sources = await fingerprints();
  if (command === "build") {
    const bundle = await buildBundle(sources);
    await verifyBundle(bundle, sources);
    assert.deepEqual(await fingerprints(), sources, "source changed during build");
    // Exclusive creation protects existing evidence; choose a new path to regenerate.
    await writeFile(file, JSON.stringify(bundle) + "\n", { flag: "wx" });
  }
  const saved = JSON.parse(await readFile(file, "utf8"));
  const verification = await verifyBundle(saved, sources);
  assert.deepEqual(await fingerprints(), sources, "source changed during verification");
  console.log(JSON.stringify({ file, ...verification, summary: saved.summary }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
