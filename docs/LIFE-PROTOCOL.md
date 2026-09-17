# Life protocol：编码与接口

日期：2026-09-16（2026-09-17 补：收费 Kin 见 [SOULKIN-FEE.md](SOULKIN-FEE.md)；官方市场见 [SOUL-MARKET.md](SOUL-MARKET.md)。本文 §4 仍描述现网免费 SoulKin）。本文是 ImmortalSoul / LifeJournal / SoulKin / 创世包的编码规格，不替代 `PRODUCT-LATEST.md`。BSC 主网身份核已部署：Soul `0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F`。主网禁止再部署一份 ImmortalSoul。

## 特别注意：主网身份核不可废，产品却会继续变

产品在快速迭代，很多玩法现在想不清楚；同时要准备 BSC 主网给用户真正孵化。这两件事不能互相拆台。

**主网一旦部署 `ImmortalSoul`，这只集合的身份就不能再换合约「重来一遍」。** 重部等于废掉用户已经持有的 NFT、lifeId、基因组和族谱事实。测试网可以作废旧地址；主网不行。

因此：**凡是以后可能上链的功能，在架构设计的第一天就要按「身份核钉死、玩法后挂」来想**，不要等写完 Solidity 才发现字段写死了。没想清楚的东西不要塞进 Soul；想清楚了也优先做成卫星模块，用 `lifeId` / `tokenId` 当主键。完整纪律见 §3。对照产品正文：[PRODUCT-LATEST.md](PRODUCT-LATEST.md) §0.3 第 6–7 条、§19.2、§21。群体智慧的晋升、评测、claim 与经验状态一律后挂，禁止写入 ImmortalSoul。

## 1. 对象

| 对象 | 链上 | 链下 |
| --- | --- | --- |
| LifeId | `keccak256(abi.encode(ifs.life/1, chainId, collection, tokenId))` | 原始三元组一并公开 |
| Genome / birthHash | `keccak256(abi.encode(ifs.fly-birth/1, lifeId, genesisRoot, decoderHash, seed))` | `iff.genome/1` 适配。Gen0：`mutateRoot=0`、`generation=0`、`inheritBias=false`。后代：`generation≥1`、`inheritBias=true`、`parentSouls` 为双亲 lifeId |
| Given name | `ImmortalSoul.givenName(id)`，孵化时写入，主人可改 | 真名仍由 lifeId 字节本地词表揭晓，不上链 |
| Descent | `parentA` / `parentB` / `generation` 钉在 Soul 上 | 前端族谱；孩子列表也可由 `DescentRecorded` 重建 |
| Species / Model / Genesis | Soul 构造时不可变：`genesisRoot`、`speciesHash`、`modelHash`、`genesisURI` | `public/life-genesis/current.json` 与数据包 |
| Session 控制 | `authorizedRunner`、`controlEpoch` | 运行器进程；NFT operator ≠ 脑控制 |
| 刺激 / 检查点 | LifeJournal 事件与 head | 完整神经状态与档案 |
| 繁衍规则 | SoulKin（可替换模块） | 请求/完成 UI |

当前解码器是 `phenotype-loci/2`，decoder hash 是 `keccak256("phenotype-loci/2")`，不是 JSON SHA-256。SIM 档案继续用 canonical SHA-256；两者不要互换。同一 Soul 部署钉死一个 decoderHash。

## 2. 孵化

```text
requestHatch(givenName)  占用 1 个 Gen0 pending 名额，记录 recipient、名字与 entropyBlock = now+2
等待 ≥ 3 个区块
hatch(id)               任何人可代完成；seed 来自 birth domain + 该块 blockhash；NFT 与名字铸给原 recipient
expireHatch(id)         entropyBlock+256 之后释放名额
setGivenName(id, name)  仅当前主人。1–64 字节，禁控制符、引号、反斜杠
```

