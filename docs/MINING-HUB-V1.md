# MiningHub v1：私有轨卫星接口

日期：2026-09-18。状态：**测试网卫星已重部** `0xdb80def1828236A5af09965F46c6BEE63ccc1f4e`（对着既有 Soul / Journal / MockIFSTax；含 validUntil、日限额、错段撤销）。旧地址 `0x1dAd6d5D9C407553814888917Ff45F0d1Fee55A1` 与更早的 `0xF0e07ff3dF12319808f977A0D81b4eF86BB71825` 为 **STALE**。本地 Anvil 门、公开恢复包、完整重放对抽样对照已过。主网未部署。不构成挖矿上线、收益或智能宣称。对照 [MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md](MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md)、[LIFE-PROTOCOL.md](LIFE-PROTOCOL.md) §3.2、[SOUL-MARKET.md](SOUL-MARKET.md) 的卫星纪律。编码 `src/life/mining-archive.mjs`。恢复 `src/life/restore-life.mjs`。对照 `src/life/verify-compare.mjs`。本地门 `npm run life:test:hub`、`node --test tests/restore-life.test.mjs`、`npm run segment:compare`。运营口径 [MINING-OPS.md](MINING-OPS.md)。

v1 只做私有轨：主人给自己的 Soul 加 IFS，绑定已登记 Runner，领段 → 承诺 → 抽种 → 结算。公共轨、座位锁、History NFT、Keeper 取回挑战不进本字节码。

发现路径：测试网 `public/contract/life/MiningHub.testnet.json`；主网 `public/contract/life/MiningHub.deployment.json` 仍是 `UNDEPLOYED`。不进 `modules[]`。

## 1. 先过 LIFE-PROTOCOL §3.2

| 问                        | 答                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 身份还是玩法？            | 玩法。lifeId、基因组、主人仍在 Soul。培养基（链上 `Tank`）、押金、工价、段、争议在卫星。                                                               |
| 能否不重部 Soul？         | 能。只读 `ownerOf` / `lifeId` / `canControl` / `controlEpoch` / `authorizedRunner`。私有轨承诺仍走已部署 `LifeJournal.checkpoint`。 |
| 规则以后会不会改？        | 会。整只卫星再部署替换。无 UUPS，无透明代理。                                                                                       |
| 失败能否卡住孵化 / 转移？ | 不能。不是 `MODULE_HOOK`，不进 `modules[]`。Hub 暂停时 NFT 仍能转；日记仍能由 `canControl` 写。                                     |
| 前端怎么发现？            | 部署清单。Soul 构造函数和常量里不准出现 MiningHub 地址。                                                                            |
| 测试网作废 ≠ 主网可作废   | 测试网可标 `STALE`。主网只换卫星，不换 Soul / Journal。                                                                             |

禁止：改 ImmortalSoul；把工价写进 tokenURI；部署 `ImmortalFly.sol` 到 chainId 56；用 D 账面、押金或用户本金冒充预算。

## 2. 为什么不进 `modules[]`

与 SoulMarket 相同：Hub 不 `mintDescendant`，不需要 Soul 特权。写进 `modules[]` 会被 `setCurator(0)` 冻死，以后不能换规则。Journal 已经在 `MODULE_JOURNAL`；Hub 只要求 Runner 同时是 `authorizedRunner`，才能把 `archiveHash` 写进 Journal。

## 3. v1 范围

做：Tank（ownerFuel + giftFuel）、Bond、运营方白名单（链上 `allowlisted`）、绑定报价与步数/支出上限、领段租约、工作键、承诺、锁抽种、开叶哈希、挑战窗结束后结算、超时作废、离线判定入账、争议超时双输、罚没进蜂巢、WorkLedger 只追加。

不做：Budget / 公共轨、Seat、浏览器 Checker 发 IFS、链上执行 `step()`。

