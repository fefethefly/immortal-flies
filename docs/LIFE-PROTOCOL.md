# Life protocol：编码与接口

文档目录：[README.md](README.md)。日期：2026-09-18。本文是 ImmortalSoul / LifeJournal / SoulKin / 创世包的编码规格，不替代 `PRODUCT-LATEST.md`。BSC 主网身份核（`phenotype-loci/3`）已部署：Soul `0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD`。旧团队测试集合 `0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F`（`/2`）已标 RETIRED，`#1` 仍在旧地址，不是同一只集合。收费 Kin 见 [SOULKIN-FEE.md](SOULKIN-FEE.md)；官方市场见 [SOUL-MARKET.md](SOUL-MARKET.md)。

## 特别注意：主网身份核不可废，产品却会继续变

产品在快速迭代，很多玩法现在想不清楚；同时要准备 BSC 主网给用户真正孵化。这两件事不能互相拆台。

**主网一旦部署 `ImmortalSoul`，这只集合的身份就不能再换合约「重来一遍」。** 重部等于废掉用户已经持有的 NFT、lifeId、基因组和族谱事实。测试网可以作废旧地址；主网不行。

因此：**凡是以后可能上链的功能，在架构设计的第一天就要按「身份核钉死、玩法后挂」来想**，不要等写完 Solidity 才发现字段写死了。没想清楚的东西不要塞进 Soul；想清楚了也优先做成卫星模块，用 `lifeId` / `tokenId` 当主键。完整纪律见 §3。对照产品正文：[PRODUCT-LATEST.md](PRODUCT-LATEST.md) §0.3 第 6–7 条、§19.2、§21。群体智慧的晋升、评测、claim 与经验状态一律后挂，禁止写入 ImmortalSoul。

## 1. 对象

| 对象 | 链上 | 链下 |
| --- | --- | --- |
| LifeId | `keccak256(abi.encode(ifs.life/1, chainId, collection, tokenId))` | 原始三元组一并公开 |
| Genome / birthHash | `keccak256(abi.encode(ifs.fly-birth/1, lifeId, genesisRoot, seed))`。不含 decoder。每只另记 2 字节 `lookVersion` | `iff.genome/1` 适配。Gen0：`mutateRoot=0`、`generation=0`、`inheritBias=false`。后代：`generation≥1`、`inheritBias=true`、`parentSouls` 为双亲 lifeId |
| Given name | `ImmortalSoul.givenName(id)`，孵化时写入，主人可改 | 真名仍由 lifeId 字节本地词表揭晓，不上链 |
| Descent | `parentA` / `parentB` / `generation` 钉在 Soul 上 | 前端族谱；孩子列表也可由 `DescentRecorded` 重建 |
| Species / Model / Genesis | 构造不可变：`genesisRoot`、`speciesHash`、`modelHash`、`birthChainId`。`genesisURI` / `contractURI` 可改指针 | `public/life-genesis/current.json` 与数据包 |
| Looks / tokenURI | 可替换 `SoulRenderer`：`proposeRenderer` → 48h → `activateRenderer`；时锁期内 `challengeRenderer(seed)` 可废提案。`lockRenderer()` 单向关门 | 群体页 chibi 同源读出；OpenSea 筛 `attributes`。稀有排行榜是链下普查，不进 tokenURI |
| Session 控制 | `authorizedRunner`、`controlEpoch` | 运行器进程；NFT operator ≠ 脑控制 |
| 刺激 / 检查点 | LifeJournal 事件与 head | 完整神经状态与档案 |
| 繁衍规则 | SoulKin（可替换模块） | 请求/完成 UI |

当前仓库解码器是 `phenotype-loci/3`，`DECODER_HASH` 只作目录标记，不进入 `genomeHash`。SIM 档案继续用 canonical SHA-256；两者不要互换。主网 LIVE 集合是 `/3`。RETIRED 的 `0x500D…293F` 仍是 `/2`。

## 2. 孵化

```text
requestHatch(givenName)              占用 1 个 Gen0 pending 名额；无门时对所有人开放
requestHatch(givenName, bytes proof) 若挂了 MODULE_HATCH_GATE，门只能拒绝
等待 ≥ 3 个区块
hatch(id)                           任何人可代完成；seed 来自 birth domain + 该块 blockhash；NFT 与名字铸给原 recipient
expireHatch(id)                     entropyBlock+256 之后释放名额
setGivenName(id, name)              仅当前主人。1–64 字节，禁控制符、引号、反斜杠
```

