# BSC testnet loop (16-node prototype)

**Scope:** this document only describes read/write against the legacy prototype `ImmortalFly.sol` (`iff-neural-16-v1`) on **BSC Testnet chainId 97**. It is not mainnet Soul, and it is not `$IFS`.

**Mainnet forbidden:** do not deploy this contract to BSC mainnet (56). The mainnet identity is `contracts/life/ImmortalSoul.sol`. Testnet souls use:

```sh
npm run life:check:testnet
# IFF_DEPLOY_KEY=0x… npm run life:deploy:testnet
# IFF_DEPLOY_KEY=0x… npm run life:hatch:testnet
```

Deployment manifest: `public/contract/life/ImmortalSoul.testnet.json`. The production habitat reads the mainnet `ImmortalSoul.deployment.json` by default; to practice testnet breeding locally add `?net=test`. Old `/1` collections whose `status` starts with `STALE` are not treated as live contracts by the frontend. The current decoder is `phenotype-loci/2`. 2026-09-16 testnet identity check: `ImmortalSoul` `0x3487A2802AF82F12Bb7a3dd40B262394f4819A5a`. On 2026-09-17 `MODULE_KIN` was replaced with `SoulKinFee` `0xfBC663EF50fF104277D05c520994E25a2391414f` (price adjustable, adapter not wired). The old free Kin `0xCA916D8632805FDC204eadF381f5243296f8A4d6` is kept as STALE. The old `0x220e…7322` is abandoned. The legacy altar still runs on `ImmortalFly.sol`.

Current target: to keep practicing on the legacy altar, deploy the prototype to testnet and sign with the local altar. Current state: `public/contract/ImmortalFly.deployment.json` is `UNDEPLOYED`. In production `/altar` redirects to the Blueprint page; local `npm run dev` can still open `altar.html`. The MaleCNS connectome, maze scores, the Flap Vault UI, and mainnet Soul mint do not go through this contract.

## Two frontends

| Surface                          | What it does today                                                                               | What it will do                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Local altar (Vite: `altar.html`) | Minimal self-deployed on-chain altar: switch testnet, mint, train, sleep, rebirth, read `getFly` | Keep growing into a full lab and release notes                       |
| Flap page                        | Not submitted to this site                                                                       | Ships a separate Vault / Artifact four-file pack embedded at flap.sh |

The connectome lab `brain.html` stays offline and never sends transactions.

## Deploying the contract (you run this locally)

The account needs testnet tBNB. Private keys live only in environment variables — never paste them into chat or commit them to git.

```sh
# Optional: verify RPC and compilation first
npm run contracts:check:testnet

export IFF_DEPLOY_KEY=0xyour-testnet-key
# Optional: export BSC_TESTNET_RPC=https://bsc-testnet-rpc.publicnode.com
npm run contracts:deploy:testnet
```

On success this overwrites `public/contract/ImmortalFly.deployment.json` (address, `fromBlock`, explorer links). The frontend finds the contract through this file; the compile script only updates the ABI and never clears the address.

You can also override the address with `VITE_IFF_ADDRESS=0x…` and restart `npm run dev`.

## Minimal flow on this site

1. `npm run dev -- --port 4173`
2. Install a wallet in the browser and click «Sign»
3. Approve the switch to BSC Testnet
4. If the address has no token yet, mint on the altar (`mint(seed)`, seed from the current local DNA; 0 falls back to 3700127)
5. Train / sleep / rebirth pop signatures; on success the page overwrites its display with `getFly`
6. On-chain mode turns off the local per-second `tick` so state does not fork from the contract
7. Mazes and local seal/import stay local experiments; they never become contract state

The browser must reach a testnet RPC. When public nodes rate-limit, provide your own `BSC_TESTNET_RPC`.

## Not included (and this prototype should not add them)

- Mainnet Soul mint (new contract, see PRODUCT-LATEST §19)
- Paid mint, on-chain breeding, on-chain achievements
- Custom Flap Vault UI
- Writing the 160k MaleCNS neurons into a contract
- Burn execution, buyback execution, vault address announcement (unrelated to this prototype)
