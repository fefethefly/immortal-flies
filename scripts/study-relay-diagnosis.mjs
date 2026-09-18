#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,hashBytes,canonical} from '../src/brain/codec.mjs';
import {loadCommittedGraph} from './study-protocol-scale.mjs';
import {PLAN,diagnoseArm,summarize,firstDivergence} from './relay-diagnosis-core.mjs';
const root=resolve(import.meta.dirname,'..');
const paths=['scripts/study-relay-diagnosis.mjs','scripts/relay-diagnosis-core.mjs','scripts/study-protocol-scale.mjs',
  'src/brain/runtime.mjs','src/brain/codec.mjs','src/brain/graph.mjs','src/brain/adapters.mjs',
  'src/brain/ethology.mjs','src/brain/task-local-relay.mjs','src/brain/relay-inbox.mjs'];
export async function fingerprints(){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));}
export async function buildDiagnosis(sources) {
  const graph=await loadCommittedGraph(PLAN),rows=[];
  for(const seed of PLAN.seeds)for(const bearing of PLAN.bearings)for(const arm of PLAN.arms) {
    const run=await diagnoseArm(graph,seed,bearing,arm);
    assert.deepEqual(await diagnoseArm(graph,seed,bearing,arm),run);
    rows.push(run);
  }
  const pairs=[];
  for(const seed of PLAN.seeds)for(const bearing of PLAN.bearings) {
    const get=arm=>rows.find(r=>r.seed===seed&&r.bearing===bearing&&r.arm===arm);
    const off=get('neural-off'),relay=get('neural-relay');
    pairs.push({seed,bearing,firstInputDifference:firstDivergence(relay,off,'applied'),
      firstSpikeDifference:firstDivergence(relay,off,'spikes'),firstBodyDifference:firstDivergence(relay,off,'after'),
      collectedDelta:relay.metrics.collected-off.metrics.collected});
  }
  const directionalCollapse=PLAN.seeds.map(seed=>{
    const r=rows.filter(r=>r.seed===seed&&r.arm==='neural-relay');
    return {seed,secondRoundInput:r.map(r=>r.trace[1].applied.food),
      sameInput:new Set(r.map(r=>canonical(r.trace[1].applied))).size===1,
      sameNeuralState:new Set(r.map(r=>r.trace[1].stateHash)).size===1};
  });
  const payload={schema:'iff.relay-diagnosis/1',audit:'SIM',plan:PLAN,planHash:await hash(PLAN),
    graph:graph.manifest,sources,rows,summary:summarize(rows),pairs,directionalCollapse,
    replayedArms:rows.length,executionCount:rows.length*2};
  return {...payload,reportHash:await hash(payload)};
}
async function main() {
  const [command,output,...extra]=process.argv.slice(2);
  assert.ok(['run','verify'].includes(command)&&extra.length===0,'Usage: study-relay-diagnosis.mjs run|verify [report path]');
  const file=resolve(output??join(root,'reports/relay-diagnosis-v1.json'));
  const sources=await fingerprints();
  const result=await buildDiagnosis(sources);
  assert.deepEqual(await fingerprints(),sources,'sources changed');
  if(command==='run')await writeFile(file,JSON.stringify(result)+'\n',{flag:'wx'});
  const saved=JSON.parse(await readFile(file,'utf8'));
  const {reportHash,...payload}=saved;
  assert.equal(await hash(payload),reportHash);
  assert.deepEqual(saved,result,'complete replay mismatch');
  console.log(JSON.stringify({file,reportHash,summary:result.summary,pairs:result.pairs,directionalCollapse:result.directionalCollapse},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
