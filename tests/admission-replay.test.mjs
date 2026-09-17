import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash } from '../src/brain/codec.mjs';
import { fingerprints, verifyAdmissionBundle } from '../scripts/admission-replay.mjs';
const file=new URL('../reports/admission-replay-v1.json',import.meta.url);
test('admission package: seven full runs replay and decisions match transmission indexes',async()=>{
  const saved=JSON.parse(await readFile(file,'utf8')), sources=await fingerprints();
  assert.equal((await verifyAdmissionBundle(saved,sources)).stateSteps,448);
  for(const run of Object.values(saved.runs)) {
    assert.equal(run.outcome.collected,0);assert.equal(run.traces.length,64);
    assert.equal(run.decisions.length,run.transmissions.length);
    for(let i=0;i<run.decisions.length;i++) {
      const d=run.decisions[i],t=run.transmissions[i];
      assert.equal(d.round,t.round);assert.equal(d.messageId,t.messageId);
      assert.equal(d.recipient,run.members[t.to]);
    }
  }
  assert.equal(saved.summary.mixed.accepted,31);assert.equal(saved.summary.mixed.rejected,31);
  assert.equal(saved.summary.expired.reasons.EXPIRED,30);
});
test('rehashed false decisions and source mismatches are rejected',async()=>{
  const saved=JSON.parse(await readFile(file,'utf8')),sources=await fingerprints();
  const bad=structuredClone(saved);bad.runs.environment.decisions[0].accepted=true;
  await assert.rejects(verifyAdmissionBundle(bad,sources),/bundle hash/);
  const {bundleHash,...payload}=bad;bad.bundleHash=await hash(payload);
  await assert.rejects(verifyAdmissionBundle(bad,sources),/full replay mismatch/);
  await assert.rejects(verifyAdmissionBundle(saved,{}),/source fingerprints/);
});
test('CLI independently exports and verifies without overwriting evidence',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'iff-admission-package-'));
  const cli=new URL('../scripts/admission-replay.mjs',import.meta.url).pathname;
  const target=join(dir,'bundle.json');
  const invoke=verb=>execFileSync(process.execPath,[cli,verb,target],{encoding:'utf8',stdio:'pipe',timeout:15000});
  try {
    assert.equal(JSON.parse(invoke('build')).verified,true);
    const before=await readFile(target,'utf8');
    assert.equal(JSON.parse(invoke('verify')).replayedArms,7);
    assert.throws(()=>invoke('build'));
    assert.equal(await readFile(target,'utf8'),before);
  } finally {await rm(dir,{recursive:true,force:true});}
});
