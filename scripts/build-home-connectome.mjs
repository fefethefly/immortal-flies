// Compact, reproducible homepage view of the existing MaleCNS full graph.
// No inferred positions are included. Coordinates retain their source axes.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = new URL("../public/data/malecns-full/", import.meta.url);
const out = new URL("../public/assets/first-contact/", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", base), "utf8"),
);
async function verified(file) {
  const bytes = await readFile(new URL(file.path, base));
  const hash = `0x${createHash("sha256").update(bytes).digest("hex")}`;
  if (hash !== file.sha256)
    throw new Error(`Source hash mismatch: ${file.path}`);
  return bytes;
}
const metadata = JSON.parse(await verified(manifest.metadata));
const binary = await verified(manifest.connectivity);
const data = new Uint32Array(
  binary.buffer,
  binary.byteOffset,
  binary.byteLength / 4,
);
const offsets = data.subarray(3, 4 + manifest.neurons);
const targets = data.subarray(
  4 + manifest.neurons,
  4 + manifest.neurons + manifest.edges,
);
const weights = data.subarray(4 + manifest.neurons + manifest.edges);
const hasPosition = (node) =>
  node?.position?.length === 3 && node.position.every(Number.isFinite);
const positions = metadata.nodes
  .filter(hasPosition)
  .flatMap((node) => node.position);
const connections = [];
// Deterministic sparse edges preserve source endpoints and measured weights.
for (let i = 0; i < manifest.neurons; i += 47) {
  if (!hasPosition(metadata.nodes[i])) continue;
  let best = -1;
  for (let e = offsets[i]; e < offsets[i + 1]; e++)
    if (
      targets[e] !== i &&
      hasPosition(metadata.nodes[targets[e]]) &&
      (best < 0 || weights[e] > weights[best])
    )
      best = e;
  if (best >= 0)
    connections.push(
      ...metadata.nodes[i].position,
      ...metadata.nodes[targets[best]].position,
    );
}
const payload = new Int16Array(
  [...positions, ...connections].map((n) =>
    Math.round(Math.max(-1, Math.min(1, n)) * 32767),
  ),
);
const result = Buffer.alloc(8 + payload.byteLength);
result.writeUInt32LE(positions.length / 3, 0);
result.writeUInt32LE(connections.length / 6, 4);
Buffer.from(payload.buffer).copy(result, 8);
await writeFile(new URL("connectome-overview.bin", out), result);
const circuitBase = new URL("../public/data/malecns-circuit/", import.meta.url);
const circuitManifest = JSON.parse(
  await readFile(new URL("manifest.json", circuitBase), "utf8"),
);
const circuitBytes = await readFile(
  new URL(circuitManifest.metadata.path, circuitBase),
);
if (
  `0x${createHash("sha256").update(circuitBytes).digest("hex")}` !==
  circuitManifest.metadata.sha256
)
  throw new Error("Circuit metadata hash mismatch");
const circuit = JSON.parse(circuitBytes);
const located = new Map(
  metadata.nodes.filter(hasPosition).map((node, i) => [node.id, i]),
);
const mapping = Int32Array.from(
  circuit.nodes,
  (node) => located.get(node.id) ?? -1,
);
await writeFile(
  new URL("connectome-overview-activity.bin", out),
  Buffer.from(mapping.buffer),
);
await writeFile(
  new URL("connectome-overview.json", out),
  JSON.stringify(
    {
      schema: "immortal.home-connectome/1",
      dataset: manifest.dataset,
      license: manifest.license,
      source: manifest.source,
      neurons: manifest.neurons,
      edges: manifest.edges,
      positionedNeurons: positions.length / 3,
      displayedEdges: connections.length / 6,
      sourceMetadataHash: manifest.metadata.sha256,
      sourceConnectivityHash: manifest.connectivity.sha256,
      circuitMetadataHash: circuitManifest.metadata.sha256,
      visualization:
        "Normalized source coordinates only; missing positions omitted. Sparse measured edges. A structural view, not a running full-brain simulation.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Homepage connectome: ${positions.length / 3} positioned neurons, ${connections.length / 6} measured edges, ${result.byteLength} bytes`,
);
