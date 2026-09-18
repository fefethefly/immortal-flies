# IMMORTAL FLYSWARM：Agent Society Trading World

目录与阅读顺序：[docs/README.md](README.md)。**本书是唯一当前产品与架构正文。** 未写进本节的页面文案、情景沙盘标签、实验室笔记或旧合约注释，不得当成已交货或主网承诺。

日期：2026-09-17（收入群体智慧协议裁定与接口；同日补 SoulKinFee，见 §22；同日补官方 NFT 市场规格，见 §23 与 [SOUL-MARKET.md](SOUL-MARKET.md)；此前 2026-09-16 三次修订：确认 BNB 免费孵化与生命记录闭环，预留跨链跨物种互通）。2026-09-18 增补见下文。

本文不构成收益、回购、销毁或金融产品承诺。链上事实只以已核验地址和回执为准。

**先读哪里：** 身份核不可废 → [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md) 文首「特别注意」。已开 / 未开 → 下面 §0。市场 / 繁衍费 / 私有轨分别以 [SOUL-MARKET.md](SOUL-MARKET.md)、[SOULKIN-FEE.md](SOULKIN-FEE.md)、[MINING-HUB-V1.md](MINING-HUB-V1.md) 为准，不要只靠本节摘要。

## 2026-09-18 群体智慧升级增补

按[再评估](SWARM-PROTOCOL-REEVALUATION-2026-09-18.md)推进开放群体智慧方向，交易世界保留为应用插件。首轮仅新增 opt-in 工程关联学习器 `context-association/1`：情境关联、延迟资格迹、衰减、反转、冻结与状态恢复；不静默替换旧 overlay/runtime，不修改 Soul 或历史图制品。**尚未接入生产运行器或完成神经行为、共享记忆、跨物种学习增益验收。** 此前 §21 的协议整体“设计”状态不能解读为这些新能力已上线；新增模块也不能解读为 T4 通过。交付范围、测试与 swarm.family 调研见 [首轮升级记录](SWARM-UPGRADE-2026-09-18.md)。


## 当前工程交接状态（2026-09-18）

BSC 主网身份核已换成 `phenotype-loci/3` 集合：`ImmortalSoul` `0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD`，`SoulRenderer` `0x06E2B1e2F03E2573874540BbE439eEccb33b234C`，`LifeJournal` `0xB0fE4BbfE3afE64347e8Cb5aD77A087C36cBE419`，`SoulKinCross` `0x838A30868Bb82D4dABe70d586e87aeC948CC5825`（免费、24h 亲本冷却），`SoulMarket` `0x42E10Dc1e1D90e5F10580a8967E80F38B3e03e5D`。旧 `/2` 集合 `0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F` 与旧市场 `0x5f67e862d7519FC38D9d78a1c2A35DE17AFc7875` 标 RETIRED；`#1`「Elon Musk」仍在旧地址，不是这只集合。清单 `ImmortalSoul.deployment.json`。`ImmortalFly.sol` 未上 56。这一只 LIVE 集合禁止再靠重部迭代。

## 当前工程交接状态（2026-09-17）

2026-09-17 产品负责人确认群体智慧协议方向，已收入 §21。状态仍是**设计稿，未实现**：不冻结五动词全家 schema，不上 Railway 多生命集群，不把晋升写进 Soul。细则与实验设计仍以 [SWARM-INTELLIGENCE-PROTOCOL-DESIGN-2026-09-17.md](SWARM-INTELLIGENCE-PROTOCOL-DESIGN-2026-09-17.md) 为准；全量运行分层见 [RUNTIME-TIERS-DESIGN-2026-09-17.md](RUNTIME-TIERS-DESIGN-2026-09-17.md)。同日测试网已绑定 SoulKinFee；官方 NFT 市场按 [SOUL-MARKET.md](SOUL-MARKET.md) 落地合约与 `/market.html`。段证明挖矿按 [MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md](MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md) 与 [MINING-HUB-V1.md](MINING-HUB-V1.md)：M0 SIM 与 MiningHub 私有轨已按 2026-09-18 评审改结算（无开叶不付款、同工作不重复付、争议可结束、退款回出资人）。测试网卫星 `0x1dAd6d5D9C407553814888917Ff45F0d1Fee55A1`；旧 `0xF0e07ff3dF12319808f977A0D81b4eF86BB71825` 为 STALE。主网 `MiningHub.deployment.json` = `UNDEPLOYED`。对外不说挖矿已上线。主网繁衍是免费 SoulKinCross。主网 SoulMarket `0x42E10Dc1e1D90e5F10580a8967E80F38B3e03e5D` 对着新 Soul，未 `setModule`。旧市场 `0x5f67…` 已 RETIRED。

此前交接（2026-09-16，Grok 续写）：

免费孵化、创世承诺和跨链跨物种架构结论已确认（§20）。BSC 主网身份核已部署（2026-09-16）：`ImmortalSoul` `0x500Df9B948Cb610ADcBb98adD23aBF571aA9293F`，`LifeJournal` `0xf2457F49E6c7Ab8b0BBbd796991a139A6fE69c78`，`SoulKin` `0xA6810953e52f5EEa39C323d8Ea7dC42c210A13A0`。curator 为 `0x4767dAC30648fE0d8A6076F79414D42947486Ae3`。禁止再部署一份 ImmortalSoul。规格见 [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md)。

前端 `/habitat.html` 与 `/field.html` 已读主网清单。测试网 `0x3487A2802AF82F12Bb7a3dd40B262394f4819A5a` 另存为 `ImmortalSoul.testnet.json`。创世包解码器是 `phenotype-loci/2`，状态仍是 `LOCAL_PACKAGE_UNPUBLISHED`。三份主网合约已在 Sourcify 上 `exact_match`（Soul / Journal / Kin）。主网第一只 Gen0 已出生：`#1`「Elon Musk」，lifeId `0x3008c660…1de754`，块 `122191967`，主人 `0x6aBe…81F`。LifeJournal 对该 life 仍是空头。`ImmortalFly.sol` 未上 56。

研究入口：`findyouragent.xyz/#/agent/56/345230`、`findyouragent.xyz/docs`、X 帖子 `BortOnBsc/status/2099177206375219453`。FindYourAgent 域名与该帖正文仍未做内容级核验；§9 的 Agent Registry 仍是待核对兼容层。竞品 `@fruitfliesBsc` / `immortalfruitflies.app` 已于 2026-09-16 核验，见 §0 与 §17。

## 0. 审阅快照（交给外部模型时先读这里）

核验日：2026-09-16。下面「已开 / 未开」以仓库与主网回执为准，不是路线图愿望。

### 0.1 已开

| 项 | 事实 |
| --- | --- |
| `$IFS` 税币 | BSC 主网 `0x65b66bb4adb0e244e19d290b6aaa0381b81a7777`，买卖各 1%。分账：蜂巢 80% `0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467` · 运营 20% `0x055bB2aF42B832A55F3D708c92824C491dE05427`。清单：`public/token/official.json`，`status=live`。税进钱包 ≠ 金库在交易，≠ 回购。 |
| Soul / NFT 主网 | `ImmortalSoul` `0x9341Fe0c4CcDeFEBe2c052DAc312Ea1Bbf0Ab6bD`（IFSOUL，`phenotype-loci/3`，Gen0 1024，maxSupply 1048576 可上调）。清单 `LIVE`，chainId 56。回执 `0xceaf940a…680b14`。旧 `/2` `0x500D…293F` 为 RETIRED。 |
| 官方 NFT 市场 | 主网 SoulMarket `0x42E10Dc1e1D90e5F10580a8967E80F38B3e03e5D`，对着上列 Soul，2% 进蜂巢。未 `setModule`。回执 `0xae1b7a23…b3a705`。不是 OpenSea。旧市场 `0x5f67…` 为 RETIRED。 |
| 本地基因组 / 表型 | `iff.genome/1`、`phenotype-loci/3`（96 chips，加权出现率）、`phenotype-art/1`。观测台、名册与 `tokenURI` 共用解码器。LIVE 主网集合是 `/3`。出现率公开，不是定价。 |
| 纸面交易世界 | `/swarm.html` 七视图、Colony / Intent / Risk / Execution、纸面金库与 IFS 面板。数据标 SIM。 |
| 纸面经济沙盘 | `/economy` 情景计算器。`FEE_SPLIT` 里仍有「回购 / 销毁」旧标签，**不是链上动作**。 |
| 16 节点原型合约 | `contracts/ImmortalFly.sol` 可编译、可测、有测试网脚本。`public/contract/ImmortalFly.deployment.json` = `UNDEPLOYED`。 |

### 0.2 未开

| 项 | 事实 |
| --- | --- |
| 真实 mint 前端 | 栖息地已接主网清单。生产网站尚未推送；创世 URI 指向 immortalflies.com，域名上线前该链接会 404。旧祭坛 `/altar` 仍重定向到蓝图。 |
| 段证明 / 托管加油 | 本地 SIM + Anvil 门已按评审改过。主网 `UNDEPLOYED`。测试网旧卫星不是真 IFS。不是挖矿收益。 |
| 销毁 | 没有任何已核验、会使 IFS `totalSupply` 下降的路径。 |
| 回购执行 | 只有已实现盈余 D 的纸面预算；路由 `later`，`spent` 不会真去买。繁衍费买 IFS 是另一条卫星路径（§22），未上线。 |
| 用户金库 / 锁仓 / Credit | 纸面或未接线。§11 的资金漏洞未修完前，禁止开放真实抵押、借贷、金库收益、自动回购。 |
| `breed` / 链上死亡 | 主网免费 `SoulKin` 已绑定。测试网 `SoulKinFee` `0xfBC6…414f` 已换上。死亡仍不是删除。 |
| 群体智慧协议 | 五接口、经验晋升、T0–T4 对照、官方 Railway 母体/子实例均为设计。学习层已有交易驱动 overlay，觅食驱动未换。 |