- 无协议铸造费。附带 BNB 的 `requestHatch` 回退。不要求持有 IFS。
- 每个地址终身只能成功孵化 1 只 Gen0（`hatched[recipient]`）。卖掉不能再孵。过期未完成的请求不占这个名额。接收或繁衍得到的后代不占这个名额。
- 不是 VRF。多个钱包、放弃请求、出块者都能影响 seed。对外只说「不可自选稀有皮」，不说防女巫。
- `MAX_GEN0 = 1024` 是本集合 Gen0 上限。`MAX_SUPPLY = 65536` 是含后代的硬顶。成功出生才计入 `totalSupply`。
- 转移或 `setRunner` 都会 `++controlEpoch` 并清空旧授权。`authorizedRunner` 不叫 `runner`，避免和 ethers Contract.runner 撞名。

## 3. 特别注意：可扩展性（设计任何上链功能前先读）

产品会变，主网 Soul 不能跟着废。不要用 UUPS / 透明代理改身份核：收藏者拿到的是这只蝇的身份，不是一张可以改规则的券。也不要「下次再重部一个 ImmortalSoul」——主网重部就是废约。

### 3.1 分界

| 永不移动（钉在 ImmortalSoul） | 可以后挂 / 替换（模块或卫星） |
| --- | --- |
| lifeId、seed、birthHash、decoderHash | 繁衍规则（SoulKin） |
| Gen0 上限与「一地址一生一孵」 | Journal 地址指针 |
| 不可烧毁 | 出生钩子 `MODULE_HOOK` |
| 起名存储与字符集 | 市场、档案、社交、成就、展示、经济附件… |
| 父母、世代（一旦写下不可改） | 经验晋升、评测、claim、复算包（PRODUCT-LATEST §21）；**任何现在还没想清楚的玩法** |

