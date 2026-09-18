import { soulTokenSvgFromRequest } from "../src/life/soul-token-svg.mjs";

function requestUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "immortalflies.com";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return new URL(req.url, `${proto}://${host}`);
}

export default function handler(req, res) {
  const result = soulTokenSvgFromRequest(requestUrl(req));
  if (result.miss) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return;
  }
  if (!result.ok) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Bad request");
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(result.svg);
}
