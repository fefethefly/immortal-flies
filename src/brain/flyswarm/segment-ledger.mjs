/**
 * iff.segment-ledger/1 —— 段证明的四本账（L3，SIM）。
 *
 * 规格：docs/MINING-SEGMENT-PROOF-DESIGN-2026-09-17.md §5–§6。
 *
 * 四本账互不挪用，任何一本空了都不从另一本借（AGENTS.md 分账纪律）：
 *   Tank   罐（每 lifeId）  买方的钱：主人 ownerFuel 可退；围观 giftFuel 留在生命上
 *   Budget 预算（公共轨）   协议的钱：只认到账回执；A ≥ L 永远成立
 *   Bond   押金（每运营方） 卖方的钱：一笔押金一个身份；只在二分判负时罚没
 *   Seat   座位锁（每主人） 持币者的名额：不生息、不进票权、不改表型
 *
 * 硬规则：
 * - 守恒：totalIn === held + totalOut，任何操作之后都成立（invariants()）。
 * - 私有轨：抽检通过后记账，挑战窗结束后才付；窗内押金曝险不释放。公共轨：K 个不同运营方根一致才付，70% 即付 30% 延迟。
 * - 罚没只有一种触发：adjudicate() 的机械判定（segment.mjs），其余不匹配只标 CHALLENGED。
 * - 全部整数、逻辑 tick、audit = SIM；本文件不签名、不转账、不持有真实资金。
 */
import { clone, identifier, integer, requireValue } from "../codec.mjs";
import { SEGMENT_POLICY, validateCommitment } from "./segment.mjs";

export const LEDGER_SCHEMA = "iff.segment-ledger/1";
export const SEGMENT_RECORD_SCHEMA = "iff.segment/1";
export const RECEIPT_SCHEMA = "iff.segment-receipt/1";

export const TRACKS = Object.freeze(["PRIVATE", "PUBLIC"]);
export const SEGMENT_STATUSES = Object.freeze([
  "OPEN", // 已领段，费用已预留
  "COMMITTED", // 承诺已登记，挑战窗开启
  "CHALLENGED", // 抽检不匹配或有人发起二分：只标记，不罚
  "SETTLED", // 已付工价（私有轨即付；公共轨 70/30）
  "SLASHED", // 二分判负：押金罚没，预留费退回
  "VOID", // 超时 / 主动放弃：预留费退回，不罚
]);
export const OPERATOR_ROLES = Object.freeze(["RUNNER", "KEEPER"]);
export const OPERATOR_STATUSES = Object.freeze(["ACTIVE", "EXITING", "EXITED"]);

export const SEGMENT_LEDGER_POLICY = Object.freeze({
  id: "iff-segment-ledger-1",
  version: "1",
  /** 押金门槛（SIM 原子单位）。不照搬 credit 的 10_000；主网按实测成本报价。 */
  minBond: 1_000_000,
  /** 押金曝险倍数：每开一段锁 bondMultiple × fee（§6.3：伪造期望值为负） */
  bondMultiple: 5,
  /** 挑战者押金（发起二分需要有身份；输了罚这个） */
  challengeBond: 100_000,
  /** 挑战窗（逻辑 tick；主网映射 24h） */
  challengeWindowTicks: 1000,
  /** 运营方退出冷却 */
  exitCooldownTicks: 7000,
  /** 单段工价硬顶（SIM 原子单位） */
  maxFeePerSegment: 100_000,
  /** 公共轨副本数 K：不同运营方 */
  publicReplicas: 3,
  /** 公共轨即付比例 */
  payNowBps: 7000,
  /** 公共轨延迟释放（逻辑 tick；主网映射 4 纪元） */
  deferTicks: 4000,
  /** 争议处理后仍一致的副本下限：低于此不付、预留退回（未决参数） */
  minAgreeingReplicas: 2,
  /** 座位锁冷却 */
  seatCooldownTicks: 7000,
  /** 座位锁折扣：每 seatUnit 锁仓 1 bps，硬顶 seatDiscountCapBps */
  seatUnit: 100_000,
  seatDiscountCapBps: 1000,
  /** 罚没去向（只是标签；SIM 不转账） */
  slashSink: "hive",
});

export function createSegmentLedger({ audit = "SIM" } = {}) {
  requireValue(audit === "SIM", "SEGMENT_LEDGER_AUDIT", "M0 只跑 SIM 账本");
  return {
    schema: LEDGER_SCHEMA,
    policy: `${SEGMENT_LEDGER_POLICY.id}@${SEGMENT_LEDGER_POLICY.version}`,
    audit,
    tick: 0,
    tanks: new Map(), // lifeId -> {ownerFuel, giftFuel, reserved, binding}
    budget: { assets: 0, liabilities: 0, receipts: [] },
    operators: new Map(), // operatorId -> {roles, bond, exposure, status, unlockAt, registeredAt}
    seats: new Map(), // ownerId -> {amount, unlockAt}
    tasks: new Map(), // taskId -> {price, replicas, checkFee, storageFee, reserved, segmentIds, status}
    segments: new Map(), // segmentId -> iff.segment/1
    leases: new Map(), // lifeId -> segmentId
    claimed: new Set(), // `${lifeId}:${startRoot}:${steps}`
    heads: new Map(), // lifeId -> last accepted finalRoot
    earnings: new Map(), // operatorId -> 未提取工价
    receipts: [], // iff.segment-receipt/1
    totals: { in: 0, out: 0, slashed: 0 },
  };
}

const P = SEGMENT_LEDGER_POLICY;
const amount = (n, name) => integer(n, 1, Number.MAX_SAFE_INTEGER, name);

