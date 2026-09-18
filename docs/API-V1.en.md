# Backend API handoff (DeepSeek)

Date: 2026-09-16. The Node service hosts the Pit Session's complete replayable archive and connects `iff.explain/1` to an OpenAI-compatible LLM.

## Startup

```sh
cp .env.example .env   # Optional: fill OPENAI_API_KEY
npm run server         # http://127.0.0.1:8787
npm run dev            # Vite proxies /v1 /health /ready to 8787
```

The service still starts without `OPENAI_API_KEY`; `/ready` reports `checks.llm.status` as `degraded`, and explanations use the local deterministic implementation.

## Contract

- OpenAPI: [`docs/openapi-v1.yaml`](openapi-v1.yaml)
- Optional client: [`src/api-client.mjs`](../src/api-client.mjs) (not wired into pages by default)
- Success bodies: `view.pit` = `pitView()`, `view.world` = `worldView()`
- Errors: `application/problem+json` (`title` = error code, `request_id`)
- Writes and LLM calls: `Authorization: Bearer <ownerToken>` (returned at session creation; only the hash is stored on disk)
- Restart: idle, unexpired sessions restore from `server/data/sessions/`; long-unvisited ones only occupy disk and load again on next request; anything past `IFF_SESSION_MAX_AGE_MS` is deleted
- Rate limits: tick / write / LLM / session creation over the cap return `429 RATE_LIMITED` with `Retry-After`

## P5 user vault (wired)

`GET /v1/vault` (vault view), `POST /v1/vault/deposit | exit` (Bearer owner token = user identity, disk stores only hashes), `POST /v1/vault/settle` (SIM mechanical settlement). The ledger is `iff.vault/1` (`src/brain/flyswarm/vault.mjs`): deposits mint shares at NAV (1e6 fixed point), batches record cost / high-water / realized PnL / fees / exit state and Position ID, redemption strictly verifies share ownership, the exit queue is FIFO under a liquidity cap, and only realized profit is distributable. User principal is kept apart from protocol-owned funds.

## P4 protocol-owned funds (wired)

`GET /v1/sessions/:id/protocol` returns the `iff.protocol/1` view (R/C/N/T/D, the 35/25/20/10/10 allocation, buyback eligibility and halt reasons, append-only hash-chained receipts, all SIM). The revenue layer lives in `src/brain/flyswarm/protocol.mjs` and advances with each session tick; it is read-only and derives from the core vault without touching user assets.

## P3 simulated credit (wired)

`/v1/sessions/:id/credit` (GET ledger view), `/credit/stake | unstake | occupy | release` (POST, SIM, requires ownerToken), `/v1/credit/policy` (versioned parameters). The ledger is `iff.credit/1` (`src/brain/flyswarm/credit.mjs`): four accounts + the §6.2 formula + no double staking + contraction on expiry/loss/lapse; every session persists `credit.json`. The frontend IFS view and the Risk credit column already read the server ledger (falling back to local paper credit when disconnected).

## Integration notes

1. Create `POST /v1/sessions` → keep `sessionId` + `ownerToken`
2. Use the existing 1Hz rhythm with `POST .../tick` (an `Idempotency-Key` is allowed)
3. «Change one experience» → `POST .../branches`; «replay the causal chain» → `GET /v1/branches/:id` or events
4. Why / ask → `POST /v1/llm/explain` / `ask`; plans are validated, never executed
5. P2 paper world: `GET /v1/sessions/:id/world` (Colony / Intent / Risk / Execution + hold baseline and net cost); single layer `GET .../layers/{colony|intent|risk|execution|market|baseline}`
6. Read-only market: `POST /v1/sessions/:id/market` injects a `changeBps` observation (may carry a `chain-observation` or `aggregator-quote` provenance). No calldata / signatures allowed; consumed on the next tick, then it falls back to the paper walk
7. Venue quotes (on by default): the server polls KyberSwap BSC `GET /routes`; `GET /v1/venue/quotes` returns USD / changeBps for the watchlist. On the static production site (no 8787) the browser fetches the same Kyber routes. Fills stay paper `fillBook` (SIM); `/route/build` is never called. Disable the poller with `IFF_VENUE_ENABLED=0`.

## Hosting mesh (scaffold, routes not mounted)

The domain model exists in `src/brain/flyswarm/mesh.mjs` and `hosting.mjs`. Planned read-only/SIM endpoints, **not mounted yet**:

- `GET /v1/mesh` → `meshView()` (partitions, nodes, coverage; no body IDs / potentials)
- `GET /v1/hosting` → `hostingView()`
- `POST /v1/hosting/quote | escrow | assign | start | settle | refund | renew`

Integrations must not rewrite `officialNeurons`. IFS hosting uses the existing `occupyCredit`; BNB must not occupy stake. Automatic contract debits are not open.

The Life Core stays in `src/brain/`; LLM and HTTP live only in `server/`. Market and layer views live in the World layer (`src/brain/flyswarm/market.mjs`, `layers.mjs`).
