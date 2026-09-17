# SoulMarket：官方二级市场

日期：2026-09-17。状态：**合约与 `/market.html` 已实现。主网 SoulMarket `0x5f67e862d7519FC38D9d78a1c2A35DE17AFc7875`（对着 Soul `0x500D…293F`，hive 官方蜂巢，未 `setModule`）。测试网 `0xC09452de32e965E45B765a32d6DDada2B5968A76`。** 本文是 ImmortalSoul 的官方挂单卫星，不替代 [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md)，也不改主网身份核。对照 [PRODUCT-LATEST.md](PRODUCT-LATEST.md) §0.3、§16.7、§23。不是 OpenSea。钱包直转与 Element 一类 BSC 盘仍可用。

主网 Soul 已可 `transferFrom`。没有本模块，用户也能在任意钱包之间转，或上到别的 NFT 市场。本模块要做的是：**官方页面能按 lifeId 上架、按表型筛选、用 BNB 成交，手续费进已公布蜂巢。** 主网卫星已部署；生产站要带上 `SoulMarket.deployment.json` 后，`/market.html` 才显示已开。不要说「已上 OpenSea」。

## 0. 一句话

另内部署一只只认本集合的挂单合约。卖家授权后标价；买家付 BNB；合约把 NFT 转给买家、把价款分给卖家和蜂巢。成交走普通 ERC-721 转移，Soul 自己清掉 `authorizedRunner`。市场挂了，灵魂仍能持有、转移、读 tokenURI。

## 1. 先过 LIFE-PROTOCOL §3.2

| 问 | 答 |
| --- | --- |
| 身份还是玩法？ | 玩法。谁拥有哪只、lifeId、基因组仍在 Soul。怎么标价、怎么成交、抽多少费，都在卫星。 |
| 能否不重部 Soul？ | 能。市场只调 `ownerOf` / `getApproved` / `transferFrom` / `lifeId`。Soul 没有市场函数，也不需要为了上架加字段。 |
| 规则以后会不会改？ | 会。整只市场可再部署替换。不给 Soul、也不给市场本身上 UUPS。 |
| 失败能否卡住孵化 / 转移？ | 不能。市场不是 `MODULE_HOOK`，不进出生路径。市场暂停或作废时，钱包之间的 `transferFrom` 仍可用。 |
| 前端怎么发现它？ | `public/contract/life/SoulMarket.deployment.json`。**不**写进 `modules[]`。 |
| 测试网作废 ≠ 主网可作废 | 测试网可标 `STALE` 换地址。主网只换市场卫星，不换 Soul。 |

禁止：给 ImmortalSoul 加版税、地板价、自动做市；按稀有度改 IFS；把市场做成 Soul 模块特权；部署 `ImmortalFly.sol` 到 56。

## 2. 为什么不进 `modules[]`

`MODULE_KIN` 必须挂在 Soul 上，因为只有它能 `mintDescendant`。市场不需要任何 Soul 特权。

若把市场地址写进 `modules[MODULE_MARKET]`：

- curator 以后 `setCurator(0)` 会冻住指针，市场反而不能换；
- 读者会以为市场坏了会卡住身份。

发现路径只走部署清单。Soul 构造函数和常量里不准出现市场地址。

## 3. 和现网、Kin、外部盘的边界

| 对象 | 是什么 | 不是什么 |
| --- | --- | --- |
| 本模块 | 本集合的官方 ask 盘 | OpenSea / Element 的替代承诺；不封禁外部盘 |
| 成交 | ERC-721 转移 + BNB 结算 | 脑会话移交；日记所有权随 NFT，runner 必断 |
| 手续费 | 成交 BNB 的一小截进蜂巢 | 繁衍费买 IFS；§12 盈余回购；销毁 |
| 定价 | 卖家自报 BNB | 协议地板、稀有级加价、IFS 标价（v1 不做） |
| 第二只蝇 | 买一只别人上架的灵魂 | 放开一钱包一只 Gen0 |

卖掉 Gen0 **不能**再孵。`hatched[seller]` 仍是 true。买到 Gen0 的人若自己没孵过，仍可去孵自己的第一只。这是 Soul 已冻结的事实，市场不得改口。