主网 chainId 56 构造约束：`ifs == 0x65b66BB4Adb0e244E19d290b6AAa0381B81A7777`，`hive == 0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467`。hive 不得等于 ops `0x055bB2aF42B832A55F3D708c92824C491dE05427`。

## 4. 编码

### 4.1 链上承诺与 Journal

Journal 的 `stateRoot` 仍是状态的 canonical SHA-256（32 字节，LIFE-PROTOCOL §5）。不要改成 keccak。

```text
checkpointPack = keccak256(abi.encode(checkpointRoots))
archiveHash    = keccak256(abi.encode(
                   "ifs.segment-archive/1",
                   block.chainid, hub, tokenId, segmentId,
                   steps, checkpointEvery, leafEvery,
                   startRoot, finalRoot, trajectoryRoot, checkpointPack
                 ))
```

`commitPrivate` 必须核对：调用者 `soul.canControl(tokenId, msg.sender)`、`controlEpoch` 未过期、Journal 最新一条 `checkpointRoot` 用上式重算后相等（`stateRoot` 取 `c.finalRoot`）。合约不验证神经计算。入参是 `(id, c, epoch, previous, uri)`，不是日记序号；序号从 `journal.heads` 现读。

### 4.2 抽种

```text
seed = keccak256(abi.encode("iff.probe/1", blockhash(commitBlock + 2), segmentId))
```

`commitPrivate` 记下 `commitBlock = block.number`。之后任何人可 `lockSeed(segmentId)`：要求 `block.number >= commitBlock + 3`（否则 `blockhash(commitBlock + 2)` 仍是当前块或未来块，为零）。且 `commitBlock + 2` 仍在 256 窗口内。窗口错过 → `voidExpired`（退预留、不罚）。种子只决定抽哪几个叶，不决定钱。

分层 k=3、L=10、n=1000 的位置计算与 `segment.mjs` `selectProbes` 相同；合约存 `seed`，不存位置数组。

### 4.3 IFS 入账

IFS 是 1% 税币。所有入站必须按余额差入账：

```text
function _pull(from, amount) returns (received)
  before = IFS.balanceOf(this)
  IFS.transferFrom(from, this, amount)
  received = IFS.balanceOf(this) - before
  require received > 0
```

培养基 / 押金 / 工价全部用 `received`，不用参数 `amount`。出站 `transfer` 的税记入「税损」事件，不从别的账补。

## 5. 存储（概念）

```text
operator / arbiter / allowlisted
paused              停新领段与新添料；已开段仍可承诺、结算、作废
maxFeePerSegment / minBond / bondMultiple / challengeWindow / challengeBond

Tank[tokenId]:          // 对用户称培养基 / Vial；标识不改
  owner, lifeId, ownerFuel, giftFuel, reserved
  runner, fee, steps, spendCap, spent, validUntil

Operator[addr]:
  roles bitmask, bond, exposure, status {NONE, ACTIVE, EXITING, EXITED}
  unlockAt, record {accepted, disputed, lost}

Segment[id]:
  tokenId, lifeId, runner, funder, steps, fee, fromOwner, fromGift
  exposure, startRoot, status, workKey, inputFrom, inputTo, inputRoot
  commitment { steps, checkpointEvery, leafEvery, startRoot, finalRoot,
               trajectoryRoot, checkpointPack, archiveHash, journalSequence }
  commitBlock, seed, openingHash, challengeUntil
  paid, dispute { challenger, snapBond, snapWindow, verdicts }

activeLease[tokenId]  当前 OPEN/COMMITTED/CHALLENGED 段
workClaimed[key]      keccak(tokenId, startRoot, steps, inputFrom, inputTo, inputRoot)
lastFinalRoot[tokenId] 最近一次 SETTLED 的终态
earnings[runner]      窗关后可提工价
refunds[funder]       转移未预留主人料 + 作废/判负的主人出资
```

