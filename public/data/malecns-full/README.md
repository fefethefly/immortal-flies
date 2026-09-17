# MaleCNS 全量图

处理后约 16.2 万个注释神经元、275 万条显著连接，二进制约 22 MB。`graph.bin` 与 `metadata.json` 不入库；`manifest.json` 入库，Linux CI 按清单哈希取缓存或从 Janelia 源重建。

```sh
python3 -m pip install pyarrow pandas
npm run connectome:ensure:full
```

生成后，实验室页面的「全量图」选项即可载入。交互子图不依赖这一步。
