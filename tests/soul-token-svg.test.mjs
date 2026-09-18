import test from "node:test";
import assert from "node:assert/strict";
import {
  soulTokenImageUrl,
  soulTokenSvg,
  soulTokenSvgFromPath,
  soulTokenSvgFromRequest,
} from "../src/life/soul-token-svg.mjs";

const LIVE = [
  {
    id: 1,
    seed: 2476182759,
    generation: 0,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440"><rect width="400" height="440" fill="#0a0907"/><g transform="translate(200 210) scale(1)"><path d="M-22 0L-95 70M-22 25L-100 115M-22 50L-82 152M22 0L95 70M22 25L100 115M22 50L82 152" stroke="#f0b90b" stroke-width="3"/><g transform=" scale(.72)"><ellipse cx="-58" cy="-24" rx="35" ry="88" transform="rotate(-35 -58 -24)" fill="#e6e0cf" opacity=".28"/><ellipse cx="58" cy="-24" rx="35" ry="88" transform="rotate(35 58 -24)" fill="#e6e0cf" opacity=".28"/><circle cx="-70" cy="-70" r="8" fill="#30271d" opacity=".5"/><circle cx="70" cy="-70" r="8" fill="#30271d" opacity=".5"/></g><ellipse cy="38" rx="31" ry="62" fill="#324d67"/><path d="M-30 18 h60" stroke="#30271d" stroke-width="5"/><path d="M-30 30 h60" stroke="#30271d" stroke-width="5"/><path d="M-30 42 h60" stroke="#30271d" stroke-width="5"/><rect x="-11" y="22" width="22" height="7" rx="2" fill="#30271d"/><path d="M-26 8 h10M16 8 h10" stroke="#30271d" stroke-width="3"/><ellipse cy="-33" rx="33" ry="40" fill="#324d67"/><circle cx="-23" cy="-53" r="15" fill="#c23b2e"/><circle cx="23" cy="-53" r="15" fill="#c23b2e"/></g><text x="24" y="386" fill="#f0ead9" font-family="monospace" font-size="20">IMMORTAL #1</text><text x="24" y="416" fill="#a89e8c" font-family="monospace" font-size="12">GEN0 / phenotype-loci/3</text></svg>',
  },
  {
    id: 2,
    seed: 541271453,
    generation: 0,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440"><rect width="400" height="440" fill="#0a0907"/><g transform="translate(200 210) scale(1)"><path d="M-22 0L-95 70M-22 25L-100 115M-22 50L-82 152M22 0L95 70M22 25L100 115M22 50L82 152" stroke="#f0b90b" stroke-width="3"/><g transform=""><ellipse cx="-58" cy="-24" rx="35" ry="88" transform="rotate(-35 -58 -24)" fill="#e6e0cf" opacity=".28"/><ellipse cx="58" cy="-24" rx="35" ry="88" transform="rotate(35 58 -24)" fill="#e6e0cf" opacity=".28"/><circle cx="-70" cy="-70" r="8" fill="#30271d" opacity=".5"/><circle cx="70" cy="-70" r="8" fill="#30271d" opacity=".5"/></g><ellipse cy="38" rx="31" ry="62" fill="#67323b"/><path d="M-30 18 h60" stroke="#30271d" stroke-width="5"/><path d="M-30 30 h60" stroke="#30271d" stroke-width="5"/><path d="M-26 8 h10M16 8 h10" stroke="#30271d" stroke-width="3"/><ellipse cy="-33" rx="33" ry="40" fill="#67323b"/><circle cx="-23" cy="-53" r="15" fill="#6b4a32"/><circle cx="23" cy="-53" r="15" fill="#6b4a32"/></g><text x="24" y="386" fill="#f0ead9" font-family="monospace" font-size="20">IMMORTAL #2</text><text x="24" y="416" fill="#a89e8c" font-family="monospace" font-size="12">GEN0 / phenotype-loci/3</text></svg>',
  },
];

function withSize(svg) {
  return svg.replace(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 440">',
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="440" viewBox="0 0 400 440">',
  );
}

test("wallet SVG matches live mainnet token cards, plus explicit size", () => {
  for (const row of LIVE) {
    assert.equal(soulTokenSvg(row), withSize(row.svg));
    assert.equal(
      soulTokenImageUrl(row.id, row.seed, row.generation),
      `https://immortalflies.com/nft/soul/${row.id}/${row.seed}/${row.generation}.svg`,
    );
  }
});

test("HTTPS path and query both resolve the same card", () => {
  const path = soulTokenSvgFromPath("/nft/soul/1/2476182759/0.svg");
  const query = soulTokenSvgFromRequest(
    new URL("https://immortalflies.com/api/nft-soul-svg?id=1&seed=2476182759&gen=0"),
  );
  const file = soulTokenSvgFromRequest(
    new URL("https://immortalflies.com/api/nft-soul-svg?id=1&seed=2476182759&file=0.svg"),
  );
  assert.equal(path.ok, true);
  assert.equal(query.svg, path.svg);
  assert.equal(file.svg, path.svg);
  assert.equal(soulTokenSvgFromPath("/nft/other.svg").miss, true);
  assert.equal(soulTokenSvgFromPath("/nft/soul/0/1/0.svg").ok, false);
});