`tokenId` 是链上主键；`lifeId` 每次写培养基时再读 `soul.lifeId`，对不上回退。Soul 转移不回调 Hub：任何会碰培养基的函数先 `_syncOwner(tokenId)`——若 `ownerOf != tank.owner`，把未预留的 `ownerFuel` 记到 `refunds[oldOwner]`，清绑定，留下 `giftFuel` 与 `reserved`。在途段作废时 `fromOwner` 进 `refunds[funder]`，不是新主人的 `ownerFuel`。

`openSegment` 的 `startRoot` 必须等于 `lastFinalRoot`（parent）。日记刺激按序合并后，承诺里的 `startRoot` 可以是 primed 根，不必再等于 Tank 上的 parent。谱系续跑核 `parentRoot`。`revokeAcceptance` 沿 `prevSettled` 走后代，释放 `workClaimed`，把头滚回 parent；不改 Journal。

主网日限额默认 `maxUserDaily = 100 ether`、`maxProtocolDaily = 1000 ether`。测试网 / Anvil 为 0（不限额）。

## 6. 函数

权限：`O` 主人（`ownerOf`），`R` 绑定的 Runner，`P` 已登记运营方，`A` Hub operator，`*` 任何人。

| 函数                                                                       | 谁           | 做什么                                    | 失败码                                                |
| -------------------------------------------------------------------------- | ------------ | ----------------------------------------- | ----------------------------------------------------- |
| `constructor(soul, journal, ifs, hive)`                                    | —            | 钉死四地址；chainId 56 核 IFS / hive      | `BadConfig`                                           |
| `setOperator(addr)`                                                        | A            | 换钥匙                                    | `Unauthorized`                                        |
| `setPaused(bool)`                                                          | A            | 停新添料 / 领段                           | `Unauthorized`                                        |
| `setLimits(maxFee, minBond, bondMultiple, challengeWindow, challengeBond)` | A            | 硬顶；已开段不追溯                        | `Unauthorized` `LimitCap`                             |
| `setSpendLimits(userDaily, protocolDaily)`                                     | A            | 日限额；0 = 不限额；已花不追溯            | `Unauthorized`                                        |
| `setAllowlisted(who, ok)`                                                      | A            | 运营方准入                                                    | `Unauthorized`                                        |
| `setArbiter(addr)`                                                             | A            | 可选；超时后可写入终局。未公布前应保持 0                      | `Unauthorized`                                        |
| `registerOperator(roles, amount)`                                              | 白名单       | `transferFrom` 后按余额差入账；`received ≥ minBond`；一地址一笔 | `NotAllowlisted` `BondLow` `AlreadyRegistered` `PausedHub` |
| `topUpBond(amount)`                                                            | P            | 追加押金                                  | `NotActive`                                       |
| `beginExit()`                                                                  | P            | 进入冷却                                  | `NotActive`                                       |
| `withdrawBond()`                                                               | P            | 冷却满且 exposure=0                       | `Cooldown` `Exposed` `NotExiting`                 |
| `refuel(tokenId, amount)`                                                      | O            | ownerFuel += received                     | `PausedHub` `NotOwner` `ZeroIn`                   |
| `giftFuel(tokenId, amount)`                                                    | \*           | giftFuel += received；不可退              | `PausedHub` `ZeroIn`                              |
| `drainOwnerFuel(tokenId, amount)`                                              | O            | 退未预留 ownerFuel                        | `Insufficient`                                    |
| `claimRefund()`                                                                | \*           | 取转移后的主人料退款                                | `Insufficient`                                    |
| `bindRunner(tokenId, runner, fee, steps, spendCap, validUntil)`                            | O            | 授权步数、支出上限与有效期；runner 必须 ACTIVE+RUNNER+白名单 | `PausedHub` `FeeCap` `NotActive` `WrongSteps` `CapExceeded` `OrderExpired` |
| `openSegment(id, tokenId, steps, startRoot)`                                   | R            | 预留 fee，锁租约与工作键，冻结 Journal 输入区间      | `Unbound` `TankEmpty` `BondLow` `DupSegment` `LeaseHeld` `WorkTaken` `NeedContinuity` `PausedHub` |
| `commitPrivate(id, c, epoch, previous, uri)`                                   | R            | 核 Journal checkpointRoot 与冻结输入；开挑战窗        | `BadStatus` `BadArchive` `StaleEpoch`             |
| `lockSeed(id)`                                                                 | \*           | 写入 blockhash(commit+2)；需当前块 ≥ commit+3         | `TooEarly` `SeedExpired`                      |
| `recordOpening(id, openingHash)`                                               | R            | 只存哈希，开口在链下；结算前置                        | `NoSeed` `BadStatus`                              |
| `settlePrivate(id)`                                                            | R            | 有 seed、有 opening、窗已关、未挑战才记账；同时放曝险 | `WindowOpen` `NoOpening` `NoSeed` `AlreadyPaid`   |
| `closeChallenge(id)`                                                           | \*           | 窗关后；未结算则按原路退预留给出资人                  | `WindowOpen` `BadStatus`                          |
| `voidSegment(id)`                                                              | R 或 O       | 仅 OPEN：退预留、放曝险                   | `BadStatus`                                       |
| `voidExpired(id)`                                                              | R 或 O       | COMMITTED 且抽种块已离开 256 窗：退预留、不罚 | `TooEarly` `BadStatus`                        |
| `openDispute(id)`                                                              | P≠runner     | 从已有押金锁 `challengeBond` 曝险；标 CHALLENGED | `WindowClosed` `SelfDispute` `BondLow`      |
| `submitVerdict(id, verdict, recordHash)`                                       | 争议双方之一 | 提交离线 `iff.adjudication/1` 的哈希      | `NoDispute`                                       |
| `confirmVerdict(id)`                                                           | \*           | 双方哈希与 verdict 相同才入账（见 §7）    | `Mismatch` `TooEarly`                             |
| `timeoutDispute(id)`                                                           | \*           | 一方未交则未应诉方负；双方哈希不一致则双输 | `TooEarly`                                        |
| `resolveByArbiter(id, verdict)`                                                | arbiter      | 超时后写入终局；与 timeout 竞态以先上链为准 | `Unauthorized` `TooEarly`                       |
| `withdrawEarnings()`                                                           | P            | 提工价（运营方工资，不是协议收入）        | `Insufficient`                                    |
| `revokeAcceptance(id)`                                                         | A            | 错段沿谱系撤销验收、滚回头                | `Unauthorized` `RevokedLine`                      |
| `syncOwner(tokenId)`                                                           | \*           | 转移后退 ownerFuel                        | —                                                 |

