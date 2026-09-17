# SoulKinFee：收费 / 买 IFS / 失败兜底

日期：2026-09-17。状态：**测试网已绑定；主网未换模块。** 本文是下一只可替换繁衍模块的编码与产品规格，不替代 [LIFE-PROTOCOL.md](LIFE-PROTOCOL.md)，也不改主网 `ImmortalSoul`。对照 [PRODUCT-LATEST.md](PRODUCT-LATEST.md) §0.3、§17.2、§18、§22。

实现：`contracts/life/SoulKinFee.sol`、`FlapPortalBuyAdapter.sol`。BSC 测试网 `MODULE_KIN` 已是 `SoulKinFee` `0xfBC663EF50fF104277D05c520994E25a2391414f`（适配器未接）。主网现在仍是免费 `SoulKin` `0xA6810953e52f5EEa39C323d8Ea7dC42c210A13A0`。没换主网模块、没接通已核验买币适配器之前，对外只能说测试网在练收费，不能说飞轮已转、不能说已回购、不能说已销毁。

## 0. 一句话

换一只卫星 Kin：请求繁衍时付固定 BNB；孩子先出生；再尽量用这笔 BNB 经已核验适配器买 `$IFS`，打进已公布的蜂巢金库；买失败或没接路由时，**不回滚出生**，BNB 留在 Kin 里，只能扫进同一只金库或重试买入。

## 1. 先过 LIFE-PROTOCOL §3.2

| 问 | 答 |
| --- | --- |
| 身份还是玩法？ | 玩法。谁是父母、哪一代、孩子 seed 仍由 Soul 在 `mintDescendant` 里写死。收费、路由、失败怎么放行，都在新 Kin。 |
| 能否不重部 Soul？ | 能。新合约 + 仍走 `modules[MODULE_KIN]`。`mintDescendant` 只认当前 Kin 地址。 |
| 规则以后会不会改？ | 会。价格、适配器可换；整只 Kin 也可再换。不给 Soul 也不给 Kin 上 UUPS。 |
| 失败能否卡住出生？ | 不能。`mintDescendant` 成功之后才尝试买币；买币 `try/catch`。Soul 的 `MODULE_HOOK.afterBorn` 已经是 `try/catch`，本模块不得把买币塞进钩子。 |
| 前端怎么发现？ | `public/contract/life/SoulKinFee.json` + 部署清单的 `kin` 字段。Soul 里不写死下一只 Kin 的地址常量。 |
| 测试网作废 ≠ 主网可作废 | 测试网可标 `STALE` 换地址。主网只换 Kin，不换 Soul。 |

禁止：给 `ImmortalSoul` 加付费口、放开 `hatched`、部署 `ImmortalFly.sol` 到 chainId 56。

## 2. 和现网、§12、竞品的边界

| 对象 | 是什么 | 不是什么 |
| --- | --- | --- |
| 本模块的 BNB | 用户为「再生一只」付的繁衍费 | 用户金库本金、Credit、已实现盈余 D |
| 买到的 IFS | 繁衍费换来的协议库存，进蜂巢金库 | §12 / §18 的「盈余回购」；不是销毁 |
| 买 IFS 时的 1% 税 | 代币自己的买卖税，80% 蜂巢 / 20% 运营 | 本模块再切一刀运营分成 |
| 现网 `SoulKin` | 免费 + gas，同钱包双亲 | 收费模块上线前不要改它的字节码 |
| 竞品 V2 句 | 同笔交易用繁衍费买币 | 买完打给 CZ / 个人；他们的 V2 未作为我们的路由 |

§0.3 第 1 条仍然成立：锁仓、税进钱包、转入金库，都不是销毁。本模块**禁止**把 `BreedBuyFilled` 或金库余额写成「已销毁」。真烧要等 IFS 上出现会使 `totalSupply` 下降的 `burn`（或等价）并且公布回执；那是以后另一只卫星或结算层的事，不塞进第一只收费 Kin。

