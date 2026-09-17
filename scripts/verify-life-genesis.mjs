import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash, hashBytes } from "../src/brain/codec.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function verifyGenesisAssets(publicDir = path.join(projectRoot, "public")) {
  const deployment = JSON.parse(await fs.readFile(path.join(publicDir, "contract/life/ImmortalSoul.deployment.json"), "utf8"));
  const uri = new URL(deployment.genesisURI);
  function localFile(url) {
    if (url.origin !== uri.origin) throw new Error("Genesis references an external origin");
    const file = path.resolve(publicDir, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(`${path.resolve(publicDir)}${path.sep}`)) throw new Error("Invalid genesis asset path");
    return file;
  }
  const manifest = JSON.parse(await fs.readFile(localFile(uri), "utf8"));
  if (await hash(manifest) !== deployment.genesisRoot) throw new Error("Pinned genesis root mismatch");
  if (await hash(manifest.species) !== manifest.speciesHash) throw new Error("Species hash mismatch");
  if (await hash(manifest.model) !== manifest.modelHash) throw new Error("Model hash mismatch");
  const graph = manifest.species.graph;
  const references = [
    ...[graph.connectivity, graph.metadata, graph.provenance].map(file => ({ file, base: new URL(manifest.dataBase, uri) })),
    ...manifest.model.files.map(file => ({ file, base: new URL(manifest.runtimeBase, uri) })),
  ];
  for (const { file, base } of references) {
    const absolute = localFile(new URL(file.path, base));
    let bytes;
    try { bytes = await fs.readFile(absolute); }
    catch { throw new Error(`Missing committed genesis asset: ${absolute}. Supply the pinned file before building; do not regenerate the genesis identity.`); }
    if (bytes.length !== file.bytes || await hashBytes(bytes) !== file.sha256) {
      throw new Error(`Genesis asset fingerprint mismatch: ${absolute}`);
    }
  }
  return { genesisRoot: deployment.genesisRoot, verifiedFiles: references.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await verifyGenesisAssets(process.argv[2]));
}
