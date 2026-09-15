# Backend API handoff (DeepSeek)

日期：2026-09-16。Node 服务托管交易坑 Session 的完整可重放档案，并把 `iff.explain/1` 接到 OpenAI 兼容 LLM。

## 启动

```sh
cp .env.example .env   # 可选：填 OPENAI_API_KEY
npm run server         # http://127.0.0.1:8787
npm run dev            # Vite 将 /v1 /health /ready 反代到 8787
```

无 `OPENAI_API_KEY` 时服务仍启动；`/ready` 的 `checks.llm.status` 为 `degraded`，解释走本地确定性实现。

## 契约

- OpenAPI：[`docs/openapi-v1.yaml`](openapi-v1.yaml)
- 可选客户端：[`src/api-client.mjs`](../src/api-client.mjs)（默认不接线页面）
- 成功体：`view.pit` = `pitView()`，`view.world` = `worldView()`
- 错误：`application/problem+json`（`title` = 错误码，`request_id`）
- 写操作与 LLM：`Authorization: Bearer <ownerToken>`（创建会话时返回；磁盘只存哈希）
- 重启：空闲未过期的会话从 `server/data/sessions/` 恢复；过久未访问只占磁盘，下次请求再载入；超过 `IFF_SESSION_MAX_AGE_MS` 删除
- 限流：tick / 写 / LLM / 创建会话超限返回 `429 RATE_LIMITED` 与 `Retry-After`

## P4 协议自有资金（已接入）

`GET /v1/sessions/:id/protocol` 返回 `iff.protocol/1` 视图（R/C/N/T/D、35/25/20/10/10 拨定、回购资格与停机原因、追加式哈希链回执，全部 SIM）。收入层在 `src/brain/flyswarm/protocol.mjs`，每 tick 随会话推进；只读派生自内核金库，不动用户资产。

## P3 模拟 Credit（已接入）

`/v1/sessions/:id/credit`（GET 账本视图）、`/credit/stake | unstake | occupy | release`（POST，SIM，需 ownerToken）、`/v1/credit/policy`（版本化参数）。账本是 `iff.credit/1`（`src/brain/flyswarm/credit.mjs`）：四账户 + §6.2 公式 + 不重复抵押 + 到期/亏损/过期收缩；每会话落盘 `credit.json`。前端 IFS 视图与 Risk 信用列已接服务端账本（断线回落本地纸面信用）。

## 对接建议

1. 创建 `POST /v1/sessions` → 保存 `sessionId` + `ownerToken`
2. 用现有 1Hz 节奏 `POST .../tick`（可加 `Idempotency-Key`）
3. 「改变一次经历」→ `POST .../branches`；「重放因果链」→ `GET /v1/branches/:id` 或 events
4. Why / ask → `POST /v1/llm/explain` / `ask`；计划只校验不执行
5. P2 纸面世界：`GET /v1/sessions/:id/world`（Colony / Intent / Risk / Execution + 买持基线与净成本）；单层 `GET .../layers/{colony|intent|risk|execution|market|baseline}`
6. 只读行情：`POST /v1/sessions/:id/market` 注入 `changeBps` 观测（可带 `chain-observation` provenance）。禁止 calldata / 签名；下一 tick 消耗，过期回落纸面游走

Life Core 仍在 `src/brain/`；LLM 与 HTTP 只在 `server/`。行情与分层视图在 World 层（`src/brain/flyswarm/market.mjs`、`layers.mjs`）。