§0.3 第 2 条：金库与运营款不得自动打给 CZ 或任何个人。运营 20% **不**写成 Kin 的分流参数。买 IFS 时代币税会自动碰到运营地址——这是税币事实，要在前端说清，不要再加一笔合约分成。

吸收竞品的机制句（§17.2）：收费且同笔买币时，买完必须进协议金库或真烧。本规格选**已公布蜂巢金库**。不吸收贡赋。

## 3. 不变量

1. **不改 `ImmortalSoul`。** 不新增 payable hatch，不改 `MAX_PER_ADDRESS`，不改 `requestHatch` 拒 `msg.value`。
2. **第一只 Gen0 继续免费。** 一地址一生一孵仍在 Soul 上。第二只蝇来自转移、市场或后代，不是第二只 Gen0。
3. **无性别、无异性校验。** 表型和 Kin 都不读 sex。不要为了「两只异性才能繁殖」去改核。
4. **本版仍要求同一地址同时持有双亲。** 跨钱包合繁是下一只 Kin，不混进本规格。
5. **IFS 只进蜂巢金库** `0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467`。禁止默认或可设置到运营 `0x055bB2aF42B832A55F3D708c92824C491dE05427`、CZ、curator 热钥匙或任意 EOA。
6. **出生优先于买币。** 孩子 NFT 落地之后，买币失败只影响 `heldBNB`。
7. **无代理 / 无 UUPS。** 要改规则就再部署一只 Kin，curator `setModule`。
8. **旧 pending 必须清零再切模块。** 换 `MODULE_KIN` 之后，旧 Kin 再 `breed` 会 `ModuleOnly`，托管的 BNB 会卡死。

## 4. 收费

### 4.1 何时收

在 `requestBreed` 收，不在 `breed` 收。现网任何人可代完成出生；若把费放在 `breed`，代完成的人会误付。

```text
requestBreed(parentA, parentB) payable
  msg.value 必须恰好等于 breedPrice
  breedPrice == 0 时拒任何附带 BNB（与 Soul.requestHatch 同纪律）
  调用者必须 ownerOf(parentA) == ownerOf(parentB) == msg.sender
  每地址同时只能有 1 条 pending
  请求记录 paid = msg.value，entropyBlock = now+2
```

`breedPrice` 在请求时快照进 `Request.paid`。之后 operator 改价，不影响已托管的请求。

### 4.2 价格旋钮

| 参数 | 规则 |
| --- | --- |
| `breedPrice` | operator 可改。部署默认 `0`，便于测试网先跑通出生。 |
| `MAX_BREED_PRICE` | 不可变，建议 `0.1 ether`。挡住把价格打成几十 BNB。 |
| 建议主网初值 | **`0.002 ether`**，不是竞品的 0.005。见 §5.3：曲线太薄。 |

不要做「每地址第一次繁衍免费」。第一只已经免费（Gen0）。Kin 上再记 `bred[address]` 会被多个钱包绕开，还给前端两套文案。

### 4.3 过期退款

`expireBreed(id)` 仍在 `entropyBlock + 256` 之后。退的是 `Request.paid` 给 `recipient`，不是给 `msg.sender`。

用 `call{value:}`。若收款失败（合约拒收 BNB），记入 `refunds[recipient]`，emit `RefundHeld`，由收款人 `withdrawRefund()`。operator 不能把 pending 托管或 refund 扫走。

本版不提供「熵未到就取消」。与现网 hatch/breed 一致，避免用取消刷未来区块。

## 5. 买 IFS

### 5.1 适配器，不写死 AMM

`$IFS` 是 Flap 税币。官方交易口是 Flap Portal，不是 Pancake。Kin **不得**把 Pancake `swapExactETHForTokens` 写进模块本体。

```solidity
interface IKinBuyAdapter {
    /// 花光 msg.value 买 IFS，把买到的代币转到 sink。失败必须 revert。
    /// Kin 用 try/catch 调用；适配器成功不得把 BNB 留在自己地址。
    function buyToSink(address ifs, address sink, uint256 minOut)
        external
        payable
        returns (uint256 amountOut);
}
```

