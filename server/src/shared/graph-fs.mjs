import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hashBytes, requireValue } from "../../../src/brain/codec.mjs";
import { prepareGraph } from "../../../src/brain/graph.mjs";

/**
 * Node 侧从本地目录加载连接组（避免服务端 fetch('/data/...')）。
 * 刻意放在 server/，不进入浏览器 bundle。
 */
export async function loadGraphFromDir(dir) {
  const root = String(dir || "");
  requireValue(root.length > 0, "GRAPH_DIR", "连接组目录不能为空");
  const manifestRaw = await readFile(join(root, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestRaw);
  requireValue(manifest.schema === "iff.dataset/1", "MANIFEST_SCHEMA");
  const readEntry = async (file) => {
    const buffer = await readFile(join(root, file.path));
    requireValue(
      buffer.byteLength === file.bytes && (await hashBytes(buffer)) === file.sha256,
      "GRAPH_HASH",
      "连接组文件校验失败",
    );
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  };
  const [meta, binary] = await Promise.all([readEntry(manifest.metadata), readEntry(manifest.connectivity)]);
  const graph = prepareGraph(JSON.parse(new TextDecoder().decode(meta)), binary);
  graph.manifest = manifest;
  graph.datasetHash = manifest.connectivity.sha256;
  graph.metadataHash = manifest.metadata.sha256;
  return graph;
}
