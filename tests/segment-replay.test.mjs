import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { encodeGraph } from "../src/brain/graph.mjs";
import {
  GRAPH_MAGIC_LE,
  graphFileEndian,
  hostEndian,
  requireLittleEndianGraph,
} from "../src/brain/endian.mjs";
import {
  PLAN,
  VECTOR_SCHEMA,
  fingerprints,
  verifyBundle,
} from "../scripts/segment-replay-core.mjs";

const root = join(import.meta.dirname, "..");
const VECTOR = join(root, "reports/segment-replay-full-v1.json");

test("宿主与官方 graph.bin 都是 IFF1 小端；错魔数拒领", () => {
  assert.equal(hostEndian(), "little");
  const encoded = encodeGraph(
    {
      schema: "iff.connectome/1",
      nodes: [
        { id: "a", sign: 1 },
        { id: "b", sign: 1 },
      ],
      groups: { food: [0], threat: [0], light: [1], left: [0], right: [1] },
    },
    [{ pre: 0, post: 1, weight: 10 }],
  );
  const magic = new Uint8Array(encoded.offsets.buffer, 0, 4);
  assert.deepEqual([...magic], [...GRAPH_MAGIC_LE]);
  assert.equal(graphFileEndian(encoded.offsets.buffer), "little");
  const flipped = new Uint8Array([0x49, 0x46, 0x46, 0x31]).buffer;
  assert.equal(graphFileEndian(flipped), "big");
  assert.throws(() => requireLittleEndianGraph(flipped), /端序/);
});

test("已提交向量形状：circuit + full，L=10，n=1000", async () => {
  const saved = JSON.parse(await readFile(VECTOR, "utf8"));
  assert.equal(saved.schema, VECTOR_SCHEMA);
  assert.equal(saved.plan.steps, PLAN.steps);
  assert.equal(saved.plan.leafEvery, 10);
  assert.equal(saved.endian.host, "little");
  assert.equal(saved.datasets["malecns-circuit"].neurons, 12000);
  assert.equal(saved.datasets["malecns-full"].neurons, 161839);
  assert.match(
    saved.datasets["malecns-full"].commitment.root,
    /^0x[0-9a-f]{64}$/,
  );
});

test("跨平台向量：malecns-circuit 1000 步 L=10 与已提交根一致", async () => {
  const saved = JSON.parse(await readFile(VECTOR, "utf8"));
  const sources = await fingerprints(root);
  const result = await verifyBundle(saved, root, sources, {
    ids: ["malecns-circuit"],
  });
  assert.equal(result.ok, true);
});

test("向量外包被改则拒绝，不重跑神经计算", async () => {
  const saved = JSON.parse(await readFile(VECTOR, "utf8"));
  const sources = await fingerprints(root);
  saved.datasets["malecns-circuit"].commitment.root = "0x" + "ab".repeat(32);
  await assert.rejects(verifyBundle(saved, root, sources), /外包哈希/);
});

test(
  "跨平台向量：malecns-full 1000 步 L=10（SEGMENT_REPLAY_FULL=1 或 CI）",
  { skip: process.env.SEGMENT_REPLAY_FULL !== "1" },
  async () => {
    const saved = JSON.parse(await readFile(VECTOR, "utf8"));
    const sources = await fingerprints(root);
    const result = await verifyBundle(saved, root, sources, {
      ids: ["malecns-full"],
    });
    assert.equal(result.ok, true);
  },
);
