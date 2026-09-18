# 测试网私有轨 Runner（Railway）

状态：**守护进程已写，测试网 Hub 已部；用模拟 TIFS，不是主网 IFS。** 不是公开挖矿，不是收益。主网必须另起进程，见 [MINING-OPS.md](MINING-OPS.md)。

进程：`server/src/runner/index.mjs`。对着 `MiningHub.testnet.json` 给绑定的 Soul 领段 → 跑 MaleCNS → 写 Journal → `commitPrivate` → 抽种结算。

已部署：<https://runner-production-ea3b.up.railway.app/health>（`audit=TESTNET`，`yield=false`）。清单 `public/contract/life/PrivateRunner.testnet.json`。Hub `0xdb80def1828236A5af09965F46c6BEE63ccc1f4e`（旧 `0x1dAd…55A1` STALE）。

```sh
npm run runner:testnet
```

Railway：仓库根 Dockerfile，构建时烘焙本地 `public/data/malecns-full`（该目录不进 git）。私钥只放 Railway Variables：`IFF_DEPLOY_KEY`。不要写进镜像或仓库。

健康检查：`GET /health`。状态：`GET /status`（`audit=TESTNET`，`yield=false`）。公开恢复包 `GET /archive/0x…`。谱系 `GET /life/{tokenId}`。

可选：`IFF_MIRROR_DIR` 第二镜像；`IFF_ARCHIVE_RETAIN_MS` 默认 37 天。

`IFF_CHAIN_ID=56` 必须另设 `IFF_MAINNET_RUNNER=1` 与独立 `IFF_DATA_DIR`，并钉死真 IFS。不要把本测试网 Railway 服务改成主网。
