#!/usr/bin/env node
import { mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stage = process.argv[2] || "/tmp/iff-runner-deploy";
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "public/contract"), { recursive: true });
mkdirSync(join(stage, "public/data"), { recursive: true });
for (const rel of ["Dockerfile", "railway.toml", "package.json", "package-lock.json", ".dockerignore"]) {
  cpSync(join(root, rel), join(stage, rel));
}
cpSync(join(root, "src"), join(stage, "src"), { recursive: true });
cpSync(join(root, "server"), join(stage, "server"), {
  recursive: true,
  filter: (src) => !src.includes(`${join("server", "data")}`) && !src.endsWith("/data"),
});
cpSync(join(root, "public/contract/life"), join(stage, "public/contract/life"), { recursive: true });
cpSync(join(root, "public/data/malecns-full"), join(stage, "public/data/malecns-full"), { recursive: true });
cpSync(join(root, "public/data/malecns-circuit"), join(stage, "public/data/malecns-circuit"), {
  recursive: true,
});
if (!existsSync(join(stage, "server/src/runner/index.mjs"))) {
  throw new Error("staging missing runner");
}
console.log(stage);
