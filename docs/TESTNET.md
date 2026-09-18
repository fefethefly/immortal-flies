# BSC 测试网闭环（16 节点原型）

**范围：** 本文只描述旧原型 `ImmortalFly.sol`（`iff-neural-16-v1`）在 **BSC Testnet chainId 97** 上的读写。它不是主网灵魂，也不是 `$IFS`。

**主网禁止：** 不要把这份合约部署到 BSC 主网（56）。主网身份是 `contracts/life/ImmortalSoul.sol`。测试网灵魂用：

```sh
npm run life:check:testnet
# IFF_DEPLOY_KEY=0x… npm run life:deploy:testnet
# IFF_DEPLOY_KEY=0x… npm run life:hatch:testnet
```

部署清单：`public/contract/life/ImmortalSoul.testnet.json`。生产栖息地默认读主网 `ImmortalSoul.deployment.json`；本地要练测试网繁衍加 `?net=test`。`status` 以 `STALE` 开头的旧 `/1` 集合不会被前端当成活合约。当前解码器是 `phenotype-loci/2`。2026-09-16 测试网身份核：`ImmortalSoul` `0x3487A2802AF82F12Bb7a3dd40B262394f4819A5a`。2026-09-17 已把 `MODULE_KIN` 换成 `SoulKinFee` `0xfBC663EF50fF104277D05c520994E25a2391414f`（价可改，适配器未接）。旧免费 Kin `0xCA916D8632805FDC204eadF381f5243296f8A4d6` 留作 STALE。旧 `0x220e…7322` 已废弃。旧祭坛仍走 `ImmortalFly.sol`。

当前目标：若仍要练旧祭坛，可把原型部署到测试网，再用本地祭坛签名。当前状态：`public/contract/ImmortalFly.deployment.json` 为 `UNDEPLOYED`。生产环境 `/altar` 已重定向到蓝图页；本地 `npm run dev` 仍可打开 `altar.html`。MaleCNS 连接组、迷宫成绩、Flap Vault UI、主网 Soul mint 都不走这条合约。

## 两套前端

| 表面                           | 现在做什么                                                            | 以后做什么                                     |
| ------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------- |
| 本地祭坛（Vite：`altar.html`） | 自己部署的最小链上祭坛：切测试网、铸造、训练、休眠、转生、读 `getFly` | 继续做完整实验室与发行说明                     |
| Flap 页面                      | 不提交这套网站                                                        | 单独打 Vault / Artifact 四文件包，嵌在 flap.sh |

连接组实验室 `brain.html` 始终离线，不发送交易。

## 部署合约（你本地执行）

账户需要测试网 tBNB。私钥只放环境变量，不要贴进聊天或提交到 git。

```sh
# 可选：先确认 RPC 与编译
npm run contracts:check:testnet

export IFF_DEPLOY_KEY=0x你的测试网私钥
# 可选：export BSC_TESTNET_RPC=https://bsc-testnet-rpc.publicnode.com
npm run contracts:deploy:testnet
```

成功后会覆写 `public/contract/ImmortalFly.deployment.json`（地址、`fromBlock`、浏览器链接）。前端靠这个文件找到合约；编译脚本只更新 ABI，不会清掉地址。

也可以用 `VITE_IFF_ADDRESS=0x…` 覆盖地址后重启 `npm run dev`。

## 本站最小流程

1. `npm run dev -- --port 4173`
2. 浏览器装好钱包，点「署名」
3. 批准切到 BSC 测试网
4. 若该地址还没有代币，在祭坛铸造（`mint(seed)`，seed 来自当前本地 DNA，0 则用 3700127）
5. 训练 / 休眠 / 转生会弹出签名；成功后页面用 `getFly` 覆盖显示
6. 链上模式关闭本地每秒 `tick`，避免和合约状态分叉
7. 迷宫、本地封存/导入仍是本机实验，不会写成合约状态

浏览器要能访问测试网 RPC。公共节点偶尔限流时，可自备 `BSC_TESTNET_RPC`。

## 尚未包含（也不该由本原型补）

- 主网 Soul mint（新合约，见 PRODUCT-LATEST §19）
- 付费 mint、繁衍、成就上链
- Flap 自定义 Vault UI
- 把 MaleCNS 16 万神经元写进合约
- 销毁、回购执行、金库地址公布（与本原型无关）
