import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createTask,advanceTask,checkpointTask,restoreTask} from '../src/brain/protocol-task.mjs';
import {hash} from '../src/brain/codec.mjs';

test('saved checkpoint resumes identically to uninterrupted task and detects rehashed tampering',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'iff-task-checkpoint-'));
  try {
    const initial=await createTask();
    const complete=await advanceTask(initial,48);
    const partial=await advanceTask(initial,12);
    assert.ok(partial.pending.length>0,'checkpoint must exercise in-flight delivery');
    const file=join(dir,'checkpoint.json');
    await writeFile(file,JSON.stringify(await checkpointTask(partial))+'\n',{flag:'wx'});
    const saved=JSON.parse(await readFile(file,'utf8'));
    const restored=await restoreTask(saved,'valid');
    assert.deepEqual(await advanceTask(restored,48),complete);
    assert.equal(initial.round,0,'input state was not mutated');
    assert.equal(complete.ledger.length,1,'two receivers must not settle food twice');
    assert.deepEqual(complete.ledger[0].eligible,['sim:receiver-a','sim:receiver-b']);
    assert.equal(complete.ledger[0].winner,'sim:receiver-a');
    const bad=structuredClone(saved);bad.state.receivers[0].body.x++;
    await assert.rejects(restoreTask(bad,'valid'),{code:'CHECKPOINT_HASH'});
    const {checkpointHash,...payload}=bad;bad.checkpointHash=await hash(payload);
    await assert.rejects(restoreTask(bad,'valid'),{code:'TASK_REPLAY'});
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('forged settlement credit and forged decision records fail recomputation',async()=>{
  const partial=await advanceTask(await createTask(),26); // past the single settlement
  assert.equal(partial.ledger.length,1);
  const saved=JSON.parse(JSON.stringify(await checkpointTask(partial)));
  const stolen=structuredClone(saved);
  stolen.state.ledger[0].winner='sim:receiver-b'; // forge contribution credit
  await assert.rejects(restoreTask(stolen,'valid'),{code:'CHECKPOINT_HASH'});
  const {checkpointHash,...stolenPayload}=stolen;
  stolen.checkpointHash=await hash(stolenPayload);
  await assert.rejects(restoreTask(stolen,'valid'),{code:'TASK_REPLAY'});
  const twisted=structuredClone(saved);
  const frame=twisted.state.trace.find(t=>t.frames.some(f=>f.decisions.length>0));
  frame.frames.find(f=>f.decisions.length>0).decisions[0].reason='ACCEPTED_NO_GAIN';
  await assert.rejects(restoreTask(twisted,'valid'),{code:'CHECKPOINT_HASH'});
  const {checkpointHash:twistedHash,...twistedPayload}=twisted;
  twisted.checkpointHash=await hash(twistedPayload);
  await assert.rejects(restoreTask(twisted,'valid'),{code:'TASK_REPLAY'});
});
