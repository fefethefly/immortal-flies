#!/usr/bin/env node
/**
 * Make sure public/data/malecns-full matches the tracked manifest.
 * Does not rewrite graph.mjs / graph-fs.mjs. Large files stay gitignored.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { hashBytes } from "../src/brain/codec.mjs";

const root = resolve(import.meta.dirname, "..");
const dir = join(root, "public/data/malecns-full");
const checkOnly = process.argv.includes("--check");

async function inspect() {
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  const files = [];
  for (const key of ["metadata", "connectivity"]) {
    const spec = manifest[key];
    const file = join(dir, spec.path);
    if (!existsSync(file)) {
      return { ok: false, reason: `missing ${spec.path}`, manifest };
    }
    const buf = await readFile(file);
    const sha256 = await hashBytes(buf);
    files.push({
      path: spec.path,
      bytes: buf.byteLength,
      sha256,
      expectedBytes: spec.bytes,
      expectedSha256: spec.sha256,
    });
    if (buf.byteLength !== spec.bytes || sha256 !== spec.sha256) {
      return { ok: false, reason: `hash ${spec.path}`, manifest, files };
    }
  }
  return { ok: true, neurons: manifest.neurons, edges: manifest.edges, files };
}

function prepare() {
  return new Promise((resolvePrepare, reject) => {
    const child = spawn(
      process.env.PYTHON || "python3",
      [join(root, "scripts/data/prepare_malecns.py"), "--full"],
      { cwd: root, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePrepare();
      else reject(new Error(`prepare_malecns.py exit ${code}`));
    });
  });
}

let result = await inspect();
if (!result.ok && !checkOnly) {
  console.log(JSON.stringify({ preparing: true, reason: result.reason }));
  await prepare();
  result = await inspect();
}
console.log(JSON.stringify({ ok: result.ok, reason: result.reason || null, neurons: result.neurons, edges: result.edges, files: result.files }, null, 2));
if (!result.ok) process.exit(1);