export function advanceSegmentLedger(ledger, tick) {
  integer(tick, ledger.tick, Number.MAX_SAFE_INTEGER, "tick");
  ledger.tick = tick;
  return ledger;
}
const at = (ledger, tick) => {
  if (tick == null) return ledger.tick;
  advanceSegmentLedger(ledger, tick);
  return tick;
};

const tankOf = (ledger, lifeId) => {
  identifier(lifeId, "lifeId");
  if (!ledger.tanks.has(lifeId)) {
    ledger.tanks.set(lifeId, {
      ownerFuel: 0,
      giftFuel: 0,
      reserved: 0,
      binding: null,
    });
  }
  return ledger.tanks.get(lifeId);
};
const operatorOf = (ledger, operatorId) => {
  identifier(operatorId, "operatorId");
  const op = ledger.operators.get(operatorId);
  requireValue(op, "OPERATOR_UNKNOWN", `运营方 ${operatorId} 未登记`);
  return op;
};
const segmentOf = (ledger, segmentId) => {
  identifier(segmentId, "segmentId");
  const seg = ledger.segments.get(segmentId);
  requireValue(seg, "SEGMENT_UNKNOWN", `段 ${segmentId} 不存在`);
  return seg;
};
const addEarnings = (ledger, operatorId, wage) => {
  ledger.earnings.set(
    operatorId,
    (ledger.earnings.get(operatorId) || 0) + wage,
  );
};
/** 私有轨预留费按原路退回罐：主人的回 ownerFuel，打赏的回 giftFuel。 */
const refundReserved = (ledger, seg) => {
  const tank = tankOf(ledger, seg.lifeId);
  tank.reserved -= seg.fee;
  tank.ownerFuel += seg.fuel.fromOwner;
  tank.giftFuel += seg.fuel.fromGift;
  return seg.fee;
};
const endLease = (ledger, seg, keepClaim) => {
  if (seg.track !== "PRIVATE") return;
  if (ledger.leases.get(seg.lifeId) === seg.id) ledger.leases.delete(seg.lifeId);
  if (!keepClaim && seg.workKey) ledger.claimed.delete(seg.workKey);
};

// ───────────────────────── Tank 罐 ─────────────────────────

/** 加油。OWNER 可退；GIFT 不可退、主人不可提、随生命走。 */
export function refuel(ledger, { lifeId, amount: n, kind = "OWNER", tick }) {
  at(ledger, tick);
  amount(n, "amount");
  requireValue(
    ["OWNER", "GIFT"].includes(kind),
    "FUEL_KIND",
    "kind 只能是 OWNER / GIFT",
  );
  const tank = tankOf(ledger, lifeId);
  if (kind === "OWNER") tank.ownerFuel += n;
  else tank.giftFuel += n;
  ledger.totals.in += n;
  return tankView(ledger, lifeId);
}

/** 主人退油：只退未预留的 ownerFuel。 */
export function drainOwnerFuel(ledger, { lifeId, amount: n, tick }) {
  at(ledger, tick);
  const tank = tankOf(ledger, lifeId);
  const want = n == null ? tank.ownerFuel : amount(n, "amount");
  requireValue(want <= tank.ownerFuel, "FUEL_INSUFFICIENT", "ownerFuel 不足");
  tank.ownerFuel -= want;
  ledger.totals.out += want;
  return want;
}

/** 主人接受 Runner 报价并绑定（authorizedRunner 的账本侧镜像）。 */
export function bindRunner(
  ledger,
  { lifeId, operatorId, feePerSegment, tick },
) {
  at(ledger, tick);
  const op = operatorOf(ledger, operatorId);
  requireValue(
    op.status === "ACTIVE" && op.roles.includes("RUNNER"),
    "BIND_RUNNER",
    "只能绑定在册 Runner",
  );
  integer(feePerSegment, 0, P.maxFeePerSegment, "feePerSegment");
  const tank = tankOf(ledger, lifeId);
  tank.binding = { operatorId, feePerSegment, boundAt: ledger.tick };
  return clone(tank.binding);
}

/** Soul 转移：ownerFuel 退卖家（返回额度），giftFuel 留在生命上，绑定清空；预留费保留给已开的段。 */
export function transferLife(ledger, { lifeId, tick }) {
  at(ledger, tick);
  const tank = tankOf(ledger, lifeId);
  const refund = tank.ownerFuel;
  tank.ownerFuel = 0;
  tank.binding = null;
  ledger.totals.out += refund;
  return { refund, giftFuel: tank.giftFuel, reserved: tank.reserved };
}

export function tankView(ledger, lifeId) {
  const tank = tankOf(ledger, lifeId);
  return {
    lifeId,
    ownerFuel: tank.ownerFuel,
    giftFuel: tank.giftFuel,
    reserved: tank.reserved,
    available: tank.ownerFuel + tank.giftFuel,
    binding: tank.binding ? clone(tank.binding) : null,
    /** 罐还能发几段（按当前绑定报价；0 费视为无限 → 用 null 表示） */
    segmentsLeft:
      tank.binding && tank.binding.feePerSegment > 0
        ? Math.trunc(
            (tank.ownerFuel + tank.giftFuel) / tank.binding.feePerSegment,
          )
        : null,
  };
}

// ───────────────────────── Budget 预算 ─────────────────────────

