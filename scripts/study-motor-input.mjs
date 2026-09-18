#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash,hashBytes} from '../src/brain/codec.mjs';
import {loadCommittedGraph} from './study-protocol-scale.mjs';
import {PLAN as BASE,diagnoseArm} from './relay-diagnosis-core.mjs';
import {MOTOR_INPUT,validateMotorSources,motorInput} from '../src/brain/relay-motor-input.mjs';
import {createState,step} from '../src/brain/runtime.mjs';
import {observeLocal} from '../src/brain/task-local-relay.mjs';
const root=resolve(import.meta.dirname,'..');
const planFile=join(root,'reports/motor-input-plan-v2.json');
export const PLAN={
  ...structuredClone(BASE),schema:'iff.motor-input-plan/2',rounds:160,adapter:MOTOR_INPUT,
  arms:['neural-off','neural-relay','motor-off','motor-single','motor-dual'],
  limits:'Development feasibility on previously observed seeds 301-304; calibration probes used the same seeds, so nothing here is held-out. Rest calibration at strength 1000: 904 turns positive, 941 negative, 994 nearly straight; closed-loop authority is not guaranteed. v1 never routed the selected source (it always stimulated the full 80-node food group), so v1 motor arms measured saturated full-group input, not steering; v2 routes the calibrated single source per tick into an unchanged step(). Motor arms run 160 rounds, fixed before v2; neural baselines replay the historical 48-round protocol. Gain-saturating steering differs from scalar relay-inbox gain. No threats, no learning, no kernel, weight, motor-group or movement-rule changes. Results are not a swarm claim.',
};
const vectors={ahead:[1,0],right:[0,1],behind:[-1,0],left:[0,-1]};
const paths=['scripts/study-motor-input.mjs','scripts/relay-diagnosis-core.mjs','scripts/study-relay-diagnosis.mjs',
  'scripts/study-protocol-scale.mjs','src/brain/relay-motor-input.mjs','src/brain/runtime.mjs','src/brain/codec.mjs',
  'src/brain/graph.mjs','src/brain/ethology.mjs','src/brain/task-local-relay.mjs','src/brain/relay-inbox.mjs'];
