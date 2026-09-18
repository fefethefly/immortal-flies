#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,hashBytes,canonical} from '../src/brain/codec.mjs';
import {loadCommittedGraph} from './study-protocol-scale.mjs';
import {PLAN,runArm} from './motor-ablation-core.mjs';
const root=resolve(import.meta.dirname,'..');
const planFile=join(root,'reports/motor-ablation-plan-v1.json');
const reportFile=join(root,'reports/motor-ablation-v1.json');
const paths=['scripts/study-motor-ablation.mjs','scripts/motor-ablation-core.mjs','scripts/study-protocol-scale.mjs',
  'scripts/relay-diagnosis-core.mjs','src/brain/relay-motor-input.mjs','src/brain/relay-inbox.mjs',
  'src/brain/task-local-relay.mjs','src/brain/runtime.mjs','src/brain/codec.mjs','src/brain/graph.mjs',
  'src/brain/adapters.mjs','src/brain/ethology.mjs'];
export async function fingerprints(){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));}
export function summarize(rows) {
  const stats=r=>({runs:r.length,collected:r.reduce((n,x)=>n+x.metrics.collected,0),
    meanNetProgress:r.reduce((n,x)=>n+x.metrics.netProgress,0)/r.length});
  const byArm=Object.fromEntries(PLAN.arms.map(a=>[a,stats(rows.filter(r=>r.arm===a))]));
  const strata=PLAN.headings.flatMap(heading=>PLAN.bearings.map(bearing=>{
    const get=a=>rows.filter(r=>r.heading===heading&&r.bearing===bearing&&r.arm===a);
    const behavior=r=>canonical(r.trace.map(t=>[t.after,t.spikes,t.neuralHash,t.input.signal,t.selected]));
    return {heading,bearing,arms:Object.fromEntries(PLAN.arms.map(a=>[a,{
      ...stats(get(a)),distinctSeedBehaviors:new Set(get(a).map(behavior)).size,
      collectionRounds:get(a).map(r=>r.metrics.collectedAt)}]))};
  }));
  return {byArm,strata,paired:PLAN.arms.filter(a=>a!=='dual').map(arm=>({arm,
    rows:rows.filter(r=>r.arm==='dual').map(d=>{
      const c=rows.find(r=>r.arm===arm&&r.seed===d.seed&&r.heading===d.heading&&r.bearing===d.bearing);
      return {seed:d.seed,heading:d.heading,bearing:d.bearing,collectedDelta:d.metrics.collected-c.metrics.collected,
        progressDelta:d.metrics.netProgress-c.metrics.netProgress};
    })}))};
}
export async function buildReport(sources) {
  const graph=await loadCommittedGraph(PLAN),before=await hash(graph.metadata),rows=[];
  for(const seed of PLAN.seeds)for(const heading of PLAN.headings)for(const bearing of PLAN.bearings)for(const arm of PLAN.arms) {
    const options={seed,heading,bearing,arm};
    const row=await runArm(graph,options);
    assert.deepEqual(await runArm(graph,options),row,'deterministic replay');rows.push(row);
  }
  assert.equal(await hash(graph.metadata),before);
  const payload={schema:'iff.motor-ablation/1',audit:'SIM',plan:PLAN,planHash:await hash(PLAN),sources,
    graph:graph.manifest,rows,summary:summarize(rows),executions:rows.length*2};
  return {...payload,reportHash:await hash(payload)};
}
async function main() {
  const [command,...extra]=process.argv.slice(2);
  assert.ok(['plan','run','verify'].includes(command)&&!extra.length,'Usage: plan|run|verify');
  const sources=await fingerprints(),binding={plan:PLAN,planHash:await hash(PLAN),sources};
  if(command==='plan') {
    await loadCommittedGraph(PLAN);
    await writeFile(planFile,JSON.stringify(binding,null,2)+'\n',{flag:'wx'});
    console.log(planFile);return;
  }
  assert.deepEqual(JSON.parse(await readFile(planFile,'utf8')),binding,'plan or sources changed after freeze');
  const result=await buildReport(sources);
  assert.deepEqual(await fingerprints(),sources,'sources changed during run');
  if(command==='run')await writeFile(reportFile,JSON.stringify(result)+'\n',{flag:'wx'});
  const saved=JSON.parse(await readFile(reportFile,'utf8')),{reportHash,...payload}=saved;
  assert.equal(await hash(payload),reportHash);assert.deepEqual(saved,result,'full report replay');
  console.log(JSON.stringify({reportFile,reportHash,summary:result.summary.byArm,strata:result.summary.strata},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
