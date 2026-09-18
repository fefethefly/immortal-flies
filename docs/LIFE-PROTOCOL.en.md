# Life protocol: encoding and interfaces

Catalog: [README.md](README.md). Date: 2026-09-18. This is the encoding spec for ImmortalSoul / LifeJournal / SoulKin and the genesis package; it does not replace `PRODUCT-LATEST.md`. The BSC mainnet identity core (`phenotype-loci/3`) is deployed: Soul `0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD`. The old team test collection `0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F` (`/2`) is marked RETIRED; `#1` still lives at the old address and is not the same collection. Paid Kin: see [SOULKIN-FEE.md](SOULKIN-FEE.md); the official market: see [SOUL-MARKET.md](SOUL-MARKET.md).

## Read first: the mainnet identity core is permanent while the product keeps changing

The product is iterating fast and many gameplay ideas are not clear yet; at the same time we are preparing real hatching for users on BSC mainnet. These two must not sabotage each other.

**Once `ImmortalSoul` is deployed to mainnet, this collection's identity can never be "redone" with a new contract.** Redeploying equals destroying the NFTs, lifeIds, genomes, and lineage facts users already hold. Testnet can retire old addresses; mainnet cannot.

Therefore: **any feature that might go on-chain someday must be designed from day one as "identity pinned, gameplay hung off later"** — do not discover after the Solidity is written that a field is hardcoded. Do not stuff unclear things into Soul; once a thing is clear, prefer a satellite module keyed by `lifeId` / `tokenId`. Full discipline in §3. Product cross-references: [PRODUCT-LATEST.md](PRODUCT-LATEST.md) §0.3 items 6–7, §19.2, §21. Swarm promotion, evaluation, claims, and experience state all hang off later and must never be written into ImmortalSoul.

## 1. Objects

| Object                    | On-chain                                                                                                                                                                                   | Off-chain                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LifeId                    | `keccak256(abi.encode(ifs.life/1, chainId, collection, tokenId))`                                                                                                                          | The raw triple is published alongside                                                                                                                                   |
| Genome / birthHash        | `keccak256(abi.encode(ifs.fly-birth/1, lifeId, genesisRoot, seed))`. Excludes the decoder. Each fly also records a 2-byte `lookVersion`                                                    | `iff.genome/1` adapter. Gen0: `mutateRoot=0`, `generation=0`, `inheritBias=false`. Descendants: `generation≥1`, `inheritBias=true`, `parentSouls` = both parent lifeIds |
| Given name                | `ImmortalSoul.givenName(id)`, written at hatch, owner-changeable                                                                                                                           | The true name is still revealed locally from the lifeId bytes by a word table, never on-chain                                                                           |
| Descent                   | `parentA` / `parentB` / `generation` pinned on Soul                                                                                                                                        | Frontend lineage; child lists can also be rebuilt from `DescentRecorded`                                                                                                |
| Species / Model / Genesis | Constructor-immutable: `genesisRoot`, `speciesHash`, `modelHash`, `birthChainId`. `genesisURI` / `contractURI` are replaceable pointers                                                    | `public/life-genesis/current.json` and the data pack                                                                                                                    |
| Looks / tokenURI          | Replaceable `SoulRenderer`: `proposeRenderer` → 48h → `activateRenderer`; during the time-lock `challengeRenderer(seed)` can kill a proposal. `lockRenderer()` closes the door permanently | Colony-page chibi reads the same source; OpenSea filters on `attributes`. Rarity leaderboards are an off-chain census and never enter tokenURI                          |
| Session control           | `authorizedRunner`, `controlEpoch`                                                                                                                                                         | Runner processes; NFT operator ≠ brain control                                                                                                                          |
| Stimuli / checkpoints     | LifeJournal events and head                                                                                                                                                                | Full neural state and archives                                                                                                                                          |
| Breeding rules            | SoulKin (replaceable module)                                                                                                                                                               | Request/complete UI                                                                                                                                                     |

The repo decoder is `phenotype-loci/3`; `DECODER_HASH` is only a catalog marker and does not enter `genomeHash`. SIM archives keep using canonical SHA-256; the two are not interchangeable. The mainnet LIVE collection is `/3`. The RETIRED `0x500D…293F` stays `/2`.

## 2. Hatching

```text
requestHatch(givenName)              Occupies 1 Gen0 pending slot; open to everyone when no gate is attached
requestHatch(givenName, bytes proof) If MODULE_HATCH_GATE is attached, the gate can only reject
wait ≥ 3 blocks
hatch(id)                           Anyone may complete it; seed comes from the birth domain + that block's blockhash; NFT and name mint to the original recipient
expireHatch(id)                     Slot released after entropyBlock+256
setGivenName(id, name)              Current owner only. 1–64 bytes; no control characters, quotes, backslashes
```

