# MaleCNS v1.0 连接组处理说明

数据来自 [Janelia FlyEM MaleCNS](https://male-cns.janelia.org/download/)，许可证为 **CC BY**。官方发布版本为 `male-cns:v1.0`。本仓库不重新发布原始 Feather 文件，只保存处理记录和可运行的二进制图。

Canon 决策与整条数据流见 [BIOLOGY-SPINE-V6.md](BIOLOGY-SPINE-V6.md)。幼虫全脑是另一发育阶段，不能替换这套 body ID。

## 官方文件

缓存目录：`scripts/data/cache/`（不入库）。

| 角色 | 文件 | 用途 |
| --- | --- | --- |
| 注释 | `body-annotations-male-cns-v1.0-minconf-0.5.feather` | 官方神经元编号、类型、侧别、坐标 |
| 递质 | `body-neurotransmitters-male-cns-v1.0.feather` | 官方递质预测 |
| 连接 | `connectome-weights-male-cns-v1.0-minconf-0.5-significant-only.feather` | 显著的节段间连接强度 |

## 两个规模

两者走同一套 `iff.connectome/1` 接口。

- **交互子图** `public/data/malecns-circuit/`：从官方注释中选取嗅觉/味觉、机械感觉/逃避、光感受器与左右下行/运动神经元，再保留一跳显著连接。当前产物为 1400 个节点、42031 条边。
- **全量图** `public/data/malecns-full/`：在注释神经元之间保留权重 ≥ 10 的显著连接。当前产物约 16.2 万个节点、275 万条边、22 MB 二进制；文件不入库，需本地生成。

```sh
python3 -m pip install pyarrow pandas
npm run connectome:prepare
npm run connectome:prepare -- --full
```

## 保留与改写

保留：官方 body ID、数据版本、来源 URL、文件指纹、边权为官方连接强度。

本项目定义，不能写成果蝇的先天能力：

- 食物 / 威胁 / 光照 到神经元分组的刺激映射
- GABA、glutamate → 抑制，acetylcholine → 兴奋；其余递质在第一版不传导
- 整数泄漏积分发放与二维身体解码
- 可视化用的坐标归一化或备用布局

每个数据集的 `provenance.json` 记录上述处理。发光连线若未对应本步脉冲，属于美术效果。

## 运行与恢复

内核是 `iff-runtime/1`。输入批次校验来源、适配器版本和序号；档案包含初始状态、事件历史和最终状态，恢复时完整重放。页面在暂停、隐藏或关闭时写入本机 IndexedDB，重开后校验再继续。
