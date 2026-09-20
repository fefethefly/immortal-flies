# 私有轨运营手册

日期：2026-09-18。对着 [MINING-HUB-V1.md](MINING-HUB-V1.md)、[PRODUCT-LATEST.md](PRODUCT-LATEST.md) §24。主网 MiningHub 仍是 `UNDEPLOYED`。不构成挖矿上线或收益宣称。

## 1. 产品边界

`/host.html` 是生命托管页（添料、绑定、账单、档案、换 Runner）。首页「托管网」是 MaleCNS 分片覆盖沙盘，不是 MiningHub。对用户说培养基 / 添料 / 投喂；链上仍是 `Tank` / `refuel`。

v1 验收口径：**官方白名单 Runner，无人挑战即付。** 链上没有独立 Verifier。`openingHash` 只是开口承诺，不是神经计算证明。

仲裁人：未公布。`arbiter = address(0)` 时只走超时双输（`timeoutDispute` → `NEITHER`）。不要在未点名之前假装有仲裁人。

## 2. 真 IFS 与模拟币

| 网络 | IFS | 蜂巢 | 说明 |
| --- | --- | --- | --- |
| BSC 主网 56 | `0x65b66BB4Adb0e244E19d290b6AAa0381B81A7777` | `0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467` | 构造函数钉死。hive 不得等于 ops `0x055bB2aF42B832A55F3D708c92824C491dE05427` |
| BSC 测试网 97 | MockIFSTax `0xff23A7635140cF3c127f31A3c56A59C19F058899` | `0xc2FcdA8D7abbff26FbF0CD27D4Dc45b59c8419F2` | Hub `0xdb80def1828236A5af09965F46c6BEE63ccc1f4e`。**不是真钱** |

## 3. 收入口径

| 流 | 进谁 | 是不是协议收入 |
| --- | --- | --- |
| `settlePrivate` 工价 | Runner `earnings` → `withdrawEarnings` | **否。运营方工资。** |
| IFS 1% 入站税 | 税币合约分账（蜂巢 80 / 运营 20） | 代币税，不是 Hub 工价 |
| 争议罚没 | 只进蜂巢 | 罚没，不是回购、不是销毁 |
| 主人添料 / 投喂 | Tank（培养基） | 买方预付服务费 |

对外禁止把 Runner 工价写成协议收入、APY、挖矿收益。

## 4. 日限额

门 4（转移退款）既已跳过需求侧资金闸，主网构造默认：

- `maxUserDaily = 100 IFS`
- `maxProtocolDaily = 1000 IFS`

`0` 表示该层不限额（Anvil / 测试网默认）。`setSpendLimits` 可改，已花不追溯。超限 `DayCap`。

## 5. 证据第二镜像与保留期

Runner 把 `iff.life-restore/1` 写到 `IFF_DATA_DIR/archive-*.json`。若设置 `IFF_MIRROR_DIR`，同步再写一份。`GET /archive` 先读主目录，缺失再读镜像。

默认保留 `IFF_ARCHIVE_RETAIN_MS = 37 天`。超期删除两侧 archive。结算后删除本机 `trajectory-*.json`（开口所需完整轨迹不进公开包）。

这不是永久保管，也不是 Keeper 网络。

## 6. 主网专用 Runner

测试网进程：`npm run runner:testnet`（`IFF_CHAIN_ID=97`，`server/data/runner`）。

主网进程必须另起：

```sh
IFF_CHAIN_ID=56 IFF_MAINNET_RUNNER=1 \
  IFF_DATA_DIR=./server/data/runner-mainnet \
  IFF_MIRROR_DIR=./server/data/runner-mainnet-mirror \
  npm run runner:mainnet
```

拒绝：未设 `IFF_MAINNET_RUNNER=1`、数据目录与测试网相同、IFS 不是主网真币、Hub 仍是 `UNDEPLOYED`。不要把 Railway 测试网服务改成 56。

## 7. Sourcify 开源验证

已部署且应对过 `exact_match` 的身份核：Soul / Journal / Kin（见 PRODUCT-LATEST）。MiningHub 主网部署后用同一 solc `0.8.30`、同一 OpenZeppelin 5.4.0、无优化差异提交 Sourcify。卫星不进 `modules[]`，验证失败也不要靠重部 Soul 补救。

提交前：`npm run life:compile`，核 `public/contract/life/MiningHub.json` 的 bytecode 与链上一致。metadata 标准 JSON 走 [sourcify.dev](https://sourcify.dev)。BscScan 验证可并行，不以浏览器校验替代 Sourcify。

## 8. 刺激与连续性

`openSegment.startRoot` 是 **parent**（上一段 `lastFinalRoot`，或创世）。日记刺激按通道顺序合并，后写覆盖同通道；`applyJournalInputs` 之后的 primed 根可以与 parent 不同。承诺里的 `startRoot` 允许是 primed 根。谱系 / `continueFromPack` 只核 `parentRoot`。错段 `revokeAcceptance` 只回滚卫星头，不改 Journal。

## 9. Linux 全量图向量

Darwin 向量：`reports/segment-replay-full-v1.json`（n=1000，L=10）。Linux 门：`.github/workflows/segment-replay.yml`，绿在 `ci/malecns-full-replay`（含 12k circuit `graph.bin` 钉死 `0xe269ed3d…`）。发布分支合入该钉死后，才把跨平台逐位一致视为已复现。未 push 前 `origin/main` 仍可能没有。