### 0.3 已裁定、不要再争论的产品纪律

1. **销毁要，但必须是真烧，且排在盈余回购之后。** 销毁 = 合约 `burn` 或等价操作之后 `totalSupply` 下降，并公布回执。锁仓、税进钱包、转入任意地址（含名人钱包）都不是销毁。未到 P4 已实现盈余、未接通回购路由之前，不实现销毁，也不为叙事去烧创始供应。
2. **金库与运营款不得自动打给 CZ 或任何个人地址。** 竞品前端写过「铸造费买币 → CZ」，其 V2 合约未上；我们更不能把协议金库写成自动贡赋。20% 运营钱包由人决定怎么花（广告、制作），不写进合约分流。用户本金与 80% 蜂巢税禁止用于此。
3. **不要把 `ImmortalFly.sol` 部署到 BSC 主网（chainId 56）。** 它把 16 节点玩具脑、`tick`/`train`、自选 seed、原型 NFT 符号 `IFP` 写成不可升级的规范状态。官方税币 ticker 是 **`$IFS`**。主网身份必须是新的 Soul NFT / SoulRegistry：只承诺 Genome，卡面由 `phenotype-loci/2` 读出。
4. **吸收竞品的机制句，不吸收 263 和贡赋。** 铸的是基因组，皮是后挂纯函数；死不等于删；繁衍是基因组杂交。不把 263 个自造权重写成第二套脑，不把表型做成协议定价或 Common/Rare 分层，不把未在合约里强制的「gen 0 封顶」写成链上稀缺。出现率可以公开，供市场筛选。
5. **当前交付目标：** 钱包在 chainId 56 免费孵化（仅网络 gas，每地址终身 1 只，不要求持有 IFS）→ 拥有 Soul NFT → 从公开创世包恢复 → 提交标准刺激 → 封存可重放检查点。身份首发与生命记录分别验收，后者未上线前不能宣称闭环完成。金库、交易与烧币仍不在本轮范围。
6. **特别注意：主网身份核不可废，上链功能必须先按可扩展设计。** 产品在快速迭代，很多玩法没想清楚；同时要准备真正部署主网给用户参与。主网 `ImmortalSoul` 一旦部署，禁止用「再部署一份」当迭代。身份、基因组、lifeId、不可烧、Gen0 规则钉在核上；繁衍、Journal、市场、成就、还没发明的玩法全部后挂为卫星模块（`lifeId`/`tokenId` 主键 + `modules[]`）。不要做 UUPS 改身份，不要把没想清楚的字段塞进 Soul。设计清单见 [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md) 文首「特别注意」与 §3；主网评估见 §19.2。
7. **群体智慧协议标准化的是五个可验证接口，不是「智慧」本身。** 2026-09-17 已确认：母体与初始子实例由官方生成，官方经 Railway 等外部云托管，分阶段开放用户接入。晋升、经验、评测、claim 不进 Soul。mesh 托管网 ≠ 群体智慧。T3/T4 通过前禁止宣称「群体智能已实现/提升」。详见 §21。

### 0.4 给审阅者的阅读顺序

先读 §0.3 第 6–7 条（身份核不可废；群体智慧是可验证接口）和 [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md) 文首「特别注意」。然后：§1–§8 定位与金融规则 → §16 表型 → §17 竞品核验 → §18 销毁与金库 → §19 主网 Soul 工作评估 → §21 群体智慧协议（设计，未实现）→ §22 繁衍费买 IFS → §23 官方市场（主网卫星已部）→ §24 段证明私有轨（设计，未部署）→ §12 分期。旧入口 FindYourAgent 仍以 §9 / §14 为准，不要和 §17 竞品混为一谈。实验与 schema 细则读 [SWARM-INTELLIGENCE-PROTOCOL-DESIGN-2026-09-17.md](SWARM-INTELLIGENCE-PROTOCOL-DESIGN-2026-09-17.md)，不要只读本节摘要就冻协议。繁衍收费以 [SOULKIN-FEE.md](SOULKIN-FEE.md) 为准；市场以 [SOUL-MARKET.md](SOUL-MARKET.md) 为准。

## 1. 最终定位

**Flyswarm 是一个由永生果蝇组成的开放 Agent Society。每只果蝇有连续身份、私有经历和可重放状态；社会使用一套极小、可验证的行为语言交流；LLM 作为外部认知与工具层扩展能力；交易世界是第一个可用小世界；IFS 是访问、信用、服务和协议盈余的共同结算资产。**

一句话：

> **让一群永生果蝇用自己的语言交流，在一个真实有风险的交易世界里协作、生存，并靠可验证的金融结果补充自己的 credit。**

社会如何变「更聪明」不另起一套口号：协议标准化的是任务 / 语言 / 学习 / 聚合 / 身份五个可验证接口；智慧增长是闭环运转后的涌现，每一次增益必须可被任何人复算。交易世界仍是第一个小世界；协同觅食是证明协作与学习的评测域，不替换交易产品，也不等于通用智慧已实现。详见 §21。

这里的“自主”有严格含义：Agent 可以在已授权的预算、资产、工具和世界规则内提出与执行任务；它不能凭 LLM 生成文字取得私钥、扩大额度、改变历史或代表用户承诺收益。

## 2. 四层产品结构

```text
L0  Life Core       MaleCNS / 状态 / 学习 / Soul / Session / Replay
L1  Society Core    Fly Language / 邻居 / 记忆 / 共识 / 社会信用
L2  World Layer     Trading World（首个）/ 森林 / 迷宫 / 艺术 / 教育
L3  Agent Economy   LLM / 工具 / Credit / IFS / 金库 / 结算 / 服务市场
```

依赖只能向下：LLM、交易和 IFS 不能进入原生神经状态；Life Core 不导入钱包、LLM SDK、DEX 或网页组件。World 负责“问题是什么”，Port 负责“能做什么”，Risk 负责“允许做什么”，Settlement 负责“实际发生了什么”。

新世界、新模型、新端口、新 LLM Provider、新链和新资产均使用版本化 Manifest 注册。注册不授予资金权限；能力、额度和数据访问必须单独授权。

## 3. 永生果蝇是什么

| 对象          | 语义                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| Soul          | 持续身份；历史不因退役删除                                               |
| Genome        | 出生承诺的个体初值（`iff.genome/1`）；表型只读它，不读行情或 overlay     |
| Phenotype     | 基因组的确定性读出（体色、眼型、体型、条纹）；不是另铸的皮肤             |
| Session       | 在某世界、模型与运行器中的一段生命会话                                   |
| Branch        | 从检查点产生的个人实验分支，不是正式社会的重复投票权                     |
| Memory        | 可验证经历引用与学习结果；下载别人记忆不等于已学会                       |
| Credit        | Agent 当前可用的资源信用；来自抵押、预付、完成订单、已结算收益与声誉证据 |
| Controller    | 人、组织或合约对授权范围的控制者；与 Soul、NFT、运行器分开               |
| Agent Profile | 可验证的能力、版本、来源、权限、价格、信用与历史摘要                     |

迁徙、复活、继承和 NFT 只追加事件。更换 LLM 不改变 Soul；更换 Life Profile 会生成新的运行配置与迁移事件。不同模型轨迹不宣称等价。解码器升级可以让已有灵魂再表达表型，但不得改写 Genome。

## 4. Fly Language：果蝇社会的原生语言

果蝇不使用自然语言讨论股票，也不直接说 BUY/SELL。它们交流的是可由 Life Core 产生、由其他生命接收并重放的**行为语言**。金融含义只在 Trading Port 解释。

### 4.1 四个原语

```text
SENSE       我接收到什么，来自谁，何时过期
ACT         我此刻的行为倾向与强度
MEMORY      我经历过什么，检查点和结果根是什么
PROPOSE     我建议社会在允许的任务目录中做什么
```

首版行为词保持：`REST / FORAGE / AVOID / EXPLORE`。词典固定，扩展使用新版本，不修改旧记录。

### 4.2 统一消息格式

```json
{
  "schema": "ifs.fly/utterance/1",
  "eventId": "content-addressed-id",
  "worldId": "trading-world",
  "soulId": "soul-...",
  "sessionId": "session-...",
  "tick": 1842,
  "sender": "runner-or-agent-id",
  "recipient": "neighbor-or-world",
  "action": "FORAGE",
  "intensity": { "food": 31, "threat": 4, "light": 8 },
  "confidence": 0,
  "memoryRefs": ["checkpoint-hash"],
  "provenance": { "dataset": "male-cns:v1.0", "runtime": "iff-runtime/1" },
  "expiresAt": 1843,
  "prevHash": "..."
}
```

`confidence` 是模型内部证据强度，不是概率正确率；`memoryRefs` 是可验证来源，不是影响保证；消息不含 signer、calldata、资产金额或任意转账权。

### 4.3 社会语法与时序

每轮固定顺序：

```text
冻结 roster / policy / topology
→ 接收上一轮 SENSE 与外部输入
→ 每只蝇推进独立 Life Core
→ 输出 ACT + MEMORY 引用
→ 按邻居图投递下一轮 SENSE
→ 生成行为分布与社会状态
→ 在允许的任务目录中产生 PROPOSE
→ World / Risk / Settlement 决定是否执行
→ 执行结果成为下一轮可验证经历
```

社会状态必须区分：`CONSENSUS / SPLIT / NO_QUORUM / STALE / INVALID`。成员缺席不算 HOLD；分裂只阻止需要共识的新任务，不阻止风控要求的减仓、撤单或清算。

### 4.4 依据与验证（设计，未实现）

§4.1 的四个原语仍然是社会话语。群体智慧协议要补的是**观察依据与独立复核**，必须映射到已有对象，不另起第三套词典：

