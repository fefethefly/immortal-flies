import assert from 'node:assert/strict';
import { hash, canonical } from '../src/brain/codec.mjs';
import { createState, step } from '../src/brain/runtime.mjs';
import { observeLocal } from '../src/brain/task-local-relay.mjs';
import { receiveRelayInbox } from '../src/brain/relay-inbox.mjs';
export const PLAN = {
  schema:'iff.relay-diagnosis-plan/1', audit:'SIM', status:'development diagnostic, not held-out validation',
  graph:{id:'malecns-circuit',sourceCommit:'df7b372cba4079bbd488f0fcbe5eb182feece3aa',
    metadataSha256:'0x7623082c058a626759164e83e666b628396669d115eeaeb1c8afef654a1adca9',
    connectivitySha256:'0x4278c3cae84471b8a808391d5de5eddf8e54a2b75e01f8596743ec07e2f1e843'},
  seeds:[301,302,303,304],bearings:['ahead','right','behind','left'],rounds:48,
  receiverStart:{x:5000,y:5000},targetDistance:1200,observerDistance:1800,pickupRadius:400,
  arms:['neural-off','neural-relay','handwritten-off','handwritten-relay'],
  limits:'Stationary observer broadcasts real local observations but cannot collect. One receiver, no competition or threats. Diagnostic intervention, not full swarm task. Handwritten controller has different compute and actuation; not a matched neural capability baseline.'
};
const vectors={ahead:[1,0],right:[0,1],behind:[-1,0],left:[0,-1]};
const d2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
export async function diagnoseArm(graph,seed,bearing,arm) {
  assert.ok(PLAN.seeds.includes(seed)&&PLAN.bearings.includes(bearing)&&PLAN.arms.includes(arm));
  const [dx,dy]=vectors[bearing], target={x:5000+1200*dx,y:5000+1200*dy,consumed:false};
  const observer={x:5000+1800*dx,y:5000+1800*dy};
  const world={food:[target],threats:[]};
  let state=createState(graph,{seed,soulId:'diagnostic-receiver',branchId:'relay-diagnosis'});
  const initialStateHash=await hash(state),trace=[];
  let pending=[],collectedAt=null;
  const neural=arm.startsWith('neural'), relay=arm.endsWith('relay');
  for(let round=1;round<=PLAN.rounds;round++) {
    const before={...state.body},local=observeLocal(world,before);
    const outgoing=relay&&round<PLAN.rounds?observeLocal(world,observer).observations.map(o=>({
      id:`${round}:0:${o.channel}`,from:0,observedRound:round,deliveryRound:round+1,observer,...o})):[];
    const inbox=receiveRelayInbox(pending,{to:1,round,body:before,own:local.signal});
    const rngBefore=state.rng;
    if(neural) {state.signal=inbox.applied;state=step(state,graph,1);}
    else {
      // Handwritten control reads only local observation and the delivered payload.
      const observations=[...local.observations,...pending];
      const nearest=observations.filter(o=>o.channel==='food').sort((a,b)=>d2(before,a)-d2(before,b))[0];
      if(nearest) {
        state.body.x+=Math.sign(nearest.x-before.x)*Math.min(35,Math.abs(nearest.x-before.x));
        state.body.y+=Math.sign(nearest.y-before.y)*Math.min(35,Math.abs(nearest.y-before.y));
      }
    }
    const distance2=d2(state.body,target);
    if(!target.consumed&&distance2<=PLAN.pickupRadius**2){target.consumed=true;collectedAt=round;}
    trace.push({round,before,after:{...state.body},own:local.signal,applied:inbox.applied,
      received:structuredClone(pending),outgoing,receipts:inbox.receipts,distance2,
      rngBefore,rngAfter:state.rng,spikes:neural?[...state.spikes]:[],
      stateHash:neural?await hash(state):null});
    pending=outgoing;
  }
  const first=predicate=>trace.find(predicate)?.round??null;
  return {seed,bearing,arm,observer,target:{x:target.x,y:target.y},initialStateHash,trace,
    metrics:{collected:Number(collectedAt!==null),collectedAt,
      firstReceipt:first(t=>t.received.length>0),firstInputGain:first(t=>t.applied.food>t.own.food),
      firstMovement:first(t=>t.before.x!==t.after.x||t.before.y!==t.after.y),
      initialDistance:1200,finalDistance:Math.sqrt(trace.at(-1).distance2),
      closestDistance:Math.sqrt(Math.min(1200**2,...trace.map(t=>t.distance2))),
      netProgress:1200-Math.sqrt(trace.at(-1).distance2),
      received:trace.reduce((n,t)=>n+t.received.length,0)}};
}
export function summarize(rows) {
  const out={};
  for(const arm of PLAN.arms) {
    const r=rows.filter(r=>r.arm===arm);
    out[arm]={runs:r.length,collected:r.reduce((n,r)=>n+r.metrics.collected,0),
      meanNetProgress:r.reduce((n,r)=>n+r.metrics.netProgress,0)/r.length,
      byBearing:Object.fromEntries(PLAN.bearings.map(b=>{
        const s=r.filter(r=>r.bearing===b);return [b,{collected:s.reduce((n,r)=>n+r.metrics.collected,0),
          progress:s.map(r=>r.metrics.netProgress),firstInputGain:s.map(r=>r.metrics.firstInputGain)}];}))};
  }
  return out;
}
export function firstDivergence(a,b,key) {
  return a.trace.find((t,i)=>canonical(t[key])!==canonical(b.trace[i][key]))?.round??null;
}