- 无协议铸造费。附带 BNB 的 `requestHatch` 回退。不要求持有 IFS。收费只在 Kin。
- 每个地址终身只能成功孵化 1 只 Gen0（`hatched[recipient]`）。卖掉不能再孵。过期未完成的请求不占这个名额。接收或繁衍得到的后代不占这个名额。
- 不是 VRF。多个钱包、放弃请求、出块者都能影响 seed。对外只说「不可自选稀有皮」，不说防女巫。
- `MAX_GEN0 = 1024` 是本集合 Gen0 上限，改不了。`maxSupply` 初值 `1_048_576`，curator 只能上调，不能下调。成功出生才计入 `totalSupply`。
- 转移或 `setRunner` 都会 `++controlEpoch` 并清空旧授权。`authorizedRunner` 不叫 `runner`，避免和 ethers Contract.runner 撞名。
- ERC-2981 接口保留，默认 0%，硬顶 5%（500 bps）。ERC-4906 在改名 / 换渲染器时发事件。

## 3. 特别注意：可扩展性（设计任何上链功能前先读）

产品会变，主网 Soul 不能跟着废。不要用 UUPS / 透明代理改身份核：收藏者拿到的是这只蝇的身份，不是一张可以改规则的券。也不要「下次再重部一个 ImmortalSoul」——主网重部就是废约。

### 3.1 分界

| 永不移动（钉在 ImmortalSoul） | 可以后挂 / 替换（模块或卫星） |
| --- | --- |
| lifeId、seed、`genomeHash`（不含 decoder）、父母、世代 | 繁衍规则（SoulKin，含 24h 亲本冷却） |
| Gen0 = 1024 与「一地址一生一孵」 | Journal 地址指针 |
| 不可烧毁 | 出生钩子 `MODULE_HOOK`（`afterBorn{gas: 200000}`） |
| 起名存储与字符集 | 孵化门 `MODULE_HATCH_GATE`（只能拒绝） |
| ticker `IFSOUL`、无代理 / 无 UUPS | 市场、档案、社交、成就、展示、经济附件… |

`curator` 在 `totalSupply == 0` 时可即时 `setModule` / `proposeRenderer` / `setRoyalty` / `setCurator`（部署期）。一旦有灵魂出生：设非零模块走 48h 时锁，`activateModule` 后才生效；置零立即（止损）。渲染器同样 48h，时锁期内任何人可 `challengeRenderer(seed)`——新 `loci(seed)` 必须保留旧前缀，否则提案作废。`lockRenderer()` 之后不能再换。`setCurator(0)` 立即交出。curator 不能：再孵 Gen0、改已有基因组、烧掉灵魂、下调 `maxSupply`。交出之后模块表冻住。

`SoulRenderer` 不是 `modules[]` 槽：它是长相读法。新渲染器通过 `tokenURI(soul, id)` 自己读名字/世代/卫星；Soul 端 try/catch，失败回退最小 JSON。

### 3.2 新上链功能开工清单（必须先过）

设计或实现任何「以后要上链」的功能时，先回答，再写合约：

1. **这是身份事实，还是产品玩法？** 身份事实（谁、哪只、哪颗种子、哪对父母、哪一代）才进 Soul。玩法（怎么繁衍、怎么记账、怎么社交、怎么定价）进卫星。
2. **主网部署后还能不能不重部 Soul 就上线？** 不能 → 方案不成立。改成：新合约 + `lifeId`/`tokenId` 主键 + 可选 `modules[id]`。
3. **规则以后会不会改？** 会 → 规则放可替换模块，不放 Soul 函数体。Soul 只留不可变事实或「仅模块可写一次」的槽。
4. **失败能不能卡住孵化 / 转移？** 出生钩子必须 `try/catch`。卫星挂了，已有灵魂仍能持有、转移、读 tokenURI。
5. **前端和部署清单怎么发现它？** 写 `public/contract/life/*.json` 与 `modules` 槽，不要在 Soul 里写死下一个功能的地址常量。
6. **测试网作废 ≠ 主网可作废。** 测试网可以标 `STALE` 换地址。主网清单一旦 `LIVE`，禁止用「再部署一个 ImmortalSoul」当迭代手段。

默认做法：**另内部署卫星合约，用 lifeId 或 tokenId 当主键**，再由 curator 把地址写进 `modules[id]`。不要为了加一个字段就重部 NFT。不要因为「现在还没想清楚」就把预留字段胡乱堆进 Soul——想不清楚就别上链，先本地或事件日志。

