#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,hashBytes} from '../src/brain/codec.mjs';
import {loadCommittedGraph} from './study-protocol-scale.mjs';
import {fingerprints as baseFingerprints} from './study-relay-diagnosis.mjs';
import {PLAN,runArm,summarize,separation} from './relay-direction-core.mjs';
import {relayCohorts} from '../src/brain/relay-direction.mjs';
const root=resolve(import.meta.dirname,'..');
const planFile=join(root,'reports/relay-direction-plan-v1.json');
export async function fingerprints() {
  const sources=await baseFingerprints();
  for(const p of ['scripts/study-relay-direction.mjs','scripts/relay-direction-core.mjs','src/brain/relay-direction.mjs'])
    sources[p]=await hashBytes(await readFile(join(root,p)));
  return sources;
}
export async function buildReport(sources) {
  const graph=await loadCommittedGraph(PLAN), rows=[];
  const metadataHash=await hash(graph.metadata);
  for(const seed of PLAN.seeds)for(const bearing of PLAN.bearings)for(const arm of PLAN.arms) {
    const row=await runArm(graph,seed,bearing,arm);
    assert.deepEqual(await runArm(graph,seed,bearing,arm),row);
    rows.push(row);
  }
  assert.equal(await hash(graph.metadata),metadataHash,'graph metadata mutated');
  // Matched routed arms must use identical RNG draw counts at every tick,
  // including zero-intensity ticks; outcomes are not assumed to improve.
  for(const seed of PLAN.seeds)for(const bearing of PLAN.bearings) {
    const runs=rows.filter(r=>r.seed===seed&&r.bearing===bearing&&!r.arm.startsWith('neural'));
    for(const r of runs)assert.deepEqual(r.trace.map(t=>t.rngAfter),runs[0].trace.map(t=>t.rngAfter));
  }
  const payload={schema:'iff.relay-direction-study/1',audit:'SIM',plan:PLAN,planHash:await hash(PLAN),
    graph:graph.manifest,cohorts:relayCohorts(graph),sources,rows,summary:summarize(rows),
    separation:separation(rows),executionCount:rows.length*2};
  return {...payload,reportHash:await hash(payload)};
}
async function main() {
  const [command,output,...extra]=process.argv.slice(2);
  assert.ok(['plan','run','verify'].includes(command)&&extra.length===0,'Usage: plan|run|verify [report path]');
  if(command==='plan') {
    assert.equal(output,undefined);
    await writeFile(planFile,JSON.stringify({plan:PLAN,planHash:await hash(PLAN)},null,2)+'\n',{flag:'wx'});
    console.log(planFile); return;
  }
  assert.deepEqual(JSON.parse(await readFile(planFile,'utf8')),{plan:PLAN,planHash:await hash(PLAN)},'frozen development plan changed');
  const file=resolve(output??join(root,'reports/relay-direction-v1.json')),sources=await fingerprints();
  const result=await buildReport(sources);
  assert.deepEqual(await fingerprints(),sources,'sources changed');
  if(command==='run')await writeFile(file,JSON.stringify(result)+'\n',{flag:'wx'});
  const saved=JSON.parse(await readFile(file,'utf8'));
  const {reportHash,...payload}=saved;
  assert.equal(await hash(payload),reportHash); assert.deepEqual(saved,result,'complete replay mismatch');
  console.log(JSON.stringify({file,reportHash,summary:result.summary,separation:result.separation},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
