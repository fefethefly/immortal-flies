import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceTask,checkpointTask,createTask,PROTOCOL_TASK,restoreTask} from '../src/brain/protocol-task.mjs';

const run=async mode=>advanceTask(await createTask(mode),PROTOCOL_TASK.rounds);
const decisionsOf=state=>state.trace.flatMap(t=>t.frames.flatMap(f=>f.decisions));

test('valid transport settles the shared food exactly once under roster-order arbitration',async()=>{
  const state=await run('valid');
  assert.equal(state.plan.policy.substrate,'handwritten-not-neural');
  assert.equal(state.budget.neuralSteps,0);
  assert.equal(state.ledger.length,1,'one food, one settlement');
  assert.deepEqual(state.ledger[0].eligible,['sim:receiver-a','sim:receiver-b']);
  assert.equal(state.ledger[0].winner,'sim:receiver-a');
  assert.ok(state.budget.acceptedDeliveries>0);
  assert.equal(state.budget.rejectedDeliveries,0);
  // The credited settlement must reference the winner's admitted-message action,
  // not the mere reception of a message.
  const settlement=state.ledger[0];
  const frame=state.trace.find(t=>t.round===settlement.round).frames
    .find(f=>f.instanceId===settlement.winner);
  assert.ok(frame.accepted.length>0,'winner acted on admitted input');
  assert.equal(frame.action.reason,'approach');
});

test('duplicate deliveries are rejected per receiver and cannot settle twice',async()=>{
  const valid=await run('valid'),duplicate=await run('duplicate');
  assert.deepEqual(duplicate.ledger,valid.ledger,'duplicate transport must not change the settlement');
  assert.deepEqual(duplicate.receivers.map(r=>r.body),valid.receivers.map(r=>r.body));
  assert.equal(duplicate.budget.acceptedDeliveries,valid.budget.acceptedDeliveries);
  assert.equal(duplicate.budget.rawDeliveries,valid.budget.rawDeliveries*2);
  const duplicates=decisionsOf(duplicate).filter(d=>d.reason==='DUPLICATE');
  assert.equal(duplicates.length,duplicate.budget.rejectedDeliveries);
  assert.ok(duplicates.length>0,'duplicate copies must be explicitly classified');
});

test('expired, foreign-session and conflicting transports admit nothing and settle nothing',async()=>{
  for (const [mode,reason] of [['expired','EXPIRED'],['session','SESSION_MISMATCH'],['conflict','ID_CONFLICT']]) {
    const state=await run(mode);
    assert.equal(state.ledger.length,0,`${mode} must not settle`);
    assert.ok(state.budget.sent>0,`${mode} must actually transport messages`);
    assert.equal(state.budget.acceptedDeliveries,0,mode);
    const decisions=decisionsOf(state);
    assert.ok(decisions.length>0,`${mode} must exercise rejection`);
    assert.ok(decisions.every(d=>d.reason===reason),`${mode} decisions must all be ${reason}`);
  }
});

test('no-communication control transports and settles nothing',async()=>{
  const state=await run('off');
  assert.equal(state.ledger.length,0);
  assert.equal(state.budget.sent,0);
  assert.equal(state.budget.rawDeliveries,0);
  assert.equal(decisionsOf(state).length,0);
  assert.deepEqual(state.receivers.map(r=>r.body),state.plan.receivers.map(r=>r.body));
});

test('checkpoints cannot silently switch task modes on restore',async()=>{
  const artifact=await checkpointTask(await advanceTask(await createTask('valid'),12));
  await assert.rejects(restoreTask(artifact,'duplicate'),{code:'TASK_PLAN'});
});