/** Versioned translation of ordered LifeJournal events into the existing neural kernel. */
import { BrainSession } from '../brain/session.mjs';
import { createState } from '../brain/runtime.mjs';
import { makeInput } from '../brain/adapters.mjs';
import { hash, canonical } from '../brain/codec.mjs';
export const REPLAY_PROFILE = 'ifs.journal-replay/1';
export const STEPS_PER_INPUT = 16;
export async function replayLife(graph, {life, seed, inputs}) {
  if (!/^0x[0-9a-f]{64}$/i.test(life) || !Number.isInteger(seed) || seed<1 || seed>0xffffffff) throw new Error('Invalid identity');
  if (!Array.isArray(inputs) || inputs.length>9000) throw new Error('Replay budget exceeded');
  const initial=createState(graph,{soulId:life,branchId:'canonical',seed});
  initial.enabledSources=['environment'];
  const session=new BrainSession(graph,initial);
  for(let i=0;i<inputs.length;i++){
    const item=inputs[i];
    if(item.index!==i+1 || !Number.isInteger(item.kind) || item.kind<0 || item.kind>2 || !Number.isInteger(item.intensity) || item.intensity<0 || item.intensity>1000)throw new Error('Invalid or unordered chain inputs');
    const payload={food:0,threat:0,light:0};payload[['food','threat','light'][item.kind]]=item.intensity;
    // Logical input index is the deterministic clock. Chain evidence is retained by the outer archive.
    const frame=makeInput(session.state,'environment',payload,{now:item.index,provenance:{kind:'simulation',profile:REPLAY_PROFILE}});
    await session.dispatch({type:'input',frame,acceptedAt:item.index});
    await session.dispatch({type:'step',count:STEPS_PER_INPUT});
  }
  return session;
}
export async function buildLifeArchive(graph, identity, inputs) {
  const session=await replayLife(graph,{...identity,inputs});
  const payload={schema:'ifs.life-archive/1',profile:REPLAY_PROFILE,identity,inputs,brain:await session.checkpoint()};
  return {payload,sha256:await hash(payload),stateRoot:await hash(session.state)};
}
export async function verifyLifeArchive(graph, archive, identity, inputs) {
  if(archive?.payload?.schema!=='ifs.life-archive/1' || archive.payload.profile!==REPLAY_PROFILE || await hash(archive.payload)!==archive.sha256)throw new Error('Archive integrity mismatch');
  if(canonical(archive.payload.identity)!==canonical(identity) || canonical(archive.payload.inputs)!==canonical(inputs))throw new Error('Archive differs from chain evidence');
  const expected=await buildLifeArchive(graph,identity,inputs);
  if(canonical(expected)!==canonical(archive))throw new Error('Neural replay mismatch');
  return true;
}
