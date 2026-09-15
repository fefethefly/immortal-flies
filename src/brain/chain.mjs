import { Interface, getAddress } from 'ethers';
import { requireValue } from './codec.mjs';

const pairABI = new Interface(['function getReserves() view returns (uint112,uint112,uint32)']);
const hex = n => `0x${n.toString(16)}`;
/** Read-only RPC seam; accepts an EIP-1193 provider or a test implementation. */
export async function captureMarket(provider, address) {
  const pair=getAddress(address);
  requireValue(BigInt(await provider.request({method:'eth_chainId',params:[]}))===56n,'WRONG_CHAIN','请切换到 BNB Smart Chain');
  const head=Number(BigInt(await provider.request({method:'eth_blockNumber',params:[]})));
  requireValue(head>50,'BLOCK_RANGE');
  const current=head-15, previous=current-30;
  const block=n=>provider.request({method:'eth_getBlockByNumber',params:[hex(n),false]});
  const reserve=n=>provider.request({method:'eth_call',params:[{to:pair,data:pairABI.encodeFunctionData('getReserves')},hex(n)]});
  const [a,b,rawA,rawB]=await Promise.all([block(previous),block(current),reserve(previous),reserve(current)]);
  requireValue(a?.hash && b?.hash,'BLOCK_UNAVAILABLE');
  const again=await block(current);
  const previousAgain=await block(previous);
  requireValue(b.hash===again?.hash && a.hash===previousAgain?.hash,'CHAIN_REORG','区块发生变化，请重新采样');
  const [x0,y0]=pairABI.decodeFunctionResult('getReserves',rawA), [x1,y1]=pairABI.decodeFunctionResult('getReserves',rawB);
  requireValue(x0>0n&&y0>0n&&x1>0n&&y1>0n,'EMPTY_PAIR');
  const bps=(y1*x0*10000n)/(x1*y0)-10000n;
  const changeBps=Number(bps>10000n?10000n:bps < -10000n?-10000n:bps);
  const delta=x1>x0?x1-x0:x0-x1;
  const activity=Number(delta*1000n/x0>1000n?1000n:delta*1000n/x0);
  return {payload:{changeBps,activity},provenance:{kind:'chain-observation',chainId:56,pair,
    blockNumber:current,blockHash:b.hash,previousBlockNumber:previous,previousBlockHash:a.hash,
    confirmationDepth:15,rawReserves:[rawA,rawB],blockTimestamps:[a.timestamp,b.timestamp],
    interpretation:'token1/token0 reserve ratio; activity is relative reserve0 change, not volume; provider-observed, not oracle-verified'}};
}