/** 只认到账回执（TAX 切片、评测费）。D 账面、押金、用户本金一律不是预算。 */
export function fundBudget(ledger, { amount: n, source, receipt, tick }) {
  at(ledger, tick);
  amount(n, "amount");
  requireValue(
    ["TAX", "FEE"].includes(source),
    "BUDGET_SOURCE",
    "预算来源只能是 TAX / FEE",
  );
  requireValue(
    typeof receipt === "string" && receipt.length > 0,
    "BUDGET_RECEIPT",
    "预算入账必须带到账回执",
  );
  ledger.budget.assets += n;
  ledger.budget.receipts.push({
    tick: ledger.tick,
    amount: n,
    source,
    receipt,
  });
  ledger.totals.in += n;
  return budgetView(ledger);
}

export function budgetView(ledger) {
  const { assets, liabilities } = ledger.budget;
  return {
    assets,
    liabilities,
    free: assets - liabilities,
    receipts: ledger.budget.receipts.length,
  };
}

/** 挂公共任务：预留全额（K × 价 + 复核费 + 存储费）；F = A − L 不够就不开。 */
export function openTask(
  ledger,
  {
    taskId,
    price,
    replicas = P.publicReplicas,
    checkFee = 0,
    storageFee = 0,
    tick,
  },
) {
  at(ledger, tick);
  identifier(taskId, "taskId");
  requireValue(!ledger.tasks.has(taskId), "TASK_DUPLICATE", "任务已存在");
  integer(price, 1, P.maxFeePerSegment, "price");
  integer(replicas, 1, 100, "replicas");
  integer(checkFee, 0, Number.MAX_SAFE_INTEGER, "checkFee");
  integer(storageFee, 0, Number.MAX_SAFE_INTEGER, "storageFee");
  const reserved = price * replicas + checkFee + storageFee;
  requireValue(
    ledger.budget.assets - ledger.budget.liabilities >= reserved,
    "BUDGET_INSUFFICIENT",
    "预算可用额不足，不开任务（A ≥ L）",
  );
  ledger.budget.liabilities += reserved;
  const task = {
    taskId,
    price,
    replicas,
    checkFee,
    storageFee,
    reserved,
    spent: 0,
    segmentIds: [],
    status: "OPEN", // OPEN | ACCEPTED | DISPUTED | CLOSED
    deferred: [], // {operatorId, segmentId, amount, releaseAt, released}
    openedAt: ledger.tick,
  };
  ledger.tasks.set(taskId, task);
  return clone(task);
}

// ───────────────────────── Bond 押金 / 运营方 ─────────────────────────

export function registerOperator(
  ledger,
  { operatorId, roles = ["RUNNER"], bond, tick },
) {
  at(ledger, tick);
  identifier(operatorId, "operatorId");
  requireValue(
    !ledger.operators.has(operatorId),
    "OPERATOR_DUPLICATE",
    "一笔押金一个身份",
  );
  requireValue(
    Array.isArray(roles) &&
      roles.length >= 1 &&
      roles.every((r) => OPERATOR_ROLES.includes(r)),
    "OPERATOR_ROLES",
  );
  integer(bond, P.minBond, Number.MAX_SAFE_INTEGER, "bond");
  const op = {
    operatorId,
    roles: [...new Set(roles)],
    bond,
    exposure: 0,
    status: "ACTIVE",
    unlockAt: null,
    registeredAt: ledger.tick,
    record: { accepted: 0, replicated: 0, disputed: 0, lost: 0 },
  };
  ledger.operators.set(operatorId, op);
  ledger.totals.in += bond;
  return operatorView(ledger, operatorId);
}

export function topUpBond(ledger, { operatorId, amount: n, tick }) {
  at(ledger, tick);
  const op = operatorOf(ledger, operatorId);
  requireValue(op.status === "ACTIVE", "OPERATOR_STATUS", "退出中不能追加押金");
  amount(n, "amount");
  op.bond += n;
  ledger.totals.in += n;
  return operatorView(ledger, operatorId);
}

export function beginExit(ledger, { operatorId, tick }) {
  at(ledger, tick);
  const op = operatorOf(ledger, operatorId);
  requireValue(op.status === "ACTIVE", "OPERATOR_STATUS");
  op.status = "EXITING";
  op.unlockAt = ledger.tick + P.exitCooldownTicks;
  return operatorView(ledger, operatorId);
}

/** 退押金：冷却到期且曝险为零（所有段挑战窗已关）。 */
export function withdrawBond(ledger, { operatorId, tick }) {
  at(ledger, tick);
  const op = operatorOf(ledger, operatorId);
  requireValue(op.status === "EXITING", "OPERATOR_STATUS", "先 beginExit");
  requireValue(ledger.tick >= op.unlockAt, "BOND_COOLDOWN", "冷却未到");
  requireValue(op.exposure === 0, "BOND_EXPOSED", "仍有段在挑战窗内");
  const freed = op.bond;
  op.bond = 0;
  op.status = "EXITED";
  ledger.totals.out += freed;
  return freed;
}

export function withdrawEarnings(ledger, { operatorId, tick }) {
  at(ledger, tick);
  operatorOf(ledger, operatorId);
  const n = ledger.earnings.get(operatorId) || 0;
  ledger.earnings.set(operatorId, 0);
  ledger.totals.out += n;
  return n;
}

export function operatorView(ledger, operatorId) {
  const op = operatorOf(ledger, operatorId);
  return {
    ...clone(op),
    freeBond: op.bond - op.exposure,
    earnings: ledger.earnings.get(operatorId) || 0,
  };
}

// ───────────────────────── Seat 座位锁 ─────────────────────────