只读：`tanks` `operators` `segments` `workOf(tokenId)` `previewSeed(id)` `archiveHashOf`。

## 7. 事件

```text
OperatorRegistered(addr, roles, bond)
BondChanged(addr, bond, exposure)
TankFueled(tokenId, lifeId, kind, received, ownerFuel, giftFuel)
OwnerRefunded(tokenId, oldOwner, amount)
RunnerBound(tokenId, runner, fee)
SegmentOpened(id, tokenId, runner, fee, steps, startRoot)
SegmentCommitted(id, trajectoryRoot, finalRoot, archiveHash, commitBlock)
SeedLocked(id, seed, sourceBlock)
OpeningRecorded(id, openingHash)
SegmentSettled(id, runner, paid)
SegmentVoided(id)
DisputeOpened(id, challenger)
VerdictSubmitted(id, by, verdict, recordHash)
SegmentSlashed(id, loser, amount, sink)          // sink 只能是 hive
TaxObserved(from, requested, received)           // 入站税损
Paused(bool)
OperatorChanged(next)
LimitsChanged(maxFee, minBond, bondMultiple, challengeWindow, challengeBond)
```

## 8. 错误码

`Unauthorized` `PausedHub` `BadConfig` `BadStatus` `BadArchive` `StaleEpoch` `NotOwner` `NotActive` `AlreadyRegistered` `BondLow` `Exposed` `Cooldown` `NotExiting` `ZeroIn` `Insufficient` `FeeCap` `LimitCap` `Unbound` `TankEmpty` `DupSegment` `TooEarly` `SeedExpired` `NoSeed` `AlreadyPaid` `WindowOpen` `WindowClosed` `SelfDispute` `NoDispute` `Mismatch` `WrongLife` `WrongJournal` `NotAllowlisted` `LeaseHeld` `WorkTaken` `NeedContinuity` `NoOpening` `WrongSteps` `CapExceeded` `OrderExpired` `DayCap` `RevokedLine`

