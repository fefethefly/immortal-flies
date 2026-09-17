import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPhenotypeManifest } from "../src/brain/flyswarm/phenotype-loci.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dest = path.join(root, "public/life-phenotype/current.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${JSON.stringify(buildPhenotypeManifest(), null, 2)}\n`);
console.log(dest);
