# 两套前端

Immortal 需要两套互不替代的界面。

## 1. 自己部署的站点（本仓库）

单页壳：`src/site-app.jsx` 读路径，在同文档里切 `/`、`/habitat.html`、`/field.html`、`/host.html`、`/market.html`、`/colony.html`、`/swarm.html`、`/brain.html`、`/economy.html`、`/blueprint.html`（另有 `/live.html`、`/protocol.html` 不在主导航）。这些 HTML 只是同一壳的入口，刷新可深链。顶栏点击不再整页卸载。生产环境 `/altar` 仍重定向到蓝图（见 `vercel.json`）。

首页与栖息地可用 `?hatch=1&given=Name`（或 `#hatch`）打开孵化面板。移动钱包回跳必须带上同一查询，否则起名会丢。实现：`src/life/hatch-intent.mjs`。

`/host.html` 是私有轨生命托管：添料、绑定 / 更换 Runner、账单、恢复档案。它读 MiningHub 清单，不是首页托管网（MaleCNS 分片覆盖沙盘）。主网 Hub 未部署时页上写明，可用 `?net=test` 看测试网模拟币。工价不是挖矿收益。页面把每只生命的预付续跑金称作培养基（英文 Vial）；链上标识仍是 `Tank` / `refuel`。

`/colony.html` 是群体只读台账：链上名册的位点筛选图鉴、Gen0 已观测对照公布率的初代图谱、按交叉规则（亲本各半 + 约 2% 突变）给出几率与真实研磨样本的繁衍预测器、血脉榜，以及覆盖全部性状值的「预览图鉴」（未出生标本，真实 seed 读出，明确标注）。它不写链，出现率不是定价。

这是对外主站。蜂群是当前产品主循环，只跑纸面账本。测试网合约部署后，本地祭坛读写 `ImmortalFly`；生产环境祭坛已并入蓝图。连接组与经济页不发交易。`$IFS` 已在 BSC 主网发射（见 `docs/FLAP-LAUNCH.md`），税分账地址已写入 `official.json`。税进钱包 ≠ 金库在交易，≠ 回购。

部署方式自选：静态托管、自己的域名。**不会**被 Flap 自动当成站点皮肤。

## 2. Flap 上的 Vault UI

Flap 收的是 Vault 合约 + 可选、经审核的 **Vault UI / Mini App**（通常是规定好的少量文件，嵌在 flap.sh 相关页）。那不是把本仓库整站上传。

flybrain 一类项目若在 Flap 页看到自己的界面，走的是这套嵌入包，不是 Vite 站点。

本阶段先不制作 Flap 包。测试网闭环和最小祭坛完成、合约地址稳定后，再按 Flap Artifact Workbench 拆一版只含铸造/状态/训练的嵌入 UI。
