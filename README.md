# IMMORTAL / Fruit Flies

**The Swarm Trades. — 果蝇上链，先学会买卖。**

一个为 BNB Chain 设计的数字生命原型。活着的第一件事是交易：趋近与退避被读成买入与卖出。身份、训练与转生留在祭台；出借、金库与预测是后续金融行为，不另起策略机器人。

## 启动

需要 Node.js 22+。

```sh
npm install
npm run dev -- --port 4173
```

打开 http://127.0.0.1:4173/ 看对外主站，http://127.0.0.1:4173/swarm.html 看交易坑，http://127.0.0.1:4173/brain.html 看连接组全典，http://127.0.0.1:4173/blueprint.html 看蓝图。生产环境 `/altar` 与 `/economy` 已重定向到蓝图（见 `vercel.json`）；本地仍可打开 `altar.html`。生产构建：`npm run build`，本地预览：`npm run preview -- --port 4173`。官方代币清单在 `public/token/official.json`，ticker 为 `$IFS`，已在 BSC 主网发射（`0x65b66bb4adb0e244e19d290b6aaa0381b81a7777`），发射记录见 [docs/FLAP-LAUNCH.md](docs/FLAP-LAUNCH.md)。

## 这一版可以做什么

- 在真实 MaleCNS 1,400 节点感官-运动子图上，观看 5 只果蝇在纸面账本上买卖 IFL/BNB，注入花蜜、威胁、光或暗，等待退役与繁衍。
- 观察维特鲁威印记：圆、方、准星与白线果蝇。
- 花蜜、光源与避障训练真实改变三组学习参数和神经状态。
- 休眠暂停模型；转生补充能量，保留身份、基因与已学习状态。
- 在迷宫中自主寻果，形成仅保存在本地的挑战记录。
- 查看 16 节点模型的电位与脉冲图谱。
- 浏览 Amber / Echo / Phantom 三张有倾斜与光泽反馈的创世卡片概念。
- 封存、恢复、导入完整 JSON 档案；导出提供下载和全文复制两种路径。
- 独立运行连续 64 步的保存/恢复一致性验证。
- 手机与桌面响应式布局、键盘可操作弹窗、减少动态效果支持、可选交互音效。

状态会保存在当前浏览器。模拟仅在页面可见、未休眠且没有正在执行的交互时每秒推进一步；关闭页面不会偷偷推进或惩罚用户。清除网站数据会移除本地进度，请保存档案。内置浏览器对下载的支持可能不同，档案弹窗始终提供可选择的完整 JSON 文本。

## 范围与事实

**$IFS 代币已在 BSC 主网发射**（记录见 [docs/FLAP-LAUNCH.md](docs/FLAP-LAUNCH.md)）；但 **NFT 合约主网尚未开放**、测试网合约也未部署（`public/contract/ImmortalFly.deployment.json` 仍是 `UNDEPLOYED`），祭台只是本地仪式。部署后连接钱包会切到 BSC 测试网（97），铸造与训练会发交易。迷宫成绩、本地档案、MaleCNS 全典都不能当作链上资产或官方成绩。

模型名称为 `iff-neural-16-v1`：16 个节点、3 组可训练参数与确定性随机状态。它受到果蝇行为启发，并非完整果蝇脑连接组，更不代表意识上传。页面中复杂的发光线路是美术表现；神经图谱展示的是轻量模型的实际电位与脉冲。

SHA-256 校验用于验证档案完整性，不能证明档案的来源、持有人身份或成绩真实性。复制状态和复制 NFT 所有权是两回事。

## 链上原型

[contracts/ImmortalFly.sol](contracts/ImmortalFly.sol) 是可编译 ERC-721：固定上限 1024；完整保存轻量模型状态；内置基础 SVG 和元数据；无 burn、管理员、代理升级或任意状态覆写入口。状态由交易推进。

