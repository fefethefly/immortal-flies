import test from 'node:test';
import assert from 'node:assert/strict';
import { materialize, scenario } from '../scripts/protocol-replay-core.mjs';
import { runAdmissionRelay } from '../src/brain/task-admission-relay.mjs';
import { runProtocolRelay } from '../src/brain/task-protocol-relay.mjs';
import { hash } from '../src/brain/codec.mjs';

test('full admission runner: accepted, duplicate, expired and cross-env decisions explain input', async () => {
  const plan = scenario(), { graph, world } = await materialize(plan);
  const config = { ...plan.config, mode:'relay', rounds:4 };
  const valid = await runAdmissionRelay(graph,world,config);
  const duplicate = await runAdmissionRelay(graph,world,{...config,deliveryCopies:2});
  const mixed = await runAdmissionRelay(graph,world,{...config,fault:'mixed-environment'});
  const cross = await runAdmissionRelay(graph,world,{...config,fault:'environment'});
  const expired = await runAdmissionRelay(graph,world,{...config,fault:'expired'});
  const conflict = await runAdmissionRelay(graph,world,{...config,fault:'conflict'});
  const off = await runAdmissionRelay(graph,world,{...config,mode:'off'});
  const frame = run => run.traces.find(t=>t.round===2 && t.fly===1);
  assert.equal(frame(valid).own.food,0); assert.equal(frame(valid).applied.food,216);
  assert.ok(valid.decisions.some(d=>d.reason==='ACCEPTED_INPUT' && d.before===0 && d.after===216));
  assert.ok(duplicate.decisions.some(d=>d.reason==='DUPLICATE'));
  assert.ok(mixed.decisions.some(d=>d.accepted));
  assert.ok(mixed.decisions.some(d=>d.reason==='ENVIRONMENT_MISMATCH'));
  for(const [run,reason] of [[cross,'ENVIRONMENT_MISMATCH'],[expired,'EXPIRED'],[conflict,'ID_CONFLICT']]) {
    assert.ok(run.decisions.length>0); assert.ok(run.decisions.every(d=>!d.accepted && d.reason===reason));
    assert.deepEqual(run.finalStateHashes,off.finalStateHashes);
    assert.ok(run.traces.every(t=>t.applied.food===t.own.food));
  }
  for(const run of [duplicate,mixed]) {
    assert.deepEqual(run.traces,valid.traces); assert.deepEqual(run.finalStateHashes,valid.finalStateHashes);
  }
  const legacy = await runProtocolRelay(graph,world,config);
  assert.deepEqual(valid.traces,legacy.traces); assert.deepEqual(valid.finalStateHashes,legacy.finalStateHashes);
  for(const run of [valid,duplicate,mixed,cross,expired,conflict,off]) {
    assert.deepEqual(await runAdmissionRelay(graph,world,run.config),run);
    assert.equal(run.budget.executedSteps,8);
    assert.equal(run.decisions.length,run.transmissions.length);
    assert.equal(run.budget.deliveries,run.decisions.filter(d=>d.accepted).length);
    const { resultHash,...payload }=run; assert.equal(await hash(payload),resultHash);
    for(const trace of run.traces) {
      const ds=run.decisions.filter(d=>d.round===trace.round && d.recipient===run.members[trace.fly]);
      const applied={...trace.own};
      for(const d of ds.filter(d=>d.accepted)) {
        const m=run.messages.find(m=>m.id===d.messageId && m.instanceId===d.instanceId);
        assert.equal(d.before,applied[m.channel]);applied[m.channel]=d.after;
      }
      assert.deepEqual(applied,trace.applied);
    }
  }
});

test('admission runner: capacity, accounting, initial settlement and input immutability', async () => {
  const plan=scenario(), {graph,world}=await materialize(plan);
  const before=structuredClone({graph,world,plan});
  const config={...plan.config,mode:'relay',rounds:4,deliveryCopies:2};
  const run=await runAdmissionRelay(graph,world,config);
  const {canonical}=await import('../src/brain/codec.mjs');
  assert.equal(run.budget.rawDeliveryPayloadBytes,run.transmissions.reduce((n,t)=>n+t.payloadBytes,0));
  let acceptedBytes=0;
  for(let i=0;i<run.transmissions.length;i++) {
    const t=run.transmissions[i],d=run.decisions[i];
    assert.equal(d.messageId,t.messageId);assert.equal(d.recipient,run.members[t.to]);
    assert.equal(d.round,t.round);
    assert.equal(t.payloadBytes,new TextEncoder().encode(canonical(t.message)).byteLength);
    if(d.accepted)acceptedBytes+=t.payloadBytes;
  }
  assert.equal(run.budget.deliveryPayloadBytes,acceptedBytes);
  assert.equal(run.budget.rejectedDeliveries,run.budget.duplicateDeliveries);
  assert.ok(run.admissionStates.every(s=>s.lastRound===4));
  const starts=Array.from({length:10},(_,i)=>({x:i?3800:5000,y:5000}));
  const ten=await runAdmissionRelay(graph,world,{mode:'relay',flies:10,rounds:3,positions:starts,deliveryCopies:2});
  assert.equal(ten.budget.executedSteps,30);
  assert.ok(ten.decisions.some(d=>d.accepted));
  await assert.rejects(runAdmissionRelay(graph,world,{mode:'relay',flies:10,deliveryCopies:2,fault:'conflict'}),{code:'ADMISSION_BATCH_BUDGET'});
  for(const patch of [{fault:'unknown'},{sessionId:''},{deliveryCopies:0},{rounds:0}]) {
    await assert.rejects(runAdmissionRelay(graph,world,{...config,...patch}));
  }
  const collected=await runAdmissionRelay(graph,world,{...config,positions:[{x:5600,y:5000},{x:5600,y:5000}]});
  assert.equal(collected.outcome.initialCollected,1);assert.equal(collected.outcome.collected,1);
  assert.equal(collected.messages.length,0);assert.equal(collected.decisions.length,0);
  const scrambled=await runAdmissionRelay(graph,world,{...config,mode:'scrambled',deliveryCopies:1});
  const old=await runProtocolRelay(graph,world,{...config,mode:'scrambled',deliveryCopies:1});
  assert.deepEqual(scrambled.traces,old.traces);assert.deepEqual(scrambled.finalStateHashes,old.finalStateHashes);
  assert.deepEqual({graph,world,plan},before);
});
