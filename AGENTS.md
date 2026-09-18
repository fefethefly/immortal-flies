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

## Hard product boundaries

Read before changing identity, money, or deploy paths:

- [docs/LIFE-PROTOCOL.md](docs/LIFE-PROTOCOL.md) opening note and §3
- [docs/PRODUCT-LATEST.md](docs/PRODUCT-LATEST.md) (current product book)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- Brain kernel: [src/brain/AGENTS.md](src/brain/AGENTS.md)

Do not redeploy the LIVE `ImmortalSoul` collection to iterate. Do not deploy `ImmortalFly.sol` to chainId 56. Paper / SIM ledgers are not real funds. Never commit `.env`, keys, or `refs/cline/**`.