- No protocol mint fee. `requestHatch` with attached BNB reverts. Holding IFS is not required. Fees exist only in Kin.
- Each address can successfully hatch at most 1 Gen0 in its lifetime (`hatched[recipient]`). Selling does not unlock another hatch. Expired uncompleted requests do not consume the slot. Descendants received or bred do not consume the slot.
- Not VRF. Multiple wallets, abandoned requests, and block producers can all influence the seed. Public messaging says «you cannot self-select a rare skin», not «sybil-proof».
- `MAX_GEN0 = 1024` is this collection's Gen0 cap and cannot change. `maxSupply` starts at `1_048_576`; the curator can only raise it, never lower it. Only successful births count into `totalSupply`.
- Transfer or `setRunner` both `++controlEpoch` and clear the old authorization. The field is named `authorizedRunner`, not `runner`, to avoid colliding with ethers `Contract.runner`.
- ERC-2981 interface is kept, default 0%, hard cap 5% (500 bps). ERC-4906 fires on rename / renderer swap.

## 3. Read first: extensibility (before designing any on-chain feature)

The product will change; mainnet Soul must not be sacrificed along the way. Do not use UUPS / transparent proxies to alter the identity core: collectors hold the identity of this fly, not a voucher whose rules can be rewritten. And never "just redeploy another ImmortalSoul next time" — a mainnet redeploy is contract abandonment.

### 3.1 The boundary

| Pinned forever (in ImmortalSoul)                                   | Hang off / replaceable (module or satellite)                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| lifeId, seed, `genomeHash` (excludes decoder), parents, generation | Breeding rules (SoulKin, incl. 24h parent cooldown)                   |
| Gen0 = 1024 and «one address, one lifetime hatch»                  | Journal address pointer                                               |
| Not burnable                                                       | Birth hook `MODULE_HOOK` (`afterBorn{gas: 200000}`)                   |
| Name storage and charset                                           | Hatch gate `MODULE_HATCH_GATE` (reject-only)                          |
| ticker `IFSOUL`, no proxy / no UUPS                                | Market, archives, social, achievements, display, economy attachments… |

While `totalSupply == 0`, the `curator` may call `setModule` / `proposeRenderer` / `setRoyalty` / `setCurator` instantly (deployment period). Once any soul is born: setting a non-zero module goes through a 48h time-lock and only takes effect after `activateModule`; setting it to zero is immediate (circuit breaker). The renderer has the same 48h; during the time-lock anyone may `challengeRenderer(seed)` — the new `loci(seed)` must preserve the old prefix or the proposal is void. After `lockRenderer()` no further swap is possible. `setCurator(0)` relinquishes immediately. The curator cannot: hatch more Gen0, alter existing genomes, burn souls, or lower `maxSupply`. After relinquishing, the module table freezes.

`SoulRenderer` is not a `modules[]` slot: it is a way of reading looks. A new renderer reads names/generations/satellites itself via `tokenURI(soul, id)`; the Soul side try/catches and falls back to a minimal JSON on failure.

### 3.2 Pre-flight checklist for new on-chain features (must pass)

Before writing contracts for any «future on-chain» feature, answer first:

1. **Is this an identity fact or product gameplay?** Identity facts (who, which fly, which seed, which parents, which generation) belong in Soul. Gameplay (how to breed, how to ledger, how to socialize, how to price) belongs in satellites.
2. **Can it launch after mainnet without redeploying Soul?** If not → the design fails. Change it to: new contract + `lifeId`/`tokenId` key + optional `modules[id]`.
3. **Will the rules change later?** If yes → rules go in a replaceable module, not in Soul's function bodies. Soul keeps only immutable facts or «module-writable once» slots.
4. **Can a failure stall hatching / transfer?** The birth hook must `try/catch`. If a satellite dies, existing souls must still be held, transferred, and readable via tokenURI.
5. **How do the frontend and deployment manifests discover it?** Write `public/contract/life/*.json` and the `modules` slot; never hardcode the next feature's address constant into Soul.
6. **Testnet retirement ≠ mainnet retirement.** Testnet may mark `STALE` and move addresses. Once a mainnet manifest is `LIVE`, «deploy another ImmortalSoul» is forbidden as an iteration mechanism.

