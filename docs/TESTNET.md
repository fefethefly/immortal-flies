# BSC 测试网闭环

当前目标：先把 `ImmortalFly` 部署到 **BNB Smart Chain Testnet（chainId 97）**，再让本地祭坛用钱包签名读写同一只果蝇。当前状态：`public/contract/ImmortalFly.deployment.json` 为 `UNDEPLOYED`。注意：生产环境 `/altar` 已重定向到蓝图页；本地 `npm run dev` 仍可打开 `altar.html` 走下面的流程。MaleCNS 连接组、迷宫成绩、Flap Vault UI 都不走这条合约。

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

## 尚未包含

- 主网、付费 mint、繁衍、成就上链
- Flap 自定义 Vault UI
- 把 MaleCNS 16 万神经元写进合约
