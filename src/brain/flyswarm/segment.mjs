/**
 * iff.segment/1 —— 段证明（Segment Proof）的证明引擎（L3，SIM）。
 *
 * 规格：docs/MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md §3–§4。
 *
 * 一「段」= 把一条生命的状态从位置 0 确定性推进到位置 n，对每一步之后的状态
 * 摘要作 Merkle 承诺。承诺之后才知道抽哪几步；开叶必须带**前一个**检查点，
 * 复算者从那里重放 ≤ 2c 步：先核检查点衔接（防「循环轨迹」伪造），再核抽中的叶。
 * 争议时两棵树二分到首个分歧位置，任何人 step() 一次即可判负。
 *
 * 硬规则：
 * - 内核零改动：只调用 runtime.mjs 的 step()，不读写图、不改边权。
 * - 全部时间是逻辑位置（0..n），禁止 Date.now()。
 * - 叶、树、承诺、开口、判定各有 schema 与 audit；旧版本永不改写。
 * - 本文件不签名、不转账、不持有资金；schema 是 M0 候选，冻结前不进 schemas.mjs。
 */
import { clone, hash, identifier, integer, requireValue } from "../codec.mjs";
import { step } from "../runtime.mjs";

export const SEGMENT_SCHEMA = "iff.segment/1";
export const LEAF_SCHEMA = "iff.trajectory-leaf/1";
export const MERKLE_SCHEMA = "iff.merkle/1";
export const TRAJECTORY_SCHEMA = "iff.trajectory/1";
export const COMMITMENT_SCHEMA = "iff.segment-commitment/1";
export const OPENING_SCHEMA = "iff.trajectory-opening/1";
export const PROBE_SCHEMA = "iff.probe/1";
export const ADJUDICATION_SCHEMA = "iff.adjudication/1";

export const SEGMENT_POLICY = Object.freeze({
  id: "iff-segment-1",
  version: "1",
  /** 段长上限（位置数，每个位置 = 一步 step） */
  maxSteps: 1000,
  /** 检查点间隔 c：开叶复算 ≤ 2c 步（全量图批量重放约 1 ms/步，见设计稿 §8 实测） */
  checkpointEvery: 100,
  /** 叶步幅 L：每 L 步取一个叶；1 = 逐 tick（设计稿原案）。争议判定重放 L 步。 */
  leafEvery: 1,
  /** 分层抽检数 k：每 1/k 段各抽一个位置 */
  probeCount: 3,
  /** runtime.step 单次上限（内核既有约束） */
  maxStepBatch: 128,
});

const HASH64 = /^0x[0-9a-f]{64}$/;
const isHash = (v, name) =>
  requireValue(
    typeof v === "string" && HASH64.test(v),
    "INVALID_HASH",
    `${name} 必须是 0x 开头 64 位十六进制`,
  );
const AUDITS = ["SIM", "TESTNET", "MAINNET"];
const meta = (r, id) => {
  requireValue(r && r.schema === id, "SCHEMA_MISMATCH", `记录不是 ${id}`);
  requireValue(
    AUDITS.includes(r.audit),
    "INVALID_AUDIT",
    "audit 必须是 SIM / TESTNET / MAINNET",
  );
  return r;
};

/** 状态摘要：与 LifeJournal 的 stateRoot 同义 —— canonical SHA-256。 */
export const stateDigest = (state) => hash(state);

/** 叶 = hash(schema, 位置, 状态摘要)。位置绑定防止叶在槽位间平移复用。 */
export async function leafOf({ position, stateRoot }) {
  integer(position, 1, SEGMENT_POLICY.maxSteps, "position");
  isHash(stateRoot, "stateRoot");
  return hash({ schema: LEAF_SCHEMA, position, stateRoot });
}

/** 分批调用 step()，尊重内核单次 ≤128 步的既有约束；不改内核。 */
export function replaySteps(state, graph, count) {
  integer(count, 0, SEGMENT_POLICY.maxSteps, "count");
  let s = state;
  let left = count;
  while (left > 0) {
    const batch = Math.min(left, SEGMENT_POLICY.maxStepBatch);
    s = step(s, graph, batch);
    left -= batch;
  }
  return s;
}

/** 检查点数量：位置 0, c, 2c, … 且 < steps。 */
export function checkpointCount(steps, checkpointEvery) {
  return Math.ceil(steps / checkpointEvery);
}

// ───────────────────────── Merkle（iff.merkle/1） ─────────────────────────
// 奇数层最后一个节点原样上提（不复制），证明中该层记为 null。

