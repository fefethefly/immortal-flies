import assert from 'node:assert/strict';
import {hash} from '../src/brain/codec.mjs';
import {createState,step} from '../src/brain/runtime.mjs';
import {observeLocal} from '../src/brain/task-local-relay.mjs';
import {receiveRelayInbox} from '../src/brain/relay-inbox.mjs';
import {motorInput,validateMotorSources,MOTOR_INPUT} from '../src/brain/relay-motor-input.mjs';
import {PLAN as BASE} from './relay-diagnosis-core.mjs';

export const PLAN={
  schema:'iff.motor-ablation-plan/1',audit:'SIM',status:'local plan before execution; not external preregistration or blind holdout',
  graph:structuredClone(BASE.graph),controller:structuredClone(MOTOR_INPUT),
  seeds:[305,306,307,308,309,310,311,312],headings:[0,45],bearings:[...BASE.bearings],
  arms:['scalar','dual','no-message','scrambled'],rounds:160,
  start:{x:5000,y:5000},targetRadius:1200,observerRadius:1800,pickupRadius:400,
  geometry:'eight compass vectors; diagonals use rounded radius/sqrt(2); report actual distance',
  transport:'only observer 0 sends to receiver 1; no disguised self-relay; one-round delay; no memory',
  scramble:'each delivered x/y = (original + 5000) % 10000; explicit misinformation, not truth',
  primary:'collection within 160 rounds; paired dual minus other arms by geometry; no significance claim',
  secondary:'net distance reduction, first collection, source wiring, seed-invariant neural/body traces',
  limits:'0/1000 controller drive makes seed replicates behaviorally redundant. Changed heading provides limited geometry stress, not broad generalization. Scalar gain and food group size differ; time budget matched, effective stimulation and compute not matched. No threats, learning, controller tuning, production integration or swarm capability claim.',
};
const axes=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
export function geometry(heading,bearing) {
  assert.ok(PLAN.headings.includes(heading)&&PLAN.bearings.includes(bearing));
  const [dx,dy]=axes[(heading/45+2*PLAN.bearings.indexOf(bearing))%8];
  const point=radius=>{const scale=dx&&dy?Math.round(radius/Math.sqrt(2)):radius;
    return {x:PLAN.start.x+dx*scale,y:PLAN.start.y+dy*scale};};
  return {target:point(PLAN.targetRadius),observer:point(PLAN.observerRadius)};
}
export function delivery(pending,arm) {
  assert.ok(PLAN.arms.includes(arm));
  if(arm==='no-message')return [];
  return pending.map(m=>arm==='scrambled'?{...structuredClone(m),x:(m.x+5000)%10000,y:(m.y+5000)%10000}:structuredClone(m));
}
export async function runArm(graph,{seed,heading,bearing,arm}) {
  assert.ok(PLAN.seeds.includes(seed)&&PLAN.arms.includes(arm));
  validateMotorSources(graph);
  const {target,observer}=geometry(heading,bearing),world={food:[{...target,consumed:false}],threats:[]};
  const d2=b=>(target.x-b.x)**2+(target.y-b.y)**2;
  let s=createState(graph,{seed,soulId:'ablation-receiver',branchId:'motor-ablation'});
  s.body.heading=heading;
  const initialDistance=Math.sqrt(d2(s.body)),trace=[],initialStateHash=await hash(s);
  let pending=[],collectedAt=null,edgeVisits=0;
  for(let round=1;round<=PLAN.rounds;round++) {
    const before={...s.body},local=observeLocal(world,before);
    const outgoing=round<PLAN.rounds?observeLocal(world,observer).observations.map(o=>({
      id:`${round}:0:${o.channel}`,from:0,observedRound:round,deliveryRound:round+1,observer:{...observer},...o})):[];
    const received=delivery(pending,arm);
    const input=arm==='scalar'?{signal:receiveRelayInbox(received,{to:1,round,body:before,own:local.signal}).applied,source:null}
      :motorInput(received,{to:1,round,body:before,observations:local.observations},'dual');
    // Keep one silent source even without a target: constant draw budget for
    // calibrated arms. Its 0 intensity cannot inject current. Record wiring.
    const selected=arm==='scalar'?[...graph.metadata.groups.food]:[input.source??MOTOR_INPUT.forward];
    assert.ok(selected.every(i=>graph.metadata.groups.food.includes(i)));
    const view={...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:selected}}};
    for(const pre of s.spikes)if(graph.metadata.nodes[pre].sign)edgeVisits+=graph.offsets[pre+1]-graph.offsets[pre];
    const rngBefore=s.rng;s.signal=input.signal;s=step(s,view,1);
    if(collectedAt===null&&d2(s.body)<=PLAN.pickupRadius**2){collectedAt=round;world.food[0].consumed=true;}
    trace.push({round,before,after:{...s.body},local,received,outgoing,
      input,selected,rngBefore,rngAfter:s.rng,spikes:[...s.spikes],
      neuralHash:await hash({voltage:s.voltage,refractory:s.refractory,spikes:s.spikes}),distance2:d2(s.body)});
    pending=outgoing;
  }
  return {seed,heading,bearing,arm,target,observer,initialStateHash,finalStateHash:await hash(s),trace,
    budget:{steps:PLAN.rounds,neuronUpdates:PLAN.rounds*graph.n,edgeVisits,
      foodAttempts:trace.reduce((n,t)=>n+t.selected.length,0),deliveries:trace.reduce((n,t)=>n+t.received.length,0)},
    metrics:{collected:Number(collectedAt!==null),collectedAt,initialDistance,finalDistance:Math.sqrt(d2(s.body)),
      netProgress:initialDistance-Math.sqrt(d2(s.body)),closestDistance:Math.sqrt(Math.min(initialDistance**2,...trace.map(t=>t.distance2)))}};
}