export function lockSeat(ledger, { ownerId, amount: n, tick }) {
  at(ledger, tick);
  identifier(ownerId, "ownerId");
  amount(n, "amount");
  const seat = ledger.seats.get(ownerId) || { amount: 0, unlockAt: null };
  seat.amount += n;
  seat.unlockAt = null;
  ledger.seats.set(ownerId, seat);
  ledger.totals.in += n;
  return clone(seat);
}
export function beginUnlockSeat(ledger, { ownerId, tick }) {
  at(ledger, tick);
  const seat = ledger.seats.get(ownerId);
  requireValue(seat && seat.amount > 0, "SEAT_EMPTY");
  seat.unlockAt = ledger.tick + P.seatCooldownTicks;
  return clone(seat);
}
export function unlockSeat(ledger, { ownerId, tick }) {
  at(ledger, tick);
  const seat = ledger.seats.get(ownerId);
  requireValue(
    seat && seat.unlockAt != null,
    "SEAT_NOT_UNLOCKING",
    "先 beginUnlockSeat",
  );
  requireValue(ledger.tick >= seat.unlockAt, "SEAT_COOLDOWN", "冷却未到");
  const freed = seat.amount;
  ledger.seats.delete(ownerId);
  ledger.totals.out += freed;
  return freed;
}
/** 折扣只是名额 / 价格优惠，硬顶；不发息、不进票权。 */
export function seatDiscountBps(ledger, ownerId) {
  const seat = ledger.seats.get(ownerId);
  if (!seat || seat.unlockAt != null) return 0;
  return Math.min(P.seatDiscountCapBps, Math.trunc(seat.amount / P.seatUnit));
}

// ───────────────────────── 段：开 → 承诺 → 抽检 → 结算 / 争议 ─────────────────────────

/**
 * 领段。私有轨用罐里的绑定报价预留费用；公共轨要求不同运营方、价格等于预登记价。
 * 两条轨都锁 bondMultiple × fee 的押金曝险。
 */
export function openSegment(
  ledger,
  { segmentId, track, lifeId, taskId, operatorId, steps, startRoot, tick },
) {
  at(ledger, tick);
  identifier(segmentId, "segmentId");
  requireValue(
    !ledger.segments.has(segmentId),
    "SEGMENT_DUPLICATE",
    "段已存在",
  );
  requireValue(TRACKS.includes(track), "SEGMENT_TRACK");
  integer(steps, 1, SEGMENT_POLICY.maxSteps, "steps");
  requireValue(
    /^0x[0-9a-f]{64}$/.test(startRoot || ""),
    "INVALID_HASH",
    "startRoot",
  );

  let fee;
  let op;
  let fuel = null;
  if (track === "PRIVATE") {
    const tank = tankOf(ledger, lifeId);
    requireValue(tank.binding, "SEGMENT_UNBOUND", "该生命未绑定 Runner");
    op = operatorOf(ledger, tank.binding.operatorId);
    requireValue(
      operatorId == null || operatorId === op.operatorId,
      "SEGMENT_OPERATOR",
      "只有绑定的 Runner 能领这只的段",
    );
    fee = tank.binding.feePerSegment;
    const available = tank.ownerFuel + tank.giftFuel;
    requireValue(
      available >= fee,
      "TANK_EMPTY",
      "罐空则段不开，生命休眠，不删",
    );
    requireValue(
      !ledger.leases.has(lifeId),
      "LEASE_HELD",
      "同一生命同一分支只允许一个当前执行租约",
    );
    const head = ledger.heads.get(lifeId);
    requireValue(
      !head || startRoot === head,
      "NEED_CONTINUITY",
      "下一段必须从上一段已验收终态继续",
    );
    const workKey = `${lifeId}:${startRoot}:${steps}`;
    requireValue(
      !ledger.claimed.has(workKey),
      "WORK_TAKEN",
      "同一工作不能换 ID 再付",
    );
    // 先烧主人的油，打赏留作这只的底：转移时 giftFuel 随生命走。
    // 记住拆分：任何退回都按原路退，主人拿不到打赏。
    const fromOwner = Math.min(tank.ownerFuel, fee);
    fuel = { fromOwner, fromGift: fee - fromOwner };
    tank.ownerFuel -= fuel.fromOwner;
    tank.giftFuel -= fuel.fromGift;
    tank.reserved += fee;
  } else {
    identifier(taskId, "taskId");
    const task = ledger.tasks.get(taskId);
    requireValue(
      task && task.status === "OPEN",
      "TASK_UNKNOWN",
      "任务不存在或已关闭",
    );
    op = operatorOf(ledger, operatorId);
    requireValue(
      task.segmentIds.length < task.replicas,
      "TASK_FULL",
      "副本已满",
    );
    requireValue(
      task.segmentIds.every(
        (id) => ledger.segments.get(id).operatorId !== operatorId,
      ),
      "TASK_REPLICA_EXCLUSIVE",
      "同一运营方不能跑同一任务的两个副本",
    );
    fee = task.price;
    task.segmentIds.push(segmentId);
  }
  requireValue(
    op.status === "ACTIVE" && op.roles.includes("RUNNER"),
    "OPERATOR_STATUS",
    "运营方不在册或退出中",
  );
  const exposure = fee * P.bondMultiple;
  requireValue(
    op.bond - op.exposure >= exposure,
    "BOND_INSUFFICIENT",
    "押金不足以覆盖本段曝险",
  );
  op.exposure += exposure;

  const seg = {
    schema: SEGMENT_RECORD_SCHEMA,
    audit: ledger.audit,
    id: segmentId,
    track,
    lifeId: track === "PRIVATE" ? lifeId : null,
    taskId: track === "PUBLIC" ? taskId : null,
    operatorId: op.operatorId,
    steps,
    fee,
    fuel,
    exposure,
    startRoot,
    status: "OPEN",
    openedAt: ledger.tick,
    commitment: null,
    committedAt: null,
    challengeUntil: null,
    probe: null,
    dispute: null,
    paid: { now: 0, deferred: 0 },
    workKey: track === "PRIVATE" ? `${lifeId}:${startRoot}:${steps}` : null,
  };
  if (track === "PRIVATE") {
    ledger.claimed.add(seg.workKey);
    ledger.leases.set(lifeId, segmentId);
  }
  ledger.segments.set(segmentId, seg);
  return clone(seg);
}

