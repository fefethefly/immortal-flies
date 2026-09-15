# Flap 发射清单

日期：2026-09-16（更新）。**已发射。** 本仓库不能替你签名，也不能保管私钥。

## 发射记录（BSC 主网实测）

| 字段           | 值                                                                   |
| -------------- | -------------------------------------------------------------------- |
| 名称（链上）   | `Immortal flyswarm`                                                  |
| ticker         | `IFS`                                                                |
| 合约地址       | `0x65b66bb4adb0e244e19d290b6aaa0381b81a7777`（盐值命中 `7777` 结尾） |
| Flap 页面      | https://flap.sh/bnb/0x65b66bb4adb0e244e19d290b6aaa0381b81a7777       |
| owner（实测）  | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0`（Flap Portal）          |
| 总供应（实测） | `1e27`（18 位小数）                                                  |
| 买/卖税        | 各 100 bps                                                           |
| 分账           | 金库 8000 bps / 运营 2000 bps                                        |

主站清单 `public/token/official.json` 已置 `live`。**金库地址（`vault` 字段）仍未公布**，主站明说 “The hive vault address is not posted”。发射交易哈希与金库地址回执待补录；拿到回执前不另行宣布金库或回购。

## 先定 ticker：用 $IFS，不用 $IFF

| 候选                        | 结论                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **IFS**                     | **采用。** 三个字母。官方名称仍是 Immortal Fly，和纸面 IFL、旧候选 IFLY 分开。                                    |
| IFLY                        | **不用。** 本仓库曾选用，未发射，已改成 IFS。                                                                     |
| MCNS                        | 备选。锁死 MaleCNS，不易被当成普通 meme，但对外更难读。                                                           |
| VITR                        | 备选。锁死维特鲁威品牌。                                                                                          |
| IFF                         | **不用。** 2026-09-15 BSC 已有 `immortal fruit flies / IFF` 税币，地址以 `7777` 结尾。再发一个 IFF 会被当成仿盘。 |
| FLY / FRUITFLIES / FRUITFLY | **不用。** 同日已被抢注。                                                                                         |

发射成功后，只改 `public/token/official.json` 的 `status`、`address`、`vault`、`flapUrl`。主站会自己读这份清单。

## 为什么走 Flap 税币 + Split Vault

Flap 的金库发射口 `VaultPortal` 要的是税币。这和 V7「场内手续费进金库」在第一阶段是同一条路：买卖税各 1%，80% 进蜂巢地址，20% 进运营地址。5% 往返太重，成交会被压住。代币本身仍然不要做成可改税率的任意管理员盘；发射参数一次写死。

以后若迁到 Pancake 普通 BEP-20，另开结算层，不改 MaleCNS。

## 你需要准备的东西

1. 一个多签或冷钱包，作为 **FLAP_HIVE_ADDRESS**（收 80%）。
2. 一个运营钱包 **FLAP_OPS_ADDRESS**（收 20%），不能和金库相同。
3. 发射用的热钱包，里面有足够 BNB 付 `quoteAmt` 和 gas。建议先备 **0.05–0.2 BNB**，按当天 Flap 曲线再改。
4. 一张方图（印记 `public/assets/fly-seal.png` 可用），网站、推特、简介。
5. **不要把私钥发给我，不要写进仓库。**

## 页面发射步骤（当时的执行参考，已完成）

发射已经完成，以下步骤留作复刻与复盘参考。

1. 打开 [flap.sh](https://flap.sh)，切到 BNB 主网。
2. Launch Token → **Custom Vault**。
3. 工厂地址：`0xfab75Dc774cB9B38b91749B8833360B46a52345F`（官方 Split Vault）。
4. 名称 `Immortal Fly`，ticker `IFS`。
5. 买/卖税各 `100` bps（1%）。盐值必须让合约地址以 `7777` 结尾（Flap 页面会找）。
6. Split 收款人：金库 8000 bps，运营 2000 bps。
7. 元数据网站填即将上线的 Vercel 域名。
8. 签名。记下 token、vault、交易哈希。
9. 把三个字段写进 `public/token/official.json`，重新部署主站。

本机预演：

```sh
FLAP_HIVE_ADDRESS=0x... FLAP_OPS_ADDRESS=0x... npm run flap:prepare
```

脚本只编码 `vaultData` 并打印对照表，默认不广播。

## 主网地址（官方文档）

| 合约                | 地址                                         |
| ------------------- | -------------------------------------------- |
| Portal              | `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` |
| VaultPortal         | `0x90497450f2a706f1951b5bdda52B4E5d16f34C06` |
| Split Vault Factory | `0xfab75Dc774cB9B38b91749B8833360B46a52345F` |
| Tax Token V3 实现   | `0x024f18294970B5c76c0691b87f138A0317156422` |

来源：[Flap deployed addresses](https://docs.flap.sh/flap/developers/deployed-contract-addresses)、[Registered vaults](https://docs.flap.sh/flap/developers/token-launcher-developers/registered-vaults)。

## 发射之后立刻做

- ✅ 主站 `official.json` 已改成 `live`（address、flapUrl 已填；`vault` 待金库地址回执后补）。
- 官宣只贴本页公布的地址。
- 不要承诺金库已经在自动盈利或回购已经开始。税进地址 ≠ 有机体已经在交易。
