# IMMORTAL / Fruit Flies

**Free hatch on BNB. Own a digital fruit fly with a verifiable history.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Mode](https://img.shields.io/badge/Mode-LIVE%20%C2%B7%20Soul%20%2B%20%24IFS%20on%20BSC-success)](https://immortalflies.com)
[![Chain](https://img.shields.io/badge/Chain-BSC%20Mainnet%20(56)-F0B90B?logo=bnbchain&logoColor=white)](https://bscscan.com/address/0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD)
[![Token](https://img.shields.io/badge/%24IFS-tax%20coin%20live-2775ca)](./docs/FLAP-LAUNCH.md)
[![Soul](https://img.shields.io/badge/Soul-ImmortalSoul%20%2F%20phenotype--loci%2F3-9b59b6)](./docs/LIFE-PROTOCOL.md)
[![Connectome](https://img.shields.io/badge/Connectome-MaleCNS%20v1.0%20(CC%20BY)-e74c3c)](./docs/CONNECTOME-MALE-CNS.md)
[![Host](https://img.shields.io/badge/Host-Vercel-000000?logo=vercel&logoColor=white)](https://immortalflies.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.30-363636?logo=solidity&logoColor=white)](./contracts/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![ethers](https://img.shields.io/badge/ethers-6.15-2535a0)](https://docs.ethers.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.4-4E5EE4?logo=openzeppelin&logoColor=white)](https://www.openzeppelin.com/)
[![CI](https://img.shields.io/badge/CI-npm%20test%20%2B%20build-2ea44f)](./.github/workflows/segment-replay.yml)

License [MIT](LICENSE). Third-party connectome and fonts: [NOTICE](NOTICE). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately via [SECURITY.md](SECURITY.md) — never paste private keys or API secrets into issues.

**Site** · https://immortalflies.com · **Repo** · https://github.com/fefethefly/immortal-flies

Current focus: free BNB hatch (gas only), Soul identity, on-chain interaction, and recoverable archives. The public protocol separates LifeId, SpeciesManifest, ModelManifest, and Session so future cross-chain / cross-species work can plug in later. BNB Chain is the only identity authority in v1; bridging is closed. Trading remains a paper small world. Product rules: [PRODUCT-LATEST](docs/PRODUCT-LATEST.md). Spec: [LIFE-PROTOCOL](docs/LIFE-PROTOCOL.md).

LIVE identity kernel: `ImmortalSoul` [`0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD`](https://bscscan.com/address/0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD) (`phenotype-loci/3`). Retired `/2` collection `0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F` is not this set. Do **not** deploy `ImmortalFly.sol` to chainId 56, and do **not** redeploy Soul to iterate.

## Stack

| Layer | What we use |
| --- | --- |
| App | React 19, Vite 6, Three.js, Lucide |
| Chain | ethers 6, Solidity 0.8.30, OpenZeppelin 5.4, BSC mainnet + testnet |
| Identity | `ImmortalSoul`, `LifeJournal`, `SoulKinCross`, `SoulMarket` |
| Token | `$IFS` Flap tax coin on BSC |
| Brain | MaleCNS-derived connectome runtime (`iff-runtime/1`), paper trading pit |
| Host | Vercel static site + optional Node session/LLM server |
| Data | Janelia FlyEM MaleCNS v1.0 (CC BY) |

## Quick start

Requires Node.js 22+.

```sh
npm install
npm run dev -- --port 4173
```

Optional backend (Session / Replay / P1 LLM):

```sh
npm run server   # http://127.0.0.1:8787 — see docs/API-V1.md
```

`npm run dev` proxies `/v1`, `/health`, and `/ready` to 8787. Without `OPENAI_API_KEY`, the explainer falls back to a local deterministic implementation.

| URL | Page |
| --- | --- |
| http://127.0.0.1:4173/ | Public home |
| http://127.0.0.1:4173/swarm.html | Trading pit |
| http://127.0.0.1:4173/brain.html | Connectome lab |
| http://127.0.0.1:4173/habitat.html | Hatch / habitat |
| http://127.0.0.1:4173/colony.html | Colony catalog |
| http://127.0.0.1:4173/blueprint.html | Blueprint |

Top nav switches inside one document (no full reload). Production `/altar` redirects to blueprint (`vercel.json`). Build: `npm run build`. Preview: `npm run preview -- --port 4173`.

Official token listing: `public/token/official.json` — ticker `$IFS`, live on BSC at `0x65b66bb4adb0e244e19d290b6aaa0381b81a7777`. Launch notes: [docs/FLAP-LAUNCH.md](docs/FLAP-LAUNCH.md).

## What this build can do

- Watch flies on a real MaleCNS sensory–motor subgraph trade IFL/BNB on a paper ledger; inject nectar, threat, light, or dark; wait for cull and breed.
- Seven product views in the pit: Pit / Colony / Intent / Risk / Execution / Vault / IFS.
- Live tape: six event classes (sense, behavior, memory, fill, social, risk) land each tick; causal bar replays cause → turn → fill → social; hive pressure meter aggregates buy/sell pressure.
- Ask channel: seven fixed questions with event citations; free-form ask when API + LLM are up; still works without a model.
- LLM boundary drawer: explain (cited steps), retrieve, candidate plans (PASS/REJECT), read-only tool whitelist, versioned strategy checks.
- Risk / Execution / Vault / IFS disclose paper positions, liquidity, drawdown, credit, receipts; user vault is marked not wired.
- Optional server mirror when `npm run server` is running; disconnect falls back to local.
- Habitat hatch wait, colony catalog, on-chain Soul SVG (`/nft/soul/...`), local archive export/import with SHA-256 integrity checks.
- Lightweight `iff-neural-16-v1` altar model (train / sleep / rebirth) — testnet prototype only.

State lives in the browser. The sim advances only while the page is visible, not dormant, and not mid-interaction. Clearing site data wipes local progress — save an archive first.

## Scope and facts

**`$IFS` is live on BSC** ([FLAP-LAUNCH](docs/FLAP-LAUNCH.md)). **Soul NFT is live** — collection `0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD`, listing `public/contract/life/ImmortalSoul.mainnet.json`. `ImmortalFly.sol` is a 16-node **testnet** prototype — **do not deploy it to BSC mainnet**. See [LIFE-PROTOCOL](docs/LIFE-PROTOCOL.md) and [PRODUCT-LATEST](docs/PRODUCT-LATEST.md) §§19–20.

Maze scores, local archives, and MaleCNS graphs are **not** on-chain assets or official results. Burns and auto-payouts to personal addresses are not implemented and must not be framed as protocol splits.

`iff-neural-16-v1` has 16 nodes, three trainable groups, and deterministic RNG. It is fly-inspired, not a full brain and not consciousness upload. Fancy glowing wires on the page are art; the neural view shows the light model’s voltages and spikes.

SHA-256 checks archive integrity; it does not prove provenance, ownership, or score authenticity. Copying state is not copying NFT ownership.

## On-chain pieces

- **Mainnet Soul** — `contracts/life/ImmortalSoul.sol` and satellites (Journal, Kin, Market). Identity facts stay in Soul; play lives in modules. No UUPS / proxy on Soul.
- **Testnet prototype** — [contracts/ImmortalFly.sol](contracts/ImmortalFly.sol): ERC-721, cap 1024, full 16-node state, built-in SVG; no burn, admin, or proxy. Not the mainnet soul.
- Local altar (merged into blueprint in production) talks chainId **97** via `src/chain.mjs`. Listing: `public/contract/ImmortalFly.deployment.json` (`UNDEPLOYED`).

Frontends: [docs/FRONTENDS.md](docs/FRONTENDS.md). Testnet: [docs/TESTNET.md](docs/TESTNET.md). Contract notes: [contracts/README.md](contracts/README.md).

## Verify

```sh
npm test
npm run build
npm run life:compile
npm run life:test
npm run contracts:compile
npm run contracts:test
```

Contract tests need Foundry `anvil`. The script spins a temporary local chain, runs tests, and exits — it does not touch a public network.

## Production

```sh
npm run build        # output in dist/
npm run preview
```

Static hosting is enough (Vercel: `vercel.json`). The Node backend is optional — without it, pit views, ask, and explain stay local (badge: LOCAL ONLY).

## Source map

| Path | Role |
| --- | --- |
| `src/swarm-page.jsx` | Trading pit UI |
| `src/brain/flyswarm/` | Pit bridge, paper world, explain, schemas |
| `src/life/` | Habitat, hatch, colony, market, Soul SVG |
| `src/brain/` | Runtime, adapters, ethology, protocol tasks |
| `server/` | Session / Replay / LLM HTTP (`docs/API-V1.md`) |
| `contracts/life/` | Mainnet identity + satellites |
| `public/data/` | Prepared MaleCNS graphs |
| `public/contract/life/` | Deployment listings |
| `tests/`, `scripts/` | Verification |

[Product](docs/PRODUCT-LATEST.md) · [Flap launch](docs/FLAP-LAUNCH.md) · [Biology spine](docs/BIOLOGY-SPINE-V6.md) · [Assets](docs/assets.md)

## Connectome runtime

Separate from the 16-node altar toy: brain run, input adapters, restore, and Flap preview are split, wired to Janelia MaleCNS v1.0 (CC BY).

```sh
python3 -m pip install pyarrow pandas
npm run connectome:prepare            # interactive subgraph (shipped)
npm run connectome:prepare -- --full  # full graph, large local download
```

The interactive subgraph ships with the repo; the full graph is generated locally and not committed. Details: [docs/CONNECTOME-MALE-CNS.md](docs/CONNECTOME-MALE-CNS.md).

## License

Source code is [MIT](LICENSE). Janelia FlyEM MaleCNS-derived graphs remain **CC BY** (not re-licensed as MIT). Bundled fonts are **SIL OFL**. See [NOTICE](NOTICE).