/** 登记承诺：形状合法、起点一致、步数一致。开启挑战窗。 */
export function commitSegment(ledger, { segmentId, commitment, tick }) {
  at(ledger, tick);
  const seg = segmentOf(ledger, segmentId);
  requireValue(seg.status === "OPEN", "SEGMENT_STATUS", "只有 OPEN 段可承诺");
  validateCommitment(commitment);
  requireValue(commitment.audit === ledger.audit, "COMMITMENT_AUDIT");
  requireValue(
    commitment.startRoot === seg.startRoot,
    "COMMITMENT_START",
    "承诺起点与段起点不符",
  );
  requireValue(
    commitment.steps === seg.steps,
    "COMMITMENT_STEPS",
    "承诺步数与段不符",
  );
  seg.commitment = clone(commitment);
  seg.status = "COMMITTED";
  seg.committedAt = ledger.tick;
  seg.challengeUntil = ledger.tick + P.challengeWindowTicks;
  return clone(seg);
}

/** 记抽检结果。不匹配 → CHALLENGED（不罚，等二分）。 */
export function recordProbe(
  ledger,
  { segmentId, seed, positions, results, tick },
) {
  at(ledger, tick);
  const seg = segmentOf(ledger, segmentId);
  requireValue(
    ["COMMITTED", "CHALLENGED"].includes(seg.status),
    "SEGMENT_STATUS",
  );
  requireValue(/^0x[0-9a-f]{64}$/.test(seed || ""), "INVALID_HASH", "seed");
  requireValue(
    Array.isArray(positions) &&
      Array.isArray(results) &&
      positions.length === results.length &&
      positions.length >= 1,
    "PROBE_SHAPE",
  );
  const ok = results.every((r) => r && r.ok === true);
  seg.probe = {
    seed,
    positions: positions.slice(),
    ok,
    reasons: results.map((r) => r.reason ?? null),
    at: ledger.tick,
  };
  if (!ok) seg.status = "CHALLENGED";
  return clone(seg.probe);
}

/** 私有轨结算：抽检通过后记账，挑战窗结束后才付工价并释放曝险。 */
export function settlePrivate(ledger, { segmentId, tick }) {
  at(ledger, tick);
  const seg = segmentOf(ledger, segmentId);
  requireValue(seg.track === "PRIVATE", "SEGMENT_TRACK");
  requireValue(
    seg.status === "COMMITTED",
    "SEGMENT_STATUS",
    "只有 COMMITTED 段可结算",
  );
  requireValue(
    (seg.probe && seg.probe.ok) || (seg.dispute && seg.dispute.verdict === "A"),
    "SEGMENT_UNPROBED",
    "验收前必须抽检通过（或争议胜诉）",
  );
  requireValue(
    ledger.tick > seg.challengeUntil,
    "CHALLENGE_OPEN",
    "挑战窗结束后才可记账提现",
  );
  const tank = tankOf(ledger, seg.lifeId);
  tank.reserved -= seg.fee;
  addEarnings(ledger, seg.operatorId, seg.fee);
  seg.paid.now = seg.fee;
  seg.status = "SETTLED";
  const op = operatorOf(ledger, seg.operatorId);
  op.record.accepted += 1;
  if (seg.exposure > 0) {
    op.exposure -= seg.exposure;
    seg.exposure = 0;
  }
  endLease(ledger, seg, true);
  ledger.heads.set(seg.lifeId, seg.commitment.finalRoot);
  return receipt(ledger, seg);
}

/** 预算对任务的净流出：即付 + 已放尾款 − 追回。closeTask 用 reserved − spent 退回。 */
const spend = (ledger, task, n) => {
  ledger.budget.assets -= n;
  ledger.budget.liabilities -= n;
  task.spent += n;
};

/**
 * 公共轨验收。OPEN：K 个副本全部 COMMITTED 且根一致 → 每个 70% 即付、30% 延迟；否则 DISPUTED。
 * DISPUTED：争议处理后重新验收，只看未判负 / 未作废的副本，须 ≥ minAgreeingReplicas 且根一致。
 */
export function acceptTask(ledger, { taskId, tick }) {
  at(ledger, tick);
  const task = ledger.tasks.get(taskId);
  requireValue(
    task && ["OPEN", "DISPUTED"].includes(task.status),
    "TASK_UNKNOWN",
  );
  const live = task.segmentIds
    .map((id) => segmentOf(ledger, id))
    .filter((s) => !["SLASHED", "VOID"].includes(s.status));
  if (task.status === "OPEN") {
    requireValue(
      task.segmentIds.length === task.replicas,
      "TASK_INCOMPLETE",
      "副本未满，不验收",
    );
    requireValue(
      live.every((s) => s.status === "COMMITTED"),
      "TASK_UNCOMMITTED",
      "有副本未承诺",
    );
  } else {
    requireValue(
      live.length >= P.minAgreeingReplicas,
      "TASK_TOO_FEW",
      "争议后一致副本不足，不付",
    );
  }
  const roots = new Set(live.map((s) => s.commitment.root));
  if (roots.size !== 1) {
    task.status = "DISPUTED";
    for (const s of live) s.status = "CHALLENGED";
    return { taskId, accepted: false, roots: [...roots] };
  }
  const receipts = [];
  for (const s of live) {
    const now = Math.trunc((s.fee * P.payNowBps) / 10000);
    const later = s.fee - now;
    spend(ledger, task, now);
    addEarnings(ledger, s.operatorId, now);
    task.deferred.push({
      operatorId: s.operatorId,
      segmentId: s.id,
      amount: later,
      releaseAt: ledger.tick + P.deferTicks,
      released: false,
    });
    s.paid.now = now;
    s.paid.deferred = later;
    s.status = "SETTLED";
    const op = operatorOf(ledger, s.operatorId);
    op.record.accepted += 1;
    op.record.replicated += 1;
    receipts.push(receipt(ledger, s));
  }
  // 复核费 / 存储费预留仍在 liabilities 里，直到 closeTask 释放
  task.status = "ACCEPTED";
  return { taskId, accepted: true, root: [...roots][0], receipts };
}

