# 安全报告

请**不要**在公开 issue、PR 或聊天里粘贴私钥、助记词、API 密钥、`.env` 或 Railway / Vercel 令牌。

## 报告漏洞

对本仓库软件或已部署合约的安全问题，请走 GitHub 非公开渠道：

https://github.com/fefethefly/immortal-flies/security/advisories/new

报告里请写清：影响范围、复现条件、是否已有主网资金风险。不要附带可签名的密钥。

## 本仓库明确不保管的东西

- 部署与 Runner 私钥只放本机 `.env` / `~/.env` 或托管平台的 Variables，不要提交。
- `OPENAI_API_KEY` 可留空；空密钥时解释层降级为本地确定性实现。
- 不要把主网热钥匙和测试网钥匙混用。

## 链上事实

合约地址、交易哈希、公开钱包不是密钥。身份核一旦在 BSC 主网部署，禁止用「再部署一份 ImmortalSoul」当补丁。不要把 `ImmortalFly.sol` 部署到 chainId 56。