| 角色 | 可变？ | 值 |
| --- | --- | --- |
| `ifs` | 不可变 | `0x65b66BB4Adb0e244E19d290b6AAa0381B81A7777` |
| `sink` | 不可变 | 蜂巢 `0xfAdb2FE136c89866Cd1CB0DD31298e08cc61a467` |
| `adapter` | operator 可换 | 部署默认 `address(0)` = 不买，只托管 |

`adapter == 0` 时，`paid` 直接进 `heldBNB`，原因码 `NoAdapter`。这是合法的第一阶段：先收费、先出生，再等人核验路由。

### 5.2 2026-09-17 主网实测（绑适配器前必须再核一次）

对 Portal `0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0` 调 `getTokenV8Safe` 与 `quoteExactInput`；对 Pancake V2 Factory 调 `getPair`。

| 项 | 值 | 含义 |
| --- | --- | --- |
| Flap `status` | `1 Tradable` | 仍在键曲线，**未**迁 DEX |
| `pool` | `0x0` | Flap 侧没有官方 DEX 池 |
| `progress` | ≈ `0.74%` | 离毕业还早 |
| `reserve` | ≈ `0.1187 BNB` | 整条曲线的报价储备 |
| `circulatingSupply` | ≈ `2.10e7` IFS | 相对 10 亿总量仍浅 |
| `buyTaxRate` / `sellTaxRate` | `100` / `100` | 买卖各 1% |
| `quoteToken` | `address(0)` = BNB | 与 `official.json` 一致 |
| Flap 报价 `0.005 BNB` | ≈ `8.50e5` IFS | Portal `quoteExactInput` 可用 |
| Pancake V2 pair | `0xb223F9182d07081Aa7B6A4a934452982C3153B36` | **储备 0/0**，空壳对 |

因此：

- 曲线期只允许 **Flap Portal 适配器**（`swapExactInput`：`inputToken = address(0)`，`outputToken = IFS`）。文档写明该方法目前只服务未毕业代币。
- **禁止**把上述 Pancake 空对写成路由。有 pair 地址 ≠ 有流动性。
- IFS 毕业（`status = DEX` 且 `pool != 0`）之后，另内部署适配器再 `setAdapter`。旧 Portal 适配器应卸掉，否则买入会开始系统性失败并堆 `heldBNB`。

### 5.3 薄曲线与建议价

`0.005 BNB` 相对 `0.119 BNB` 储备大约是一次吃掉曲线的 4%；相对流通大约是一次买进约 4%。这会把价格打很高，且 `minOut = 0` 时极易被夹。

主网第一刀建议：

- `breedPrice = 0.002 ether`（约竞品繁衍费的 40%）
- **先不绑适配器**，观察 `heldBNB` 与曲线储备
- 曲线储备明显变厚、或已毕业到真实 DEX 池之后，再绑适配器；必要时再把价格调到 `0.005`

operator 在冲击过大时可以 `setAdapter(0)`，等于暂停买入、不停出生。

### 5.4 税跳与文案

Portal 的 `ExactInputParams` **没有 recipient**。IFS 先到适配器，再 `transfer` 到蜂巢，可能再吃 1% 转账税。两跳合计最多约 2% 的 IFS 走税分账（80% 蜂巢 / 20% 运营），余下进 `sink`。

前端只许说：

> 繁衍费用于购买 `$IFS` 并转入已公布的蜂巢金库。买卖税仍按代币规则分账。这不是销毁，也不是金库用盈余在做市。

不许说：已销毁、已回购（§12 那种）、贡赋、打给 CZ。

### 5.5 滑点

第一只适配器允许 `minOut = 0`，换出生不被滑点卡住。必须在规格和页面上承认夹子风险。后续适配器可以自己做报价并设 `minOut`；达不到就 revert，Kin 把 BNB 放进 `heldBNB`，孩子仍然在。

