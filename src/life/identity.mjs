/** EVM identity adapter. No wallet/RPC dependencies enter the Life Core. */
import { AbiCoder, getAddress, keccak256, toUtf8Bytes } from 'ethers';
const abi = AbiCoder.defaultAbiCoder();
export const LIFE_DOMAIN = keccak256(toUtf8Bytes('ifs.life/1'));
export const BIRTH_DOMAIN = keccak256(toUtf8Bytes('ifs.fly-birth/1'));
export const DECODER_HASH = keccak256(toUtf8Bytes('phenotype-loci/2'));
export function lifeId(chainId, collection, tokenId) {
  if (BigInt(chainId) <= 0n || BigInt(tokenId) <= 0n) throw new Error('Invalid birth identity');
  return keccak256(abi.encode(['bytes32','uint256','address','uint256'], [LIFE_DOMAIN, chainId, getAddress(collection), tokenId]));
}
export function birthHash({life, genesisRoot, seed}) {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff) throw new Error('Invalid birth seed');
  return keccak256(abi.encode(['bytes32','bytes32','bytes32','bytes32','uint32'], [BIRTH_DOMAIN, life, genesisRoot, DECODER_HASH, seed]));
}
export function soulGenome({life, genesisRoot, seed, audit, chainId, parentSouls, generation, inheritBias} = {}) {
  const resolved = audit ?? (Number(chainId) === 56 ? 'MAINNET' : 'SIM');
  const gen = Number(generation) || 0;
  const parents = Array.isArray(parentSouls) ? parentSouls.filter(Boolean) : [];
  return {
    schema: 'iff.genome/1',
    audit: resolved,
    soulId: life,
    seed,
    genesisId: genesisRoot,
    parentSouls: parents,
    mutateRoot: '0x' + '0'.repeat(64),
    generation: gen,
    inheritBias: inheritBias ?? gen > 0,
  };
}
