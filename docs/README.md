# Documentation

**Start here.** Most files in this folder are working notes. Only the rows marked **current** are product or protocol rules. Dated filenames are history, not promises.

Public site: https://immortalflies.com/docs · Repo catalog: this page.

This page does not move funds, prove intelligence, or replace on-chain listings.

## How to read

| Order | Read | Why |
| --- | --- | --- |
| 1 | [LIFE-PROTOCOL](LIFE-PROTOCOL.md) (EN: [LIFE-PROTOCOL.en.md](LIFE-PROTOCOL.en.md)) | Identity kernel. Soul cannot be redeployed to iterate. |
| 2 | [PRODUCT-LATEST](PRODUCT-LATEST.md) §0 then §19–§24 | The only current product / architecture book. |
| 3 | [CONNECTOME-MALE-CNS](CONNECTOME-MALE-CNS.md) + [BIOLOGY-SPINE-V6](BIOLOGY-SPINE-V6.md) | What the fly body is, and what it is not. |
| 4 | Satellite specs below | Market, kin, mining, API — only if you are changing that surface. |

Skip everything else until you need a lab replay or a design memo.

**Do not treat as shipped:** page copy, sandbox labels, old contract comments, or any `*-DESIGN-2026-09-*.md` unless PRODUCT-LATEST cites it as implemented.

## Current — product & protocol

| Doc | Status | Role |
| --- | --- | --- |
| [PRODUCT-LATEST.md](PRODUCT-LATEST.md) | **Current product book** | Open digital life: identity, connectome, society. Trading is the first small world, not the frame. Money rules, Soul assessment, swarm interfaces (mostly design), honest boundaries. |
| [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md) | **Current encoding spec** | ImmortalSoul / Journal / Kin / genesis. EN: [LIFE-PROTOCOL.en.md](LIFE-PROTOCOL.en.md). |
| [SOUL-MARKET.md](SOUL-MARKET.md) | Current satellite | Official NFT market. Not OpenSea. |
| [SOULKIN-FEE.md](SOULKIN-FEE.md) | Current satellite | Paid kin (testnet). Mainnet hatch kin is free SoulKinCross. |
| [FLAP-LAUNCH.md](FLAP-LAUNCH.md) | Current fact sheet | `$IFS` launch record on BSC. |
| [FRONTENDS.md](FRONTENDS.md) | Current | Site vs Flap embed. |
| [CONNECTOME-MALE-CNS.md](CONNECTOME-MALE-CNS.md) | Current | MaleCNS ingest, licenses, two graph sizes. |
| [BIOLOGY-SPINE-V6.md](BIOLOGY-SPINE-V6.md) | Current discipline | Adult male CNS is canon. Larva / FlyWire / 16-node toy are other animals. |
| [assets.md](assets.md) | Current | Art and font provenance. |

## Current — engineering

| Doc | Status | Role |
| --- | --- | --- |
| [API-V1.md](API-V1.md) | Current HTTP contract | Session / replay / explain. EN: [API-V1.en.md](API-V1.en.md). |
| [TESTNET.md](TESTNET.md) | Current | chainId 97 altar / deploy. EN: [TESTNET.en.md](TESTNET.en.md). |
| [MINING-HUB-V1.md](MINING-HUB-V1.md) | Current satellite spec | Private-track hub. Mainnet undeployed. Not a yield product. |
| [MINING-OPS.md](MINING-OPS.md) | Current ops | Runner, hive, day caps. No APY language. |
| [MINING-RUNNER-TESTNET.md](MINING-RUNNER-TESTNET.md) | Current ops | Testnet runner URL and listing. |

On-chain addresses live in `public/contract/life/*.json`, not in prose.

## Design memos — not shipped

Read these only after PRODUCT-LATEST §21 / §24. They do **not** freeze schemas or authorize “swarm intelligence is live.”