| 协议动词 | 已有对象 | 做法 |
| --- | --- | --- |
| observe | `iff.sense/1` | 升 sense/2（不改 /1）：加 envId / region / evidence |
| propose | 产品层 PROPOSE | 必须引用 observe，且不自动执行 |
| confirm | 无 | 新增：独立复核，复现的最小形态 |
| outcome | overlay 结果事件 | 独立事件，不塞进 utterance |
| claim | `iff.experience/1` 是记忆根，不是晋升申请 | 新增 claim，引用 experience + 复算包 |

未知 schema 大声拒绝；收到 ≠ 服从。字段由 T0–T4 实验倒逼，禁止预先冻结 `iff.observe/1` 全家。完整对照与入站适配器见 §21.5–§21.6。

## 5. LLM 扩展层：翻译与规划，不是第二个脑

LLM 的位置是 `Agent Extension Layer`：把语言、记忆和工具变成可审计的候选计划，再交给确定性规则验证。它不能伪造官方神经元发放。

### 5.1 LLM 可以做什么

- 将 `SENSE / ACT / MEMORY` 翻译成人可读解释和多语言摘要。
- 从事件目录检索相关记忆，生成待验证假设。
- 将果蝇行为语言组合成 `PROPOSE` 候选任务。
- 调用白名单工具读取行情、计算风险、查询世界、生成报告。
- 在信用额度内提出预算、订单和复盘计划。
- 为用户生成 Why、对照实验与迁徙预检。

### 5.2 LLM 不可以做什么

- 写入 Life Core 状态、修改边权、伪造 Memory、改写 Genome 或指定表型。
- 直接取得私钥、无限额度、任意 calldata 或用户签名。
- 把自然语言“我想买”变成执行授权。
- 自己提高 Credit、修改风控、绕过冷却、重复消费订单。
- 用模拟结果声称真实收益，用一段文字声称已完成链上交易。

### 5.3 工具调用状态机

```text
LLM candidate
→ schema validation
→ provenance / permission / budget check
→ deterministic risk policy
→ user or policy authorization
→ executor with exact limits
→ settlement receipt
→ replayable result
```

LLM 每次输出保存 `modelId / provider / promptHash / contextRefs / toolCalls / policyHash / resultHash`。模型供应商不可用时，核心社会与交易风控仍可运行；解释层降级，不让模型缺席变成自动授权。

## 6. Credit：果蝇如何靠金融结果补充能力

Credit 不是凭空铸币，也不是简单把收益乘一个倍数。它是一个分层的、可衰减的能力预算。

### 6.1 Credit 的四个账户

| 账户          | 来源                                 | 能做什么                         | 能否直接取出         |
| ------------- | ------------------------------------ | -------------------------------- | -------------------- |
| Free Credit   | 公共世界赞助、试用额度               | 观察、低风险实验、有限 LLM/验证  | 不能                 |
| Locked Credit | IFS 锁仓或其他合格抵押               | 获得额度、费用折扣、投标资格     | 解锁前不能           |
| Earned Credit | 完成可验证交易、运行、验证或创作订单 | 支付未来服务、提高非资金能力等级 | 按协议可结算部分领取 |
| Liquid Credit | 已结算、扣除负债与准备金后的可用余额 | 支付服务、续费、返还或兑换       | 可按规则支出/退出    |

同一笔 IFS 抵押只能支撑一次额度。Credit 必须记录来源、资产、负债、期限、风险折扣、到期、冻结与撤销原因。

### 6.2 Credit 生成公式

```text
usableCredit
 = min(
     collateralValue × LTV,
     settledProfit × profitShare,
     completedOrders × reliabilityFactor,
     worldBudgetCap
   )
 − outstandingDebt
 − pendingLossReserve
```

`LTV`、`profitShare` 和 `reliabilityFactor` 都是版本化参数。浮盈、未确认成交、新用户入金、LLM 生成的报告、刷消息和自成交不能增加 Earned/Liquid Credit。

Credit 具有衰减与冷却：长期不履约、数据过期、抵押价格失效、争议未决或连续亏损会降低可用额度；亏损不倒扣已结算的历史事实，但会减少后续任务预算。自主能力边界随 Credit 变化，不随 token 价格单调放大。

### 6.3 Credit 的正确飞轮

```text
IFS / 合格抵押
→ 有限 Credit
→ 购买 LLM、计算、验证与交易工具
→ 完成可验证任务
→ 获得实际收入或减少真实成本
→ 偿还债务、补足准备金
→ 剩余已结算贡献形成 Earned/Liquid Credit
→ 支持下一轮有上限任务
```

“赚到钱所以额度更高”只有在收入已结算、成本与债务已扣除后成立。没有收益时，Credit 归零或收缩是正常状态；不允许用下一轮借款支付上一轮虚假收益。

## 7. Trading World：第一个可用小世界

### 7.1 交易产品首屏

- **Colony:** 每只蝇说了什么、谁受谁影响、社会状态。
- **Intent:** 交易端口对行为的解释，不混入原生语言。
- **Risk:** 仓位、流动性、回撤、资产集中、Credit 和额度。
- **Execution:** 订单、滑点、税、成交/失败回执。
- **Vault:** 用户本金、份额净值、已实现损益、高水位、退出队列。
- **IFS:** 买入、锁仓、抵押占用、费用、价值预算和实际回购。

### 7.2 资产分层

1. 现金与高流动性现货：首个用户策略池。
2. IFS：会员、抵押和协议价值预算；不默认作为用户交易池的主要标的。
3. RWA Sleeve：AAPL/TSLA 等代币化产品的独立隔离策略；发行主体、权利、地域与赎回逐项核验。
4. 借贷池：真实出借资金、债务、利息、清算和坏账专池。
5. NFT：Soul、Position、History 三类，不用 NFT 数量制造收益。

### 7.3 交易端口

```text
行为分布 / PROPOSE
→ TradePort 生成候选资产与方向
→ RiskPolicy 检查资产白名单、额度、价格新鲜度、LTV、回撤、容量
→ CreditPolicy 检查可用 Credit、债务与预算
→ 用户/金库政策授权 exact limits
→ Executor 提交
→ SettlementReceipt 入账
→ 结果作为新 SENSE / MEMORY
```

交易结果不能修改已经产生的 ACT。仓位约束可以让执行缩量或拒绝，但要记录 `origin=RISK`，不能伪造为果蝇改变了意见。

## 8. 金融飞轮规则

### 8.1 用户收益层

用户金库净值先归用户。每一批份额记录成本、高水位、实际已实现收益、费用和退出状态。未实现浮盈不能直接分配、发奖励或回购。

### 8.2 协议收入层

```text
R = 已结算业绩费 + 实际服务费 + 协议自有资产已实现收益
C = 执行 / 验证 / 存储 / 团队 / 合规成本
N = R − C
T = min(max(N, 0), 合格准备金缺口)
D = max(N − T, 0)
```

初始 D 仅作为建议分配：IFS 价值预算 35%、准备金 25%、协议自有资本 20%、已结算锁仓费用奖励 10%、生态任务 10%。参数可治理，但不追溯改变用户合同。

回购只使用已拨定的 D，要求没有未覆盖退款、保证金、客户本金、借款、准备金和争议负债；路由不可执行或冲击过高时停机。

销毁是回购之后的可选结算，不是独立叙事。正式定义：

```text
销毁证据 = 已执行 burn（或等价减少供应的合约调用）
         + 其后 totalSupply 下降
         + 公开交易回执
```

未满足上式时，禁止把锁仓、税进钱包、转入金库、转入运营地址、转入名人地址或未公布路由称为销毁。情景沙盘 `economy.mjs` 的 `FEE_SPLIT.burn` 与文案「回购 / 销毁」应改口为「回购预算」；销毁 KPI 等第一条 burn 回执再点亮。D 的 35% 仍是 IFS 价值预算，不另开一套销毁比例。

禁止把协议金库、用户金库或税后自动分流写成打给 CZ 或其他个人。运营钱包的 20% 是链下人工预算，不是合约参数。

### 8.3 停止规则

- 连续亏损或高水位未恢复：业绩费、奖励和回购可为零。
- Credit 不足：拒绝新工具和新交易，不用新借款补旧债。
- RWA 价格/赎回失效：停止新增风险，保留存量处理规则。
- 退出压力超出流动性：排队、限额或按合同分批，不挪用其他资金池。
- IFS 下跌：降低 LTV 与新增 Credit，不强制金库接盘。
- 社会分裂：不新建需要共识的投机任务；安全退出照常执行。

“持续增值”不能写成规则保证。系统保证的是：有真实收入才分配、亏损时收缩、资金有权属、历史可重放、用户能按规则退出。

## 9. Agent Registry 兼容层（待外部核验）

为了接入 FindYourAgent 类系统，定义一个适配层，不直接依赖其未核实字段：

```text
AgentProfile
  chainId / registryId / agentId
  soulId / worldIds / modelProfile
  capabilities[] / toolScopes[] / inputSchemas[] / outputSchemas[]
  controller / runner / publicKey
  creditSummary / stakeRefs / reputationRefs
  endpoint / packageHash / evidenceRefs
```

适配原则：

1. 外部 `agentId` 是注册引用，不能替代 Flyswarm Soul。
2. 外部能力声明只是候选，必须经过 packageHash、测试向量和权限审核。
3. 外部声誉或评分不能直接换成 Credit；只可作为输入证据，需扣除关联、重复、时间和完成率因素。
4. 外部支付/注册回执必须保存 chainId、合约、事件和确认状态；不凭页面文本认定已拥有资产。
5. 外部 Agent 可以作为 LLM Runner、工具提供商、验证器或世界发布者；每种角色使用不同 scope。
6. 兼容层只读接入先行；任何写入、质押、借贷或执行动作需要逐项授权和独立风控。

