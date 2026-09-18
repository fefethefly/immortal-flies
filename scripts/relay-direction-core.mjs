import assert from 'node:assert/strict';
import { hash, canonical } from '../src/brain/codec.mjs';
import { createState, step } from '../src/brain/runtime.mjs';
import { observeLocal } from '../src/brain/task-local-relay.mjs';
import { relayCohorts, routeRelayDirection, RELAY_DIRECTION } from '../src/brain/relay-direction.mjs';
import { PLAN as BASE, diagnoseArm } from './relay-diagnosis-core.mjs';
export const PLAN = {
  ...structuredClone(BASE), schema:'iff.relay-direction-plan/1',
  arms:['neural-off','neural-relay','neutral','directional','rotated'], adapter:RELAY_DIRECTION,
  limits:'Development only; previously observed seeds. Engineered arbitrary sensory cohorts, not anatomical bearings. No kernel, edges, weights, motor groups, local sensing or learning changes. Equal attempts only among routed arms, not against full scalar baseline. Closed-loop intensity and edge work may differ. No threats; no safety generalization.',
};
const vectors = {ahead:[1,0],right:[0,1],behind:[-1,0],left:[0,-1]};
export async function runArm(graph, seed, bearing, arm) {
  assert.ok(PLAN.seeds.includes(seed) && PLAN.bearings.includes(bearing) && PLAN.arms.includes(arm));
  if (arm.startsWith('neural')) return diagnoseArm(graph,seed,bearing,arm);
  const [dx,dy] = vectors[bearing], {receiverStart:start} = PLAN;
  const target = {x:start.x+PLAN.targetDistance*dx,y:start.y+PLAN.targetDistance*dy,consumed:false};
  const observer = {x:start.x+PLAN.observerDistance*dx,y:start.y+PLAN.observerDistance*dy};
  const world = {food:[target],threats:[]}, cohorts = relayCohorts(graph);
  let state = createState(graph,{seed,soulId:'diagnostic-receiver',branchId:'relay-diagnosis'});
  const initialStateHash = await hash(state), trace = [];
  let pending = [], collectedAt = null, edgeVisits = 0;
  for (let round=1;round<=PLAN.rounds;round++) {
    const before = {...state.body}, local = observeLocal(world,before);
    const outgoing = round<PLAN.rounds ? observeLocal(world,observer).observations.map(o=>({
      id:`${round}:0:${o.channel}`,from:0,observedRound:round,deliveryRound:round+1,observer,...o})) : [];
    const input = routeRelayDirection(pending,{to:1,round,body:before,own:local.signal},cohorts,arm);
    const routed = {...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:input.routing.selected}}};
    for (const pre of state.spikes) if(graph.metadata.nodes[pre].sign) edgeVisits += graph.offsets[pre+1]-graph.offsets[pre];
    const rngBefore = state.rng;
    state.signal = input.applied; state = step(state,routed,1);
    const distance2 = (state.body.x-target.x)**2+(state.body.y-target.y)**2;
    if(!target.consumed && distance2<=PLAN.pickupRadius**2) {target.consumed=true;collectedAt=round;}
    trace.push({round,before,after:{...state.body},own:local.signal,applied:input.applied,
      received:structuredClone(pending),outgoing,receipts:input.receipts,routing:input.routing,
      distance2,rngBefore,rngAfter:state.rng,spikes:[...state.spikes],
      neuralHash:await hash({voltage:state.voltage,refractory:state.refractory,spikes:state.spikes}),stateHash:await hash(state)});
    pending=outgoing;
  }
  const first = p=>trace.find(p)?.round??null;
  return {seed,bearing,arm,observer,target:{x:target.x,y:target.y},initialStateHash,trace,
    budget:{neuronUpdates:graph.n*PLAN.rounds,edgeVisits,foodAttempts:cohorts[0].length*PLAN.rounds,
      allSensoryAttempts:(cohorts[0].length+graph.metadata.groups.threat.length+graph.metadata.groups.light.length)*PLAN.rounds},
    metrics:{collected:Number(collectedAt!==null),collectedAt,
      firstMovement:first(t=>t.before.x!==t.after.x||t.before.y!==t.after.y),
      finalDistance:Math.sqrt(trace.at(-1).distance2),netProgress:PLAN.targetDistance-Math.sqrt(trace.at(-1).distance2)}};
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
    return {seed,arm,distinctApplied:new Set(t.map(t=>canonical(t.applied))).size,
      distinctRoutes:new Set(t.map(t=>canonical(t.routing?.selected??[]))).size,
      distinctSpikes:new Set(t.map(t=>canonical(t.spikes))).size,
      distinctState:new Set(t.map(t=>t.stateHash)).size};
  }));
}