本地祭台（`altar.html`，生产环境已并入蓝图）已写好测试网读写代码：`src/chain.mjs` 负责切链、发现代币、`getFly` / `mint` / `train` / `sleep` / `wake` / `rebirth`。地址写在 `public/contract/ImmortalFly.deployment.json`（当前 `UNDEPLOYED`）。艺术卡面仍用本地图片；链上 SVG 是独立兜底。主网、发行规则和独立安全检查尚未完成，不能承诺“已经在 BNB 永存”。

两套前端：[docs/FRONTENDS.md](docs/FRONTENDS.md)。测试网步骤：[docs/TESTNET.md](docs/TESTNET.md)。Flap Vault UI 是另一包，现在不做。

详细接口、权限、限制与复原代码见 [contracts/README.md](contracts/README.md)。特别注意：原型的 NFT approved operator 同时具有改变模型状态的权限；正式版需要单独设计游戏操作授权。

## 验证

```sh
npm test
npm run build
npm run contracts:compile
npm run contracts:test
npm run contracts:check:testnet
```

合约测试需要安装 Foundry 的 `anvil`。脚本仅启动临时本地链、运行测试并关闭，不连接公共链。

本次验证：

- 7 项蜂群测试通过：同刺激重放、花蜜/威胁改变买卖倾向、淘汰与繁衍、纸面账本不印钞、刺激冷却、行为解码、交易意图不能执行。
- 6 项模型/档案测试通过：轨迹恢复、损坏档案、元数据校验、休眠转生、训练和能量、合法迷宫路径。
- 10 项连接组内核测试通过：同输入重放、中断后从检查点继续、拒绝重复/过期/乱序/停用输入、新增适配器不改身份、模型迁移可追溯、损坏档案拒绝、Flap 预览不能执行且凭证只能消费一次、只读市场采样拒绝错误链和重组、官方 MaleCNS 子图保留 body ID 并可重放。
- 12 项本地链测试通过：包括实际铸造 1024 只并拒绝第 1025 只、权限和转让、JS/Solidity 数值一致、完整状态恢复、链上 SVG。
- 19 项蝇群协议测试通过：schema 语言法、创世内容寻址、名册双层身份、era 分片日志、confidence-hold 三验收向量（分裂必 HOLD / 逐位重放 / 客脑不可写官方 body ID）、内核话语-记忆-聚合闭环、退役不删灵魂与检查点繁衍。
- 浏览器验证训练、休眠、转生、挑战、恢复、损坏档案拒绝与 64 步证明。下载完成事件在内置浏览器中未能确认，因此提供并检查了可完整读取的 JSON 备用导出路径。
- BSC 主网实测：`$IFS` 代币存在于 `0x65b66bb4adb0e244e19d290b6aaa0381b81a7777`，symbol `IFS`、总供应 `1e27`、owner 为 Flap Portal（`0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`），与 [docs/FLAP-LAUNCH.md](docs/FLAP-LAUNCH.md) 发射记录一致。

本地 gas 样本：mint 181,608，32 步 train 约 629,000，rebirth 39,811。不是 BSC 的实时报价，不能据此承诺费用。生成的明细位于 `artifacts/contract-test-report.json`。

## 源码导航