/** 释放到期的延迟 30%。被判负的段不释放尾款（closeTask 退回预算）。 */
export function releaseDeferred(ledger, { taskId, tick }) {
  at(ledger, tick);
  const task = ledger.tasks.get(taskId);
  requireValue(task, "TASK_UNKNOWN");
  let released = 0;
  for (const d of task.deferred) {
    if (d.released || ledger.tick < d.releaseAt) continue;
    if (segmentOf(ledger, d.segmentId).status !== "SETTLED") continue;
    spend(ledger, task, d.amount);
    addEarnings(ledger, d.operatorId, d.amount);
    d.released = true;
    released += d.amount;
  }
  return released;
}

/** 关任务：所有副本到终态、尾款放完 → 未用的预留（复核费、存储费、判负副本的钱）退回 F。 */
export function closeTask(ledger, { taskId, tick }) {
  at(ledger, tick);
  const task = ledger.tasks.get(taskId);
  requireValue(task && task.status !== "CLOSED", "TASK_UNKNOWN");
  const segs = task.segmentIds.map((id) => segmentOf(ledger, id));
  requireValue(
    segs.every((s) => ["SETTLED", "SLASHED", "VOID"].includes(s.status)),
    "TASK_LIVE_SEGMENTS",
    "仍有副本未到终态",
  );
  requireValue(
    task.deferred.every(
      (d) => d.released || segmentOf(ledger, d.segmentId).status !== "SETTLED",
    ),
    "TASK_DEFERRED_PENDING",
    "尾款未释放完不能关",
  );
  const refund = task.reserved - task.spent;
  requireValue(refund >= 0, "TASK_OVERSPENT", "任务支出超过预留");
  ledger.budget.liabilities -= refund;
  task.status = "CLOSED";
  return refund;
}

/**
 * 争议判定入账。adjudication 来自 segment.mjs adjudicate()：
 *   verdict "A" = 段的运营方赢；"B" = 挑战者赢；"NEITHER" = 双输。
 * 罚没数额 = 段的押金曝险（bondMultiple × fee）；挑战者输罚 challengeBond。
 */
export function resolveDispute(
  ledger,
  { segmentId, challengerId, adjudication, tick },
) {
  at(ledger, tick);
  const seg = segmentOf(ledger, segmentId);
  requireValue(
    ["COMMITTED", "CHALLENGED", "SETTLED"].includes(seg.status),
    "SEGMENT_STATUS",
  );
  requireValue(
    seg.challengeUntil != null && ledger.tick <= seg.challengeUntil,
    "CHALLENGE_CLOSED",
    "挑战窗已关",
  );
  requireValue(
    adjudication && adjudication.schema === "iff.adjudication/1",
    "SCHEMA_MISMATCH",
  );
  requireValue(
    ["A", "B", "NEITHER"].includes(adjudication.verdict),
    "ADJUDICATION_VERDICT",
  );
  const challenger = operatorOf(ledger, challengerId);
  requireValue(
    challenger.operatorId !== seg.operatorId,
    "DISPUTE_SELF",
    "不能挑战自己",
  );
  requireValue(
    challenger.bond - challenger.exposure >= P.challengeBond,
    "CHALLENGE_BOND",
    "挑战者押金不足",
  );
  const runner = operatorOf(ledger, seg.operatorId);
  const outcome = {
    segmentId,
    challengerId,
    verdict: adjudication.verdict,
    position: adjudication.position,
    runnerSlashed: 0,
    challengerSlashed: 0,
    refunded: 0,
  };

  const runnerLoses = adjudication.verdict !== "A";
  const challengerLoses = adjudication.verdict !== "B";

  if (runnerLoses) {
    const slash = Math.min(seg.exposure, runner.bond);
    runner.bond -= slash;
    runner.exposure -= seg.exposure;
    ledger.totals.slashed += slash;
    ledger.totals.out += slash;
    runner.record.lost += 1;
    outcome.runnerSlashed = slash;
    // 已付工价只能追回尚未提取的部分（SIM 不追链下资产）；未付的预留费退回买方
    if (seg.status === "SETTLED") {
      const held = ledger.earnings.get(seg.operatorId) || 0;
      const clawback = Math.min(held, seg.paid.now);
      ledger.earnings.set(seg.operatorId, held - clawback);
      if (seg.track === "PRIVATE") {
        tankOf(ledger, seg.lifeId).giftFuel += clawback; // 追回进这只的底，不进主人口袋
      } else {
        const task = ledger.tasks.get(seg.taskId);
        ledger.budget.assets += clawback;
        ledger.budget.liabilities += clawback;
        task.spent -= clawback;
      }
      outcome.refunded = clawback;
    } else if (seg.track === "PRIVATE") {
      outcome.refunded = refundReserved(ledger, seg);
    }
    seg.status = "SLASHED";
    endLease(ledger, seg, false);
  } else if (seg.status === "CHALLENGED") {
    seg.status = "COMMITTED"; // 运营方胜诉：抽检不匹配被机械判定推翻，可继续结算
  }
  if (challengerLoses) {
    const slash = Math.min(P.challengeBond, challenger.bond);
    challenger.bond -= slash;
    ledger.totals.slashed += slash;
    ledger.totals.out += slash;
    challenger.record.lost += 1;
    outcome.challengerSlashed = slash;
  }
  runner.record.disputed += 1;
  seg.dispute = {
    ...outcome,
    at: ledger.tick,
    preStateRoot: adjudication.preStateRoot,
    expectedLeaf: adjudication.expectedLeaf,
  };
  return clone(seg.dispute);
}