| Doc | Date | Role |
| --- | --- | --- |
| [SWARM-PROTOCOL-REEVALUATION-2026-09-18.md](SWARM-PROTOCOL-REEVALUATION-2026-09-18.md) | 2026-09-18 | Literature vs claims; seven gaps. |
| [SWARM-UPGRADE-2026-09-18.md](SWARM-UPGRADE-2026-09-18.md) | 2026-09-18 | First `context-association/1` slice. Not T4. |
| [SWARM-INTELLIGENCE-PROTOCOL-DESIGN-2026-09-17.md](SWARM-INTELLIGENCE-PROTOCOL-DESIGN-2026-09-17.md) | 2026-09-17 | Five interfaces, T0–T4, Railway notes. |
| [RUNTIME-TIERS-DESIGN-2026-09-17.md](RUNTIME-TIERS-DESIGN-2026-09-17.md) | 2026-09-17 | Circuit vs full graph vs cluster. |
| [MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md](MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md) | 2026-09-17 | Segment work unit (supersedes raw PoUW). |
| [MINING-HIVE-VERIFY-DESIGN-2026-09-17.md](MINING-HIVE-VERIFY-DESIGN-2026-09-17.md) | 2026-09-17 | Hive verify constraints. |
| [MINING-POUW-DESIGN-2026-09-17.md](MINING-POUW-DESIGN-2026-09-17.md) | 2026-09-17 | **Origin draft.** Use the two files above. |
| [BRAINWEB-RESEARCH-2026-09-17.md](BRAINWEB-RESEARCH-2026-09-17.md) | 2026-09-17 | Competitor page audit, not a spec. |

## Lab notes — local experiments

Replay vectors and ablation write-ups. They are SIM evidence for adapters and relay, **not** biological validation and **not** product copy.

[ADMISSION-RELAY-V1](ADMISSION-RELAY-V1.md) · [RELAY-ADMISSION-V1](RELAY-ADMISSION-V1.md) · [RELAY-DIAGNOSIS-V1](RELAY-DIAGNOSIS-V1.md) · [RELAY-DIRECTION-V1](RELAY-DIRECTION-V1.md) · [MOTOR-ABLATION-V1](MOTOR-ABLATION-V1.md) · [MOTOR-INPUT-V1](MOTOR-INPUT-V1.md) · [PREDICTIVE-MOTOR-V1](PREDICTIVE-MOTOR-V1.md) · [REACTIVE-MOTOR-CONTROL-V1](REACTIVE-MOTOR-CONTROL-V1.md) · [TURN-COST-V1](TURN-COST-V1.md) · [DIRECTION-INPUT-V1](DIRECTION-INPUT-V1.md) · [DIRECTION-SUBSET-V1](DIRECTION-SUBSET-V1.md) · [DIRECTION-BUDGET-V1](DIRECTION-BUDGET-V1.md) · [DIRECTION-HOLDOUT-V1](DIRECTION-HOLDOUT-V1.md) · [DIRECTION-L2O-CHECKPOINT](DIRECTION-L2O-CHECKPOINT.md) · [PROTOCOL-RELAY-V1](PROTOCOL-RELAY-V1.md) · [PROTOCOL-REPLAY-SMOKE-V1](PROTOCOL-REPLAY-SMOKE-V1.md) · [PROTOCOL-TASK-RUNNER-V1](PROTOCOL-TASK-RUNNER-V1.md)

JSON vectors sit in `reports/` (some are gitignored dumps).

## Historical — do not use as status

These were true on the day in the title. Soul `/3` is LIVE; `/2` is RETIRED.

| Doc | Why it is history |
| --- | --- |
| [GROK-HANDOFF-2026-09-16.md](GROK-HANDOFF-2026-09-16.md) | Pre-deploy handoff. Says Soul is undeployed. Wrong now. |
| [GENESIS-ONCHAIN-REVIEW-2026-09-16.md](GENESIS-ONCHAIN-REVIEW-2026-09-16.md) | Review of the first mainnet draft (`/2` era). |
| [STAGE1-DELIVERY-2026-09-17.md](STAGE1-DELIVERY-2026-09-17.md) | One-day delivery log. |
| [FRONTEND-REVIEW.md](FRONTEND-REVIEW.md) | Swarm UI pass. Not a protocol. |

## English set

| EN | ZH twin |
| --- | --- |
| [LIFE-PROTOCOL.en.md](LIFE-PROTOCOL.en.md) | [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md) |
| [API-V1.en.md](API-V1.en.md) | [API-V1.md](API-V1.md) |
| [TESTNET.en.md](TESTNET.en.md) | [TESTNET.md](TESTNET.md) |

PRODUCT-LATEST, mining, and most lab notes are Chinese only. The root [README](../README.md) is English.

## House rules

1. Identity facts stay in Soul. Play stays in satellites. See LIFE-PROTOCOL opening note.
2. Do not deploy `ImmortalFly.sol` to chainId 56.
3. Do not redeploy the LIVE ImmortalSoul collection to add features.
4. Paper trading, credit, and vaults marked SIM are not real funds.
5. MaleCNS-derived graphs stay CC BY. See [NOTICE](../NOTICE).
6. New product rules go into PRODUCT-LATEST or a satellite spec — not a new dated handoff at the folder root.
