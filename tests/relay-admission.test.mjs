import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveAdmitted } from '../src/brain/relay-admission.mjs';
import { admissionExample } from '../src/protocol-admission-demo.mjs';
import { materialize, scenario } from '../scripts/protocol-replay-core.mjs';
import { createState, step } from '../src/brain/runtime.mjs';

test('admission: all fixed examples have explicit reasons and deterministic input', () => {
  const expected = {valid:['ACCEPTED_INPUT',216],duplicate:['ACCEPTED_INPUT',216],conflict:['ID_CONFLICT',0],
    environment:['ENVIRONMENT_MISMATCH',0],task:['TASK_MISMATCH',0],session:['SESSION_MISMATCH',0],
    instance:['UNKNOWN_INSTANCE',0],expired:['EXPIRED',0],future:['NOT_YET_DUE',0],schema:['UNKNOWN_SCHEMA',0],
    'no-gain':['ACCEPTED_NO_GAIN',500]};
  for (const [kind,[reason,value]] of Object.entries(expected)) {
    const example=admissionExample(kind), before=structuredClone(example);
    assert.equal(example.result.decisions[0].reason,reason);
    assert.equal(example.result.applied.food,value);
    assert.deepEqual(receiveAdmitted(example.messages,example.context),example.result);
    assert.deepEqual(example,before);
  }
  assert.equal(admissionExample('duplicate').result.decisions[1].reason,'DUPLICATE');
  assert.ok(admissionExample('conflict').result.decisions.every(d=>d.reason==='ID_CONFLICT'));
});
test('admission: carried state stops replay, scopes recipients and rejects conflicting identities', () => {
  const {messages,context,result}=admissionExample();
  assert.equal(receiveAdmitted(messages,context,result.state).decisions[0].reason,'DUPLICATE');
  assert.equal(receiveAdmitted(messages,{...context,round:3},result.state).decisions[0].reason,'DUPLICATE');
  assert.throws(()=>receiveAdmitted(messages,{...context,sessionId:'different'},result.state),{code:'ADMISSION_SCOPE'});
  assert.throws(()=>receiveAdmitted(messages,{...context,round:1},result.state));
  assert.equal(receiveAdmitted([{...messages[0],x:5700}],context,result.state).decisions[0].reason,'ID_CONFLICT');
  assert.equal(receiveAdmitted([{...messages[0],channel:'move'}],context).decisions[0].reason,'MALFORMED');
  assert.equal(receiveAdmitted([null],context).decisions[0].reason,'UNKNOWN_SCHEMA');
  assert.equal(receiveAdmitted([{...messages[0],instanceId:context.recipient}],context).decisions[0].reason,'SELF_MESSAGE');
  const other={...context,recipient:'sim:other',members:[...context.members,'sim:other']};
  assert.equal(receiveAdmitted(messages,other).decisions[0].reason,'ACCEPTED_INPUT');
  assert.throws(()=>receiveAdmitted(Array(41).fill(messages[0]),context),{code:'ADMISSION_BATCH'});
});
test('admitted input alone drives native neural stepping; rejected packets equal silence', async () => {
  const {graph}=await materialize(scenario());
  const initial=createState(graph,{seed:44,soulId:'admission-child',branchId:'test'});
  initial.body.x=3800;
  const run=kind=>{
    let s=structuredClone(initial), state;
    const base=admissionExample(kind);
    for(let round=2;round<=17;round++){
      const messages=base.messages.map(m=>({...m,id:`observation-${round}`,observedRound:round-1}));
      const context={...base.context,round,body:{x:s.body.x,y:s.body.y}};
      const result=receiveAdmitted(messages,context,state);state=result.state;
      s.signal=result.applied;s=step(s,graph,1);
    }
    return s;
  };
  const valid=run('valid');
  assert.deepEqual(run('duplicate'),valid);
  assert.deepEqual(run('environment').body,{...initial.body,energy:984});
  assert.notDeepEqual(valid.body,run('environment').body);
  assert.deepEqual(run('conflict'),run('environment'));
});
