# Grok 接手说明：BNB 免费孵化与数字生命闭环

更新时间：2026-09-16（Grok 续写）。**没有公共链部署、转账或对外发布。未自动 commit。**

## 用户已确认的目标

1. 类似 immortalfruitflies.app：在 BNB 免费孵化一只 NFT 果蝇，零协议铸造费，用户仅支付网络 gas。
2. 出生身份与所有权在链上，连接组与初始状态可核验，互动和检查点构成真实可追溯历史。
3. LifeId、物种、模型、出生数据、运行会话分离；未来支持跨链跨物种交流/迁徙，首版 BNB 为唯一权威身份链。
4. 同一身份仅有一条正式历史；实验副本是 Branch。NFT operator 授权不等于脑控制权限。
5. 先完成果蝇闭环。跨链桥、breed、用户金库、借贷、回购和销毁不在本轮。禁止部署旧 ImmortalFly.sol 到 BSC 主网。

产品正文：PRODUCT-LATEST.md §20。规格：LIFE-PROTOCOL.md。原评审：GENESIS-ONCHAIN-REVIEW-2026-09-16.md。

## 本轮已补

| 项 | 结果 |
| --- | --- |
| ethers `runner` 撞名 | Solidity 字段改为 `authorizedRunner`；转移（含自转）清空授权并 `++controlEpoch` |
| `soulGenome.audit` | 默认 `SIM`；`chainId === 56` 或显式 `audit` 才写 `MAINNET` |
| LIFE-PROTOCOL.md | 已写编码、孵化、Journal、创世包、未完成项 |
| package.json | `life:compile` / `life:test` / `life:genesis` |
| identity / replay / chain 解析 | `tests/life-*.test.mjs` |
| 后端 Genome | 重启一致 + 旧 pitSnapshot 恢复 + 双缺失拒绝 `ARCHIVE_GENOME_MISSING` |
| 前端孵化入口 | `src/life/hatch-panel.jsx` 挂在名册页；部署清单 `UNDEPLOYED` 时不伪造 NFT |
| 部署清单 | `public/contract/life/ImmortalSoul.deployment.json` 明确 `UNDEPLOYED` |

## 仍缺（不要写成已上线）

1. 测试网/主网部署脚本与 BscScan 验证。
2. 创世包公开存储（当前 `LOCAL_PACKAGE_UNPUBLISHED`，生产构建排除 `malecns-full`）。
3. Journal 刺激 / 检查点 UI、链事件读取、独立重放校验展示（Chain recorded / Replay checked）。
4. 合约更多边界：1024 顶格、pending 名额、重入 receiver、恶意 checkpoint。
5. 服务端正式 LifeId 索引；SIM Genome 的 `genesisId=0` 不得原地改写旧历史。
6. 未经主网验收不得改 §0「已开」。

## 创世草稿指纹（本机，未公开）

- genesisRoot：`0xe45cb0c66f29a3229fa9d8c20b805b0c6a1dd1b3023f0bbb26a7238f4efee091`
- speciesHash：`0x9982b08d178f6fa1f80771d7f100915c224fb47d364959c0a70a237cbe347c19`
- modelHash：`0xd7286cdbee0d23302ed59f9df2b633f64c9b1196fc811a8c9a34578eb1d7d9a7`

两步未来区块熵不是 VRF。Journal 不验证神经计算。