Default practice: **deploy a separate satellite contract keyed by lifeId or tokenId**, then have the curator write its address into `modules[id]`. Do not redeploy the NFT to add one field. Do not heap reserved fields into Soul because «we haven't figured it out yet» — if it is unclear, keep it off-chain, local, or in event logs.

Known slots:

```text
MODULE_KIN        = keccak256("ifs.module.kin/1")
MODULE_JOURNAL    = keccak256("ifs.module.journal/1")
MODULE_HOOK       = keccak256("ifs.module.hook/1")
MODULE_HATCH_GATE = keccak256("ifs.module.hatch-gate/1")
```

Future slots use `keccak256("ifs.module.<name>/1")`; never reuse an old id for different semantics. `MODULE_HOOK` calls `afterBorn(...)` in a `try/catch` after birth. A failing hook never stalls hatching.

## 4. Lineage / breeding

Parents and generation live on Soul, so swapping SoulKin never loses existing bloodlines. SoulKin only decides «how the next one can be born».

```text
requestBreed(parentA, parentB)  Caller must hold both parents; entropyBlock = now+2; each parent has a default 24h cooldown (Kin-tunable, capped at 7 days)
breed(id)                      Anyone may complete it; seed = keccak(ifs.descent/1, soul, parents, parentSeeds, id, entropy)
expireBreed(id)                Released after entropyBlock+256
```

- Descendants go through `mintDescendant`, callable only by `modules[MODULE_KIN]`.
- `generation = max(parentA, parentB) + 1`. Looks remain a pure readout of the child seed by the current renderer.
- «One address, one lifetime hatch» constrains Gen0 only. Descendants may be held in multiples.
- The cooldown lives in Kin, not Soul. No IFS-lock acceleration, no «hold more, mine more».
- Today's breeding rules can be swapped for a new SoulKin later; existing children's parent fields stay untouched.
- Only the next Kin charges fees, tries to buy `$IFS`, and escrows failed buys. Spec: [SOULKIN-FEE.md](SOULKIN-FEE.md). Fees, routing, and failure fallbacks must never be written into ImmortalSoul. The mainnet LIVE `MODULE_KIN` is the free `SoulKinCross` `0x838A30868Bb82D4dABe70d586e87aeC948CC5825` (24h parent cooldown).

### 4.1 Cross-rule Kin (SoulKinCross / SoulKinCrossFee, ifs.descent-cross/1)

The plain `keccak(ifs.descent/1, …)` fully scatters parent inputs — child looks are unrelated to the parents, equivalent to rerolling against the published rate table. The cross-rule Kin fixes this, with semantics matching market peers:

```text
sources(entropy, soul, requestId)  Per locus: byte<5 → mutation (≈1.95%≈2%, rerolled against the published rate table);
                                   otherwise the top bit → parent A or B (roughly half each)
candidate stream cand(n) = uint32(keccak(ifs.descent-grind/1, stream, n))
grind (off-chain, free)            Search from n=0 for an «all-hit candidate»: across the 10 crossover loci every non-mutated locus matches its source
breed(id, n)                      Anyone may complete it; the contract decodes once to verify the all-hit, else CrossMisfit
```