已知槽：

```text
MODULE_KIN        = keccak256("ifs.module.kin/1")
MODULE_JOURNAL    = keccak256("ifs.module.journal/1")
MODULE_HOOK       = keccak256("ifs.module.hook/1")
MODULE_HATCH_GATE = keccak256("ifs.module.hatch-gate/1")
```

以后新槽用 `keccak256("ifs.module.<name>/1")`，不要复用旧 id 装不同语义。`MODULE_HOOK` 在出生后 `try/catch` 调用 `afterBorn(...)`。钩子失败不会卡住孵化。

## 4. 族谱 / 繁衍

双亲与世代写在 Soul 上，所以换掉 SoulKin 也不会丢掉已有血脉。SoulKin 只负责「怎样才能生出下一只」。

```text
requestBreed(parentA, parentB)  调用者必须同时持有双亲；entropyBlock = now+2；每只亲本默认 24h 冷却（Kin 可调，顶 7 天）
breed(id)                      任何人可代完成；seed = keccak(ifs.descent/1, soul, parents, parentSeeds, id, entropy)
expireBreed(id)                entropyBlock+256 之后释放
```

- 后代走 `mintDescendant`，仅 `modules[MODULE_KIN]` 能调。
- `generation = max(parentA, parentB) + 1`。长相仍是当前渲染器对 child seed 的读出。
- 一地址一生一孵只限制 Gen0。后代可持有多只。
- 冷却在 Kin 里，不在 Soul。没有锁仓 IFS 加速，也没有「持有越多挖矿越多」。
- 现在的繁衍规则以后可以换新的 SoulKin；旧孩子的父母字段不动。
- 下一只 Kin 才收费、才尝试买 `$IFS`、才做买入失败托管。规格：[SOULKIN-FEE.md](SOULKIN-FEE.md)。收费、路由、失败兜底一律不准写进 ImmortalSoul。主网 LIVE 的 `MODULE_KIN` 是免费 `SoulKinCross` `0x838A30868Bb82D4dABe70d586e87aeC948CC5825`（24h 亲本冷却）。

### 4.1 交叉规则 Kin（SoulKinCross / SoulKinCrossFee，ifs.descent-cross/1）

上面的 `keccak(ifs.descent/1, …)` 把亲本输入完全打散——子代长相与亲本无关，等于按公布率表重抽。交叉规则 Kin 修正这一点，语义与市面竞品同型：

```text
sources(entropy, soul, requestId)  每个位点：字节<5 → 突变（≈1.95%≈2%，按公布率表重掷）；
                                   否则最高位 → 亲本 A 或 B（各约一半）
候选流 cand(n) = uint32(keccak(ifs.descent-grind/1, stream, n))
grind（链下，免费）              从 n=0 起找「全中候选」：10 个交叉位点里所有非突变位点都与来源一致
breed(id, n)                     任何人可代完成；合约一次解码验证全中，否则 CrossMisfit
```

- **链下研磨、链上验证**。全中候选的组合概率约 1e-4～1e-6，链上研磨不可行；完成者（默认是前端）在链下扫候选流（典型几万次、几十毫秒～数秒），把序号 n 提交，合约用一次 `phenotype-loci/3` 等价解码验证。验证开销 ≈3 万 gas（2026-09 本地 anvil 实测 breed 总 gas ≈33 万，与旧 SoulKin 的 30 万同量级）。性别每代重掷，不进交叉。
- **铸前不可狙击**。entropy 是完成区块的未来区块哈希，请求时不可知；请求者无法预先研磨。
- **同一熵下有多个合法候选**。谁完成、提交哪个 n 由完成者决定；所有全中候选在非突变位点上完全一致，只在突变位点（约 2% 的位点）不同。前端默认提交最小 n（正典候选）。出生后 seed 固定，长相仍是 seed 的纯读出。
- **Soul 与 SoulRenderer 不动**，已出生的任何一只（含旧 keccak 子代）不受影响；换模块即可启用/回退。
- 群体页 `/colony.html` 的繁衍预测器用同一套规则展示每位点几率（亲本各约一半 + 2% 突变重掷）与真实研磨出的样本子代。部署：`npm run life:check:kin-cross` → `life:deploy:kin-cross:testnet [-- --bind]`。

## 5. Journal

`submitStimulus(id, epoch, kind, intensity, expectedInput)`

