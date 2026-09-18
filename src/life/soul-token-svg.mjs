/**
 * Wallet-facing token card. Must match SoulRenderer.sol path-for-path.
 * Indexers (Binance Web3 Wallet, MetaMask mobile) often drop nested SVG
 * data URIs; they fetch this HTTPS resource instead.
 */
import { expressPhenotype } from "../brain/flyswarm/phenotype.mjs";

export const SOUL_TOKEN_IMAGE_ORIGIN = "https://immortalflies.com";
export const SOUL_TOKEN_SVG_WIDTH = 400;
export const SOUL_TOKEN_SVG_HEIGHT = 440;

const WING_TRANSFORM = Object.freeze({
  typical: "",
  miniature: " scale(.72)",
  curly: " rotate(22)",
  vestigial: " scale(.38)",
});

export function soulTokenImagePath(id, seed, generation) {
  return `/nft/soul/${Number(id)}/${Number(seed)}/${Number(generation)}.svg`;
}

export function soulTokenImageUrl(id, seed, generation) {
  return `${SOUL_TOKEN_IMAGE_ORIGIN}${soulTokenImagePath(id, seed, generation)}`;
}

function scaleAttr(scale) {
  return scale === 1 ? "1" : String(scale);
}

function stripePaths(count) {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    out += `<path d="M-30 ${18 + i * 12} h60" stroke="#30271d" stroke-width="5"/>`;
  }
  return out;
}

function markSvg(mark) {
  if (mark === "bar") return '<rect x="-11" y="22" width="22" height="7" rx="2" fill="#30271d"/>';
  if (mark === "spots") {
    return '<circle cx="-9" cy="30" r="4" fill="#30271d"/><circle cx="9" cy="30" r="4" fill="#30271d"/>';
  }
  return "";
}

export function soulTokenSvg({ id, seed, generation = 0 } = {}) {
  const tokenId = Number(id);
  const gen = Number(generation);
  const ph = expressPhenotype({
    soulId: `soul-${tokenId}`,
    seed: Number(seed) || 1,
    generation: gen,
  });
  const art = ph.art;
  const wingX = WING_TRANSFORM[art.wingShape] ?? "";
  const blot =
    art.wingMark === "clear"
      ? ""
      : '<circle cx="-70" cy="-70" r="8" fill="#30271d" opacity=".5"/><circle cx="70" cy="-70" r="8" fill="#30271d" opacity=".5"/>';
  const dimorph =
    art.sex === "male" ? '<path d="M-26 8 h10M16 8 h10" stroke="#30271d" stroke-width="3"/>' : "";
  const abdomen = art.sex === "male" ? "62" : "76";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SOUL_TOKEN_SVG_WIDTH}" height="${SOUL_TOKEN_SVG_HEIGHT}" viewBox="0 0 ${SOUL_TOKEN_SVG_WIDTH} ${SOUL_TOKEN_SVG_HEIGHT}">` +
    `<rect width="${SOUL_TOKEN_SVG_WIDTH}" height="${SOUL_TOKEN_SVG_HEIGHT}" fill="#0a0907"/>` +
    `<g transform="translate(200 210) scale(${scaleAttr(art.scale)})">` +
    `<path d="M-22 0L-95 70M-22 25L-100 115M-22 50L-82 152M22 0L95 70M22 25L100 115M22 50L82 152" stroke="#f0b90b" stroke-width="3"/>` +
    `<g transform="${wingX}">` +
    `<ellipse cx="-58" cy="-24" rx="35" ry="88" transform="rotate(-35 -58 -24)" fill="#e6e0cf" opacity=".28"/>` +
    `<ellipse cx="58" cy="-24" rx="35" ry="88" transform="rotate(35 58 -24)" fill="#e6e0cf" opacity=".28"/>` +
    blot +
    `</g>` +
    `<ellipse cy="38" rx="31" ry="${abdomen}" fill="${art.body}"/>` +
    stripePaths(art.stripes) +
    markSvg(art.mark) +
    dimorph +
    `<ellipse cy="-33" rx="33" ry="40" fill="${art.body}"/>` +
    `<circle cx="-23" cy="-53" r="15" fill="${art.eye}"/>` +
    `<circle cx="23" cy="-53" r="15" fill="${art.eye}"/>` +
    `</g>` +
    `<text x="24" y="386" fill="#f0ead9" font-family="monospace" font-size="20">IMMORTAL #${tokenId}</text>` +
    `<text x="24" y="416" fill="#a89e8c" font-family="monospace" font-size="12">GEN${gen} / phenotype-loci/3</text>` +
    `</svg>`
  );
}

export function soulTokenSvgFromParts(id, seed, generation) {
  const tokenId = Number(id);
  const tokenSeed = Number(seed);
  const gen = Number(generation);
  if (
    !Number.isInteger(tokenId) ||
    tokenId < 1 ||
    !Number.isInteger(tokenSeed) ||
    tokenSeed < 0 ||
    tokenSeed > 0xffffffff ||
    !Number.isInteger(gen) ||
    gen < 0 ||
    gen > 1_000_000
  ) {
    return { ok: false, miss: false };
  }
  return {
    ok: true,
    miss: false,
    svg: soulTokenSvg({
      id: tokenId,
      seed: tokenSeed === 0 ? 1 : tokenSeed,
      generation: gen,
    }),
  };
}

export function soulTokenSvgFromPath(pathname) {
  const match = String(pathname || "").match(
    /^\/nft\/soul\/(\d+)\/(\d+)\/(\d+)\.svg$/,
  );
  if (!match) return { ok: false, miss: true };
  return soulTokenSvgFromParts(match[1], match[2], match[3]);
}

export function soulTokenSvgFromRequest(url) {
  const id = url.searchParams.get("id");
  const seed = url.searchParams.get("seed");
  const file = url.searchParams.get("file");
  const gen =
    url.searchParams.get("gen") ??
    url.searchParams.get("generation") ??
    (file && file.endsWith(".svg") ? file.slice(0, -4) : null);
  if (id != null && seed != null && gen != null) {
    return soulTokenSvgFromParts(id, seed, gen);
  }
  return soulTokenSvgFromPath(url.pathname);
}

export function attachSoulTokenSvgServer(server) {
  server.middlewares.use((req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    const result = soulTokenSvgFromPath(pathname);
    if (result.miss) return next();
    if (!result.ok) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Bad request");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(result.svg);
  });
}
