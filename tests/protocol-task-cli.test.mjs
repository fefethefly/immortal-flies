import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hash} from '../src/brain/codec.mjs';

const script=fileURLToPath(new URL('../scripts/protocol-task.mjs',import.meta.url));
// Each invocation is a separate OS process, so every step below is a real session.
const cli=(...args)=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script,...args],{stdio:['ignore','pipe','pipe']});
  let out='',err='';
  child.stdout.on('data',chunk=>out+=chunk);
  child.stderr.on('data',chunk=>err+=chunk);
  child.on('error',reject);
  child.on('close',code=>code===0?resolve(JSON.parse(out)):reject(new Error(`exit ${code}\n${err}`)));
});

test('run, resume and verify agree across separate processes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'iff-task-cli-'));
  try {
    await cli('run','valid','12',join(dir,'partial.json')); // session one ends here
    const resumed=await cli('resume','valid',join(dir,'partial.json'),'48',join(dir,'resumed.json'));
    const direct=await cli('run','valid','48',join(dir,'direct.json')); // fresh process
    assert.equal(resumed.round,48);
    assert.equal(resumed.collected,1);
    assert.deepEqual(resumed.ledger,direct.ledger);
    assert.equal(await readFile(join(dir,'resumed.json'),'utf8'),await readFile(join(dir,'direct.json'),'utf8'),
      'resumed artifact must be byte-identical to the uninterrupted artifact');
    const verified=await cli('verify','valid',join(dir,'direct.json'));
    assert.equal(verified.round,48);
    assert.equal(verified.collected,1);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('six transport modes pass through the command line with contracted outcomes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'iff-task-cli-modes-'));
  try {
    const expected={valid:1,duplicate:1,expired:0,session:0,conflict:0,off:0};
    for (const [mode,collected] of Object.entries(expected)) {
      const summary=await cli('run',mode,'48',join(dir,`${mode}.json`));
      assert.equal(summary.verified,true,mode);
      assert.equal(summary.collected,collected,mode);
      assert.equal((await cli('verify',mode,join(dir,`${mode}.json`))).round,48,mode);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('tampered checkpoint files are refused by the command line',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'iff-task-cli-tamper-'));
  try {
    await cli('run','valid','12',join(dir,'state.json'));
    const artifact=JSON.parse(await readFile(join(dir,'state.json'),'utf8'));
    artifact.checkpoint.state.ledger.push({id:'food:0',round:5,winner:'sim:receiver-b',
      eligible:['sim:receiver-b'],actionRef:{round:5,instanceId:'sim:receiver-b'},body:{x:1,y:1}});
    await writeFile(join(dir,'tampered.json'),JSON.stringify(artifact)+'\n');
    await assert.rejects(cli('verify','valid',join(dir,'tampered.json')),/TASK_FILE_HASH/);
    // Rehashing the forged file must still fail: recomputation disproves the record.
    const {fileHash,...payload}=artifact;
    payload.checkpoint.checkpointHash=await hash({schema:payload.checkpoint.schema,
      audit:payload.checkpoint.audit,state:payload.checkpoint.state});
    await writeFile(join(dir,'rehashed.json'),JSON.stringify({...payload,fileHash:await hash(payload)})+'\n');
    await assert.rejects(cli('verify','valid',join(dir,'rehashed.json')),/TASK_REPLAY/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('demo performs the full save-restore-verify loop in one command',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'iff-task-cli-demo-'));
  try {
    const summary=await cli('demo',join(dir,'demo'));
    assert.equal(summary.verified,true);
    assert.equal(summary.resumeEqualsContinuous,true);
    assert.equal(summary.collected,1);
    assert.equal(summary.separateProcesses,true);
    assert.deepEqual(Object.keys(summary.modes),['valid','duplicate','expired','session','conflict','off']);
    for(const result of Object.values(summary.modes))assert.equal(result.resumeEqualsContinuous,true);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('CLI refuses overwrite, incompatible sources, wrong mode and invalid rounds',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'iff-task-cli-guards-'));
  try {
    const file=join(dir,'nested','state.json');
    await cli('run','valid','12',file);
    const original=await readFile(file,'utf8');
    await assert.rejects(cli('run','valid','48',file),/EEXIST/);
    assert.equal(await readFile(file,'utf8'),original);
    await assert.rejects(cli('verify','off',file),/TASK_PLAN/);
    await assert.rejects(cli('resume','valid',file,'11',join(dir,'backward.json')),/INVALID_VALUE/);
    await assert.rejects(cli('run','valid','49',join(dir,'invalid.json')),/INVALID_VALUE/);
    const {fileHash,...payload}=JSON.parse(original);
    payload.sources['src/brain/protocol-task.mjs']='0x'+'0'.repeat(64);
    const changed=join(dir,'changed-source.json');
    await writeFile(changed,JSON.stringify({...payload,fileHash:await hash(payload)}));
    await assert.rejects(cli('verify','valid',changed),/source fingerprints/);
  } finally {await rm(dir,{recursive:true,force:true});}
});