事件名占用了 `Paused`，所以失败码是 `PausedHub`。

## 9. 争议（必须写进实现注释）

合约**不**跑 MaleCNS，也**不**在哈希不匹配时罚本金。

罚没只在：

1. 双方 `submitVerdict` / `confirmVerdict` 同一 `recordHash`，且 `verdict != RunnerWins`；或
2. 被 `openDispute` 后，一方超时未提交；或
3. 双方都提交但哈希不一致，`timeoutDispute` 记 `NEITHER`（双输）；或
4. 指定 `arbiter` 在同样超时之后写入终局。**v1 未公布仲裁人，默认 `arbiter = 0`，只走超时双输。**

`recordHash = keccak256(bytes(canonical(iff.adjudication/1)))` 的链下包必须公开。争议押金与时限在 `openDispute` 时快照，之后改 `setLimits` 不追溯。没有机械确认就不要在窗内自动罚。这是轨迹承诺与抽样复核，不是无信任证明。

## 10. 与 SIM 账本的对应

| SIM                    | 链上                                                  |
| ---------------------- | ----------------------------------------------------- |
| `refuel` OWNER/GIFT    | `refuel` / `giftFuel`                                 |
| `drainOwnerFuel`       | `drainOwnerFuel`                                      |
| `transferLife`         | `_syncOwner`                                          |
| `bindRunner`           | `bindRunner` + 主人另调 `soul.setRunner`              |
| `openSegment` PRIVATE  | `openSegment`                                         |
| `commitSegment`        | `commitPrivate`                                       |
| `recordProbe`          | 链下；链上只 `recordOpening`                          |
| `settlePrivate`        | `settlePrivate`（先 `lockSeed`）                      |
| `resolveDispute`       | `submitVerdict` + `confirmVerdict` / `timeoutDispute` |
| Budget / Seat / 公共轨 | v1 不出现                                             |

## 11. 实现顺序

1. ~~培养基 + 押金 + 绑定 + `_pull` 税差（Anvil + MockIFSTax 1%）~~ 已过
2. ~~领段 / 承诺 / Journal 对拍 / 锁种 / 结算 / 过窗~~ 已过
3. ~~转移退回主人料、重复 claim、暂停~~ 已过
4. ~~争议超时双输 / 可选 arbiter；快照 challengeBond 与窗口~~ 已过
5. ~~测试网重部卫星~~ 已过：现址 `0xdb80def1828236A5af09965F46c6BEE63ccc1f4e`。`0x1dAd6d5D9C407553814888917Ff45F0d1Fee55A1` 与 `0xF0e07ff3…71825` 为 STALE。未 `setModule`。`npm run life:wire:hub:testnet`。主网部署脚本默认拒绝。
6. ~~公开档案在另一台机器恢复生命~~ 本地门已过：`iff.life-restore/1`，`npm run life:restore` / `node --test tests/restore-life.test.mjs`。两个临时目录当作另一台机器；不需要原 Runner 的 `state-*.json`。不是真钱，也不是挖矿页。
7. ~~完整重放 vs 抽样对照~~ 本地门已过：`npm run segment:compare` → `reports/segment-verify-compare-v1.json`。circuit n=1000 L=10：全量约 0.9s / 1000 步；抽样 k=3 约 0.17s、复算 510 步；96/99 个中间叶抽不到。开口携带检查点状态，体积可以大于恢复包。链上不能跑 `step()`。
8. 主网另部卫星前：资金轨道审计 + 显式批准。Linux CI 须复现 Darwin 全量图 1000 步向量（`.github/workflows/segment-replay.yml`；绿在 `ci/malecns-full-replay`，须合进发布分支）。日限额、第二镜像、主网专用 Runner、Sourcify：见 [MINING-OPS.md](MINING-OPS.md)。前端 `/host.html`。

