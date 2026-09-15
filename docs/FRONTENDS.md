# 两套前端

Immoral / Immortal 需要两套互不替代的界面。

## 1. 自己部署的站点（本仓库）

Vite 多页：`/swarm.html` 交易蜂群、`/` 对外主站、`/brain.html` 连接组连接组、`/economy.html` 情景沙盘、`/blueprint.html` 蓝图。五页共用 `SiteBar` / `SitePage`。生产环境 `/altar` 仍重定向到蓝图（见 `vercel.json`）。

这是对外主站。蜂群是当前产品主循环，只跑纸面账本。测试网合约部署后，本地祭坛读写 `ImmortalFly`；生产环境祭坛已并入蓝图。连接组与经济页不发交易。`$IFS` 已在 BSC 主网发射（见 `docs/FLAP-LAUNCH.md`），金库地址未公布。

部署方式自选：静态托管、自己的域名。**不会**被 Flap 自动当成站点皮肤。

## 2. Flap 上的 Vault UI

Flap 收的是 Vault 合约 + 可选、经审核的 **Vault UI / Mini App**（通常是规定好的少量文件，嵌在 flap.sh 相关页）。那不是把本仓库整站上传。

flybrain 一类项目若在 Flap 页看到自己的界面，走的是这套嵌入包，不是 Vite 站点。

本阶段先不制作 Flap 包。测试网闭环和最小祭坛完成、合约地址稳定后，再按 Flap Artifact Workbench 拆一版只含铸造/状态/训练的嵌入 UI。
