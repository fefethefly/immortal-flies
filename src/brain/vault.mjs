import { requireValue, integer } from './codec.mjs';

const FORBIDDEN_FIELDS = Object.freeze([
  'to', 'data', 'value', 'delegatecall', 'target', 'calldata',
  'signer', 'privateKey', 'tx', 'transaction', 'sendTransaction',
]);

/** Preview vault: records a commitment once. It cannot sign or send a transaction. */
export function inspectIntent(intent) {
  requireValue(intent?.schema === 'iff.intent/1', 'INTENT_SCHEMA');
  requireValue(intent.mode === 'simulation', 'EXECUTION_DISABLED', '资金接口只有模拟模式');
  requireValue(intent.chainId === 97, 'EXECUTION_DISABLED', '第一版仅允许测试网预览');
  requireValue(!FORBIDDEN_FIELDS.some((key) => Object.hasOwn(intent, key)), 'INTENT_SURFACE', '资金意图不能携带交易字段');
  requireValue(/^0x[0-9a-f]{64}$/.test(intent.commitment || ''), 'INTENT_HASH');
  requireValue(['FUND_COMPUTE', 'NO_ACTION'].includes(intent.action), 'INTENT_ACTION');
  requireValue(typeof intent.amountWei === 'string' && /^\d{1,60}$/.test(intent.amountWei), 'BUDGET_VALUE');
  return intent;
}

export function createVaultPreview({ now = () => Date.now(), consumed = new Set() } = {}) {
  return Object.freeze({
    consume(intent, clock = now()) {
      inspectIntent(intent);
      integer(intent.expiresAt, 1, Number.MAX_SAFE_INTEGER, 'expiresAt');
      integer(intent.nonce, 0, Number.MAX_SAFE_INTEGER, 'nonce');
      requireValue(clock <= intent.expiresAt, 'INTENT_EXPIRED', '动作凭证已过期');
      requireValue(!consumed.has(intent.commitment), 'INTENT_REPLAY', '同一动作凭证只能消费一次');
      if (intent.action === 'NO_ACTION' || intent.amountWei === '0') {
        return { status: 'skipped', reason: intent.reason || '无动作', spent: false };
      }
      consumed.add(intent.commitment);
      return { status: 'preview-recorded', commitment: intent.commitment, amountWei: intent.amountWei, spent: true };
    },
    get size() { return consumed.size; },
  });
}