/** 挑战窗关闭：释放押金曝险。SETTLED / SLASHED / VOID 之外的段过窗视为放弃 → VOID 并退预留。 */
export function closeChallenge(ledger, { segmentId, tick }) {
  at(ledger, tick);
  const seg = segmentOf(ledger, segmentId);
  requireValue(
    seg.status !== "OPEN",
    "SEGMENT_STATUS",
    "未承诺的段用 voidSegment",
  );
  requireValue(
    ledger.tick > seg.challengeUntil,
    "CHALLENGE_OPEN",
    "挑战窗未关",
  );
  if (seg.exposure > 0 && seg.status !== "SLASHED") {
    const op = operatorOf(ledger, seg.operatorId);
    op.exposure -= seg.exposure;
  }
  if (seg.status === "COMMITTED" || seg.status === "CHALLENGED") {
    // 过窗没结算：私有轨按原路退预留；公共轨副本作废
    if (seg.track === "PRIVATE") refundReserved(ledger, seg);
    endLease(ledger, seg, false);
    seg.status = "VOID";
  }
  seg.exposure = 0;
  return clone(seg);
}

/** 未承诺的段放弃：退预留、释放曝险、不罚。 */
export function voidSegment(ledger, { segmentId, tick }) {
  at(ledger, tick);
  const seg = segmentOf(ledger, segmentId);
  requireValue(seg.status === "OPEN", "SEGMENT_STATUS", "只有 OPEN 段可放弃");
  const op = operatorOf(ledger, seg.operatorId);
  op.exposure -= seg.exposure;
  seg.exposure = 0;
  if (seg.track === "PRIVATE") {
    refundReserved(ledger, seg);
  } else {
    const task = ledger.tasks.get(seg.taskId);
    task.segmentIds = task.segmentIds.filter((id) => id !== segmentId);
  }
  endLease(ledger, seg, false);
  seg.status = "VOID";
  return clone(seg);
}

function receipt(ledger, seg) {
  const r = {
    schema: RECEIPT_SCHEMA,
    audit: ledger.audit,
    segmentId: seg.id,
    track: seg.track,
    lifeId: seg.lifeId,
    taskId: seg.taskId,
    operatorId: seg.operatorId,
    steps: seg.steps,
    root: seg.commitment.root,
    finalRoot: seg.commitment.finalRoot,
    wage: seg.fee,
    paidNow: seg.paid.now,
    deferred: seg.paid.deferred,
    settledAt: ledger.tick,
  };
  ledger.receipts.push(r);
  return clone(r);
}

// ───────────────────────── 不变量 / 视图 / 快照 ─────────────────────────

/** 每次操作后都应成立。返回 {ok, checks}，测试里直接 assert。 */
export function invariants(ledger) {
  let tanks = 0;
  for (const t of ledger.tanks.values()) {
    requireValue(
      t.ownerFuel >= 0 && t.giftFuel >= 0 && t.reserved >= 0,
      "TANK_NEGATIVE",
    );
    tanks += t.ownerFuel + t.giftFuel + t.reserved;
  }
  let bonds = 0;
  for (const op of ledger.operators.values()) {
    requireValue(op.bond >= 0 && op.exposure >= 0, "BOND_NEGATIVE");
    bonds += op.bond;
  }
  let seats = 0;
  for (const s of ledger.seats.values()) seats += s.amount;
  let earnings = 0;
  for (const e of ledger.earnings.values()) earnings += e;
  const { assets, liabilities } = ledger.budget;
  const held = tanks + bonds + seats + assets + earnings;
  const checks = {
    conservation: ledger.totals.in === held + ledger.totals.out,
    budgetSolvent: assets >= liabilities && liabilities >= 0,
    slashedOnlyByAdjudication: [...ledger.segments.values()].every(
      (s) => s.status !== "SLASHED" || (s.dispute && s.dispute.verdict !== "A"),
    ),
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    held,
    totals: { ...ledger.totals },
  };
}

export function segmentLedgerView(ledger) {
  return {
    schema: ledger.schema,
    policy: ledger.policy,
    audit: ledger.audit,
    tick: ledger.tick,
    tanks: [...ledger.tanks.keys()].map((id) => tankView(ledger, id)),
    budget: budgetView(ledger),
    operators: [...ledger.operators.keys()].map((id) =>
      operatorView(ledger, id),
    ),
    seats: [...ledger.seats.entries()].map(([ownerId, s]) => ({
      ownerId,
      ...s,
      discountBps: seatDiscountBps(ledger, ownerId),
    })),
    tasks: [...ledger.tasks.values()].map(clone),
    segments: [...ledger.segments.values()].map(clone),
    receipts: clone(ledger.receipts),
    totals: { ...ledger.totals },
    invariants: invariants(ledger),
  };
}

