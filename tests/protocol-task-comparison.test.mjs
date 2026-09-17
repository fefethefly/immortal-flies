import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { taskComparison } from '../src/protocol-task-comparison.mjs';
async function fixtures() {
  return Promise.all(['protocol-replay-smoke-v1.json','admission-replay-v1.json'].map(p=>readFile(new URL(`../reports/${p}`,import.meta.url),'utf8').then(JSON.parse)));
}
test('normal traffic comparison derives task failure and distinct communication costs',async()=>{
  const [legacy,admission]=await fixtures();
  const rows=taskComparison(legacy,admission);
  assert.deepEqual(rows.map(r=>r.firstCollection),[null,null,null]);
  assert.deepEqual(rows.map(r=>r.collected),[0,0,0]);
  assert.deepEqual(rows.map(r=>r.executedSteps),[64,64,64]);
  assert.deepEqual(rows.map(r=>[r.dx,r.dy]),[[0,0],[30,-30],[30,-30]]);
  assert.deepEqual(rows.map(r=>r.rawBytes),[0,4035,10088]);
  assert.deepEqual(rows.map(r=>r.collectionDelta),[0,0,0]);
});
test('comparison refuses changed scope, budget or fault conditions',async()=>{
  const [legacy,admission]=await fixtures();
  for(const mutate of [r=>r.worldHash='bad',r=>r.initialStateHashes[0]='bad',r=>r.config.rounds=33,
    r=>r.budget.executedSteps=1,r=>r.config.fault='environment',r=>r.config.mode='scrambled']) {
    const altered=structuredClone(admission);mutate(altered.runs.valid);
    assert.throws(()=>taskComparison(legacy,altered));
  }
  const successful=structuredClone(admission);
  successful.runs.valid.ledger=[{round:9,index:0,taker:1},{round:4,index:1,taker:0}];
  successful.runs.valid.outcome.collected=2;
  const row=taskComparison(legacy,successful)[2];
  assert.equal(row.firstCollection,4);assert.equal(row.collectionDelta,2);
});
