import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash, hashBytes, canonical } from "../src/brain/codec.mjs";
import { loadGraphFromDir } from "../server/src/shared/graph-fs.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dataDir = path.join(root, "public/data/malecns-full");
const currentPath = path.join(root, "public/life-genesis/current.json");
const DECODER = "phenotype-loci/2";

async function loadExistingPackage() {
  const current = JSON.parse(await fs.readFile(currentPath, "utf8"));
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(root, "public/life-genesis", current.genesisRoot.slice(2), "manifest.json"),
      "utf8",
    ),
  );
  if ((await hash(manifest.species)) !== manifest.speciesHash) {
    throw new Error("Existing genesis species hash mismatch");
  }
  return { current, manifest };
}

async function loadSpecies() {
  try {
    const graph = await loadGraphFromDir(dataDir);
    const provenanceBytes = await fs.readFile(path.join(dataDir, "provenance.json"));
    const provenance = JSON.parse(provenanceBytes.toString("utf8"));
    if ((await hashBytes(provenanceBytes)) !== graph.manifest.provenance.sha256) {
      throw new Error("Invalid provenance");
    }
    return {
      species: {
        schema: "ifs.species/1",
        species: "Drosophila melanogaster",
        stage: "adult male",
        dataset: "male-cns:v1.0",
        scope: "annotated significant graph, minWeight >= 10; not unfiltered full CNS",
        neurons: graph.n,
        edges: graph.e,
        license: provenance.license,
        publisher: provenance.publisher,
        source: provenance.homepage,
        graph: graph.manifest,
      },
      neurons: graph.n,
      edges: graph.e,
    };
  } catch (error) {
    const { current, manifest } = await loadExistingPackage();
    console.warn(
      `graph.bin missing (${error.message}); reusing species from ${current.genesisRoot}`,
    );
    return {
      species: manifest.species,
      neurons: manifest.species.neurons,
      edges: manifest.species.edges,
      previousRoot: current.genesisRoot,
    };
  }
}

const files = new Map();
async function visit(relative) {
  if (files.has(relative)) return;
  const bytes = await fs.readFile(path.join(root, relative));
  files.set(relative, {
    path: relative,
    bytes: bytes.length,
    sha256: await hashBytes(bytes),
  });
  for (const match of bytes.toString().matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith(".")) {
      throw new Error("Genesis runtime must be self-contained");
    }
    await visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1])));
  }
}

const loaded = await loadSpecies();
await visit("src/life/replay.mjs");
const model = {
  schema: "ifs.model/1",
  runtime: "iff-runtime/1",
  profile: "lif-integer/1",
  replay: "ifs.journal-replay/1",
  stepsPerInput: 16,
  initialization:
    "createState(graph, {soulId: LifeId, branchId: canonical, seed: Genome.seed}); enabledSources=[environment]",
  files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
};
const manifest = {
  schema: "ifs.genesis-package/1",
  species: loaded.species,
  model,
  speciesHash: await hash(loaded.species),
  modelHash: await hash(model),
  birthSchema: "ifs.fly-birth/1",
  decoder: DECODER,
  dataBase: "/data/malecns-full/",
  runtimeBase: "runtime/",
};
if (manifest.decoder !== DECODER) throw new Error("Genesis decoder must be phenotype-loci/2");
const genesisRoot = await hash(manifest);
const out = path.join(root, "public/life-genesis", genesisRoot.slice(2));
await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, "manifest.json"), `${canonical(manifest)}\n`);
for (const file of model.files) {
  const dest = path.join(out, "runtime", file.path);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(path.join(root, file.path), dest);
}
const config = {
  status: "LOCAL_PACKAGE_UNPUBLISHED",
  decoder: DECODER,
  genesisRoot,
  speciesHash: manifest.speciesHash,
  modelHash: manifest.modelHash,
  manifestPath: `/life-genesis/${genesisRoot.slice(2)}/manifest.json`,
  neurons: loaded.neurons,
  edges: loaded.edges,
};
if (loaded.previousRoot && loaded.previousRoot !== genesisRoot) {
  config.previousGenesisRoot = loaded.previousRoot;
}
await fs.writeFile(currentPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(JSON.stringify(config, null, 2));
