# Contributing

Need Node.js 22+. Do not commit `.env`, private keys, or a locally generated full connectome.

**Language:** this project is public. Write **English** for commits, pull requests, issues, and GitHub-facing docs. See [AGENTS.md](AGENTS.md). Existing Chinese product/lab notes are not a translation queue unless someone asks.

```sh
npm install
cp .env.example .env   # leave secrets empty for a local run
npm test
npm run build
```

Contract tests need Foundry `anvil`:

```sh
npm run life:compile
npm run life:test
```

The full MaleCNS graph is not in git. Generate it locally; see `docs/CONNECTOME-MALE-CNS.md`.

## Boundaries

- License is MIT. Derived MaleCNS graphs and bundled fonts stay on the licenses in NOTICE.
- Do not deploy `ImmortalFly.sol` to BSC mainnet.
- Do not redeploy `ImmortalSoul` on mainnet to add features; play goes in satellite contracts.
- Paper trading, credit, and vaults marked SIM are not real funds.
- Before you commit, check `git status` for `.env`, `*.pem`, and Finder `*_副本` copies.
- Do not `git push --mirror` or push `refs/cline/**`. Those are local Cline checkpoints and may contain browser profile data, not source.

Open a pull request for patches. Report vulnerabilities via [SECURITY.md](SECURITY.md), not a public issue.