export async function fingerprints(){return Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));}
export async function runArm(graph,seed,bearing,arm) {
  assert.ok(PLAN.seeds.includes(seed)&&PLAN.bearings.includes(bearing)&&PLAN.arms.includes(arm));
  if(arm.startsWith('neural'))return diagnoseArm(graph,seed,bearing,arm);
  const [dx,dy]=vectors[bearing],{receiverStart:start}=PLAN;
  const target={x:start.x+PLAN.targetDistance*dx,y:start.y+PLAN.targetDistance*dy,consumed:false};
  const observer={x:start.x+PLAN.observerDistance*dx,y:start.y+PLAN.observerDistance*dy};
  const world={food:[target],threats:[]};
  validateMotorSources(graph);
  const mode=arm==='motor-off'?'off':arm==='motor-single'?'single':'dual';
  let state=createState(graph,{seed,soulId:'diagnostic-receiver',branchId:'relay-diagnosis'});
  const initialStateHash=await hash(state),trace=[];
  let pending=[],collectedAt=null,edgeVisits=0;
  for(let round=1;round<=PLAN.rounds;round++) {
    const before={...state.body},local=observeLocal(world,before);
    const outgoing=round<PLAN.rounds?[
      ...observeLocal(world,observer).observations.map(o=>({id:`${round}:0:${o.channel}`,from:0,observedRound:round,deliveryRound:round+1,observer:{...observer},...o})),
      ...observeLocal(world,before).observations.map(o=>({id:`${round}:2:${o.channel}`,from:2,observedRound:round,deliveryRound:round+1,observer:{...before},...o}))]:[];
    const input=motorInput(pending,{to:1,round,body:before,observations:local.observations},mode);
    for(const pre of state.spikes)if(graph.metadata.nodes[pre].sign)edgeVisits+=graph.offsets[pre+1]-graph.offsets[pre];
    const stimulus=input.source===null?graph:
      {...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:[input.source]}}};
    state.signal=input.signal;state=step(state,stimulus,1);
    const distance2=(state.body.x-target.x)**2+(state.body.y-target.y)**2;
    if(!target.consumed&&distance2<=PLAN.pickupRadius**2){target.consumed=true;collectedAt=round;}
    trace.push({round,before,after:{...state.body},own:local.signal,applied:input.signal,error:input.error,
      source:input.source,received:structuredClone(pending),outgoing,distance2,spikes:[...state.spikes],
      heading:state.body.heading,stateHash:await hash(state)});
    pending=outgoing;
  }
  const first=p=>trace.find(p)?.round??null;
  return {seed,bearing,arm,observer,target:{x:target.x,y:target.y},initialStateHash,trace,
    budget:{neuronUpdates:graph.n*PLAN.rounds,edgeVisits},
    metrics:{collected:Number(collectedAt!==null),collectedAt,
      firstMovement:first(t=>t.before.x!==t.after.x||t.before.y!==t.after.y),
      finalDistance:Math.sqrt(trace.at(-1).distance2),
      netProgress:PLAN.targetDistance-Math.sqrt(trace.at(-1).distance2),
      meanAbsError:trace.reduce((n,t)=>n+Math.abs(t.error??0),0)/trace.length}};
}
export function summarize(rows) {
  return Object.fromEntries(PLAN.arms.map(arm=>{
    const r=rows.filter(r=>r.arm===arm);
    return [arm,{runs:r.length,collected:r.reduce((n,r)=>n+r.metrics.collected,0),
      meanNetProgress:r.reduce((n,r)=>n+r.metrics.netProgress,0)/r.length,
      byBearing:Object.fromEntries(PLAN.bearings.map(b=>[b,r.filter(r=>r.bearing===b).map(r=>r.metrics.netProgress)]))}];
  }));
}
export function separation(rows) {
  return PLAN.seeds.flatMap(seed=>PLAN.arms.map(arm=>{
    const t=rows.filter(r=>r.seed===seed&&r.arm===arm).map(r=>r.trace[1]);
    return {seed,arm,distinctApplied:new Set(t.map(t=>JSON.stringify(t.applied))).size,
      distinctSource:new Set(t.map(t=>JSON.stringify(t.source))).size,
      distinctState:new Set(t.map(t=>t.stateHash)).size};
  }));
}
export async function buildReport(sources) {
  const graph=await loadCommittedGraph(PLAN),rows=[],metadataHash=await hash(graph.metadata);
  for(const seed of PLAN.seeds)for(const bearing of PLAN.bearings)for(const arm of PLAN.arms) {
    const row=await runArm(graph,seed,bearing,arm);
    assert.deepEqual(await runArm(graph,seed,bearing,arm),row);
    rows.push(row);
  }
  assert.equal(await hash(graph.metadata),metadataHash,'graph metadata mutated');
  for(const r of rows.filter(r=>r.arm==='motor-off'))
    assert.ok(r.trace.every(t=>t.before.x===t.after.x&&t.before.y===t.after.y),'motor-off transport control must not move');
  const payload={schema:'iff.motor-input-study/1',audit:'SIM',plan:PLAN,planHash:await hash(PLAN),
    graph:graph.manifest,sources,rows,summary:summarize(rows),separation:separation(rows),executionCount:rows.length*2};
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
  const file=resolve(output??join(root,'reports/motor-input-v2.json')),sources=await fingerprints();
  const result=await buildReport(sources);
  assert.deepEqual(await fingerprints(),sources,'sources changed');
  if(command==='run')await writeFile(file,JSON.stringify(result)+'\n',{flag:'wx'});
  const saved=JSON.parse(await readFile(file,'utf8'));
  const {reportHash,...payload}=saved;
  assert.equal(await hash(payload),reportHash); assert.deepEqual(saved,result,'complete replay mismatch');
  console.log(JSON.stringify({file,reportHash,summary:result.summary,separation:result.separation},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
