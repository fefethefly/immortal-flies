import { createHash, timingSafeEqual } from "node:crypto";

export function hashToken(token) {
  return createHash("sha256").update(String(token), "utf8").digest("hex");
}

export function tokensMatch(token, expectedHash) {
  if (!token || !expectedHash) return false;
  const got = hashToken(token);
  const a = Buffer.from(got, "hex");
  const b = Buffer.from(String(expectedHash), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