栖息地已有「转给地址」。市场是给陌生人的标价通道，不替换点对点转账。

卖家若有未完成的 `requestBreed`，成交后 `breed` 会因双亲不再属于原 recipient 而回退。市场不读 Kin。页面必须在上架前警告。

## 4. 不变量

1. **不改 ImmortalSoul。** 不写版税回调、不写 `price`、不把市场地址写进核。
2. **只服务构造时钉死的那一只 Soul。** 不是通用 NFT 交易所。
3. **上架主键是 `chainId + collection + tokenId + lifeId`。** 同脸可以是另一只。成交时再读一次 `soul.lifeId(tokenId)`，对不上就回退。
4. **NFT 不上托管。** 挂单期间灵魂仍在卖家钱包，栖息地还能看见。成交当刻 `transferFrom`。
5. **报价只收 BNB。** v1 不用 IFS 标价（税币两跳会把成交搞脏）。
6. **手续费只进蜂巢** `0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467`（主网）。不进运营、CZ、operator。
7. **tokenURI 不写价格、稀有级、名次。** 筛选在页面用已有 attributes。
8. **无代理 / 无 UUPS。** 要改规则就再部署一只市场。
9. **市场挂了，身份还在。** 用户始终可以用钱包直接转。

## 5. v1 做成什么样

只做 **卖家挂单 / 买家一口价**。不做出价托管、拍卖、打包、分期、借贷。

```text
list(tokenId, price)     卖家是 owner；已 approve 本市场或 setApprovalForAll
relist(tokenId, price)   同一卖家改价
cancel(tokenId)          卖家撤单
sweep(tokenId)           任何人可清掉「已不是卖家」的僵尸单
buy(tokenId) payable     msg.value == price；先转 NFT，再分 BNB
```

`Listing`：

```text
seller
tokenId
lifeId
price          // wei，BNB
listedAt
```

每只 token 最多一条单。`price == 0` 表示没有挂单。

### 5.1 成交顺序（硬）

```text
1. 读 listing；price > 0；msg.value == price
2. soul.ownerOf(tokenId) == seller
3. soul.lifeId(tokenId) == listing.lifeId
4. 删除 listing                         // 先删，防重入回头再买
5. soul.transferFrom(seller, buyer, tokenId)
6. fee = price * feeBps / 10000
7. 把 fee 打到 hive，余下打到 seller
8. 若某笔 BNB 打不进，记 refunds[to]，不回滚已成交的 NFT
```

禁止：先收 BNB 再转 NFT 却在转失败时把钱留在合约（用 `nonReentrant` + 转失败整笔 revert）。  
第 5 步失败（没授权、卖家已转走）必须整笔 revert，买家不丢 BNB。  
第 7 步卖家是拒收 BNB 的合约时：NFT 已易手，不能 revert；记 `refunds[seller]`，卖家 `withdrawRefund()`。蜂巢打失败同样记 `refunds[hive]`。

Soul 的 `_update` 会在第 5 步清空 runner、`++controlEpoch`。市场不必再调 `setRunner`。

### 5.2 价格与费率

| 参数 | 规则 |
| --- | --- |
| `MIN_PRICE` | 不可变，建议 `0.001 ether`。免费转账走栖息地，不走市场。 |
| `MAX_FEE_BPS` | 不可变 `1000`（10%）。 |
| `feeBps` | operator 可改。建议初值 **200**（2%）。 |
| 部署默认 | `feeBps = 200`。 |

主网 `hive` 必须等于 `official.json` 的 vault。`chainid == 56` 时构造函数校验。运营地址禁止作为 hive。

### 5.3 授权

卖家先 `approve(market, tokenId)` 或 `setApprovalForAll(market, true)`。市场在 `list` 时检查授权，`buy` 时再检查一次。卖家撤授权等于单子买不成，任何人可 `sweep`。

不要做「上架即转入市场」。托管会让栖息地丢蝇，也让市场合约变成热钱包。

## 6. 页面