- `kind`：0 food / 1 threat / 2 light；`intensity` 0–1000
- `expectedInput` 必须等于当前 `inputCount`（从 0 起）
- 链上**不**验证神经计算，也不保证 URI 可下载
- 栖息地应把最近一条刺激做成本地可见反应（投食 / 阵风 / 突进），不要假装链上在跑大脑

`checkpoint(...)` 要求 `previous == head.checkpointRoot`、`throughInput == inputCount`。页面必须分列：Chain recorded / Replay checked。可另内部署 Journal；权威 Journal 只由部署清单指定。

重放：`src/life/replay.mjs`，每个刺激推进 16 步。`stateRoot` 是状态的 canonical SHA-256；Journal 的 `checkpointRoot` 是 EVM keccak。校验工具对两者分别比对。

## 6. 创世包

`scripts/build-life-genesis.mjs` 从本机 `public/data/malecns-full/` 生成 `public/life-genesis/current.json`。当前解码器字段是 `phenotype-loci/3`（与仓库 Soul 的 `DECODER_HASH` 对齐）。状态仍是 `LOCAL_PACKAGE_UNPUBLISHED`。生产构建排除大图目录，**不能**只上传 manifest 就宣称大脑已公开。发布后必须：内容寻址、独立机器可下载、哈希与 Soul 构造参数一致。本机没有 `graph.bin` 时，脚本复用已有物种承诺，只重算 runtime / decoder / genesisRoot。

## 7. 前端与部署

- 钱包模块：`src/life/` 读 `public/contract/life/`，不要复用旧 `src/chain.mjs`（仍是 16 节点原型）。
- 脚本：`npm run life:compile`、`npm run life:test`、`npm run life:deploy:testnet`、`npm run life:hatch:testnet`、`npm run life:check:mainnet`、`npm run life:check:kin-fee`、`npm run life:check:market`。主网广播必须显式带 `--i-am-deploying-bsc-mainnet`。替换主网 Kin 必须另带 `--i-am-replacing-mainnet-kin`。不要把 `ImmortalFly.sol` 部署到 chainId 56。市场卫星不要 `setModule`。
- 前端：`/field.html` 神经元场，`/habitat.html` 栖息地，`/market.html` 官方一口价。未部署时不伪造 NFT，也不写「已上 OpenSea」。
- 主网清单：`public/contract/life/ImmortalSoul.deployment.json`（`status=LIVE`，Soul `0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD`）。市场卫星：`SoulMarket.deployment.json`（`status=LIVE`，`0x42E10Dc1e1D90e5F10580a8967E80F38B3e03e5D`，不进 `modules[]`）。旧 `/2` 集合：`ImmortalSoul.retired.json`。测试网另存 `ImmortalSoul.testnet.json` / `SoulMarket.testnet.json`。BscScan / Sourcify 源码验证与生产网站仍待做。

## 8. 表型与市场

规格源：`src/brain/flyswarm/phenotype-loci.mjs`。公开表：`public/life-phenotype/current.json`（`npm run life:phenotype`）。

- 96 chips 仍由 seed / mutateRoot 展开。每个位点折叠后对 10000 bps 加权表掷骰，不再对大段 chips 取均值。
- 性状：Body、Saturation、Light、Eyes、Size、Stripes（0–4）、Mark（none / bar / spots）、Wings（clear / apical / banded / pictured）、Wing shape（typical / miniature / curly / vestigial）、Veins（complete / incomplete / extra）、Sex（female / male）。骨白锁定 Light=light。
- 链下多样性轴：chips 56–63 读出 `eyePair`（双眼同色 / 左右异色）。这是同一颗 seed 的未用熵，**不进** `tokenURI`。
- `tokenURI.attributes` 只放上述市场字段 + Generation（`Gen0` / `Gen1` / …）。禁止稀有级、名次、价格。`name` / `givenName` 来自链上起名。
- 页面可显示出现率与「1024 只里预期约 N 只」。这不是地板价。
- 上架主键是 `chainId + collection + tokenId + lifeId`。同脸不是同一只。
- 转移清空 `authorizedRunner`。市场成交不移交脑会话。
- 官方挂单是独立卫星，不进 `modules[]`，规格见 [SOUL-MARKET.md](SOUL-MARKET.md)。Soul 不写版税和地板价。
- `phenotype-loci/1` 已废弃。`/2` 是 RETIRED 的团队测试集合 `0x500D…293F`。LIVE 身份核是 `/3`。换 lifeId 公式或能被烧掉才必须再开集合。
