# 协议任务运行器：检查点恢复与复算 / 1

状态：非神经 SIM 协议任务，未接入产品、上链、学习或经验晋升。复用现有接纳中继与非神经导航，不改协议语义。

实现：
- /Users/caonanya/Documents/ChatGPT/immoratalflies/src/brain/protocol-task.mjs（核心）
- /Users/caonanya/Documents/ChatGPT/immoratalflies/scripts/protocol-task.mjs（命令行）

## 任务结构

固定一个观察者、两个接收者（`sim:receiver-a`、`sim:receiver-b`）。每个接收者保留观察、消息队列与接收去重状态；只有通过 `relay-admission/1` 验证的消息进入控制器（`coordinate-navigation-control/1`，标记 `handwritten-not-neural`，不调用神经 step，`neuralSteps` 恒为 0）。同一食物只结算一次：同拍多个接收者同时进入采集半径时，按固定接收者名单顺序裁定（赢家为名单序在前者），账本记录 `谁完成 → 哪一拍 → 哪些被接纳消息驱动了动作`（`actionRef`）。收到消息本身不计为贡献。

## 检查点与复算

检查点覆盖：任务计划、世界消耗状态、成员位置、逻辑拍数、待投递消息、各接收者去重状态、完整动作记录（trace）与结算账本。恢复时依次校验：文件哈希 → 检查点哈希 → 计划与所选模式一致 → 从固定初始任务完整重放到检查点拍数并逐字节比对。因此"篡改后重算哈希"无法通过复算。运行器文件还携带源码指纹，源码变更后旧工件拒绝验证。写入用同文件系统原子链接发布，拒绝覆盖已存在文件。

## 六种传输模式

`valid` 正常送达；`duplicate` 每条消息投递两次，重复副本被 `DUPLICATE` 拒绝、结算不变；`expired` 一拍过期送达，全部 `EXPIRED`；`session` 伪造外来会话，全部 `SESSION_MISMATCH`；`conflict` 同 ID 双版本，全部 `ID_CONFLICT`；`off` 无通信对照，无消息、无移动、无结算。除 `valid`/`duplicate` 结算 1 次外，其余模式结算 0 次。

## 命令行

```sh
node scripts/protocol-task.mjs run MODE ROUND OUTPUT     # 运行并保存
node scripts/protocol-task.mjs resume MODE INPUT ROUND OUTPUT  # 恢复并续跑
node scripts/protocol-task.mjs verify MODE INPUT         # 复核已有工件
node scripts/protocol-task.mjs demo NEW_DIRECTORY        # 端到端演示
```

`demo` 对六种模式各启动独立进程完成"运行 12 拍 → 保存 → 新进程恢复到 48 拍 → 与新进程连续运行 48 拍逐字节比对 → verify 复核"，并断言重复模式与正常模式账本一致。一次命令覆盖全部验收场景；每次调用都是独立 OS 进程，恢复不依赖上一个进程的内存。

## 最小验证

```sh
node --test tests/protocol-task-checkpoint.test.mjs tests/protocol-task-modes.test.mjs tests/protocol-task-cli.test.mjs
```

12 个测试锁定：恢复等于连续运行；重复消息不重复结算；伪造贡献记入、伪造决策记录、篡改位置在重算哈希后仍被 `TASK_REPLAY` 拒绝；跨进程 CLI 往返逐字节一致；覆盖拒绝、源码指纹不符、模式不匹配与越界拍数均报错。

边界：固定可信 SIM 名单，不是网络认证；单一固定世界，不是普遍采集保证；不产生独立协作证据，不接真实资金。