- **Off-chain grind, on-chain verify.** The all-hit candidate probability is about 1e-4 to 1e-6, so on-chain grinding is infeasible; the finisher (the frontend by default) scans the candidate stream off-chain (typically tens of thousands of tries, tens of milliseconds to seconds) and submits the index n; the contract verifies with one `phenotype-loci/3`-equivalent decode. Verification costs ≈30k gas (local anvil measurement 2026-09: total breed gas ≈330k, same order as the old SoulKin's 300k). Sex rerolls every generation and does not enter the crossover.
- **No pre-mint sniping.** Entropy is the future block hash of the completion block, unknowable at request time; the requester cannot pre-grind.
- **Multiple legal candidates under the same entropy.** Who completes and which n gets submitted is the finisher's choice; all all-hit candidates agree on every non-mutated locus and differ only at mutated loci (≈2% of loci). The frontend submits the smallest n by default (the canonical candidate). After birth the seed is fixed; looks remain a pure readout of the seed.
- **Soul and SoulRenderer stay untouched**; every already-born fly (including old keccak descendants) is unaffected; enabling/rolling back is a module swap.
- The colony page `/colony.html` breed predictor uses the same rules to show per-locus odds (each parent ≈half + 2% mutation reroll) and real ground-out sample offspring. Deploy: `npm run life:check:kin-cross` → `life:deploy:kin-cross:testnet [-- --bind]`.

## 5. Journal

`submitStimulus(id, epoch, kind, intensity, expectedInput)`

- `kind`: 0 food / 1 threat / 2 light; `intensity` 0–1000
- `expectedInput` must equal the current `inputCount` (starting from 0)
- The chain does **not** verify neural computation, nor guarantee the URI is downloadable
- The habitat should render the latest stimulus as a locally visible reaction (feed / gust / lunge), not pretend the chain is running a brain

`checkpoint(...)` requires `previous == head.checkpointRoot` and `throughInput == inputCount`. Pages must separate: Chain recorded / Replay checked. A second Journal may be deployed privately; the authoritative Journal is whatever the deployment manifest names.

Replay: `src/life/replay.mjs`, 16 steps per stimulus. `stateRoot` is the canonical SHA-256 of state; the Journal's `checkpointRoot` is EVM keccak. Verification tooling compares them separately.

## 6. Genesis package

`scripts/build-life-genesis.mjs` generates `public/life-genesis/current.json` from the local `public/data/malecns-full/`. The current decoder field is `phenotype-loci/3` (aligned with the repo Soul's `DECODER_HASH`). Status is still `LOCAL_PACKAGE_UNPUBLISHED`. Production builds exclude the big graph directory; uploading just the manifest must **not** be presented as «the brain is public». Once published it must be: content-addressed, downloadable on an independent machine, and hash-matching the Soul constructor arguments. Without a local `graph.bin`, the script reuses the existing species commitment and only recomputes runtime / decoder / genesisRoot.

## 7. Frontend and deployment

- Wallet module: `src/life/` reads `public/contract/life/`; do not reuse the old `src/chain.mjs` (still the 16-node prototype).
- Scripts: `npm run life:compile`, `npm run life:test`, `npm run life:deploy:testnet`, `npm run life:hatch:testnet`, `npm run life:check:mainnet`, `npm run life:check:kin-fee`, `npm run life:check:market`. Mainnet broadcasts must explicitly carry `--i-am-deploying-bsc-mainnet`. Replacing mainnet Kin must additionally carry `--i-am-replacing-mainnet-kin`. Never deploy `ImmortalFly.sol` to chainId 56. The market satellite must not `setModule`.
- Frontend: `/field.html` neuron field, `/habitat.html` habitat, `/market.html` official ask book. When undeployed, do not fabricate NFTs and do not write «already on OpenSea».
- Mainnet manifests: `public/contract/life/ImmortalSoul.deployment.json` (`status=LIVE`, Soul `0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD`). Market satellite: `SoulMarket.deployment.json` (`status=LIVE`, `0x42E10Dc1e1D90e5F10580a8967E80F38B3e03e5D`, not in `modules[]`). Old `/2` collection: `ImmortalSoul.retired.json`. Testnet keeps `ImmortalSoul.testnet.json` / `SoulMarket.testnet.json`. BscScan / Sourcify source verification and the production site are still pending.

## 8. Phenotype and market

Spec source: `src/brain/flyswarm/phenotype-loci.mjs`. Public table: `public/life-phenotype/current.json` (`npm run life:phenotype`).

- The 96 chips still expand from seed / mutateRoot. Each locus folds and rolls dice against the 10000-bps weighted table; no more averaging over big chip spans.
- Traits: Body, Saturation, Light, Eyes, Size, Stripes (0–4), Mark (none / bar / spots), Wings (clear / apical / banded / pictured), Wing shape (typical / miniature / curly / vestigial), Veins (complete / incomplete / extra), Sex (female / male). Bone-white locks Light=light.
- Off-chain diversity axis: chips 56–63 read out `eyePair` (both eyes same / left-right heterochromia). This is unused entropy from the same seed and does **not** enter `tokenURI`.
- `tokenURI.attributes` carries only the market fields above + Generation (`Gen0` / `Gen1` / …). Rarity tiers, ranks, and prices are forbidden. `name` / `givenName` come from on-chain naming.
- Pages may show occurrence rates and «expect about N in 1024». That is not a floor price.
- The listing key is `chainId + collection + tokenId + lifeId`. Same face is not the same fly.
- Transfer clears `authorizedRunner`. A market sale does not hand over the brain session.
- The official ask book is a standalone satellite, not in `modules[]`; spec in [SOUL-MARKET.md](SOUL-MARKET.md). Soul writes no royalties and no floor price.
- `phenotype-loci/1` is abandoned. `/2` is the RETIRED team test collection `0x500D…293F`. The LIVE identity core is `/3`. A new collection is only forced by changing the lifeId formula or by making flies burnable.