`curator` 只能 `setModule(bytes32, address)` 和交出自己（`setCurator(address(0))` 即冻结模块表）。它不能：再孵 Gen0、改已有基因组、改名字字符集以外的身份、烧掉灵魂。交出之后，模块表冻住；已经写下的 descent 和名字仍在 Soul 上。

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
MODULE_KIN     = keccak256("ifs.module.kin/1")
MODULE_JOURNAL = keccak256("ifs.module.journal/1")
MODULE_HOOK    = keccak256("ifs.module.hook/1")
```

以后新槽用 `keccak256("ifs.module.<name>/1")`，不要复用旧 id 装不同语义。`MODULE_HOOK` 在出生后 `try/catch` 调用 `afterBorn(...)`。钩子失败不会卡住孵化。

## 4. 族谱 / 繁衍

双亲与世代写在 Soul 上，所以换掉 SoulKin 也不会丢掉已有血脉。SoulKin 只负责「怎样才能生出下一只」。

```text
requestBreed(parentA, parentB)  调用者必须同时持有双亲；entropyBlock = now+2
breed(id)                      任何人可代完成；seed = keccak(ifs.descent/1, soul, parents, parentSeeds, id, entropy)
expireBreed(id)                entropyBlock+256 之后释放
```

- 后代走 `mintDescendant`，仅 `modules[MODULE_KIN]` 能调。
- `generation = max(parentA, parentB) + 1`。长相仍是 `phenotype-loci/2` 对 child seed 的读出，不是另一套脑、也不是 263 个假权重。
- 一地址一生一孵只限制 Gen0。后代可持有多只。
- 现在的繁衍规则以后可以换新的 SoulKin；旧孩子的父母字段不动。
- 下一只 Kin 才收费、才尝试买 `$IFS`、才做买入失败托管。规格：[SOULKIN-FEE.md](SOULKIN-FEE.md)。未 `setModule` 之前，主网仍是免费 `SoulKin` `0xA6810953e52f5EEa39C323d8Ea7dC42c210A13A0`。收费、路由、失败兜底一律不准写进 ImmortalSoul。

## 5. Journal

`submitStimulus(id, epoch, kind, intensity, expectedInput)`

- `kind`：0 food / 1 threat / 2 light；`intensity` 0–1000
- `expectedInput` 必须等于当前 `inputCount`（从 0 起）
- 链上**不**验证神经计算，也不保证 URI 可下载
- 栖息地应把最近一条刺激做成本地可见反应（投食 / 阵风 / 突进），不要假装链上在跑大脑

`checkpoint(...)` 要求 `previous == head.checkpointRoot`、`throughInput == inputCount`。页面必须分列：Chain recorded / Replay checked。可另内部署 Journal；权威 Journal 只由部署清单指定。

重放：`src/life/replay.mjs`，每个刺激推进 16 步。`stateRoot` 是状态的 canonical SHA-256；Journal 的 `checkpointRoot` 是 EVM keccak。校验工具对两者分别比对。

## 6. 创世包

`scripts/build-life-genesis.mjs` 从本机 `public/data/malecns-full/` 生成 `public/life-genesis/current.json`。当前解码器字段是 `phenotype-loci/2`（与 Soul 的 `DECODER_HASH` 对齐）。状态仍是 `LOCAL_PACKAGE_UNPUBLISHED`。生产构建排除大图目录，**不能**只上传 manifest 就宣称大脑已公开。发布后必须：内容寻址、独立机器可下载、哈希与 Soul 构造参数一致。本机没有 `graph.bin` 时，脚本复用已有物种承诺，只重算 runtime / decoder / genesisRoot。

## 7. 前端与部署

- 钱包模块：`src/life/` 读 `public/contract/life/`，不要复用旧 `src/chain.mjs`（仍是 16 节点原型）。
- 脚本：`npm run life:compile`、`npm run life:test`、`npm run life:deploy:testnet`、`npm run life:hatch:testnet`、`npm run life:check:mainnet`、`npm run life:check:kin-fee`、`npm run life:check:market`。主网广播必须显式带 `--i-am-deploying-bsc-mainnet`。替换主网 Kin 必须另带 `--i-am-replacing-mainnet-kin`。不要把 `ImmortalFly.sol` 部署到 chainId 56。市场卫星不要 `setModule`。
- 前端：`/field.html` 神经元场，`/habitat.html` 栖息地，`/market.html` 官方一口价。未部署时不伪造 NFT，也不写「已上 OpenSea」。
- 主网清单：`public/contract/life/ImmortalSoul.deployment.json`（`status=LIVE`）。市场卫星：`SoulMarket.deployment.json`（`status=LIVE`，不进 `modules[]`）。测试网另存 `ImmortalSoul.testnet.json` / `SoulMarket.testnet.json`。BscScan 源码验证与生产网站仍待做。

## 8. 表型与市场

规格源：`src/brain/flyswarm/phenotype-loci.mjs`。公开表：`public/life-phenotype/current.json`（`npm run life:phenotype`）。

- 64 chips 仍由 seed / mutateRoot 展开。每个位点折叠后对 10000 bps 加权表掷骰，不再对大段 chips 取均值。
- 性状：Body、Saturation、Light、Eyes、Size、Stripes（0–4）、Mark（none / bar / spots）。骨白锁定 Light=light。
- `tokenURI.attributes` 只放上述字段 + Generation（`Gen0` / `Gen1` / …）。禁止稀有级、名次、价格。`name` / `givenName` 来自链上起名。
- 页面可显示出现率与「1024 只里预期约 N 只」。这不是地板价。
- 上架主键是 `chainId + collection + tokenId + lifeId`。同脸不是同一只。
- 转移清空 `authorizedRunner`。市场成交不移交脑会话。
- 官方挂单是独立卫星，不进 `modules[]`，规格见 [SOUL-MARKET.md](SOUL-MARKET.md)。Soul 不写版税和地板价。
- `phenotype-loci/1` 已废弃。测试网若仍是 `/1`，换 `/2` 后必须重新部署再孵。