export async function buildMerkle(leaves) {
  requireValue(
    Array.isArray(leaves) && leaves.length >= 1,
    "MERKLE_EMPTY",
    "Merkle 树至少一个叶",
  );
  leaves.forEach((leaf, i) => isHash(leaf, `leaf[${i}]`));
  const layers = [leaves.slice()];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      if (i + 1 < prev.length) {
        next.push(
          await hash({
            schema: MERKLE_SCHEMA,
            left: prev[i],
            right: prev[i + 1],
          }),
        );
      } else {
        next.push(prev[i]);
      }
    }
    layers.push(next);
  }
  return {
    schema: MERKLE_SCHEMA,
    leafCount: leaves.length,
    root: layers[layers.length - 1][0],
    layers,
  };
}

function layerSizes(leafCount) {
  const sizes = [];
  let size = leafCount;
  while (size > 1) {
    sizes.push(size);
    size = Math.ceil(size / 2);
  }
  return sizes;
}

export function merkleProof(tree, index) {
  integer(index, 0, tree.leafCount - 1, "index");
  const proof = [];
  let idx = index;
  for (let level = 0; level < tree.layers.length - 1; level += 1) {
    const layer = tree.layers[level];
    const sibling = idx ^ 1;
    proof.push(
      sibling < layer.length
        ? { hash: layer[sibling], side: idx % 2 === 0 ? "right" : "left" }
        : null,
    );
    idx >>= 1;
  }
  return proof;
}

/** 按 leafCount 重建层形状，证明长度与 null 位置都必须与形状一致，防伸缩证明。 */
export async function verifyMerkleProof(root, leaf, index, proof, leafCount) {
  if (!HASH64.test(root || "") || !HASH64.test(leaf || "")) return false;
  if (!Number.isSafeInteger(index) || index < 0 || index >= leafCount)
    return false;
  const sizes = layerSizes(leafCount);
  if (!Array.isArray(proof) || proof.length !== sizes.length) return false;
  let h = leaf;
  let idx = index;
  for (let level = 0; level < sizes.length; level += 1) {
    const sibling = idx ^ 1;
    const entry = proof[level];
    if (sibling < sizes[level]) {
      if (!entry || !HASH64.test(entry.hash || "")) return false;
      if (entry.side !== (idx % 2 === 0 ? "right" : "left")) return false;
      h =
        entry.side === "right"
          ? await hash({ schema: MERKLE_SCHEMA, left: h, right: entry.hash })
          : await hash({ schema: MERKLE_SCHEMA, left: entry.hash, right: h });
    } else if (entry !== null) {
      return false;
    }
    idx >>= 1;
  }
  return h === root;
}

// ───────────────────────── 轨迹与承诺 ─────────────────────────

/**
 * 跑一段：从 initialState 推进 steps 步，逐位置取叶，每 c 步落检查点。
 * 返回值含完整叶、检查点状态与树（运行方本地保存）；承诺只上 commitmentOf()。
 */
export async function runTrajectory(
  graph,
  initialState,
  {
    steps,
    checkpointEvery = SEGMENT_POLICY.checkpointEvery,
    leafEvery = SEGMENT_POLICY.leafEvery,
    digest = stateDigest,
  } = {},
) {
  validateShape({ steps, checkpointEvery, leafEvery });
  let state = clone(initialState);
  const startRoot = await digest(state);
  const checkpoints = [{ position: 0, state: clone(state) }];
  const checkpointRoots = [startRoot];
  const leaves = [];
  let finalRoot = startRoot;
  for (let position = leafEvery; position <= steps; position += leafEvery) {
    state = replaySteps(state, graph, leafEvery);
    const stateRoot = await digest(state);
    leaves.push(await leafOf({ position, stateRoot }));
    finalRoot = stateRoot;
    if (position % checkpointEvery === 0 && position < steps) {
      checkpoints.push({ position, state: clone(state) });
      checkpointRoots.push(stateRoot);
    }
  }
  const tree = await buildMerkle(leaves);
  return {
    schema: TRAJECTORY_SCHEMA,
    audit: "SIM",
    steps,
    checkpointEvery,
    leafEvery,
    startRoot,
    finalRoot,
    root: tree.root,
    leaves,
    checkpoints,
    checkpointRoots,
    tree,
    finalState: state,
  };
}

