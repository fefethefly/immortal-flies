# 贡献

需要 Node.js 22+。不要提交 `.env`、私钥或本机生成的全量连接组。

```sh
npm install
cp .env.example .env   # 密钥留空即可跑通本地
npm test
npm run build
```

合约测试需要 Foundry `anvil`：

```sh
npm run life:compile
npm run life:test
```

全量 MaleCNS 图不入库，需本地生成，见 `docs/CONNECTOME-MALE-CNS.md`。

## 请遵守的边界

- 许可证是 MIT；衍生的 MaleCNS 图与捆绑字体仍走 NOTICE 里的原许可证。
- 不要把 `ImmortalFly.sol` 部署到 BSC 主网。
- 不要在主网再部署一份 `ImmortalSoul` 来加功能；玩法进卫星合约。
- 纸面交易、信用、金库在代码里标 SIM 的，不要写成真实资金。
- 提交前确认 `git status` 没有 `.env`、`*.pem`、Finder 的 `*_副本` 文件。
- 不要 `git push --mirror` 或推送 `refs/cline/**`。那些是本机 Cline 检查点，可能含浏览器配置，不是源码。

补丁请开 PR。漏洞请走 [SECURITY.md](SECURITY.md)，不要开公开 issue。
