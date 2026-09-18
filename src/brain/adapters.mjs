import { requireValue, integer, identifier, clone } from './codec.mjs';

/** Explicit plugin contract: {id, version, normalize(payload): SensorSignal}. */
export function createAdapters(additional = []) {
  const registry = new Map();
  for (const adapter of [...BUILTIN_ADAPTERS, ...additional]) {
    identifier(adapter.id); identifier(adapter.version);
    requireValue(typeof adapter.normalize === 'function', 'INVALID_ADAPTER');
    const key = `${adapter.id}@${adapter.version}`;
    requireValue(!registry.has(key), 'DUPLICATE_ADAPTER');
    registry.set(key, adapter);
  }
  return registry;
}
function signal(food, threat, light) { return { food, threat, light }; }
export const BUILTIN_ADAPTERS = [
  { id: 'environment', version: '1', title: '培养皿', normalize(p) {
    return signal(integer(p.food, 0, 1000, '食物'), integer(p.threat, 0, 1000, '威胁'), integer(p.light, 0, 1000, '光照'));
  } },
  { id: 'market', version: '1', title: '链上市场', normalize(p) {
    integer(p.changeBps, -10000, 10000, '变化基点');
    integer(p.activity, 0, 1000, '活动强度');
    // Product encoding, not a claim of biological market comprehension.
    return signal(Math.max(0, Math.trunc(p.changeBps / 10)), Math.min(1000, Math.abs(Math.trunc(p.changeBps / 10))), p.activity);
  } },
  { id: 'interoception', version: '1', title: '仓位内感受', normalize(p) {
    const inv = integer(p.inventoryShare, 0, 100, '仓位');
    return signal(inv <= 15 ? 200 : 0, inv >= 60 ? 200 : 0, 0);
  } },
];

export function validateInput(frame, state, registry, now) {
  requireValue(frame && frame.schema === 'iff.input/1', 'INPUT_SCHEMA');
  requireValue(frame.soulId === state.soulId && frame.branchId === state.branchId, 'INPUT_IDENTITY');
  identifier(frame.sourceId); identifier(frame.adapter); identifier(frame.adapterVersion);
  requireValue(state.enabledSources.includes(frame.sourceId), 'SOURCE_DISABLED', '此来源尚未启用');
  integer(frame.sequence, 1, Number.MAX_SAFE_INTEGER, '输入序号');
  requireValue(frame.sequence === (state.cursors[frame.sourceId] || 0) + 1, 'INPUT_SEQUENCE', '拒绝重复或跳号输入');
  integer(frame.observedAt, 0, Number.MAX_SAFE_INTEGER, '观察时间');
  integer(frame.expiresAt, frame.observedAt + 1, Number.MAX_SAFE_INTEGER, '过期时间');
  requireValue(frame.observedAt <= now && frame.expiresAt >= now, 'INPUT_EXPIRED', '输入已过期或来自未来');
  requireValue(frame.observedAt >= state.lastObservedAt, 'INPUT_ORDER', '输入时间早于上一批次');
  const adapter = registry.get(`${frame.adapter}@${frame.adapterVersion}`);
  requireValue(adapter, 'UNKNOWN_ADAPTER', '未知输入适配器版本');
  requireValue(frame.payload && typeof frame.payload === 'object', 'INPUT_PAYLOAD');
  requireValue(
    ['simulation', 'chain-observation', 'aggregator-quote'].includes(frame.provenance?.kind),
    'INPUT_PROVENANCE',
  );
  if (frame.provenance.kind === 'chain-observation') {
    requireValue(frame.adapter === 'market', 'INPUT_PROVENANCE');
    const { chainId, blockNumber, blockHash, previousBlockNumber, previousBlockHash, pair } = frame.provenance;
    requireValue(chainId === 56, 'WRONG_CHAIN');
    integer(blockNumber, 1, Number.MAX_SAFE_INTEGER, '区块');
    integer(previousBlockNumber, 0, blockNumber - 1, '前一区块');
    requireValue(/^0x[0-9a-f]{64}$/i.test(blockHash) && /^0x[0-9a-f]{64}$/i.test(previousBlockHash), 'BLOCK_HASH');
    requireValue(/^0x[0-9a-f]{40}$/i.test(pair), 'PAIR_ADDRESS');
  }
  if (frame.provenance.kind === 'aggregator-quote') {
    requireValue(frame.adapter === 'market', 'INPUT_PROVENANCE');
    const { chainId, adapter, src, dst, quotedAt } = frame.provenance;
    requireValue(chainId === 56, 'WRONG_CHAIN');
    requireValue(adapter === 'kyberswap', 'MARKET_ADAPTER');
    requireValue(/^0x[0-9a-f]{40}$/i.test(src || ''), 'SRC_ADDRESS');
    requireValue(/^0x[0-9a-f]{40}$/i.test(dst || ''), 'DST_ADDRESS');
    integer(quotedAt, 1, Number.MAX_SAFE_INTEGER, 'quotedAt');
    requireValue(
      frame.provenance.calldata == null &&
        frame.provenance.to == null &&
        frame.provenance.value == null &&
        frame.provenance.data == null,
      'MARKET_FORBIDDEN',
      '只读行情不得携带签名或 calldata',
    );
  }
  const value = adapter.normalize(clone(frame.payload));
  for (const k of ['food', 'threat', 'light']) integer(value[k], 0, 1000, k);
  return value;
}

export function makeInput(state, adapter, payload, { now = Date.now(), provenance = {kind:'simulation'}, sourceId = adapter } = {}) {
  return { schema:'iff.input/1', soulId:state.soulId, branchId:state.branchId, sourceId,
    adapter, adapterVersion:'1', sequence:(state.cursors[sourceId] || 0) + 1,
    observedAt:now, expiresAt:now + 60000, payload:clone(payload), provenance:clone(provenance) };
}