Anvil 门已覆盖评审复现的四条 P0。公开恢复包的本地门用两个临时目录模拟另一台机器：只有 `archive-*.json` 也能核完并续跑。测试网现地址见清单；旧卫星 STALE。主网未部署。对外不说挖矿已开。

## 12. 公开恢复包

Runner 的 `GET /archive/0x…` 现在给 `iff.life-restore/1`：起始态、终态、刺激、承诺、叶哈希。Merkle 树和开口用的完整轨迹留在 Runner 本机 `trajectory-*.json`，不随公开档案走。测试网现址 `https://runner-production-ea3b.up.railway.app`，对着卫星 `0xdb80def1828236A5af09965F46c6BEE63ccc1f4e`。另一台机器只需要这份档案 + 同一张图：

```text
npm run life:restore -- verify pack.json --graph public/data/malecns-circuit
npm run life:restore -- restore pack.json --out ./data/machine-b --graph public/data/malecns-circuit
npm run life:restore -- continue pack.json --out ./data/machine-b --graph public/data/malecns-circuit
```

独立 `runTrajectory` 必须对上 `startRoot` / `finalRoot` / 轨迹根。续跑下一段时 **parentRoot** 必须等于上一段 `finalRoot`（刺激 primed 根可以不同）。这不是资金结算，也不构成跨平台逐位验收。

2026-09-18：用线上全量图档案 `GET /archive/0x3d1181ba…`（token `#1`，`malecns-full`，n=1000）在空目录 `/tmp/iff-machine-b` 独立恢复并续跑。`startRoot` 接上一段终态，续跑后再写一段。不依赖原 Runner 的 `state-*.json`。

## 13. 完整重放 vs 抽样

同模型、同输入、同机器的对照在 `reports/segment-verify-compare-v1.json`（`npm run segment:compare`）。circuit、n=1000、L=10、k=3：

- 全量重放约 0.9s，覆盖 1000 步，能抓住未抽中的中间叶。
- 抽样约 0.17s，实际重放约 510 步（开口从上一检查点跑到抽中叶），96 个中间叶抽不到。
- 恢复包约 194KB；带 Merkle 树的本地轨迹约 933KB；k=3 开口约 260KB——开口里带着检查点状态，体积可以大于恢复包。
- 链上不跑 `step()`。付款路径只记抽样开口哈希。

这解释了为什么公开档案走恢复包、开口轨迹留本机：要在另一台机器续跑，必须有终态；只要验收一段承诺，抽样更快，但不是完整经历。公开包另写 `IFF_MIRROR_DIR`，默认保留 37 天。

## 14. 验收口径（书面）

v1 **没有**独立验收机。结算条件是：已锁种、已记 `openingHash`、挑战窗关闭、无人 `openDispute`。这叫「官方 Runner、无人挑战即付」。开口不能在链上复算 MaleCNS。未公布仲裁人时只走超时双输。Runner 工价不是协议收入。真 IFS 与运营步骤见 [MINING-OPS.md](MINING-OPS.md)。页面 `/host.html`，不要和首页托管网混淆。
