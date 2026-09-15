import { integer, requireValue, hashBytes } from './codec.mjs';

export const GRAPH_MAGIC = 0x49464631;

export function encodeGraph(metadata, edges) {
  requireValue(metadata?.schema === 'iff.connectome/1', 'GRAPH_SCHEMA');
  const n = integer(metadata.nodes.length, 2, 200000, '神经元数量');
  const outgoing = Array.from({ length: n }, () => []);
  for (const edge of edges) {
    const pre = integer(edge.pre, 0, n - 1, 'pre');
    const post = integer(edge.post, 0, n - 1, 'post');
    outgoing[pre].push([post, integer(edge.weight, 1, 999999, 'weight')]);
  }
  let edgeCount = 0;
  for (const list of outgoing) {
    list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    edgeCount += list.length;
  }
  integer(edgeCount, 1, 40000000, '连接数量');
  const bytes = new ArrayBuffer(12 + (n + 1 + edgeCount * 2) * 4);
  const data = new Uint32Array(bytes);
  data[0] = GRAPH_MAGIC;
  data[1] = n;
  data[2] = edgeCount;
  let cursor = 0;
  data[3] = 0;
  for (let i = 0; i < n; i++) {
    cursor += outgoing[i].length;
    data[4 + i] = cursor;
  }
  let targetAt = 4 + n;
  let weightAt = 4 + n + edgeCount;
  for (let i = 0; i < n; i++) {
    for (const [post, weight] of outgoing[i]) {
      data[targetAt++] = post;
      data[weightAt++] = weight;
    }
  }
  return prepareGraph({ ...metadata, edgeCount }, bytes);
}

export function bindManifest(graph, id = 'fixture') {
  const datasetHash = graph.datasetHash || `0x${'11'.repeat(32)}`;
  const metadataHash = graph.metadataHash || `0x${'22'.repeat(32)}`;
  graph.datasetHash = datasetHash;
  graph.metadataHash = metadataHash;
  graph.manifest = {
    schema: 'iff.dataset/1',
    id,
    neurons: graph.n,
    edges: graph.e,
    metadata: { path: 'metadata.json', bytes: 1, sha256: metadataHash },
    connectivity: { path: 'graph.bin', bytes: 1, sha256: datasetHash },
  };
  if (graph.metadata.dataset) graph.manifest.dataset = graph.metadata.dataset;
  return graph;
}

export function prepareGraph(metadata, buffer) {
  requireValue(metadata.schema === 'iff.connectome/1', 'GRAPH_SCHEMA');
  const n = integer(metadata.nodes.length, 2, 200000, '神经元数量');
  const e = integer(metadata.edgeCount, 1, 40000000, '连接数量');
  requireValue(buffer.byteLength === 12 + (n + 1 + e * 2) * 4, 'GRAPH_SIZE');
  const data = new Uint32Array(buffer);
  requireValue(data[0] === 0x49464631 && data[1] === n && data[2] === e, 'GRAPH_HEADER');
  const offsets = data.subarray(3, 4 + n);
  const targets = data.subarray(4 + n, 4 + n + e);
  const weights = data.subarray(4 + n + e);
  requireValue(offsets[0] === 0 && offsets[n] === e, 'GRAPH_OFFSETS');
  const ids = new Set();
  metadata.nodes.forEach(node => {
    requireValue(typeof node.id === 'string' && !ids.has(node.id), 'GRAPH_NODE_ID'); ids.add(node.id);
    requireValue([-1,0,1].includes(node.sign), 'GRAPH_SIGN');
  });
  for (let i = 0; i < n; i++) requireValue(offsets[i] <= offsets[i + 1], 'GRAPH_OFFSETS');
  for (let j = 0; j < e; j++) requireValue(targets[j] < n && weights[j] > 0 && weights[j] < 1000000, 'GRAPH_EDGE');
  for (const group of ['food','threat','light','left','right']) {
    requireValue(Array.isArray(metadata.groups[group]) && metadata.groups[group].length > 0, 'GRAPH_GROUP');
    metadata.groups[group].forEach(i => integer(i, 0, n - 1, '分组索引'));
  }
  return { metadata, n, e, offsets, targets, weights };
}

export async function loadGraph(manifestURL) {
  const manifestResponse = await fetch(manifestURL);
  requireValue(manifestResponse.ok, 'GRAPH_DOWNLOAD', '无法读取连接组清单');
  const manifest = await manifestResponse.json();
  requireValue(manifest.schema === 'iff.dataset/1', 'MANIFEST_SCHEMA');
  const base = new URL(manifestURL, globalThis.location?.href || 'http://localhost/');
  const fetchFile = async (file) => {
    const url = new URL(file.path, base);
    requireValue(url.origin === base.origin, 'GRAPH_ORIGIN');
    const r = await fetch(url);
    requireValue(r.ok, 'GRAPH_DOWNLOAD', `无法读取 ${file.path}`);
    const buffer = await r.arrayBuffer();
    requireValue(buffer.byteLength === file.bytes && await hashBytes(buffer) === file.sha256, 'GRAPH_HASH', '连接组文件校验失败');
    return buffer;
  };
  const [meta, binary] = await Promise.all([fetchFile(manifest.metadata), fetchFile(manifest.connectivity)]);
  const graph = prepareGraph(JSON.parse(new TextDecoder().decode(meta)), binary);
  graph.manifest = manifest;
  graph.datasetHash = manifest.connectivity.sha256;
  graph.metadataHash = manifest.metadata.sha256;
  return graph;
}