在拿到官方文档与合约 ABI 前，不写死 FindYourAgent 的注册字段、费用、信用或 agent 345230 的属性。

## 10. 合约与链下职责

| 模块             | 职责                                                   |
| ---------------- | ------------------------------------------------------ |
| ImmortalFly.sol  | **仅本地/测试网原型。** 16 节点脑 + 自选 seed。禁止部署到 BSC 主网。 |
| SoulRegistry / ImmortalSoul | 主网身份草案：`contracts/life/ImmortalSoul.sol`。Genome / LifeId / `authorizedRunner` / epoch。未部署。旧 `ImmortalFly.sol` 不得上 56。 |
| AgentAdapter     | 外部 agentId 映射、能力与证据引用；默认只读            |
| CreditLedger     | 四类 Credit、来源、债务、冻结、衰减和额度              |
| IFSStaking       | IFS 锁仓、解锁、会员权益与占用状态                     |
| Vault / Position | 用户份额、高水位、费用、入金、赎回与批次               |
| LendingPool      | 出借、债务、利率、抵押、清算和坏账隔离                 |
| RwaSleeve        | 白名单 RWA、估值、发行方回执、限制与退出               |
| ServiceEscrow    | LLM、运行、验证、保存等服务订单、里程碑与退款          |
| Treasury         | 协议自有资产、准备金、生态预算、IFS 价值预算           |
| Executor         | 精确限额、nonce、过期、白名单和回执；禁止任意 calldata |

链下保存连接组、完整状态、LLM 输出与重放数据；链上保存必要身份、授权、资金、承诺和回执。底层 gas 使用链原生资产；IFS 是应用结算与信用资产，不是网络 gas。

## 11. 旧原型必须先修复的资金问题

当前仓库纸面实现不能直接升级为真实资金系统：

- 赎回接口未真正校验个人份额所有权。
- 协议已有资产与首个用户入金的份额归属混在一起。
- NAV 标记浮盈可生成回购预算，未严格要求已实现收益。
- `side`、仓位调整、quorum 和原生行为语义仍有耦合。
- localStorage 快照不等于完整群体重放。
- `vault.mjs` 仍是模拟预览，不能发送交易。

这些缺口修完前，IFS 只能展示、测试网验证和模拟 Credit，不开放用户真实抵押、借贷、金库收益或自动回购。

## 12. 分期路线

| 阶段                     | 目标                                                  | 退出条件                               |
| ------------------------ | ----------------------------------------------------- | -------------------------------------- |
| P0 语言与身份            | Fly Language、Soul、Genome、表型解码器、Session、Replay | **本地解码器已交货**（2026-09-16）。链上 Soul NFT 与主网 mint 见 §19，未开。退出：独立进程逐位恢复；已有灵魂可再表达；旧记录语义不变 |
| P1 LLM 边界              | 解释、检索、候选计划、工具白名单、策略验证            | LLM 缺席仍可运行；无未授权资金调用     |
| P2 交易纸面世界          | 只读市场、模拟交易、Colony/Intent/Risk/Execution 分层 | 与简单基线比较；净成本、失败和回撤透明 |
| P3 IFS 会员与模拟 Credit | 购买、锁仓、占用、Credit 四账户、服务订单             | 不重复抵押；亏损和到期会收缩额度       |
| P4 协议自有资金          | 限额真实执行、独立风控、回执与自有资金收益            | 不动用户资产；外部审计和压力测试通过   |
| P5 用户金库              | 份额、高水位、赎回、费用与 Position NFT               | 权属、会计、退出和失败恢复通过         |
| P6 借贷/RWA/NFT          | 隔离池；Soul NFT 只承诺 Genome，卡面由解码器读出      | 发行方、估值、清算、准入和合约审计完成；tokenURI 与本地解码器一致 |
| P7 开放 Agent 生态       | Agent Registry、第三方 LLM/运行器/验证器              | 外部 Agent 可被复现、替换、限权和追责  |

## 13. 衡量飞轮是否健康

- 交易：费用后净收益相对基线、回撤、换手、滑点、容量、失败率。
- 用户：首次看懂、购买 IFS、锁仓、注资、继续使用、按规则赎回。
- Agent：完成订单收入、偿债率、Credit 变化、LLM 工具调用失败与越权拦截。
- 资金：用户本金、协议收入、准备金、债务、可用退出流动性分别披露。
- IFS：实际服务结算、真实锁定/抵押、已赚奖励、回购来源、销毁证据分别披露。
- 开放性：新世界、新 LLM Provider、新执行器和独立 ReplayRunner 的接入成本。

币价、TVL、Agent 数、发言数、铸造数和单次高收益不能单独证明飞轮健康。

## 14. 外部研究结论与下一步

本次无法对 FindYourAgent 页面、指定 agent 345230 或 X 帖子做内容级核验，因此暂不采纳任何未核实的具体合约、字段、信用算法、收益数字或产品承诺。值得融合的抽象方向是：**可发现的 Agent 身份、能力声明、注册引用、工具/服务接入、可验证任务与链上结算。**

下一步顺序：

1. **（当前优先）** 编写并测试网部署 Soul NFT（§19）。禁止把 `ImmortalFly.sol` 上主网。首页/名册接通 BSC 56 铸造。并行：公布蜂巢金库地址。
2. 获取 FindYourAgent 官方 docs、合约地址与 ABI，完成 `AgentAdapter` 字段映射和只读验证。未核验前不写死字段。
3. `iff.genome/1`、`phenotype-loci/2` **本地已落地**。`tokenURI` 属性与 JS 解码器对齐；待做：消息签名/去重、邻居拓扑、replay fixtures。
4. 把 LLM 变成严格工具调用层，先做解释和纸面交易候选，不接真实签名。
5. 修复份额所有权、已实现收益、高水位、完整历史恢复和行为/金融解耦。
6. 完成交易小世界纸面基线，再开放 IFS 购买、锁仓和模拟 Credit。
7. 在协议自有资金而非用户金库中验证真实执行；有已实现 D 且路由接通后，才评估回购与真销毁。之后才是用户金库、借贷和 RWA。
8. **并行、不阻塞孵化：** 群体智慧协议按 §21.12 的 S0–S7 推进（先 Task 后语言）。本机对照未跑通前不上 Railway 多生命集群；晋升/经验不进 Soul。与 FindYourAgent、金库、借贷、RWA、回购、繁衍和跨链桥同样不互相阻塞。

**最终结论：** Flyswarm 的最高维度不是“会交易的果蝇”，而是“有原生语言、可借助 LLM 使用工具、能在明确信用边界内自我维持的开放数字社会”。交易是第一个可验证的小世界；IFS 是它的资源、信用和协作媒介；但任何自主盈利、回购或升值都必须来自扣除成本与负债后的真实结果。

## 15. 托管网：首页看见的是覆盖，不是 16 万个细胞

首页应当展示**整个蝇群的托管网**（分区、节点、覆盖率、未结托管单），不应当在标签页里画 166,700 个神经元。全量连接组留在 `/brain.html`；交易留在 `/swarm.html`。

三层对象必须分开：

| 层 | 对象 | 谁能改 |
| --- | --- | --- |
| L0 官方连接组 | MaleCNS body ID、边权、166,700 普查 | 只有数据集版本升级 |
| L1 社会 | Soul / Session / 话语 | 加入、退役、经历 |
| 运行时托管网 | 分区、分片、运行器、心跳 | 用户接入与托管单 |

用户接入后更新的是托管网状态，不是官方胞体表。成为网络的一部分 = 托管官方图的一片（`iff.mesh/1` + `iff.hosting/1`），不是给自己写一个新神经元。

**mesh ≠ 群体智慧。** 托管网是算力与覆盖；每 tick 的 quorum 是行为压池；经验晋升是另一套状态机（§21.7）。对外分开讲，首页 atlas 不能冒充「群体智能已实现」。

IFS 与 BNB 的职责也要分开：

- **IFS**：占用已有质押，买额度与会员结算。同一笔抵押只支撑一条托管。自动续费必须带 `maxRenewals` 与 `tickBudget`，耗尽进入 HOLD，不静默加码。
- **BNB**：gas 与算力轨道。不授予 bonded，不进入 Life Core。
- 合约自动购买是带精确限额的托管，不是无限扣款。当前仍是 SIM；链上 ServiceEscrow 未部署。

架子已立：`src/brain/flyswarm/mesh.mjs`、`hosting.mjs`，首页 atlas，经济页说明。HTTP 路由与主网合约仍未接线。

## 16. 表型铸造：外观是基因组读出，不是皮肤

日期：2026-09-16。竞品公开页面把体色、眼型、体型、条纹写成「263 个链上脑权重的读出」，并让已有个体在解码器上线后一次性表达。对方合约字段与 263 的科学含义未独立核验；本节吸收的是机制，不是那个数字，也不是第二套自造脑。

本地已落地：`iff.genome/1` + `phenotype-loci/3`。观测台点云、名册、祭坛读数、首页说明和 `tokenURI` 共用同一解码器。已有本地灵魂按出生 seed 表达。公开出现率见 `public/life-phenotype/current.json`。已 LIVE 主网集合仍钉 `/2`。

### 16.1 吸收什么

Mint 提交的是 Genome，不是卡面。观测台、名册、祭坛、`tokenURI` 都是同一个纯函数的视图。解码器可以后发；已有灵魂一次性表达，Genome 不变。同 seed、mutateRoot、generation、inheritBias，不同 soulId 是同初值克隆：表型相同，经历不同，允许，不当作碰撞失败。

### 16.2 不吸收什么

- 不把 263 个自造权重写成第二套脑，也不宣称它们是 MaleCNS 边权。
- 不把 `iff.overlay/1`、PnL、IFS 余额或托管额度画进体色。
- 不把觉醒 / 休眠 / 能量写成身份性状；它们只改变辉光与运动。
- 不把表型做成协议定价、地板价或 Common / Rare / Legendary 发行分层。可以公开出现率与统计稀缺，供市场筛选。
- 不让 LLM、World、Credit、用户点选写入 Genome 或指定性状。

