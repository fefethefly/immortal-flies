import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hash } from "../src/brain/codec.mjs";

const current = JSON.parse(fs.readFileSync("public/life-genesis/current.json", "utf8"));
const manifest = JSON.parse(
  fs.readFileSync(`public/life-genesis/${current.genesisRoot.slice(2)}/manifest.json`, "utf8"),
);

test("mainnet genesis package commits phenotype-loci/2", async () => {
  assert.equal(current.decoder, "phenotype-loci/2");
  assert.equal(manifest.decoder, "phenotype-loci/2");
  assert.equal(current.genesisRoot, await hash(manifest));
  assert.equal(current.speciesHash, await hash(manifest.species));
  assert.equal(current.modelHash, await hash(manifest.model));
  assert.notEqual(
    current.genesisRoot,
    "0xe45cb0c66f29a3229fa9d8c20b805b0c6a1dd1b3023f0bbb26a7238f4efee091",
  );
  assert.ok(fs.existsSync(`public${current.manifestPath}`));
});
