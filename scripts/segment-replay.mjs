#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_VECTOR_PATH,
  buildBundle,
  fingerprints,
  verifyBundle,
} from "./segment-replay-core.mjs";

const root = resolve(import.meta.dirname, "..");

async function main() {
  const [command, output, ...extra] = process.argv.slice(2);
  assert.ok(
    ["build", "verify"].includes(command) && extra.length === 0,
    "Usage: node scripts/segment-replay.mjs build|verify [absolute vector path]",
  );
  const file = resolve(output ?? join(root, DEFAULT_VECTOR_PATH));
  const sources = await fingerprints(root);
  if (command === "build") {
    const bundle = await buildBundle(root, sources);
    assert.deepEqual(
      await fingerprints(root),
      sources,
      "source changed during build",
    );
    await writeFile(file, JSON.stringify(bundle, null, 2) + "\n", {
      flag: "wx",
    });
    console.log(
      JSON.stringify(
        {
          file,
          built: true,
          datasets: Object.fromEntries(
            Object.entries(bundle.datasets).map(([id, row]) => [
              id,
              row.commitment.root,
            ]),
          ),
        },
        null,
        2,
      ),
    );
    return;
  }
  const saved = JSON.parse(await readFile(file, "utf8"));
  const verification = await verifyBundle(saved, root, sources);
  console.log(JSON.stringify({ file, ...verification }, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