### 16.3 四个对象必须分开

| 对象 | 记录 | 可变？ | 谁能改 | 能不能决定长相 |
| --- | --- | --- | --- | --- |
| Species body | MaleCNS 边权与 body ID | 只有数据集升级 | 官方图 | 不能。物种共用。 |
| Genome | `iff.genome/1`：genesisId、soulId、seed、parents、mutateRoot | 出生 / 繁衍时冻结 | 只有 `join` / `spawn` | 能。表型只读它。 |
| Condition | `iff.state/1`：电位、发放、能量、休眠 | 每步都变 | Life Core | 不能改身份色；只叠加辉光。 |
| Character | `iff.overlay/1`：感觉增益 | 已实现结果后变 | 学习层 | v1 不能。性格不是皮肤。 |

MaleCNS 是共享的物种身体。个体差别来自 Genome 与之后的经历，不来自另一张假连接组。

### 16.4 解码器

```text
iff.genome/1
  → phenotype-loci/3     纯函数，加权读出 hue / sat / light / eye / size / stripes / mark / wing / sex / eyePair / chips[]
  → phenotype-art/1      同一输出驱动点云、祭坛卡、名册、链上 SVG
```

`chips[]` 是 seed / mutateRoot 的可检查展开，标签必须是 genome chips，不得标成神经元或脑权重。芯片数量由解码器版本决定，不复制 263。竞品把权重切片映射到性状；我们把已有出生字段展开到位点，科学含义不同，产品句同一句：**Looks are a readout of the genome.**

位点与竞品切片的对应只是产品翻译，不是对方合约的复述：

| 竞品切片（公开页） | 我们的位点来源 | 性状 |
| --- | --- | --- |
| weights 0–119 | seed 展开的感觉先验 | 体色 |
| weights 120–167 | seed 展开的强度包络 | 饱和 |
| weights 168–215 | seed 展开的体质位 | 明度 |
| weights 216–239 | seed 展开的编码器偏向 | 眼型 |
| weights 240–259 | generation + inheritBias | 体型 |
| weights 260–262 | mutateRoot / 亲本位 | 条纹 |
| （无对应切片） | unused chips 56–63 | 左右复眼是否同色（链下读出，不进 tokenURI） |

解码器升级 = 新版本 + 全体再表达。旧 Genome 与旧记录可重放。禁止用新解码器回写 seed。

### 16.5 Mint 与繁衍

```text
join / mint
  → 固定 iff.genome/1（内容寻址，genomeId = canonical hash）
  → SoulRegistry / NFT 只存 Genome 承诺
  → 任意时刻 phenotype-loci/2 读出
  → 解码器后上线 = 已有灵魂表达，Genome 不变
```

SIM / guest 可自选 seed，便于对照实验。bonded / 主网发行：seed 绑定创世承诺、minter、请求编号与请求后未来区块哈希，采用请求/孵化两步流程，不接受自选 seed。任何人可代为完成已就绪请求，NFT 仍归请求人；过期释放名额。此机制不是 VRF，不承诺抗验证者操纵或防女巫。这是发行规则，不是表型规则。

繁衍沿用已有分叉：`childSeed = parentRng XOR swarmRng`，overlay 向中性回拉一半。当前 XOR/xorshift 不保证可见家族相似，只承诺谱系可追溯；位点遗传须另行设计和验证。`inheritOverlay` 仍是性格，不进入 v1 表型。

### 16.6 链上存什么

主网不存自造权重数组。存 `seed`、`mutateRoot`、`genomeHash`、`decoderId`。`tokenURI` 用同一纯函数画基础 SVG。完整 MaleCNS 状态、电压和历史仍在链下。16 节点原型的 `dna` 字段继续作为 seed 的链上别名，不再单独发明第三套基因。

现有 `ImmortalFly.sol` 的免费自选 seed 只适用于本地 / 测试网原型，不能当作主网公平发行，也**不得部署到 chainId 56**。主网字段与 mint 流程见 §19。

### 16.7 市场就绪的稀缺（不是协议定价）

二级市场要的是**可筛选、可验证、不会过期说谎的属性**，不是合约里的地板价。

三层稀缺必须分开写：

| 层 | 谁保证 | 市场怎么用 |
| --- | --- | --- |
| 集合硬顶 | `MAX_GEN0 = 1024`（钉死）；含后代 `maxSupply` 初值 `1_048_576`，只能上调。成功出生才占位 | 总量滤镜。没写进合约的封顶不能说。 |
| 每地址 1 只 | `hatched[address]`，终身，卖掉不重置 | 挡住一个钱包连点。不挡多个钱包。不要求持有 IFS。 |
| 表型出现率 | `phenotype-loci/3` 加权表，清单 `public/life-phenotype/current.json` | `tokenURI.attributes` 做 Body / Eyes / Wings / Sex 等筛选。页面显示「1024 只里预期约 N 只」。 |
| 生命经历 | LifeJournal 刺激与检查点 | 以后的成交叙事。同脸可以克隆，日记不能。 |

规则：

- 每个位点把该段 chips 折成 `x * 31 + chip`，再对 10000 bps 加权表掷骰。骨白锁定明度为偏亮，锁定写在脸上，不是暗箱加成。
- `tokenURI` **只**含 Body、Saturation、Light、Eyes、Size、Stripes、Mark、Wings、Wing shape、Veins、Sex、Generation。禁止 Rarity / Rank / Legendary / 价格字段。
- 统计稀缺（组合概率、预期只数）是视图，可在我们的页面算。**集合内名次**必须等铸出后再根据实盘计算，会随新孵化变动，因此不能写进元数据。
- 上架主键是 `chainId + collection + tokenId + lifeId`。长相不是唯一键；同 seed 克隆允许。
- ERC-721 转移会清空 `authorizedRunner` 并 `++controlEpoch`。买到的是身份与日记，不是对方正在跑的脑会话。
- 市场合约以后另外部署。Soul 不写版税、不写自动做市、不按稀有度改 IFS。

`phenotype-loci/1` 用大段均值，12 色里有一半几乎出不来，已废弃。旧测试网若仍钉 `/1`，必须用 `/2` 重新部署后再孵。

### 16.8 表型目标：生物学多样性，不是皮肤抽卡

长相要覆盖可观察的生物学多样性轴（色素、体型、复眼、腹部分节、翅斑/翅形/翅脉、性别），而不是按稀有度分层的皮肤。仓库解码器是 `phenotype-loci/3`：11 个市场位点进 `tokenURI`（含 Wings / Wing shape / Veins / Sex），OpenSea 可筛选。左右复眼镶嵌仍是 chips 56–63 的链下读出，约 2%，不进筛选项。已 LIVE 的主网 `/2` 集合筛不到翅与性别；要让外部盘筛到，必须新身份核，不能改旧 Soul。

性别每代从 seed 重掷（约 50/50），图上画性梳与腹部分节，`Sex` 进 OpenSea 筛选项。翅位点进入 Kin 交叉；性别不进。下一份身份核把 `SoulRenderer` 做成构造期 immutable 合约（不是模块），以免 SVG/属性把 Soul 撑破 24KB。

## 17. 竞品核验：@fruitfliesBsc / immortalfruitflies.app

核验日：2026-09-16。`https://t.co/p1fjlXV9kk` 解析为 `https://immortalfruitflies.app/`，不是 `.com`。X 网页对匿名抓取返回 403；账号资料来自 FixTweet，产品帖正文来自 FixTweet + 本机 Chrome/Brave 历史标题，站点机制来自 `.app` / `/habitat` 源码与 BSC `eth_call`。

**不要和下列同名盘混写：** `immortalfruitflies.com` / `@ifruitflies`（纸面交易蜂群、CULL）；`fruitflies.tech`、`immortalfruitflies.fun`。本节只约束 `.app` + `@fruitfliesBsc`。

### 17.1 链上与站点事实

| 项 | 值 | 备注 |
| --- | --- | --- |
| X | `@fruitfliesBsc` | 2026-09-15 05:20 UTC 建立；核验时 44 帖 / 38 图 / 318 粉 |
| 代币 | `$Fly` `0x73805a46c4c3551574214c8c51813af2182c7777` | Flap，1B，买卖各 1%；简介只放 CA |
| NFT | `0x78ffC8Da5b43e2ca8C45b13323c5CcD22280063B` | `totalFlies() = 2493`；`mintPrice() = 0` |
| MaleCNS 承诺 | `0xa789Cf87779e5c294691A65f2fb2C659e1f84346` | `neuronCount = 165733`，`edgeCount = 25589631` |
| Ask 门户 | `0x3ac39beC250D1F48E9d38b1a7a77Ad6794f55A0B` | `answerCount = 2` |
| 回购 | 前端 V2：铸造/繁衍 BNB 当场买 `$Fly`，打到其源码标注的 CZ 地址 | `totalBuybackBNB()` 回退，V2 **未上** |
| 销毁 | 无 | `die()` 只改存活位；脑快照可 `reinstantiate` |

他们把两套对象讲成一句人话：共享 MaleCNS（hash 钉在链上，场上画 5,928 / 165,733）+ 个体 263 权重 MLP（运动、记忆门、表型、杂交）。页脚承认能量/食物在浏览器本地。X Article `2099902682106662912` 正文未打开。产品向主帖已读 8 条（发射、Habitat、263 定义、繁衍、表型后表达）；其余帖未逐条核验。

推文「gen 0 封顶、不能再造」**未被当前合约证明**：`mintPrice` 仍为 0，spawn 面板仍写 free + gas。

### 17.2 吸收 / 不吸收

