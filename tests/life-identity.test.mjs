import test from "node:test";
import assert from "node:assert/strict";
import { getAddress, keccak256, toUtf8Bytes } from "ethers";
import {
  BIRTH_DOMAIN,
  DECODER_HASH,
  LIFE_DOMAIN,
  birthHash,
  lifeId,
  soulGenome,
} from "../src/life/identity.mjs";

const COLLECTION = "0x1111111111111111111111111111111111111111";
const ROOT =
  "0xe45cb0c66f29a3229fa9d8c20b805b0c6a1dd1b3023f0bbb26a7238f4efee091";

test("lifeId is domain-separated and stable", () => {
  const a = lifeId(56, COLLECTION, 1);
  const b = lifeId(56, "0x1111111111111111111111111111111111111111", 1);
  assert.equal(a, b);
  assert.match(a, /^0x[0-9a-f]{64}$/);
  assert.notEqual(a, lifeId(97, COLLECTION, 1));
  assert.notEqual(a, lifeId(56, COLLECTION, 2));
  assert.equal(LIFE_DOMAIN, keccak256(toUtf8Bytes("ifs.life/1")));
  assert.throws(() => lifeId(0, COLLECTION, 1), /Invalid birth identity/);
});

test("birthHash binds life, genesis, decoder and seed", () => {
  const life = lifeId(56, COLLECTION, 7);
  const hash = birthHash({ life, genesisRoot: ROOT, seed: 43 });
  assert.equal(
    hash,
    birthHash({ life, genesisRoot: ROOT, seed: 43 }),
  );
  assert.notEqual(hash, birthHash({ life, genesisRoot: ROOT, seed: 44 }));
  assert.equal(BIRTH_DOMAIN, keccak256(toUtf8Bytes("ifs.fly-birth/1")));
  assert.equal(DECODER_HASH, keccak256(toUtf8Bytes("phenotype-loci/2")));
  assert.throws(
    () => birthHash({ life, genesisRoot: ROOT, seed: 0 }),
    /Invalid birth seed/,
  );
});

test("soulGenome defaults to SIM unless chain 56 or audit is set", () => {
  const life = lifeId(97, COLLECTION, 1);
  assert.equal(soulGenome({ life, genesisRoot: ROOT, seed: 9 }).audit, "SIM");
  assert.equal(
    soulGenome({ life, genesisRoot: ROOT, seed: 9, chainId: 56 }).audit,
    "MAINNET",
  );
  assert.equal(
    soulGenome({
      life,
      genesisRoot: ROOT,
      seed: 9,
      chainId: 56,
      audit: "SIM",
    }).audit,
    "SIM",
  );
  assert.equal(getAddress(COLLECTION), getAddress(COLLECTION));
});
