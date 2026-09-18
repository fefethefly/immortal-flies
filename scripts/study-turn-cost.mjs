#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,hashBytes} from '../src/brain/codec.mjs';
import {createState} from '../src/brain/runtime.mjs';
import {observeLocal} from '../src/brain/task-local-relay.mjs';
import {motorInput} from '../src/brain/relay-motor-input.mjs';
import {sensoryStep} from '../src/brain/predictive-motor-input.mjs';
import {predictTurnCost,TURN_COST} from '../src/brain/predictive-turn-cost.mjs';
import {geometry,PLAN as BASE} from './motor-ablation-core.mjs';
import {loadCommittedGraph} from './study-protocol-scale.mjs';
export const PLAN={schema:'iff.turn-cost-plan/1',audit:'SIM',graph:BASE.graph,seed:301,
  headings:[0,45],bearings:['ahead','right','behind','left'],rounds:160,pickupRadius:400,
  arms:['baseline','turn-cost','no-message'],controller:TURN_COST,
  geometry:'motor-ablation geometry; observer-only one-round transport',
  gate:'heading=0/right collects; no baseline successful geometry loses collection; higher total collection',
  limits:'Previously examined development geometry, no holdout. Full neural state/graph access and extra prediction work; not equal compute, learning or swarm evidence. No result-based retuning.'};
const root=resolve(import.meta.dirname,'..'),planFile=join(root,'reports/turn-cost-plan-v1.json'),reportFile=join(root,'reports/turn-cost-v1.json');
const paths=['scripts/study-turn-cost.mjs','scripts/motor-ablation-core.mjs','scripts/study-protocol-scale.mjs',
  'scripts/relay-diagnosis-core.mjs','src/brain/predictive-turn-cost.mjs','src/brain/predictive-motor-input.mjs',
  'src/brain/relay-motor-input.mjs','src/brain/runtime.mjs','src/brain/codec.mjs','src/brain/graph.mjs',
  'src/brain/adapters.mjs','src/brain/ethology.mjs','src/brain/relay-inbox.mjs','src/brain/task-local-relay.mjs'];
export async function fingerprints(){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));}
export async function runArm(graph,{heading,bearing,arm}){
  assert.ok(PLAN.headings.includes(heading)&&PLAN.bearings.includes(bearing)&&PLAN.arms.includes(arm));
  const {target,observer}=geometry(heading,bearing),world={food:[{...target,consumed:false}],threats:[]};
  let s=createState(graph,{seed:PLAN.seed,soulId:'turn-cost-receiver',branchId:'development'});s.body.heading=heading;
  let pending=[],collectedAt=null,predictionSteps=0,predictionEdgeVisits=0,actualEdgeVisits=0;
  const trace=[];
  for(let round=1;round<=PLAN.rounds;round++){
    const before={...s.body},local=observeLocal(world,before);
    const outgoing=round<PLAN.rounds&&arm!=='no-message'?observeLocal(world,observer).observations.map(o=>({
      id:`${round}:0:${o.channel}`,from:0,observedRound:round,deliveryRound:round+1,observer:{...observer},...o})):[];
    const context={to:1,round,observations:local.observations};
    const decision=arm==='baseline'?motorInput(pending,{...context,body:before},'dual'):predictTurnCost(s,graph,pending,context);
    predictionSteps+=decision.predictionSteps??0;predictionEdgeVisits+=decision.predictionEdgeVisits??0;
    for(const i of s.spikes)if(graph.metadata.nodes[i].sign)actualEdgeVisits+=graph.offsets[i+1]-graph.offsets[i];
    s=sensoryStep(s,graph,decision.source);
    const chosen=decision.candidates?.find(c=>c.source===decision.source);
    if(chosen){assert.deepEqual(s.body,chosen.first.body);assert.deepEqual(s.spikes,chosen.first.spikes);assert.equal(s.rng,chosen.first.rng);}
    const distance2=(s.body.x-target.x)**2+(s.body.y-target.y)**2;
    if(collectedAt===null&&distance2<=PLAN.pickupRadius**2){collectedAt=round;world.food[0].consumed=true;}
    trace.push({round,before,local,received:structuredClone(pending),outgoing,decision,after:{...s.body},distance2,stateHash:await hash(s)});
    pending=outgoing;
  }
  return {heading,bearing,arm,target,trace,collectedAt,collected:Number(collectedAt!==null),finalDistance:Math.sqrt(trace.at(-1).distance2),
    budget:{actualSteps:160,predictionSteps,totalNeuronUpdates:(160+predictionSteps)*graph.n,predictionEdgeVisits,actualEdgeVisits}};
}
export function summarize(rows){
  const counts=Object.fromEntries(PLAN.arms.map(a=>[a,rows.filter(r=>r.arm===a).reduce((n,r)=>n+r.collected,0)]));
  const regressions=rows.filter(r=>r.arm==='baseline'&&r.collected).filter(r=>!rows.find(c=>c.arm==='turn-cost'&&c.heading===r.heading&&c.bearing===r.bearing).collected).map(({heading,bearing})=>({heading,bearing}));
  const originalRight=rows.find(r=>r.arm==='turn-cost'&&r.heading===0&&r.bearing==='right').collected===1;
  return {counts,regressions,originalRight,passed:originalRight&&regressions.length===0&&counts['turn-cost']>counts.baseline};
}
export async function buildReport(sources){
  const graph=await loadCommittedGraph(PLAN),before=await hash(graph.metadata),rows=[];
  for(const heading of PLAN.headings)for(const bearing of PLAN.bearings)for(const arm of PLAN.arms){
    const options={heading,bearing,arm},row=await runArm(graph,options);assert.deepEqual(await runArm(graph,options),row);rows.push(row);
  }
  assert.equal(await hash(graph.metadata),before);
  const payload={schema:'iff.turn-cost-study/1',plan:PLAN,sources,graph:graph.manifest,rows,summary:summarize(rows),executions:rows.length*2};
  return {...payload,reportHash:await hash(payload)};
}
async function main(){
  const [command,...extra]=process.argv.slice(2);assert.ok(['plan','run','verify'].includes(command)&&!extra.length);
  const sources=await fingerprints(),binding={plan:PLAN,planHash:await hash(PLAN),sources};
  if(command==='plan'){await loadCommittedGraph(PLAN);await writeFile(planFile,JSON.stringify(binding,null,2)+'\n',{flag:'wx'});console.log(planFile);return;}
  assert.deepEqual(JSON.parse(await readFile(planFile,'utf8')),binding);
  const result=await buildReport(sources);assert.deepEqual(await fingerprints(),sources);
  if(command==='run')await writeFile(reportFile,JSON.stringify(result)+'\n',{flag:'wx'});
  assert.deepEqual(JSON.parse(await readFile(reportFile,'utf8')),result);
  console.log(JSON.stringify({summary:result.summary,rows:result.rows.map(({trace,...r})=>r)},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