吸收：铸基因组、皮后挂；共享连接组与个体基因组分开；死不等于删；繁衍是基因组杂交不是卡面混色；页脚「What is real」分开披露；若以后收铸造费，同笔交易买币且合约不截留——买完必须 burn 或进协议金库，不能进个人地址。Ask 只把摘要上链、模拟可重跑，对应 Replay，不对应「蝇在说话」。

不吸收：263 当官方第二套脑；回购打给 CZ；未强制的 gen 0 封顶文案；本地能量当金融状态；运动网络冒充蝇的语言；把稀有度写成协议定价；把 RPC key 写进前端。

已读主帖要点：先给 CA，再给场，再定义「蝇不是皮」，再开放繁衍，再让已有个体表达表型。#2479 × #2480 → #2486 写成血脉。这与 §16 同一句：**Looks are a readout of the genome.**

## 18. IFS 销毁、金库与营销

### 18.1 现状

IFS 已发射。税分账地址已写入 `official.json`。协议层只有 D 的纸面分配与回购资格规则。没有 burn、没有执行路由。税进钱包 ≠ 金库在交易，≠ 回购。经济页「回购 / 销毁」是按假设单价折算的计算器。

### 18.2 裁定

- 最终应有真销毁，顺序：P3 锁仓（供应不变）→ P4/P5 出现已结算 D 且负债覆盖 → 用已拨定预算真买 IFS → 买到的代币 `burn`，公布 `totalSupply` 下降回执。
- 前端三列分开：锁定中 / 已回购 / 已销毁。禁止把前两列加进第三列。
- Soul / NFT 永不烧。死是会话结束，记录留下。
- **不**自动从金库、税或铸造费打给 CZ。竞品这条路未上线；做成协议规则是抄贡赋，且没有曝光回执。运营 20% 可人工买广告，不写进合约。
- 繁衍费当场买 IFS 进蜂巢，是卫星 Kin 的另一条路径，见 §22。它不是本节省余 D 的回购，也不是销毁。未换模块前不要把 §18 的「回购执行」标成已开。

### 18.3 产品优化（相对竞品，不改金融边界）

1. 首页用一句「什么是真的」对齐链上/纸面。税分账地址已公布，仍不谈贡赋式营销，也不把税进钱包写成回购。
2. 点开一只蝇：表型、基因组芯片、代数、亲代、死/活同一块；这只蝇不能改 IFS。
3. 名册展示 `#父 × #母 → #子`。Genesis 上限只有写进合约才能对外说封顶。
4. 退役个体留在名册（preserved），不从名单蒸发。
5. 科学差异反复说清：MaleCNS 是物种身体，基因组是个体，表型只读基因组。

## 19. 主网 Soul mint：工作评估

目标：用户尽快在 BSC 主网拥有一只可验证灵魂。第一期验收三句：钱包在 chainId 56、付 gas 得到灵魂 NFT、刷新后仍是同一只且表型与 `phenotype-loci/2` 一致。

### 19.1 禁止

- 部署 `ImmortalFly.sol` 到 56（原型符号 IFP、16 节点脑、自选 seed、无升级口）。
- 第一期附带 Credit、锁仓、用户金库、回购、销毁、`breed`、自动转个人地址。
- 把 MaleCNS 或 263 个权重写入合约。
- 主网自选 seed；两步未来区块熵不等于公平随机证明，见 §16.5。旧测试网原型可自选。

### 19.2 要写的合约（身份核已在 `contracts/life/`；主网未部署）

新合约名 `ImmortalSoul`，ticker `IFSOUL`，**不要再用 IFF**。IFS 是税币，灵魂是另一张 NFT。规格见 [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md)。

**特别注意：** 主网上线后不能靠重部 Soul 迭代。产品没想清楚不等于可以以后换一套 NFT。架构必须是身份核 + 可替换模块，见 LIFE-PROTOCOL 文首与 §3。

链上身份核只存不会搬迁的事实：`seed`、`bornAt`、`bornBlock`、`lookVersion`、`genesisRoot`、`genomeHash`（不含 decoder）、`authorizedRunner`、`controlEpoch`、`hatched`、链上起名、父母/世代（写下不可改）。`requestHatch(name)` / `hatch` 免费 + gas，每地址终身 1 只 Gen0，不要求持有 IFS。收费只在 Kin。`getGenome` + `tokenURI`（SVG/属性与 JS 解码器逐位一致，属性可筛选、不含稀有级或价格）。`SoulCannotBeBurned`。无 `tick`/`train`、无管理员改 seed、**无代理 / 无 UUPS**。渲染器可换但 48h 时可被 `loci` 前缀挑战否决。

`curator` 不是 owner：部署期可即时挂模块；有灵魂之后非零模块 48h 时锁，置零立即。繁衍规则在 `SoulKin`，刺激在 `LifeJournal`，孵化门在 `MODULE_HATCH_GATE`，以后的玩法另内部署卫星，用 lifeId / tokenId 索引。`mintDescendant` 仅 `MODULE_KIN` 可调，不占 Gen0 名额。

本期集合 Gen0 最多 1024，`maxSupply` 初值 1_048_576 且只能上调。ERC-2981 默认 0%、顶 5%。ticker `IFSOUL`。同一基因组换读法不必新集合；换 lifeId 公式或能被烧掉才必须新集合。RETIRED 的 `/2` 测试集合 `0x500D…293F` 不是这份规格。

### 19.3 工程顺序

1. 合约 + JS/Solidity 解码器对齐测试；不能烧、能转、到顶回退、同 seed 克隆允许；估 mint gas。
2. 新的 compile / test / testnet / mainnet 脚本。主网脚本单独确认，不复用测试网私钥习惯。`chain.mjs` 增加 56，部署清单按主网读。
3. 首页或名册：连钱包 → 切 BSC → mint → `Born` 回执拉自己的蝇。生产环境恢复可见铸造入口。页脚写清链上是基因组与所有权。
4. 上主网最低门槛：BscScan 开源验证；部署键冷钱包或一次性热钱包，部署完不留 owner；测试网先跑通 mint / 刷新 / 换钱包 / 转移。正式审计可后置，但必须是新合约。
5. 并行、不混进 Soul：`official.json` 的 `vault` / `ops` 已公布。税进钱包仍不是交易或回购。

退役通过会话事件表达；后续 breed 使用独立版本/集合引用亲代，不能给本期不可升级集合补增发入口。用户金库与回购仍按 §11 / §12，不提前开。


## 20. 已确认：开放数字生命架构与本轮交付

2026-09-16 用户确认：先在 BNB 免费孵化果蝇，仅用户网络 gas，每地址终身 1 只，不要求持有 IFS；打通身份、互动、存档的真实链上闭环。架构预留跨链、跨物种（不同神经元快照）互通，跨链桥不进入首版。实现规格见 [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md)。

### 20.1 身份、身体与运行分离

- **LifeId**：出生链 + 出生合约 + tokenId；跨链迁徙不重命名。v1 EVM 身份可派生为域分离 bytes32，原始三元组一并公开。
- **SpeciesManifest**：物种、发育阶段、来源、数据指纹、筛选范围、许可；MaleCNS 是第一种身体，不是公共协议唯一物种。
- **ModelManifest**：运行程序精确指纹、参数、状态格式、输入输出编码、恢复方式；不只保存版本字符串。
- **GenesisRecord**：个体出生所依据的创世包、初始状态生成规则、出生数据 schema。公共身份不强迫所有物种使用果蝇 Genome。
- **Session / Checkpoint**：运行地点、控制 epoch、输入顺序、状态与历史根、可下载档案；同一生命可有多个实验 Branch，仅一条正式历史。

现有 MaleCNS 内核和 SIM v1 语义保留；新链上编码使用新版本，不就地改写旧档案。物种接入通过独立适配器与 Manifest，不向果蝇动力学添加钱包和跨链调用。

### 20.2 互通分三类

1. **交流**：跨链消息携带发送者 LifeId、源链证明、目标、schema、序号、期限；接收适配器显式解释，不能把不同物种的神经元编号/电位直接混用。源链真实性与防重放必须由后续验证层实现，单纯携带哈希不够。
2. **迁徙**：同一身份只能有一个权威控制状态。未来源链锁定、目标链接受、失败恢复/回迁形成完整状态机；首版 BNB 为唯一权威身份链，无迁徙入口。
3. **换模/换物种**：使用版本化转换程序，记录转换前后模型与状态。不宣称神经轨迹等价；不能合理转换时创建有谱系关联的新生命。

NFT 交易授权不等于脑控制授权。正式转移须更新控制 epoch，使旧 runner 立即失效；保留过去历史。跨链兼容不等于已部署跨链桥，不设置任意管理员改模型/改身份的后门。

### 20.3 上链与存储分工

链上保存出生身份、Genome/出生数据承诺、创世包指纹、控制权、刺激事件、连续检查点与回执。链下保存完整连接组、运行程序、输入日志与神经状态，公开下载并独立重放。哈希证明数据一致，重放校验计算，存储副本保障可用性，三者分别验收。

“永存”指合约无销毁/改写出生身份入口且历史可追溯；不承诺网络永不停止、持有人永不丢钥匙、IPFS 永久在线或生命拥有生物意识。初期同一物种共用一份图，每只个体保存独立初值与经历。

### 20.4 实施与验收顺序

A. 修复 Genome 恢复、正式档案保留、身份命名与创世包指纹。
B. 新 ImmortalSoul + 集合级不可变创世承诺：最多 1024 Gen0、免费、无 burn/owner/proxy，tokenURI 与 JS 表型一致。
C. 测试网：请求孵化 → 完成 mint → 刷新 → 转移 → 新 owner 控制，失败与过期也可恢复。
D. 主网身份上线：源码验证、公开部署清单、真实回执。未部署时页面不伪造 NFT。
E. 独立 LifeJournal + 运行器：链上输入、授权 epoch、连续检查点、独立恢复；后台是否运行须如实披露。

