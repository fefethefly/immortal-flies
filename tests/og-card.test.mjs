import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BRAND_OG } from "../src/brand.mjs";

function jpegSize(buf) {
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8);
  let i = 2;
  while (i + 9 < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
      };
    }
    i += 2 + length;
  }
  throw new Error("JPEG SOF not found");
}

test("OG card is an opaque 1200 JPEG and both public shells point at it", async () => {
  const image = await readFile(
    new URL("../public/mark/og.jpg", import.meta.url),
  );
  assert.ok(image.length < 5 * 1024 * 1024);
  assert.deepEqual(jpegSize(image), { width: 1200, height: 1200 });
  assert.equal(BRAND_OG, "/mark/og.jpg");

  const cardUrl = "https://immortalflies.com/mark/og.jpg";
  for (const page of ["../index.html", "../swarm.html"]) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(html, /name="twitter:card" content="summary"/);
    assert.match(
      html,
      new RegExp(`property="og:image"\\s+content="${cardUrl}"`),
    );
    assert.match(
      html,
      new RegExp(`name="twitter:image"\\s+content="${cardUrl}"`),
    );
    assert.doesNotMatch(html, /twitter:image"[^>]+app\.png/);
    assert.doesNotMatch(html, /og:image"[^>]+app\.png/);
  }
});