新入口 `/market.html`（或栖息地一栏）。默认读主网清单；`?net=test` 读测试网，与孵化同一套。

必须有的块：

1. **在售。** 每张卡：`#tokenId`、givenName、lifeId 短码、Generation、表型摘要、价格 BNB。主键展示 tokenId + lifeId，不展示「稀有」。
2. **筛。** Body / Eyes / Mark / Generation。数据来自现有 decoder，不是市场合约。
3. **我的。** 上架 / 改价 / 撤单。有 pending breed 时警告。
4. **买。** 确认「买到身份与日记，买不到对方正在跑的脑」。

禁止：地板价 KPI、稀有排行、把手续费写成回购或销毁、CZ / 贡赋文案。

索引：`Listed` / `Relisted` / `Canceled` / `Sold` / `Swept`。页面扫日志做在售与流水；日志读不到时回读已知 token 的 `listings()`。不必另做链下撮合。`withdrawRefund` 在页面可领。买入前再读一次 `listings()`，标价变了就停。筛选写进 URL。栖息地直转会提示留下僵尸单。

外部盘（Element 等）仍可能出现同一只。官方页只显示本市场的单。不要假装全网地板。

## 7. 接口草案

```text
constructor(address soul, address hive)

soul() / hive()                 // 不可变
operator() / setOperator(address)
feeBps() / setFeeBps(uint16)
listings(tokenId) → (seller, lifeId, price, listedAt)
refunds(address)

list(uint256 tokenId, uint256 price)
relist(uint256 tokenId, uint256 price)
cancel(uint256 tokenId)
sweep(uint256 tokenId)
buy(uint256 tokenId) payable
withdrawRefund()
```

错误：`Unauthorized` / `NotListed` / `WrongPrice` / `BadList` / `WrongLife` / `FeeCap`。  
`receive()` / `fallback()` revert。

operator 建议与现网 curator 热钥匙同一人，或之后的多签。冻 Soul curator **不影响** 市场费率。

## 8. 上线顺序

1. 写 `SoulMarket.sol` + Anvil：上架、改价、成交、未授权回退、卖家中途转走、lifeId 校验、拒收 BNB 的卖家走 refund、手续费只到 hive。
2. 测试网对着现有 Soul `0x3487…9A5a` 部署。清单 `SoulMarket.testnet.json`。
3. `/market.html?net=test`：挂、买、撤。确认栖息地里该蝇换主人、runner 已空。
4. 主网另部，清单 `SoulMarket.deployment.json`。**不要** `setModule`。
5. 主站才把「市场」从蓝图挪到导航。

测试网先于主网。主网 Soul 已 LIVE，只加卫星。主网 SoulMarket 已于 2026-09-17 部署，回执 `0xa270422c…7deeb1`。

## 9. 本规格不做（v2 再说）

- 买家出价 / 拍卖 / 打包
- 用 IFS 标价或成交后买 IFS
- 协议地板、稀有加价、版税给「创作者」
- 把市场写成 Soul 模块
- 封禁钱包直转或外部 NFT 盘
- 借贷、租赁、碎片化
- 跨集合、跨链

出价托管是下一只卫星，主键仍是 lifeId。不要预埋进 v1。

## 10. 验收

1. 构造钉死 soul / hive；主网 hive 必须是官方蜂巢。
2. 未授权 `buy` 回退，买家余额不减（除 gas）。
3. 成交后 `ownerOf` 是买家，`authorizedRunner` 是 0，`controlEpoch` 增加。
4. `lifeId` 被调包（测试里换 listing 存储）则 `WrongLife`。
5. 手续费 = `price * feeBps / 10000`，hive 增加这么多，卖家拿剩余。
6. operator 不能 `withdraw` 成交款。
7. 市场合约自毁或暂停后，Soul 仍能 `transferFrom`。
8. 字节码 < EIP-170。
9. 页面不出现稀有级、地板价、销毁、盈余回购来描述成交。

合约与 `/market.html` 已按本文落地。主网卫星 `0x5f67…7875` 已开；说「主网市场已开」必须同时带上清单并部署前端。不是 OpenSea。
