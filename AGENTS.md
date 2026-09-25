# Agent instructions

This repository is public and intended for international collaboration. Humans and coding agents should treat this file as the default instruction set.

## Language (GitHub surface)

Write **English** for anything that lands on GitHub as collaboration text:

- commit subject and body
- pull request title and body
- issue text
- GitHub-facing docs: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `NOTICE`, `AGENTS.md`, `docs/README.md`, and any new file meant for outside contributors

Do **not** mass-translate existing Chinese product or lab notes unless a human asks. `docs/PRODUCT-LATEST.md` and many `docs/*.md` files remain Chinese working books; if you add a public twin, use `*.en.md` and link it from `docs/README.md`.

Chat with the repo owner may stay in their language. Git artifacts must still be English.

**Commit style:** 1–2 English sentences on *why*, not a file list. Example: `Keep Soul identity facts out of satellite play contracts.`

## Official fly character and marketing art

The owner designated the **fruit-fly character shown on Colony NFT cards** (`/colony.html`) as the official IMMORTAL brand character style on 2026-09-20. Apply this by default whenever posters, X posts, ads, banners, or other promotional artwork contain a fly.

- Read [docs/BRAND.en.md](docs/BRAND.en.md) before creating fly artwork; inspect the current Colony cards and `public/assets/colony-body-v4.png`. Rendering details: [docs/COLONY-ART.en.md](docs/COLONY-ART.en.md).
- Use the Colony character asset or an actual rendered card as an image reference. Preserve its cute rounded game-collectible proportions, luminous faceted eyes, smooth pearl-tipped antennae, glossy candy-enamel body, six delicate legs, and translucent pearly wing pair. The body asset is intentionally wingless; the complete character has renderer-supplied wings.
- The owner explicitly rejected the realistic matte/bristly v3 direction. Keep the character cute, polished and precious; avoid pores, dense hair, sharp mouthparts and macro-specimen texture.
- Retain the brand palette from `src/brand.mjs`. Do not substitute a generic photorealistic insect, metallic cyber-fly, old mascot, or earlier campaign image as the character authority. Those older assets do not override the Colony reference.
- Follow an explicit user request for a different direction; otherwise this is the default without asking the owner to repeat it. This style rule does not change NFT genetics or ownership.
- **Homepage exception (owner confirmed 2026-09-22):** homepage fly illustrations use a translucent, futuristic holographic projection with luminous contours and schematic internal light paths, rather than the gemstone NFT-card material. Keep this exception scoped to the homepage; Colony and token portraits retain their official collectible style.

## Hard product boundaries

Read before changing identity, money, or deploy paths:

- [docs/LIFE-PROTOCOL.md](docs/LIFE-PROTOCOL.md) opening note and §3
- [docs/PRODUCT-LATEST.md](docs/PRODUCT-LATEST.md) (current product book)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- Brain kernel: [src/brain/AGENTS.md](src/brain/AGENTS.md)

Do not redeploy the LIVE `ImmortalSoul` collection to iterate. Do not deploy `ImmortalFly.sol` to chainId 56. Paper / SIM ledgers are not real funds. Never commit `.env`, keys, or `refs/cline/**`.
