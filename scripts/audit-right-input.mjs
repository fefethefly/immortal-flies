#!/usr/bin/env node
// Single fixed-state pulse A/B diagnostic. No control-policy selection.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,hashBytes} from '../src/brain/codec.mjs';
import {createState,step} from '../src/brain/runtime.mjs';
import {loadCommittedGraph} from './study-protocol-scale.mjs';
import {PLAN} from './relay-diagnosis-core.mjs';
const root=resolve(import.meta.dirname,'..'),output=join(root,'reports/right-input-audit-v1.json');
const files=['scripts/audit-right-input.mjs','scripts/study-protocol-scale.mjs','scripts/relay-diagnosis-core.mjs',
  'src/brain/runtime.mjs','src/brain/codec.mjs','src/brain/adapters.mjs','src/brain/ethology.mjs','src/brain/graph.mjs',
  'src/brain/relay-inbox.mjs','src/brain/task-local-relay.mjs'];
const fingerprints=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));

export async function auditRightInput() {
  const sources=await fingerprints(),graph=await loadCommittedGraph(PLAN);
  const baseline=JSON.parse(await readFile(join(root,'reports/motor-input-v2.json'),'utf8'));
  const {reportHash,...payload}=baseline;assert.equal(await hash(payload),reportHash);
  const row=baseline.rows.find(r=>r.seed===301&&r.bearing==='right'&&r.arm==='motor-dual');
  const view=source=>({...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:[source]}}});
  let initial=createState(graph,{seed:301,soulId:'diagnostic-receiver',branchId:'relay-diagnosis'});
  for(const t of row.trace.slice(0,31)){
    initial.signal=t.applied;initial=step(initial,t.source===null?graph:view(t.source),1);
    assert.equal(await hash(initial),t.stateHash,'exact original state reconstruction');
  }
  assert.deepEqual(initial.body,row.trace[31].before);
  const initialHash=await hash(initial),metadataHash=await hash(graph.metadata),stimulus=view(904);
  const motor=[...new Set([...graph.metadata.groups.left,...graph.metadata.groups.right])].sort((a,b)=>a-b);
  assert.ok(graph.metadata.groups.food.includes(904)&&!motor.includes(904));
  const counts=(s,group)=>group.filter(i=>s.spikes.includes(i)).length;
  const experiment=()=>{
    let a=structuredClone(initial),b=structuredClone(initial);const trace=[];
    for(let frame=1;frame<=20;frame++){
      a.signal={food:0,threat:0,light:0};b.signal={food:frame===1?1000:0,threat:0,light:0};
      a=step(a,stimulus,1);b=step(b,stimulus,1);assert.equal(a.rng,b.rng);
      const vectors=motor.map(i=>({i,a:a.voltage[i],b:b.voltage[i],delta:b.voltage[i]-a.voltage[i],
        aSpike:a.spikes.includes(i),bSpike:b.spikes.includes(i),aRefractory:a.refractory[i],bRefractory:b.refractory[i]}));
      trace.push({frame,signalA:{...a.signal},signalB:{...b.signal},
        sourceSpikeA:a.spikes.includes(904),sourceSpikeB:b.spikes.includes(904),
        maxAbsVoltageDelta:Math.max(...vectors.map(n=>Math.abs(n.delta))),
        changedVoltages:vectors.filter(n=>n.delta!==0).length,
        changedSpikes:vectors.filter(n=>n.aSpike!==n.bSpike).length,
        changedRefractory:vectors.filter(n=>n.aRefractory!==n.bRefractory).length,
        motorA:{left:counts(a,graph.metadata.groups.left),right:counts(a,graph.metadata.groups.right)},
        motorB:{left:counts(b,graph.metadata.groups.left),right:counts(b,graph.metadata.groups.right)},
        bodyA:{...a.body},bodyB:{...b.body},vectors});
    }
    return {trace,finalA:a,finalB:b};
  };
  const experimentResult=experiment();assert.deepEqual(experiment(),experimentResult);
  assert.equal(await hash(initial),initialHash);assert.equal(await hash(graph.metadata),metadataHash);
  assert.deepEqual(await fingerprints(),sources);
  const {trace}=experimentResult,first=predicate=>trace.find(predicate)?.frame??null;
  const result={schema:'iff.right-input-audit/1',audit:'SIM',sources,baselineHash:reportHash,graph:graph.manifest,
    design:{seed:301,bearing:'right',checkpointAfter:31,frames:20,source:904,control:'zero input',
      intervention:'one full-strength pulse at frame 1 only',units:'model integers, NOT mV',
      limits:'Post-exploration fixed-state diagnostic, not held-out or preregistered. Source 904 is not the negative-source 941 used at original round 32. Tests propagation only, not reliable steering or a delay-only cause.'},
    initial,initialHash,...experimentResult,summary:{
      firstMotorVoltageChange:first(t=>t.changedVoltages>0),firstMotorSpikeChange:first(t=>t.changedSpikes>0),
      firstBodyChange:first(t=>t.bodyA.x!==t.bodyB.x||t.bodyA.y!==t.bodyB.y||t.bodyA.heading!==t.bodyB.heading)}};
  return {...result,reportHash:await hash(result)};
}
async function main(){
  const [command,...extra]=process.argv.slice(2);assert.ok(['run','verify'].includes(command)&&!extra.length,'Usage: run|verify');
  const result=await auditRightInput();
  if(command==='run')await writeFile(output,JSON.stringify(result)+'\n',{flag:'wx'});
  assert.deepEqual(JSON.parse(await readFile(output,'utf8')),result);
  console.log(JSON.stringify({output,reportHash:result.reportHash,summary:result.summary},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
