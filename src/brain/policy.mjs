import { requireValue, integer, hash } from './codec.mjs';
import { decodeTrade } from './finance.mjs';

/** This adapter has no signer or transaction method. Simulation cannot silently become execution. */
export async function proposeAction(state, { checkpointHash, chainId=97, budgetWei='0', spentWei='0', perActionWei='0', nonce=0, now=Date.now() }) {
  requireValue(/^0x[0-9a-f]{64}$/.test(checkpointHash),'CHECKPOINT_HASH');
  integer(nonce,0,Number.MAX_SAFE_INTEGER,'nonce');
  requireValue(chainId===97,'EXECUTION_DISABLED','第一版仅生成测试网动作预览');
  for(const v of [budgetWei,spentWei,perActionWei]) requireValue(typeof v==='string'&&/^\d{1,60}$/.test(v),'BUDGET_VALUE');
  const remaining=BigInt(budgetWei)-BigInt(spentWei), requested=BigInt(perActionWei);
  const eligible=state.lastAction!=='REST'&&state.lastObservedAt>0&&now-state.lastObservedAt<=60000&&now>=state.lastObservedAt&&remaining>=requested&&requested>0n;
  const intent={schema:'iff.intent/1',mode:'simulation',chainId,soulId:state.soulId,branchId:state.branchId,
    checkpointHash,policy:'operating-budget/1',nonce,expiresAt:now+60000,
    action:eligible?'FUND_COMPUTE':'NO_ACTION',amountWei:eligible?requested.toString():'0'};
  return {...intent,commitment:await hash(intent),reason:eligible?'预算内的算力支付预览':'休眠、输入过期或预算不足'};
}

/** Motor reflex preview. Approach / retreat becomes buy / sell. No signer, no broadcast. */
export async function proposeTrade(state, { checkpointHash, chainId=97, nonce=0, now=Date.now() }) {
  requireValue(/^0x[0-9a-f]{64}$/.test(checkpointHash),'CHECKPOINT_HASH');
  integer(nonce,0,Number.MAX_SAFE_INTEGER,'nonce');
  requireValue(chainId===97,'EXECUTION_DISABLED','第一版仅生成测试网交易预览');
  const side=decodeTrade(state.lastAction);
  const fresh=state.lastObservedAt>0&&now-state.lastObservedAt<=60000&&now>=state.lastObservedAt;
  const eligible=fresh&&side!=='HOLD';
  const intent={schema:'iff.trade/1',mode:'simulation',chainId,soulId:state.soulId,branchId:state.branchId,
    checkpointHash,policy:'motor-trade/1',nonce,expiresAt:now+60000,
    action:eligible?`TRADE_${side}`:'NO_ACTION',side:eligible?side:'HOLD',amountWei:'0'};
  return {...intent,commitment:await hash(intent),reason:eligible?'运动反射被读成交易方向，尚未发送':'持仓不动或输入过期'};
}
