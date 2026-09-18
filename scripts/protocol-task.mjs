#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,link,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {hash,hashBytes,requireValue} from '../src/brain/codec.mjs';
import {createTask,advanceTask,checkpointTask,restoreTask,TASK_MODES} from '../src/brain/protocol-task.mjs';
const root=resolve(import.meta.dirname,'..');
const paths=['scripts/protocol-task.mjs','src/brain/protocol-task.mjs','src/brain/relay-admission.mjs',
  'src/brain/task-navigation-control.mjs','src/brain/task-local-relay.mjs','src/brain/runtime.mjs',
  'src/brain/codec.mjs','src/brain/adapters.mjs','src/brain/ethology.mjs'];
export async function fingerprints(){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));}
export async function saveTask(file,state){
  file=resolve(file);
  const sources=await fingerprints();
  const payload={schema:'iff.protocol-task-file/1',sources,checkpoint:await checkpointTask(state)};
  const artifact={...payload,fileHash:await hash(payload)};
  assert.deepEqual(await fingerprints(),sources,'source changed during save');
  await mkdir(dirname(file),{recursive:true}); // Output directory need not pre-exist.
  // Same-filesystem link publishes complete file atomically, refusing overwrite.
  const temp=await mkdtemp(join(dirname(file),'.protocol-task-'));
  try {const staged=join(temp,'artifact.json');await writeFile(staged,JSON.stringify(artifact)+'\n',{flag:'wx'});await link(staged,file);}
  finally {await rm(temp,{recursive:true,force:true});}
  return artifact;
}
export async function loadTask(file,mode){
  const artifact=JSON.parse(await readFile(resolve(file),'utf8'));
  requireValue(artifact.schema==='iff.protocol-task-file/1','TASK_FILE_SCHEMA');
  const {fileHash,...payload}=artifact;requireValue(await hash(payload)===fileHash,'TASK_FILE_HASH');
  const sources=await fingerprints();assert.deepEqual(artifact.sources,sources,'source fingerprints');
  const state=await restoreTask(artifact.checkpoint,mode);
  assert.deepEqual(await fingerprints(),sources,'source changed during restore');
  return state;
}
function summary(state){
  const decisions=state.trace.flatMap(t=>t.frames.flatMap(f=>f.decisions));
  return {mode:state.plan.mode,round:state.round,controller:state.plan.policy.substrate,
    collected:state.ledger.length,ledger:state.ledger,pending:state.pending.length,budget:state.budget,
    reasons:Object.fromEntries([...new Set(decisions.map(d=>d.reason))].map(reason=>[reason,decisions.filter(d=>d.reason===reason).length]))};
}
async function main(){
  const [command,...args]=process.argv.slice(2);
  const usage='Usage: run MODE ROUND OUTPUT | resume MODE INPUT ROUND OUTPUT | verify MODE INPUT | demo NEW_DIRECTORY';
  let state;
  if(command==='demo'){
    assert.equal(args.length,1,usage);const dir=resolve(args[0]);await mkdir(dir); // Fail if already present.
    // Await each child exit: resume cannot use the previous process's memory.
    const invoke=async(...argv)=>JSON.parse((await promisify(execFile)(process.execPath,
      [fileURLToPath(import.meta.url),...argv])).stdout);
    const modes={};
    for(const mode of TASK_MODES){
      const folder=join(dir,mode),partial=join(folder,'checkpoint-12.json');
      const resumed=join(folder,'resumed-48.json'),direct=join(folder,'continuous-48.json');
      await invoke('run',mode,'12',partial);
      await invoke('resume',mode,partial,'48',resumed);
      await invoke('run',mode,'48',direct);
      assert.equal(await readFile(resumed,'utf8'),await readFile(direct,'utf8'),'artifact bytes differ');
      const result=await invoke('verify',mode,resumed);
      assert.equal(result.collected,['valid','duplicate'].includes(mode)?1:0);
      modes[mode]={...result,resumeEqualsContinuous:true};
    }
    assert.deepEqual(modes.duplicate.ledger,modes.valid.ledger);
    console.log(JSON.stringify({directory:dir,...modes.valid,verified:true,
      resumeEqualsContinuous:true,separateProcesses:true,modes},null,2));return;
  }
  const mode=args[0];assert.ok(TASK_MODES.includes(mode),usage);
  if(command==='run'){
    assert.equal(args.length,3,usage);state=await advanceTask(await createTask(mode),Number(args[1]));await saveTask(args[2],state);
  }else if(command==='resume'){
    assert.equal(args.length,4,usage);state=await advanceTask(await loadTask(args[1],mode),Number(args[2]));await saveTask(args[3],state);
  }else if(command==='verify'){
    assert.equal(args.length,2,usage);state=await loadTask(args[1],mode);
  }else throw new Error(usage);
  console.log(JSON.stringify({verified:true,...summary(state)},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