export function saveSegmentLedger(ledger) {
  return {
    schema: ledger.schema,
    policy: ledger.policy,
    audit: ledger.audit,
    tick: ledger.tick,
    tanks: [...ledger.tanks.entries()],
    budget: clone(ledger.budget),
    operators: [...ledger.operators.entries()],
    seats: [...ledger.seats.entries()],
    tasks: [...ledger.tasks.entries()],
    segments: [...ledger.segments.entries()],
    earnings: [...ledger.earnings.entries()],
    receipts: clone(ledger.receipts),
    totals: { ...ledger.totals },
    leases: [...ledger.leases.entries()],
    claimed: [...ledger.claimed],
    heads: [...ledger.heads.entries()],
  };
}

export function restoreSegmentLedger(saved) {
  requireValue(saved && saved.schema === LEDGER_SCHEMA, "SCHEMA_MISMATCH");
  const ledger = createSegmentLedger({ audit: saved.audit });
  requireValue(
    saved.policy === ledger.policy,
    "POLICY_MISMATCH",
    "账本策略版本不符，需迁移事件",
  );
  ledger.tick = saved.tick;
  ledger.tanks = new Map(clone(saved.tanks));
  ledger.budget = clone(saved.budget);
  ledger.operators = new Map(clone(saved.operators));
  ledger.seats = new Map(clone(saved.seats));
  ledger.tasks = new Map(clone(saved.tasks));
  ledger.segments = new Map(clone(saved.segments));
  ledger.earnings = new Map(clone(saved.earnings));
  ledger.receipts = clone(saved.receipts);
  ledger.totals = { ...saved.totals };
  ledger.leases = new Map(clone(saved.leases || []));
  ledger.claimed = new Set(saved.claimed || []);
  ledger.heads = new Map(clone(saved.heads || []));
  return ledger;
}

// ───────────────────────── M0 候选 schema（冻结前不进 schemas.mjs） ─────────────────────────

const AUDITS = ["SIM", "TESTNET", "MAINNET"];
const meta = (r, id) => {
  requireValue(r && r.schema === id, "SCHEMA_MISMATCH", `记录不是 ${id}`);
  requireValue(AUDITS.includes(r.audit), "INVALID_AUDIT");
  return r;
};
const isHash = (v, name) =>
  requireValue(
    /^0x[0-9a-f]{64}$/.test(v || ""),
    "INVALID_HASH",
    `${name} 必须是 0x 开头 64 位十六进制`,
  );

/** iff.segment/1：段记录。 */
const segmentSchema = {
  id: "iff.segment",
  version: "1",
  title: "段",
  validate(r) {
    meta(r, SEGMENT_RECORD_SCHEMA);
    identifier(r.id, "id");
    requireValue(TRACKS.includes(r.track), "SEGMENT_TRACK");
    identifier(r.operatorId, "operatorId");
    integer(r.steps, 1, SEGMENT_POLICY.maxSteps, "steps");
    integer(r.fee, 0, Number.MAX_SAFE_INTEGER, "fee");
    if (r.track === "PRIVATE") {
      identifier(r.lifeId, "lifeId");
      requireValue(r.fuel && typeof r.fuel === "object", "SEGMENT_FUEL");
      integer(r.fuel.fromOwner, 0, r.fee, "fuel.fromOwner");
      integer(r.fuel.fromGift, 0, r.fee, "fuel.fromGift");
      requireValue(
        r.fuel.fromOwner + r.fuel.fromGift === r.fee,
        "SEGMENT_FUEL_SUM",
        "预留拆分必须等于工价",
      );
    }
    if (r.track === "PUBLIC") {
      identifier(r.taskId, "taskId");
      requireValue(r.fuel === null, "SEGMENT_FUEL", "公共轨不烧罐");
    }
    integer(r.exposure, 0, Number.MAX_SAFE_INTEGER, "exposure");
    isHash(r.startRoot, "startRoot");
    requireValue(SEGMENT_STATUSES.includes(r.status), "SEGMENT_STATUS");
    integer(r.openedAt, 0, Number.MAX_SAFE_INTEGER, "openedAt");
    if (r.status !== "OPEN" && r.status !== "VOID") {
      requireValue(
        r.commitment,
        "SEGMENT_COMMITMENT",
        "承诺后的段必须携带承诺",
      );
      validateCommitment(r.commitment);
    }
    return r;
  },
};

/** iff.segment-receipt/1：验收回执。 */
const receiptSchema = {
  id: "iff.segment-receipt",
  version: "1",
  title: "段回执",
  validate(r) {
    meta(r, RECEIPT_SCHEMA);
    identifier(r.segmentId, "segmentId");
    requireValue(TRACKS.includes(r.track), "SEGMENT_TRACK");
    identifier(r.operatorId, "operatorId");
    integer(r.steps, 1, SEGMENT_POLICY.maxSteps, "steps");
    isHash(r.root, "root");
    isHash(r.finalRoot, "finalRoot");
    integer(r.wage, 0, Number.MAX_SAFE_INTEGER, "wage");
    integer(r.paidNow, 0, r.wage, "paidNow");
    integer(r.deferred, 0, r.wage - r.paidNow, "deferred");
    requireValue(
      r.paidNow + r.deferred === r.wage,
      "RECEIPT_SUM",
      "即付 + 延迟 = 工价",
    );
    integer(r.settledAt, 0, Number.MAX_SAFE_INTEGER, "settledAt");
    return r;
  },
};

export const LEDGER_SCHEMAS = Object.freeze([segmentSchema, receiptSchema]);
