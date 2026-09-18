#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,hashBytes} from '../src/brain/codec.mjs';
import {createState} from '../src/brain/runtime.mjs';
import {observeLocal} from '../src/brain/task-local-relay.mjs';
import {motorInput} from '../src/brain/relay-motor-input.mjs';
import {predictMotor,sensoryStep,PREDICTIVE_MOTOR} from '../src/brain/predictive-motor-input.mjs';
import {loadCommittedGraph} from './study-protocol-scale.mjs';
import {PLAN as BASE} from './relay-diagnosis-core.mjs';
export const PLAN={schema:'iff.predictive-motor-plan/1',audit:'SIM',graph:BASE.graph,
  seed:301,bearing:'right',rounds:160,start:{x:5000,y:5000,heading:0},
  target:{x:5000,y:6200},observer:{x:5000,y:6800},pickupRadius:400,
  arms:['baseline','predictive','no-message'],controller:PREDICTIVE_MOTOR,
  pass:'predictive collected within 160 actual steps; no tuning after results',
  limits:'One previously used development scene, not holdout. Prediction reads full neural state and graph but only locally observed or delivered target coordinates. Extra simulation budget reported; not equal compute, neural learning, or general navigation.'};
const root=resolve(import.meta.dirname,'..'),planFile=join(root,'reports/predictive-motor-plan-v1.json'),reportFile=join(root,'reports/predictive-motor-v1.json');
const paths=['scripts/study-predictive-motor.mjs','scripts/study-protocol-scale.mjs','scripts/relay-diagnosis-core.mjs',
  'src/brain/predictive-motor-input.mjs','src/brain/relay-motor-input.mjs','src/brain/runtime.mjs','src/brain/codec.mjs',
  'src/brain/graph.mjs','src/brain/adapters.mjs','src/brain/ethology.mjs','src/brain/relay-inbox.mjs','src/brain/task-local-relay.mjs'];
export async function fingerprints(){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));}
export async function runArm(graph,arm){
  assert.ok(PLAN.arms.includes(arm));
  const world={food:[{...PLAN.target,consumed:false}],threats:[]};
  let s=createState(graph,{seed:PLAN.seed,soulId:'predictive-receiver',branchId:'development'});
  let pending=[],collectedAt=null,predictionSteps=0,predictionEdgeVisits=0,actualEdgeVisits=0;
  const trace=[];
  for(let round=1;round<=PLAN.rounds;round++){
    const before={...s.body},local=observeLocal(world,before);
    const outgoing=round<PLAN.rounds&&arm!=='no-message'?observeLocal(world,PLAN.observer).observations.map(o=>({
      id:`${round}:0:${o.channel}`,from:0,observedRound:round,deliveryRound:round+1,observer:{...PLAN.observer},...o})):[];
    const decision=arm==='baseline'?motorInput(pending,{to:1,round,body:before,observations:local.observations},'dual')
      :predictMotor(s,graph,pending,{to:1,round,observations:local.observations});
    predictionSteps+=decision.predictionSteps??0;predictionEdgeVisits+=decision.predictionEdgeVisits??0;
    for(const i of s.spikes)if(graph.metadata.nodes[i].sign)actualEdgeVisits+=graph.offsets[i+1]-graph.offsets[i];
    s=sensoryStep(s,graph,decision.source);
    const chosen=decision.candidates?.find(c=>c.source===decision.source);
    if(chosen){assert.deepEqual(s.body,chosen.first.body);assert.deepEqual(s.spikes,chosen.first.spikes);assert.equal(s.rng,chosen.first.rng);}
    const distance2=(s.body.x-PLAN.target.x)**2+(s.body.y-PLAN.target.y)**2;
    if(collectedAt===null&&distance2<=PLAN.pickupRadius**2){collectedAt=round;world.food[0].consumed=true;}
    trace.push({round,before,local,received:structuredClone(pending),outgoing,decision,after:{...s.body},distance2,stateHash:await hash(s)});
    pending=outgoing;
  }
  return {arm,trace,collectedAt,collected:Number(collectedAt!==null),finalDistance:Math.sqrt(trace.at(-1).distance2),
    budget:{actualSteps:PLAN.rounds,predictionSteps,totalNeuronUpdates:(PLAN.rounds+predictionSteps)*graph.n,predictionEdgeVisits,actualEdgeVisits}};
}
export async function buildReport(sources){
  const graph=await loadCommittedGraph(PLAN),before=await hash(graph.metadata),rows=[];
  for(const arm of PLAN.arms){const row=await runArm(graph,arm);assert.deepEqual(await runArm(graph,arm),row);rows.push(row);}
  assert.equal(await hash(graph.metadata),before);
  const payload={schema:'iff.predictive-motor/1',plan:PLAN,sources,graph:graph.manifest,rows,
    passed:rows.find(r=>r.arm==='predictive').collected===1,executions:6};
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
  console.log(JSON.stringify({passed:result.passed,rows:result.rows.map(({trace,...row})=>row)},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