| 路径                 | 作用                                 |
| -------------------- | ------------------------------------ |
| `src/swarm.mjs`      | 首页纸面场占位：LIF、刺激、记账（不再是交易坑决策） |
| `src/swarm-page.jsx` | 交易坑：左坑右案、血统与成交河（读 MaleCNS colony） |
| `src/brain/flyswarm/pit.mjs` | 交易坑数据桥：真实子图 → 内核 → 视图与持久化 |
| `src/swarm-pit.jsx`  | 坑中画布、天平、风琴键、名册         |
| `src/App.jsx`        | 祭台页面、交互与操作互斥             |
| `src/vitruvian.jsx`  | 维特鲁威印记与 Logo                  |
| `src/components.jsx` | 印记、卡片、弹窗等组件               |
| `src/brain/`         | 开放核：ethology / ports / learn / treasury / kernel |
| `src/brain/flyswarm/` | 蝇群协议：schemas / genesis / membership / log / quorum |
| `src/brain-page.jsx` | 活体实验室入口                       |
| `public/data/`       | MaleCNS 处理后的连接组               |
| `src/chain.mjs`      | BSC 测试网连接与合约读写             |
| `src/engine.mjs`     | 确定性模型、档案校验、迷宫           |
| `src/storage.mjs`    | 本地保存与损坏缓存恢复               |
| `src/styles.css`     | 设计系统、响应式与动效               |
| `public/assets/`     | 生成的果蝇美术                       |
| `public/fonts/`      | 本地字体及 OFL 许可证                |
| `contracts/`         | Solidity 合约及说明                  |
| `tests/`、`scripts/` | 模型和合约验证                       |

[最新产品与架构设计](docs/PRODUCT-LATEST.md) · [Flap 发射](docs/FLAP-LAUNCH.md) · [生物学资料](docs/BIOLOGY-SPINE-V6.md) · [美术素材与生成记录](docs/assets.md)

## 下一阶段

阶段划分以 [docs/PRODUCT-LATEST.md](docs/PRODUCT-LATEST.md) 第 12/14 节为准：

1. 蝇群协议 P0（语言与身份）已全部落地：schema 语言法、创世内容寻址、双层名册、era 分片日志、confidence-hold quorum 接入内核（替换朴素多数），交易坑 `/swarm.html` 已改读真实 MaleCNS 1,400 节点子图（`src/brain/flyswarm/pit.mjs`），24 节点占位只剩首页纸面场。
2. 下一阶段是 P1「LLM 边界」：解释、检索、候选计划、工具白名单与策略验证；原「活场」（六类事件落场、因果条、蜂巢压力计、ask 通道）并入 P2「交易纸面世界」。
3. 用带 tBNB 的测试网私钥跑 `npm run contracts:deploy:testnet`，再在本地祭台走完铸造 → 训练 → 休眠/转生。
4. 修复 [docs/PRODUCT-LATEST.md](docs/PRODUCT-LATEST.md) 第 11 节列出的资金缺口（份额所有权、已实现收益、高水位、行为/金融解耦、完整历史恢复）；修完前不开放用户真实抵押、借贷、金库收益或自动回购。
5. 根据实测 gas 决定哪些互动逐笔上链、哪些先在本地预演；Flap 嵌入包、主网 NFT、发行规则和独立安全检查仍在后面。

## 连接组运行内核（第一版）

独立于首页 16 节点原型：大脑运行、输入适配、状态恢复和 Flap 预览已经拆开，并接入 Janelia 公开的 MaleCNS v1.0（CC BY）。

- 打开 http://127.0.0.1:4173/brain.html 。现有视觉首页保留，作为对照入口。
- 交互子图与全量图共用同一套接口。子图随仓库提供；全量图需本地生成，不提交到 Git。
- 页面区分三类事实：官方神经元编号与连接、本项目定义的刺激映射、以及美术光效。
- 输入带有来源、版本和顺序校验；状态可以导出、重放、在中断后从本机档案恢复；更换模型会留下迁移事件。
- Flap 接口只生成 BSC 测试网模拟意图，不能签名或发送交易；同一动作凭证只能消费一次。

```sh
python3 -m pip install pyarrow pandas
npm run connectome:prepare            # 交互子图
npm run connectome:prepare -- --full  # 全量图，约数百 MB 源文件
npm test
```

来源、许可证、预处理与映射规则见 [docs/CONNECTOME-MALE-CNS.md](docs/CONNECTOME-MALE-CNS.md)。产品与开放架构见 [docs/PRODUCT-LATEST.md](docs/PRODUCT-LATEST.md)。
