import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { flapToken, normalizeToken } from "../src/token.mjs";

test("official ticker is IFS and the posted CA is live", async () => {
  const raw = JSON.parse(
    await readFile(
      new URL("../public/token/official.json", import.meta.url),
      "utf8",
    ),
  );
  const token = normalizeToken(raw);
  assert.equal(token.symbol, "IFS");
  assert.equal(token.status, "live");
  assert.equal(token.address, "0x65b66bb4adb0e244e19d290b6aaa0381b81a7777");
  assert.equal(token.vault, "0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467");
  assert.equal(token.ops, "0x055bB2aF42B832A55F3D708c92824C491dE05427");
  assert.equal(token.hiveBps, 8000);
  assert.equal(token.opsBps, 2000);
  assert.equal(token.twitter, "https://x.com/imfruitflies");
  assert.equal(token.buyTaxBps, 100);
  assert.equal(token.sellTaxBps, 100);
  assert.ok(token.rejected.some((row) => row.symbol === "IFF"));
  assert.ok(token.rejected.some((row) => row.symbol === "IFLY"));
  assert.equal(flapToken(null), "https://flap.sh");
  assert.equal(
    flapToken(token.address),
    "https://flap.sh/bnb/0x65b66bb4adb0e244e19d290b6aaa0381b81a7777",
  );
});