适配器必须使用税币友好的买入路径（Portal 的 `swapExactInput`，或 DEX 的 `SupportingFeeOnTransferTokens`）。普通 `swapExactETHForTokens` 对税币经常revert，那会让每一次完成都变成 Held——能工作，但等于没买。

## 6. 失败兜底

### 6.1 `breed` 顺序（硬）

```text
1. 读请求；检查熵块、blockhash、双亲仍属 recipient
2. soul.mintDescendant(...)          // 失败则整笔revert，请求与托管不动
3. 删除 requests[id] / pendingRequest，--pendingCount
4. 尝试买币（adapter==0 或 try/catch 失败 → heldBNB += paid）
5. 返回 tokenId
```

禁止：先买后铸（买成铸败会吞费无子）；先删请求再铸（铸败会丢请求、卡托管）。

`breed` 保持 `nonpayable`。代完成的人只付 gas。

### 6.2 原因码

| 码 | 名 | 何时 |
| --- | --- | --- |
| 1 | `NoAdapter` | `adapter == 0` 但仍有 `paid` |
| 2 | `AdapterRevert` | 适配器 revert / 无流动性 / 税币拒收 / Portal 已不服务该状态 |
| 3 | `ZeroOut` | 适配器声称成功但 `amountOut == 0`（Kin 应视为失败并托管；适配器本应先 revert） |

事件：`BreedBuyFilled(requestId, paid, amountOut, sink)` / `BreedBuyHeld(requestId, paid, reason)`。

### 6.3 托管怎么出去

`heldBNB` 只有两条出路：

1. **`retryHeldBuy(amount)`**（任何人可调）：从托管扣 `amount`，再走同一只适配器。失败则加回托管。`sink` 仍是不可变蜂巢。
2. **`flushHeldBnb()`**（任何人可调）：把全部 `heldBNB` 以 **BNB** 打到不可变蜂巢。这是「未成交的繁衍费」，**不是**买币，页面必须分开记账。

没有第三条路。没有「operator 提现到自己」。没有「退给已出生的用户」——用户已经拿到孩子。

### 6.4 与 Soul 钩子的关系

买币放在 Kin 的 `breed` 里，不要做成 `MODULE_HOOK`。钩子失败已被 Soul 吞掉；把经济放钩子里会变成「钩子挂了钱也没花」，审计和前端都更难对。

## 7. 接口草案

合约名 `SoulKinFee`。槽仍是 `keccak256("ifs.module.kin/1")`，语义仍是「当前繁衍模块」，只换地址。

```text
constructor(address soul, address ifs, address hive)   // hive 必须等于 official.json vault
operator() / setOperator(address)

breedPrice() / MAX_BREED_PRICE / setBreedPrice(uint256)
adapter() / setAdapter(address)                         // 0 = 暂停买入
ifs() / hive()                                          // 不可变
heldBNB()
refunds(address)

requestBreed(uint256 parentA, uint256 parentB) payable → uint256 id
breed(uint256 id) → uint256 tokenId
expireBreed(uint256 id)
withdrawRefund()
retryHeldBuy(uint256 amount)
flushHeldBnb()

requests(id) → (recipient, parentA, parentB, entropyBlock, paid)
```

`Request` 比现网多一个 `paid`。前端 `readPendingBreed` 必须改读第 5 个字；用旧 ABI 会把 `paid` 错读成别的字段。

现网错误继续用：`Unauthorized` / `PendingBreed` / `BreedNotReady` / `BreedUnavailable` / `InvalidPair`。新增：`WrongFee` / `PriceCap` / `BadSweep`。

`receive()` / `fallback()` revert。适配器必须在自己的调用里花光 BNB 或 revert；不要依赖 Kin 收款。

descent seed 域保持 `ifs.descent/1`，算法与现网 `SoulKin.breed` 相同。换模块不改孩子长什么样的公式。

operator 建议仍是现网 curator 热钥匙，或之后的多签。`setCurator(address(0))` 冻的是 Soul 模块表，**冻不住** Kin 的价格与适配器。交出 Soul 之前必须先决定 Kin operator 放哪。