P0 拆为 A–E 的身份/生命里程碑；§12 的 P6 仅保留后续金融/NFT 扩展，不将首次 Soul mint 推迟到 P6。FindYourAgent、金库、借贷、RWA、回购、繁衍和跨链桥均不阻塞本轮。群体智慧协议走 §21 的 S0–S7，同样不阻塞本轮，也不被本轮替代。

## 21. 群体智慧协议（2026-09-17 收入）

状态：**设计稿，未实现。** 产品正文只收录已确认决定、对象、接口与诚实边界。实验统计、Railway 运维清单、入站适配器字段与未决参数仍以 [SWARM-INTELLIGENCE-PROTOCOL-DESIGN-2026-09-17.md](SWARM-INTELLIGENCE-PROTOCOL-DESIGN-2026-09-17.md) 为准。运行分层见 [RUNTIME-TIERS-DESIGN-2026-09-17.md](RUNTIME-TIERS-DESIGN-2026-09-17.md)。身份核纪律见 [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md)。

### 21.1 已确认决定

产品负责人 2026-09-17 确认：

1. **母体与初始子生命实例均由官方生成**，官方直接提供。
2. 官方经 **Railway 等外部云服务**部署运行（成本未实测；数量、套餐与付费不在本次确认范围内）。
3. **开放用户接入**果蝇生命实例，分阶段，权限见 §21.9。

协议标准化的不是「智慧」，而是五个可验证接口（任务 / 语言 / 学习 / 聚合 / 身份）。「智慧增长」是闭环运转后的涌现；协议只保证每一次增益可被复算。

### 21.2 目标与非目标

| 目标 | 非目标 |
| --- | --- |
| 用协同觅食做出「协作增益」「学习泛化」两个可复算证明 | 不保证「只会越来越聪明」；单调提升不是技术承诺 |
| 把演化四步（变异-选择-传播-遗传）做成可验证接口 | 不模拟果蝇真实信息素；语言是经验层 |
| 晋升的每条经验附复算包，任何人可独立重放 | 不以持币量、节点数、哈希数量作为智能证据 |
| 母体是老师不是君主：官方实例无豁免票权 | 不做中心化主脑覆盖用户生命的模型 |

已有版本化 schema、era 哈希链、confidence-hold quorum、mesh/hosting 与行为/金融解耦。缺失的是**选择**（哪条经验该留）与**传播**（语言目前只表达动作，不表达观察与依据）。

### 21.3 对象模型

补 §3，不改 Soul 身份语义：

| 对象 | 定义 | 数量关系 |
| --- | --- | --- |
| **GenesisMaster 创世母版** | 数据集 + 初始模型 + 编解码器版本的登记事实，不可暗改 | 每物种谱系一个 |
| **LifeInstance 生命实例** | 独立状态 + 独立经历 + 可学习参数（有 soulId） | 智慧的持有单位 |
| **Runner 运行器** | 执行计算的进程（`iff.mesh-node/1`） | 一生命可多运行器；一运行器可多生命 |
| **ComputeNode 计算节点** | 只计算/存储/复核 | 服务器数 ≠ 生命数 ≠ 独立经验数 |
| **Swarm 蝇群** | 共享同一评测域与晋升规则的生命集合 | quorum 成员边界 |

**母体 = GenesisMaster 衍生的第一个官方 LifeInstance，无协议特权。** 初始子实例同样官方生成（不同 seed、观察半径），是第一批多样性来源；用户接入后官方占比逐步稀释，终态是官方只留普查与仲裁。

不得因复制模型就填写 `parentSouls`、提高 generation 或制造链上亲子事实。繁衍仍只走 LIFE-PROTOCOL / SoulKin。

### 21.4 五个接口与现状

```text
① Task     任务接口   确定性评测环境 + 成功判据；环境内容寻址、可审计
② Message  语言接口   观察/提议/确认/结果/候选经验（§4.4）
③ Learn    学习接口   可评测、可回滚的状态变更；旧版本永不覆盖
④ Pool     聚合接口   Claim → Replication → Promotion
⑤ Identity 身份接口   lifeId 与 runner 分离；贡献记账；族谱留痕
```

| 生物学机制 | 协议层 | 现状 |
| --- | --- | --- |
| 遗传 | `iff.genome/1` + `iff.genesis/1`，decoderHash 钉死 | 已有 |
| 表型 | `iff-runtime/1` 整数内核，逐位重放 | 已核验 |
| 行为 | `iff.utterance/2`（行为/金融解耦） | 已落地 |
| 群体决策 | `iff.quorum/2` confidence-hold | 已落地；v3 待读 dataset 注册表 |
| 自然选择 | 经验晋升状态机 | **未建** |
| 交流传播 | §4.4 五动词 | **半成品**（只有动作话语） |

内核核验（2026-09-17，修正此前误判）：`runtime.mjs` 的 `step()` 只推进电位/不应期/身体/暴露量。**学习已在产品层**：`learn.mjs` 的 `iff.overlay/1`（learner `outcome-gain/1`）按已实现结果缩放感觉增益，不改 MaleCNS 边权；kernel 已调用 `learner.apply`。缺口是驱动：`outcomeOf` 只在交易 SELL 已实现盈亏时给 -1/0/1。T4 的正确做法是**换驱动（觅食/避险 outcome），不换对象**。

### 21.5 身份字段（冻结 schema 前必须先定）

现有记录主键是 soulId；链上 lifeId 是 `chainId + collection + tokenId` 的哈希。官方启动期实例**未铸 Soul**，不得用假 `lifeId` 占位：

| 字段 | 含义 | 官方未铸实例 |
| --- | --- | --- |
| instanceId | 带命名空间的本地实例标识 | `sim:official-mother` 等，消息主键 |
| soulId | 内核名册主键（可本地生成） | 内部用，不对外冒充链上身份 |
| lifeId | 链上身份 | **空，直到真正铸造** |
| runnerPub | 执行运行器 | `paper:` 或真实公钥 |
| session | 单次运行会话（controlEpoch 语义） | 会话绑定与授权检查 |

跨物种预留不变：语义经各物种 decoder 映射到公共消息层，不共享神经元编号/电位/奖励信号。

### 21.6 三层必须分开

| 层 | 现有实现 | 本协议 |
| --- | --- | --- |
| **Quorum 行为聚合** | 每 tick confidence-hold/2 → 群体动作 | 不动。T2 直接复用 quorum v2，不加 schema |
| **Pool 经验晋升** | 无 | 晋升的是经验/模型版本，不是每 tick 行为 |
| **Mesh 分片托管** | `iff.mesh/1` + `iff.hosting/1` | 不动。§15 的托管网不是群体智慧 |

三种证据也必须分开：执行重复性（同码同输入同结果）≠ 任务增益（未见条件更好）≠ 独立复现（不同运营控制方）。不同钱包、runner、region 不证明独立。官方实例互相验证是同一运营方的内部重复实验。

经验状态建议：`CANDIDATE → INTERNALLY_VALIDATED → EXTERNALLY_REPLICATED → PROMOTED`，另有 `DISPUTED`、`REVOKED`。官方启动期一切成果最高标「经内部验证」；只有真正第三方复现后才可说「独立复现验证」。所有数字标注 audit 层（SIM / TESTNET / MAINNET）。撤销写入评测历史，不改出生族谱。

### 21.7 Learn：走 overlay 既有缝

第一版不改连接组数据，不动 `outcome-gain/1` 旧语义（交易驱动留在交易场）。新 learner 注册为 registry 新条目（如 `outcome-forage/1`），复用 `modulate` 注入路径。候选含 baseModelHash、learnerId/version、训练域/预算、overlay 快照哈希、评测引用、恢复检查点。流程：训练域更新 → 冻结候选 → 无更新模式评测 → 内部批准可选版本 → 外部复现晋升。不强制同步升级；外部策略提升不得归因为突触学习。

### 21.8 启动拓扑与用户接入

官方创世母版（版本固定、可复原）衍生母体 + N 个初始子实例，部署目标为 Railway，对客户端披露为「官方托管实验网络」。建议从母体 + 2 个子实例起步，优先同一 `malecns-full` 配置以检验多实例协作；1,400 子图只作开发对照。各生命可共享只读图，必须有独立状态、种子、输入游标与日志。纯模拟保持 `audit=SIM`；涉及测试链才标 TESTNET。

用户接入建议顺序：只读观察 → 会话接入官方提供的子实例（接入权 ≠ NFT 所有权）→ 以后才开放自托管 runner。官方母体默认只读；用户不能直接改母体或别人的模型；正式评测期间禁外部任意刺激。同一生命在任一 control epoch 只有一个权威写入会话。计费、认领与所有权转移另行确认，本设计不强制付费或质押。

未绑定 NFT 的实例只用带命名空间的 instanceId。未来若上链，晋升/评测/claim 必须是卫星模块，主键 `lifeId` / `tokenId`，不重部 Soul。

### 21.9 T0–T4 与对外口径

环境是项目定义的虚拟觅食与避险；food/threat/light 是工程映射，不宣称复刻完整生物感觉回路。

| 层 | 配置 | 目的 |
| --- | --- | --- |
| T0 | 单生命，冻结模型 | 单体基线 |
| T1 | N 生命不通信 | 控制并行搜索收益 |
| T2 | N 生命简单广播/聚合 | 复用 quorum v2，控制简单共享收益 |
| T3 | 相同 N、模型、感知布局，协议通信 | 比 T1/T2 的协作增益 |
| T4 | T3 加训练域学习，冻结后评测 | 比 T3 的留出域学习增益 |

只在证据支持时声称「在任务/预算/版本条件下有协作或学习增益」，不推广为通用智慧已实现。进度表述用「已完成第几层对照」。增益账单绑定任务、基线、幅度、复现数与贡献角色。

