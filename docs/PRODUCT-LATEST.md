# IMMORTAL FLYSWARM：Agent Society Trading World

日期：2026-09-16。状态：唯一当前产品与架构设计；未实现、未部署、未构成收益或金融产品承诺。

研究入口：`findyouragent.xyz/#/agent/56/345230`、`findyouragent.xyz/docs`、X 帖子 `BortOnBsc/status/2099177206375219453`。本次环境无法解析 FindYourAgent 域名，浏览器不可用，X CLI 也没有登录 Cookie，因此没有把这些页面的具体字段、合约或帖子内容写成事实。文中“Agent Registry / Capability / Credit”是基于链接主题和通用可验证 Agent 系统抽象出的待核对兼容层；接入前必须用官方文档、合约和实际回执逐项核验。

## 1. 最终定位

**Flyswarm 是一个由永生果蝇组成的开放 Agent Society。每只果蝇有连续身份、私有经历和可重放状态；社会使用一套极小、可验证的行为语言交流；LLM 作为外部认知与工具层扩展能力；交易世界是第一个可用小世界；IFS 是访问、信用、服务和协议盈余的共同结算资产。**

一句话：

> **让一群永生果蝇用自己的语言交流，在一个真实有风险的交易世界里协作、生存，并靠可验证的金融结果补充自己的 credit。**

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

| 对象 | 语义 |
| --- | --- |
| Soul | 持续身份；历史不因退役删除 |
| Session | 在某世界、模型与运行器中的一段生命会话 |
| Branch | 从检查点产生的个人实验分支，不是正式社会的重复投票权 |
| Memory | 可验证经历引用与学习结果；下载别人记忆不等于已学会 |
| Credit | Agent 当前可用的资源信用；来自抵押、预付、完成订单、已结算收益与声誉证据 |
| Controller | 人、组织或合约对授权范围的控制者；与 Soul、NFT、运行器分开 |
| Agent Profile | 可验证的能力、版本、来源、权限、价格、信用与历史摘要 |

迁徙、复活、继承和 NFT 只追加事件。更换 LLM 不改变 Soul；更换 Life Profile 会生成新的运行配置与迁移事件。不同模型轨迹不宣称等价。

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
  "intensity": {"food": 31, "threat": 4, "light": 8},
  "confidence": 0,
  "memoryRefs": ["checkpoint-hash"],
  "provenance": {"dataset": "male-cns:v1.0", "runtime": "iff-runtime/1"},
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

- 写入 Life Core 状态、修改边权、伪造 Memory 或改变历史。
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

| 账户 | 来源 | 能做什么 | 能否直接取出 |
| --- | --- | --- | --- |
| Free Credit | 公共世界赞助、试用额度 | 观察、低风险实验、有限 LLM/验证 | 不能 |
| Locked Credit | IFS 锁仓或其他合格抵押 | 获得额度、费用折扣、投标资格 | 解锁前不能 |
| Earned Credit | 完成可验证交易、运行、验证或创作订单 | 支付未来服务、提高非资金能力等级 | 按协议可结算部分领取 |
| Liquid Credit | 已结算、扣除负债与准备金后的可用余额 | 支付服务、续费、返还或兑换 | 可按规则支出/退出 |

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

回购只使用已拨定的 D，要求没有未覆盖退款、保证金、客户本金、借款、准备金和争议负债；路由不可执行或冲击过高时停机。实际销毁能力未经核验时，不把锁仓或转入地址称为销毁。

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

| 模块 | 职责 |
| --- | --- |
| SoulRegistry | Soul、模型来源、控制权、会话 epoch、迁徙事件 |
| AgentAdapter | 外部 agentId 映射、能力与证据引用；默认只读 |
| CreditLedger | 四类 Credit、来源、债务、冻结、衰减和额度 |
| IFSStaking | IFS 锁仓、解锁、会员权益与占用状态 |
| Vault / Position | 用户份额、高水位、费用、入金、赎回与批次 |
| LendingPool | 出借、债务、利率、抵押、清算和坏账隔离 |
| RwaSleeve | 白名单 RWA、估值、发行方回执、限制与退出 |
| ServiceEscrow | LLM、运行、验证、保存等服务订单、里程碑与退款 |
| Treasury | 协议自有资产、准备金、生态预算、IFS 价值预算 |
| Executor | 精确限额、nonce、过期、白名单和回执；禁止任意 calldata |

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

| 阶段 | 目标 | 退出条件 |
| --- | --- | --- |
| P0 语言与身份 | Fly Language、Soul、Session、完整 bundle、Replay | 独立进程逐位恢复；旧记录语义不变 |
| P1 LLM 边界 | 解释、检索、候选计划、工具白名单、策略验证 | LLM 缺席仍可运行；无未授权资金调用 |
| P2 交易纸面世界 | 只读市场、模拟交易、Colony/Intent/Risk/Execution 分层 | 与简单基线比较；净成本、失败和回撤透明 |
| P3 IFS 会员与模拟 Credit | 购买、锁仓、占用、Credit 四账户、服务订单 | 不重复抵押；亏损和到期会收缩额度 |
| P4 协议自有资金 | 限额真实执行、独立风控、回执与自有资金收益 | 不动用户资产；外部审计和压力测试通过 |
| P5 用户金库 | 份额、高水位、赎回、费用与 Position NFT | 权属、会计、退出和失败恢复通过 |
| P6 借贷/RWA/NFT | 各自隔离池与专属风险模型 | 发行方、估值、清算、准入和合约审计完成 |
| P7 开放 Agent 生态 | Agent Registry、第三方 LLM/运行器/验证器 | 外部 Agent 可被复现、替换、限权和追责 |

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

1. 获取 FindYourAgent 官方 docs、合约地址与 ABI，完成 `AgentAdapter` 字段映射和只读验证。
2. 定义 Fly Language schema、消息签名/去重、邻居拓扑和 replay fixtures。
3. 把 LLM 变成严格工具调用层，先做解释和纸面交易候选，不接真实签名。
4. 修复份额所有权、已实现收益、高水位、完整历史恢复和行为/金融解耦。
5. 完成交易小世界纸面基线，再开放 IFS 购买、锁仓和模拟 Credit。
6. 在协议自有资金而非用户金库中验证真实执行，之后才评估用户金库、借贷和 RWA。

**最终结论：** Flyswarm 的最高维度不是“会交易的果蝇”，而是“有原生语言、可借助 LLM 使用工具、能在明确信用边界内自我维持的开放数字社会”。交易是第一个可验证的小世界；IFS 是它的资源、信用和协作媒介；但任何自主盈利、回购或升值都必须来自扣除成本与负债后的真实结果。