## 8. 主网切换

测试网先于主网。步骤：

1. 实现 `SoulKinFee` + 至少一只 `FlapPortalBuyAdapter` + 一只必失败的 mock 适配器。加入 `scripts/compile-life.mjs` 的编译单元。
2. 测试网：`breedPrice = 0` 走通两步出生；再改价；再绑 mock 失败（孩子在、BNB 托管）；再绑成功适配器（或分叉主网 Portal）；过期退款；`flushHeldBnb` 只能到 hive。
3. 主网公告：旧 Kin 停止新请求的时间窗。
4. 等旧 `SoulKin.pendingCount == 0`（必要时帮用户 `breed` / `expireBreed`）。
5. 部署 `SoulKinFee`，`breedPrice` 建议先 `0` 或 `0.002`，`adapter = 0`。
6. curator `setModule(MODULE_KIN, newKin)`。
7. 改 `public/contract/life/ImmortalSoul.deployment.json` 的 `kin`、资源管理器链接、`SoulKinFee.json` ABI。旧地址在文档标 **STALE**，不要从浏览器抹掉。
8. 栖息地改为 `requestBreed(..., { value: breedPrice })`，展示价格、Filled / Held。
9. 适配器另一次公告后再 `setAdapter`。没核验 Portal 仍 `Tradable`、报价仍成功之前，不要绑。

切错且旧 Kin 里还有托管时，只能指望旧合约没有托管（现网免费 Kin 没有 BNB）。收费模块上线后再切下一代，必须重复步骤 4。

## 9. 前端与披露

- 配偶选择仍是「你钱包里的另一只」，文案不要写异性。
- 请求按钮旁写清 `breedPrice`（BNB）和「另付 gas」。
- 完成出生后若收据只有 `BreedBuyHeld`，告诉用户：孩子已在，买入未成交。
- 站点若展示 `heldBNB` / 已买入 IFS，必须分列，禁止加总成「已销毁」或「已回购」。
- `explainLifeError` 增加 `WrongFee`（付错金额）。

现网入口：`src/life/desk.jsx` 的 `requestBreed` 目前无 `value`。换模块当天必须改，否则价 > 0 时每笔都会 `WrongFee`。

## 10. 验收

链上（测试网或主网 fork）：

1. 双亲不同主人 → `Unauthorized`；`parentA == parentB` → `InvalidPair`。
2. `msg.value != breedPrice` → `WrongFee`；`breedPrice = 0` 且附带 BNB → `WrongFee`。
3. 熵未到 `breed` → `BreedNotReady`；过期退款到 recipient；拒收则 `refunds` 可领。
4. `mintDescendant` 因 `MAX_SUPPLY` 失败：请求与托管仍在，256 块后可退。
5. 适配器 revert：`tokenId` 存在，`heldBNB` 增加，`pendingRequest` 已清。
6. 适配器成功：IFS 余额出现在 hive，不在 operator，不在 ops。
7. `flushHeldBnb` 只增加 hive 的 BNB，调用者拿不到。
8. 换 `MODULE_KIN` 后旧 Kin `breed` 回退。
9. 字节码 < EIP-170。

产品验收：页面不出现「销毁 / 贡赋 / CZ / 盈余回购」来描述本模块。

## 11. 本规格不做

- 放开一钱包一只 Gen0
- 性别、交配冷却、亲缘禁配（以后可另做 Kin）
- 双钱包合繁
- 付费加孵 Gen0
- 合约内 80/20 再切运营
- 把买入 IFS 烧掉或转 `0xdead` 并称为销毁
- Kin 或 Soul 上的代理
- 把空 Pancake 对当路由
- 把本模块并进 §12 的 D 预算

本规格对应的 Solidity 已在仓库里。下一步是测试网部署 `SoulKinFee`（`npm run life:deploy:kin-fee:testnet`），确认 `pendingCount == 0` 后再考虑 `--bind`。主网绑定必须另带 `--i-am-replacing-mainnet-kin`。适配器另核验后再 `setAdapter`。