/** 段形状：叶步幅整除段长与检查点间隔，位置永远落在叶上。 */
function validateShape({ steps, checkpointEvery, leafEvery }) {
  integer(steps, 1, SEGMENT_POLICY.maxSteps, "steps");
  integer(leafEvery, 1, SEGMENT_POLICY.maxStepBatch, "leafEvery");
  integer(checkpointEvery, leafEvery, steps, "checkpointEvery");
  requireValue(
    steps % leafEvery === 0,
    "SHAPE_LEAF_STRIDE",
    "段长必须是叶步幅的整数倍",
  );
  requireValue(
    checkpointEvery % leafEvery === 0,
    "SHAPE_CHECKPOINT_STRIDE",
    "检查点间隔必须是叶步幅的整数倍",
  );
}
/** 叶数 = steps / leafEvery；位置 p 的叶索引 = p / leafEvery − 1。 */
export const leafCountOf = ({ steps, leafEvery = 1 }) => steps / leafEvery;
const leafIndexOf = (position, leafEvery) => position / leafEvery - 1;
const onLeaf = (position, leafEvery) =>
  Number.isSafeInteger(position) &&
  position >= leafEvery &&
  position % leafEvery === 0;

/** 承诺：只有哈希，可直接作为 LifeJournal.checkpoint 的 archiveHash 原像一部分或 MiningHub.commit 参数。 */
export function commitmentOf(trajectory) {
  const lastIndex = leafCountOf(trajectory) - 1;
  return {
    schema: COMMITMENT_SCHEMA,
    audit: trajectory.audit,
    steps: trajectory.steps,
    checkpointEvery: trajectory.checkpointEvery,
    leafEvery: trajectory.leafEvery,
    startRoot: trajectory.startRoot,
    finalRoot: trajectory.finalRoot,
    root: trajectory.root,
    checkpointRoots: trajectory.checkpointRoots.slice(),
    finalLeaf: trajectory.leaves[lastIndex],
    finalProof: merkleProof(trajectory.tree, lastIndex),
  };
}

export function validateCommitment(c) {
  meta(c, COMMITMENT_SCHEMA);
  validateShape(c);
  isHash(c.startRoot, "startRoot");
  isHash(c.finalRoot, "finalRoot");
  isHash(c.root, "root");
  requireValue(
    Array.isArray(c.checkpointRoots) &&
      c.checkpointRoots.length === checkpointCount(c.steps, c.checkpointEvery),
    "COMMITMENT_CHECKPOINTS",
    "检查点数量与段长不符",
  );
  c.checkpointRoots.forEach((r, i) => isHash(r, `checkpointRoots[${i}]`));
  isHash(c.finalLeaf, "finalLeaf");
  requireValue(
    Array.isArray(c.finalProof),
    "COMMITMENT_FINAL_PROOF",
    "承诺必须携带末叶到轨迹根的 Merkle 路径",
  );
  requireValue(
    c.checkpointRoots[0] === c.startRoot,
    "COMMITMENT_START",
    "检查点 0 必须等于起始状态摘要",
  );
  return c;
}

/** 从最近的前置检查点重放到 position，得到该位置的状态（运行方开叶 / 争议方取 pre-state 用）。 */
export function stateAt(graph, trajectory, position) {
  integer(position, 0, trajectory.steps, "position");
  let anchor = trajectory.checkpoints[0];
  for (const cp of trajectory.checkpoints)
    if (cp.position <= position) anchor = cp;
  return replaySteps(clone(anchor.state), graph, position - anchor.position);
}

// ───────────────────────── 抽检 ─────────────────────────

/**
 * 分层抽样：把全部叶切成 count 层，每层用 hash(seed, segmentId, 层号) 抽一个叶，返回其位置。
 * seed 必须来自承诺之后（SIM 注入显式测试种子）；它只决定抽哪里，不决定钱。
 */
export async function selectProbes({
  seed,
  segmentId,
  steps,
  leafEvery = 1,
  count = SEGMENT_POLICY.probeCount,
}) {
  isHash(seed, "seed");
  identifier(segmentId, "segmentId");
  integer(steps, 1, SEGMENT_POLICY.maxSteps, "steps");
  integer(leafEvery, 1, SEGMENT_POLICY.maxStepBatch, "leafEvery");
  requireValue(steps % leafEvery === 0, "SHAPE_LEAF_STRIDE");
  const leafCount = leafCountOf({ steps, leafEvery });
  integer(count, 1, leafCount, "count");
  const size = Math.ceil(leafCount / count);
  const positions = [];
  for (let stratum = 0; stratum < count; stratum += 1) {
    const lo = stratum * size;
    const hi = Math.min(leafCount - 1, (stratum + 1) * size - 1);
    if (lo > hi) break;
    const h = await hash({ schema: PROBE_SCHEMA, seed, segmentId, stratum });
    const draw = parseInt(h.slice(2, 14), 16);
    positions.push((lo + (draw % (hi - lo + 1)) + 1) * leafEvery);
  }
  return positions;
}

