# 中继方向输入诊断 v1：续接记录

日期：2026-09-17。状态：开发诊断已执行，**未证明采集或协作增益**。

## 断线恢复

原定位实验已完成，见原始文档：
/Users/caonanya/Documents/ChatGPT/immoratalflies/docs/RELAY-DIAGNOSIS-V1.md

恢复时旧报告严格重放与 2 项测试通过。额外的最小探针将相反方向消息交给原 receiveRelayInbox，再从同一初态执行一次原 step；实际 voltage/refractory/spikes 数组完全相同（seed 301，两侧均 30 个脉冲），不是只比较哈希。原始坐标不同，但 applied.food 都为 346。

## 本轮固定设计

复用原历史图（1400 节点、42031 边）、301–304 开发种子、四方位、48 拍、固定观察者和可动接收者。旧报告与旧代码没有覆盖。

新增 relay-quadrant-routing/1：把原 food 感觉索引排序，连续分成四个等长组；按身体相对坐标的主轴选择组。**这是任意人工编码，不是神经元具有前后左右生物学语义的证据。** 不改连接边、权重、内核或运动读出。以临时感觉组视图调用原 step；因此它不是原感觉编码器的产品升级。记录原图身份及另行版本化的路由计划，两者须共同解释实验。

五臂：原神经不通信、原标量中继、中性路由、四方向路由、旋转 180° 路由。中性路由按 round 轮换，不看方位。后三臂每拍输入组大小相等，并验证全程 RNG 状态一致；不声称与原标量臂注入预算相等，也不声称闭环实际电流或边处理量相等。

只在中继强度严格超过本地 food 时使用消息方向；否则回退中性路由。本地观察仍为标量。没有学习、映射筛选或运行后调参。计划先落盘，然后运行 80 个配置，每配置执行两次全量比较。重复运行不是独立样本。

## 结果

| 臂 | 采集 | 平均净距离缩短 |
| --- | ---: | ---: |
| 原神经不通信 | 0/16 | 0 |
| 原标量中继 | 0/16 | -128.344 |
| 等组中性路由 | 0/16 | -87.584 |
| 四方向路由 | 0/16 | -160.718 |
| 旋转 180° 路由 | 0/16 | -62.363 |

负值表示最终离目标更远。消息首次到达的第 2 拍，每个种子的四个方位：标量和中性臂都只有一种脉冲状态，方向与旋转臂都有四种不同脉冲状态；此时标量强度仍相同。

**结论：人工输入位置编码可以消除本轮的瞬时方向碰撞，但方向可区分不等于可用导航；这一任意映射没有带来采集成功，且描述性距离成绩差于中性和旋转对照。** 不能推广为所有方向适配器无效，也不能声称群体智慧或学习提升。没有威胁场景，不能推断安全性。

## 验证与并行工作区变化

新增文件：
- /Users/caonanya/Documents/ChatGPT/immoratalflies/src/brain/relay-direction.mjs
- /Users/caonanya/Documents/ChatGPT/immoratalflies/scripts/relay-direction-core.mjs
- /Users/caonanya/Documents/ChatGPT/immoratalflies/scripts/study-relay-direction.mjs
- /Users/caonanya/Documents/ChatGPT/immoratalflies/tests/relay-direction.test.mjs
- /Users/caonanya/Documents/ChatGPT/immoratalflies/reports/relay-direction-plan-v1.json
- /Users/caonanya/Documents/ChatGPT/immoratalflies/reports/relay-direction-v1.json

运行后，另一路工作修改了 /Users/caonanya/Documents/ChatGPT/immoratalflies/src/brain/graph.mjs，加入 endian.mjs 导入及 loadGraph 字节序检查。当前 prepareGraph 未变，但源码指纹变化使新旧报告严格 verify 正确拒绝通过。未回滚该修改、未覆盖报告、未放宽测试。

在临时隔离副本中，仅将 graph.mjs 恢复为 cf92469 提交版本（报告记录指纹 0x9dc97b781d629b3dcbedcc3b11f3f676a7e525047c645b14e663e69311d37fca）：
- 新旧诊断及 inbox/local relay 相关测试 **10/10 通过**；
- 新报告完整 verify 通过；
- 测试逐项确认两条原神经臂与旧报告轨迹完全相同；
- 工作区原文件保持不动。当前工作区严格测试仍受源码指纹差异阻塞，不能报告为全绿。

报告依赖仓库、历史 git 对象及对应源文件，不是独立复算包；仅在本机验证，未运行全仓库测试或部署。

## 下一步边界

此轮收尾，不扩大种子或选择更好看的分组。后续应先明确具有独立依据的感觉到运动映射，或另行设计训练域学习与冻结评测；不能把本轮任意分组晋升为产品协议。先协调并行图加载器改动，保存与报告匹配的完整源码复算包，再考虑新版本实验。
