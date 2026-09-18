import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hash} from '../src/brain/codec.mjs';
import {receiveAdmitted,OBSERVATION_SCHEMA,ADMISSION_POLICY} from '../src/brain/relay-admission.mjs';
import {navigate,NAVIGATION_POLICY} from '../src/brain/task-navigation-control.mjs';

// Integration fixture only, not a new public protocol/schema or task runner.
// Trusted request is pinned outside the saved artifact: rehashing a changed
// request must not authorize a different world, session or membership roster.
function execute(request) {
  const inbox=receiveAdmitted(request.messages,request.context,request.admissionState);
  const known=[...request.ownObservations,
    ...inbox.accepted.map(({channel,x,y})=>({channel,x,y}))];
  const action=navigate(request.context.body,known);
  return {controller:NAVIGATION_POLICY.id,substrate:'handwritten-not-neural',
    admissionPolicy:ADMISSION_POLICY,accepted:inbox.accepted,decisions:inbox.decisions,
    scalarApplied:inbox.applied,admissionState:inbox.state,action};
}
async function verify(record,expectedRequest) {
  const {artifactHash,...payload}=record;
  assert.equal(await hash(payload),artifactHash,'artifact integrity');
  assert.deepEqual(record.request,expectedRequest,'trusted request binding');
  assert.deepEqual(record.result,execute(expectedRequest),'decision/action replay');
  return true;
}
async function seal(payload){return {...payload,artifactHash:await hash(payload)};}

test('admitted coordinates drive handwritten action; disk artifact verifies and rejected messages cannot steer',async()=>{
  const worldHash=await hash({fixture:'admission-navigation',food:{x:6200,y:5000}});
  const message={schema:OBSERVATION_SCHEMA,id:'observation-1',task:'forage-v1',envId:'sim:world',
    worldHash,sessionId:'sim:session',instanceId:'sim:observer',observedRound:1,
    channel:'food',x:6200,y:5000,observer:{x:6800,y:5000}};
  const context={task:message.task,envId:message.envId,worldHash,sessionId:message.sessionId,
    members:['sim:observer','sim:receiver'],recipient:'sim:receiver',round:2,
    body:{x:5000,y:5000},own:{food:0,threat:0,light:0}};
  const base={messages:[message],context,ownObservations:[]};
  const original=structuredClone(base),directory=await mkdtemp(join(tmpdir(),'iff-admission-navigation-'));
  try {
    const result=execute(base);
    assert.equal(result.substrate,'handwritten-not-neural');
    assert.equal(result.decisions[0].reason,'ACCEPTED_INPUT');
    assert.deepEqual(result.action,{dx:35,dy:0,reason:'approach',target:{channel:'food',x:6200,y:5000}});
    const artifact=await seal({request:base,result});
    const file=join(directory,'one-step.json');
    await writeFile(file,JSON.stringify(artifact)+'\n',{flag:'wx'});
    const restored=JSON.parse(await readFile(file,'utf8'));
    assert.equal(await verify(restored,original),true);
    assert.deepEqual(base,original,'caller observations and body must not change');
    assert.equal(result.admissionState.lastRound,2);

    // A valid copy plus a foreign-session packet must behave as just the copy;
    // duplicate delivery must not add influence or duplicate accepted evidence.
    const duplicate=execute({...base,messages:[message,structuredClone(message)]});
    assert.deepEqual(duplicate.action,result.action);
    assert.deepEqual(duplicate.accepted,result.accepted);
    assert.equal(duplicate.decisions[1].reason,'DUPLICATE');
    const foreign={...message,sessionId:'sim:other',x:3800};
    const mixed=execute({...base,messages:[message,foreign]});
    assert.deepEqual(mixed.action,result.action);
    assert.equal(mixed.decisions[1].reason,'SESSION_MISMATCH');
    const cases=[
      [[foreign],'SESSION_MISMATCH'],
      [[{...message,worldHash:`0x${'ff'.repeat(32)}`}],'ENVIRONMENT_MISMATCH'],
      [[{...message,instanceId:'sim:unknown'}],'UNKNOWN_INSTANCE'],
      [[{...message,schema:'unknown/99'}],'UNKNOWN_SCHEMA'],
      [[{...message,observedRound:2}],'NOT_YET_DUE'],
      [[message,{...message,x:3800}],'ID_CONFLICT'],
    ];
    for(const [messages,reason] of cases){
      const rejected=execute({...base,messages});
      assert.ok(rejected.decisions.every(d=>!d.accepted&&d.reason===reason));
      assert.deepEqual(rejected.accepted,[]);
      assert.deepEqual(rejected.action,{dx:0,dy:0,reason:'rest',target:null});
    }
    const repeated=execute({...base,admissionState:JSON.parse(JSON.stringify(result.admissionState))});
    assert.equal(repeated.decisions[0].reason,'DUPLICATE');
    assert.equal(repeated.action.dx,0,'restored dedup state must prevent re-use of relay evidence');
    const expired=execute({...base,context:{...context,round:3}});
    assert.equal(expired.decisions[0].reason,'EXPIRED');assert.equal(expired.action.dx,0);

    // Hash integrity alone is insufficient: a rehashed false action must fail
    // recomputation, and a rehashed context change must fail trusted binding.
    const altered=structuredClone(restored);altered.result.action.dx=-35;
    await assert.rejects(verify(altered,original),/artifact integrity/);
    const {artifactHash,...changed}=altered;
    await assert.rejects(verify(await seal(changed),original),/decision\/action replay/);
    const foreignRequest=structuredClone(original);foreignRequest.context.sessionId='sim:other';
    await assert.rejects(verify(await seal({request:foreignRequest,result:execute(foreignRequest)}),original),/trusted request binding/);
    await assert.rejects(writeFile(file,'overwrite',{flag:'wx'}),{code:'EEXIST'});
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),restored,'saved evidence not overwritten');
  } finally {await rm(directory,{recursive:true,force:true});}
});