/**
 * 开叶：位置 p 所在窗口的锚检查点 q1 = floor((p-1)/c)·c，开口携带**前一个**检查点 q0 的状态，
 * 复算者从 q0 重放：q0→q1 核衔接，q1→p 核叶。q1 = 0 时 q0 = 0，改核 startRoot。
 */
export function openProbe(trajectory, position) {
  integer(position, 1, trajectory.steps, "position");
  const { checkpointEvery: c, leafEvery: L } = trajectory;
  requireValue(onLeaf(position, L), "OPENING_POSITION", "位置不在叶上");
  const anchorIndex = Math.floor((position - 1) / c);
  const fromIndex = Math.max(0, anchorIndex - 1);
  const from = trajectory.checkpoints[fromIndex];
  requireValue(
    from && from.position === fromIndex * c,
    "OPENING_FROM",
    "检查点缺失",
  );
  const index = leafIndexOf(position, L);
  return {
    schema: OPENING_SCHEMA,
    audit: trajectory.audit,
    position,
    leaf: trajectory.leaves[index],
    proof: merkleProof(trajectory.tree, index),
    from: {
      index: fromIndex,
      position: from.position,
      state: clone(from.state),
    },
    anchor: { index: anchorIndex, position: anchorIndex * c },
  };
}

/**
 * 复算一个开口。返回 {ok, reason, replayed}。任何失败都只是「不匹配」，不是罚没依据；
 * 罚没只发生在二分后 adjudicate() 判负（见 segment-ledger.mjs）。
 */
export async function checkOpening(
  graph,
  opening,
  commitment,
  { digest = stateDigest } = {},
) {
  validateCommitment(commitment);
  meta(opening, OPENING_SCHEMA);
  const { steps, checkpointEvery: c, leafEvery: L } = commitment;
  const lastIndex = leafCountOf(commitment) - 1;
  const expectedFinal = await leafOf({
    position: steps,
    stateRoot: commitment.finalRoot,
  });
  if (commitment.finalLeaf !== expectedFinal) {
    return { ok: false, reason: "FINAL_LEAF", replayed: 0 };
  }
  const finalBound = await verifyMerkleProof(
    commitment.root,
    commitment.finalLeaf,
    lastIndex,
    commitment.finalProof,
    leafCountOf(commitment),
  );
  if (!finalBound) return { ok: false, reason: "FINAL_PROOF", replayed: 0 };
  const position = opening.position;
  if (!onLeaf(position, L) || position > steps) {
    return { ok: false, reason: "OPENING_POSITION", replayed: 0 };
  }
  const anchorIndex = Math.floor((position - 1) / c);
  const fromIndex = Math.max(0, anchorIndex - 1);
  if (
    !opening.from ||
    opening.from.index !== fromIndex ||
    opening.from.position !== fromIndex * c
  ) {
    return { ok: false, reason: "OPENING_FROM", replayed: 0 };
  }
  let fromRoot;
  try {
    fromRoot = await digest(opening.from.state);
  } catch {
    return { ok: false, reason: "OPENING_STATE", replayed: 0 };
  }
  if (fromRoot !== commitment.checkpointRoots[fromIndex]) {
    return { ok: false, reason: "CHECKPOINT_ROOT", replayed: 0 };
  }
  let state = clone(opening.from.state);
  let replayed = 0;
  if (anchorIndex > fromIndex) {
    const link = anchorIndex * c - fromIndex * c;
    state = replaySteps(state, graph, link);
    replayed += link;
    if ((await digest(state)) !== commitment.checkpointRoots[anchorIndex]) {
      return { ok: false, reason: "CHECKPOINT_LINK", replayed };
    }
  }
  const tail = position - anchorIndex * c;
  state = replaySteps(state, graph, tail);
  replayed += tail;
  const stateRoot = await digest(state);
  const leaf = await leafOf({ position, stateRoot });
  if (leaf !== opening.leaf)
    return { ok: false, reason: "LEAF_MISMATCH", replayed };
  if (position === steps && stateRoot !== commitment.finalRoot) {
    return { ok: false, reason: "FINAL_ROOT", replayed };
  }
  const proven = await verifyMerkleProof(
    commitment.root,
    opening.leaf,
    leafIndexOf(position, L),
    opening.proof,
    leafCountOf(commitment),
  );
  if (!proven) return { ok: false, reason: "MERKLE_PROOF", replayed };
  return { ok: true, reason: null, replayed };
}