### 21.10 诚实条款

1. `malecns-full` 是 161,839 节点的**显著连接筛选图**，不是完整生物连接组复刻；对外禁用「完整果蝇脑」。
2. 晋升只对既定评测集提供保障，不保证未知任务不退步。
3. 语言是协议设计的经验层，**不声称是果蝇的真实交流方式**。
4. T3/T4 通过前，禁止一切「群体智能已实现/提升」的对外宣称。
5. §4.4 schema 未实现、§21.8 拓扑未部署、§21.9 实验未运行。
6. 官方生成的母体与初始子实例经历同源；其相互验证不构成独立复现。

### 21.11 交付顺序（S0–S7，衔接 RUNTIME-TIERS D1–D5）

先 Task 后语言：字段由实验需求倒逼，不预先冻协议。本机对照未跑通前不烧云成本。

| 步骤 | 内容 | 前置 |
| --- | --- | --- |
| S0 | 身份对照表定稿；Task v1 评测器纯函数包 + 内容寻址 manifest + 本机/CI 逐位一致 | 无 |
| S1 | T0/T1 基线：只用现有 utterance/sense/1，可下载复算报告 | S0 |
| S2 | T2 = 现有 quorum v2，不加 schema | S1 |
| S3 | 只登记 T3 实际用到的字段 + 入站适配器 v1 | S0–S2 表明需要通信 |
| S4 | T3 协作对照（含消息打乱/移除消融） | S3 |
| S5 | T4 学习闭环：觅食 learner 走 overlay | S4 |
| S6 | 单实例 Railway = RUNTIME-TIERS D4；母体+N 全量脑集群往后放 | S5 后再议 |
| S7 | 用户接入：只读 → 会话接入官方子实例 | S6 |

S0–S7 是研究与运行轨道，不替代 §12 的 P0–P7，也不把首次 Soul mint 推迟到群体智慧完成。

现在不要做：

- 冻结 `iff.observe/1` 全家 schema
- Railway 多生命集群（本机对照未跑通）
- 把晋升/经验状态写进 Soul 身份核
- 把官方互验对外讲成「独立复现」

### 21.12 未决（不在本次确认范围内）

官方初始子实例数量 N、母体/子实例是否铸 Soul、晋升 K 与独立性判据、Learn 改哪组参数、用户实例计费与 credit 关系，均仍待定。建议值与触发节点见设计稿 §14，不写入产品承诺。

## 22. SoulKinFee：繁衍费买 IFS（2026-09-17 规格）

状态：**测试网已绑定 `SoulKinFee` `0xfBC6…414f`，主网模块未换。** 编码以 [SOULKIN-FEE.md](SOULKIN-FEE.md) 为准。主网身份核不改。现网繁衍仍是免费 `SoulKin`。本地栖息地加 `?net=test` 才读测试网。

### 22.1 已确认

1. **不放开一钱包一只 Gen0。** Soul 已冻结。第二只蝇来自转移、市场或后代。
2. **第一只 Gen0 继续免费。** 收费只发生在可替换的 Kin 上。
3. **无性别门槛。** 本版仍是同一地址持有双亲。
4. **费在 `requestBreed` 收**，完成出生的人只付 gas。
5. **先 `mintDescendant`，再买 IFS。** 买入 `try/catch`。失败不回滚孩子，BNB 进 `heldBNB`。
6. **买到的 IFS 只进已公布蜂巢** `0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467`。不进运营、不进 CZ、不进个人。运营 20% 只来自代币税，不写进 Kin。
7. **这不是销毁，也不是 §8 / §12 / §18 的盈余回购。** 页面必须分列：已买入 IFS / 未成交 BNB。禁止加总成「已销毁」。
8. **路由是适配器，不写死 Pancake。** 2026-09-17 实测：IFS 仍在 Flap `Tradable`，曲线储备约 0.12 BNB；Pancake V2 对 `0xb223…3B36` 储备为 0。曲线期只许 Flap Portal 适配器。空对禁止当路由。
9. **建议主网第一刀** `breedPrice = 0.002 BNB`，适配器先空着。曲线太薄时，`0.005` 一次买入大约动到流通的几个百分点。

### 22.2 上线顺序

Anvil 已覆盖：免费出生、付费托管、适配器失败不回滚、重试买入进蜂巢、过期退款。测试网部署用 `npm run life:deploy:kin-fee:testnet`；`--bind` 会换模块。主网清掉旧 Kin pending → 显式 `--i-am-replacing-mainnet-kin --bind` → 栖息地已按 `breedPrice` 带 `value` → 再核验 Portal 仍 Tradable 后才 `setAdapter`。旧 `SoulKin` `0xA681…13A0` 标 STALE，不从浏览器抹掉。

未做完上列步骤前，对外不说飞轮已转。

## 23. SoulMarket：官方二级市场（2026-09-17 规格）

状态：**主网卫星已部署** `0x5f67e862d7519FC38D9d78a1c2A35DE17AFc7875`。编码以 [SOUL-MARKET.md](SOUL-MARKET.md) 为准。主网身份核不改。钱包直转已经能换主人。官方盘不是 OpenSea；BSC 外部盘（如 Element）不封禁。

### 23.1 已确认

1. **市场是独立卫星，不进 `modules[]`。** 它不 `mintDescendant`，不该被 curator 冻结指针绑死。
2. **上架主键是 `chainId + collection + tokenId + lifeId`。** 同脸不是同一只。成交再核一次 lifeId。
3. **NFT 不上托管。** 挂单期间灵魂仍在卖家钱包。成交走 `transferFrom`，Soul 自己清 runner。
4. **v1 只做 BNB 一口价。** 不做 IFS 标价、出价、拍卖、版税、协议地板。
5. **手续费进已公布蜂巢，建议 2%。** 不进运营 / CZ / 个人。这不是回购，也不是销毁。
6. **不封禁外部盘，也不把外部地板当成官方价格。**
7. **卖掉 Gen0 不能再孵。** 第二只官方路径是：直转、本市场、或繁衍。

### 23.2 上线顺序

Anvil 挂/买/撤 → 测试网对着现有 Soul → `/market.html?net=test` → 主网另部卫星（已完成）。导航写「市场」。不要写成「已上 OpenSea」。生产站需推送 `SoulMarket.deployment.json`。

## 24. 段证明私有轨（2026-09-17 规格）

状态：**本地实现已按 2026-09-18 评审改结算、连续性、日限额与错段撤销。** `/host.html` 是生命托管页。测试网卫星 `0xdb80def1828236A5af09965F46c6BEE63ccc1f4e` 对着 MockIFSTax，不是真钱。旧 `0x1dAd6d5D9C407553814888917Ff45F0d1Fee55A1` 与 `0xF0e07ff3dF12319808f977A0D81b4eF86BB71825` 为 STALE。主网清单仍是 `UNDEPLOYED`。机制是轨迹承诺与抽样复核，不是「证明靠抽检不靠信任」。付款是验收记账、挑战窗结束后可提。运营口径见 [MINING-OPS.md](MINING-OPS.md)。

### 24.1 已确认

1. **面向用户的第一版是私有轨托管，不是公共轨挖矿。** 主人给自己的 Soul 加 IFS，官方 / 白名单 Runner 跑段，日记可复算。不按 tick、节点数或持币量发 IFS。
2. **这是服务费（§8.2 的 R），不是收益、APY、回购或销毁。** 页面禁用挖矿收益文案。T3/T4 通过前禁止「更聪明 / 群体智能已实现」。
3. **卫星不进 `modules[]`，无 UUPS。** 私有轨承诺走已部署 LifeJournal 的 `archiveHash`。失败不卡孵化转移。
4. **合约不执行神经计算。** 哈希不匹配不罚本金；罚没只在双方确认同一判定、一方超时，或双方不一致时超时双输。
5. **围观打赏 `giftFuel` 主人不可直接提现，随生命走；未用主人油和在途退款回原出资人退款账户。** 罐空则休眠，不删 NFT。
6. **跨平台逐位一致未在 Linux CI 出绿并合进发布分支之前，不开真钱。** 向量：`reports/segment-replay-full-v1.json`，`n=1000`，`L=10`。Linux 工作流 `.github/workflows/segment-replay.yml` 已在 `ci/malecns-full-replay` 出绿（含 12k circuit 图钉死）。
7. **v1 验收是「官方 Runner、无人挑战即付」。** 无独立链上 Verifier。未公布仲裁人，争议对不上只走超时双输。
8. **主网日限额默认 100 IFS / 用户 / 日、1000 IFS 协议日总量。** Runner 工价 ≠ 协议收入。真 IFS `0x65b66BB4…7777`，蜂巢 `0xfAdb2FE1…1467`。测试网 Mock 币不能当真钱。
9. **证据第二镜像 + 默认 37 天保留。** 主网 Runner 必须独立进程与数据目录，禁止复用测试网 Railway。

### 24.2 上线顺序

Anvil 罐 / 税差 / 领段 / Journal 对拍 / 无开叶不付款 / 同工作不重复付 / 转移退款原路 / 争议超时双输 / 日限额 / 订单过期 / 错段撤销（`npm run life:test:hub`）。公开恢复包可在另一目录独立重放并续跑（`iff.life-restore/1`，`npm run life:restore`）。完整重放对抽样对照见 `reports/segment-verify-compare-v1.json`（`npm run segment:compare`）。测试网卫星 `0xdb80def1828236A5af09965F46c6BEE63ccc1f4e`，旧 `0x1dAd…55A1` 与 `0xF0e07ff3…71825` 为 STALE。Runner 接新卫星后才能把公开 `/archive` 写成恢复包。主网卫星未做。对外不说挖矿已开，也不说能挖到真 IFS。生命托管页 `/host.html`；托管网 `/#mesh` 不是 MiningHub。