// ───────────────────────── 争议：二分 + 判定 ─────────────────────────

/** 线性对照（测试与审计用）：首个不同叶的 0 基索引，全同返回 -1。 */
export function firstDivergence(leavesA, leavesB) {
  requireValue(
    leavesA.length === leavesB.length,
    "BISECT_SHAPE",
    "两段长度必须相同",
  );
  for (let i = 0; i < leavesA.length; i += 1)
    if (leavesA[i] !== leavesB[i]) return i;
  return -1;
}

/**
 * 二分：两棵同形状树根不同，逐层向下找首个分歧叶。每轮只比 32 字节。
 * 返回 {index, position, rounds}；position = (index + 1) × leafEvery。
 */
export function bisectTrees(treeA, treeB, { leafEvery = 1 } = {}) {
  integer(leafEvery, 1, SEGMENT_POLICY.maxStepBatch, "leafEvery");
  requireValue(
    treeA?.schema === MERKLE_SCHEMA && treeB?.schema === MERKLE_SCHEMA,
    "SCHEMA_MISMATCH",
  );
  requireValue(
    treeA.leafCount === treeB.leafCount,
    "BISECT_SHAPE",
    "两段长度必须相同",
  );
  requireValue(treeA.root !== treeB.root, "BISECT_SAME", "根相同，无争议");
  const rounds = [];
  let idx = 0;
  for (let level = treeA.layers.length - 1; level > 0; level -= 1) {
    const below = treeA.layers[level - 1];
    const belowB = treeB.layers[level - 1];
    const left = 2 * idx;
    const right = left + 1;
    if (right >= below.length) {
      idx = left; // 上提节点：无兄弟，直接下沉
    } else if (below[left] !== belowB[left]) {
      idx = left;
    } else {
      requireValue(
        below[right] !== belowB[right],
        "BISECT_INCONSISTENT",
        "父异子同，树不自洽",
      );
      idx = right;
    }
    rounds.push({
      level: level - 1,
      index: idx,
      a: below[idx],
      b: belowB[idx],
    });
  }
  return { index: idx, position: (idx + 1) * leafEvery, rounds };
}

/**
 * 判定：给定双方都认可的 pre-state（分歧叶的前一个叶位置，leafEvery=1 时即前一 tick），
 * 任何人 step() 推进 leafEvery 步，算出应有的叶。与之相等者胜；都不等则双输。
 * 这是机械谓词，不是治理判断。
 */
export async function adjudicate(
  graph,
  { preState, position, leafA, leafB, leafEvery = 1, digest = stateDigest },
) {
  integer(leafEvery, 1, SEGMENT_POLICY.maxStepBatch, "leafEvery");
  integer(position, leafEvery, SEGMENT_POLICY.maxSteps, "position");
  requireValue(
    onLeaf(position, leafEvery),
    "ADJUDICATE_POSITION",
    "位置不在叶上",
  );
  isHash(leafA, "leafA");
  isHash(leafB, "leafB");
  requireValue(leafA !== leafB, "ADJUDICATE_SAME", "两叶相同，无争议");
  const next = step(clone(preState), graph, leafEvery);
  const stateRoot = await digest(next);
  const expectedLeaf = await leafOf({ position, stateRoot });
  const verdict =
    leafA === expectedLeaf ? "A" : leafB === expectedLeaf ? "B" : "NEITHER";
  return {
    schema: ADJUDICATION_SCHEMA,
    audit: "SIM",
    position,
    leafEvery,
    preStateRoot: await digest(preState),
    expectedLeaf,
    verdict,
  };
}

// ───────────────────────── M0 候选 schema（冻结前不进 schemas.mjs） ─────────────────────────
// 段记录 iff.segment/1 与回执 iff.segment-receipt/1 由 segment-ledger.mjs 声明（那是钱的形状）。

/** iff.trajectory-leaf/1：叶的原像（位置 + 状态摘要）。叶本身 = hash({schema, position, stateRoot})，audit 不进哈希。 */
const leafSchema = {
  id: "iff.trajectory-leaf",
  version: "1",
  title: "轨迹叶",
  validate(r) {
    meta(r, LEAF_SCHEMA);
    integer(r.position, 1, SEGMENT_POLICY.maxSteps, "position");
    isHash(r.stateRoot, "stateRoot");
    return r;
  },
};

/** iff.segment-commitment/1：链上承诺形状。 */
const commitmentSchema = {
  id: "iff.segment-commitment",
  version: "1",
  title: "段承诺",
  validate: validateCommitment,
};

export const PROOF_SCHEMAS = Object.freeze([leafSchema, commitmentSchema]);
