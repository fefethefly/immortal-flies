import {canonical,hash,integer,requireValue} from './codec.mjs';
import {receiveAdmitted,createAdmissionState,OBSERVATION_SCHEMA} from './relay-admission.mjs';
import {observeLocal} from './task-local-relay.mjs';
import {navigate,NAVIGATION_POLICY} from './task-navigation-control.mjs';

export const TASK_MODES=Object.freeze(['valid','duplicate','expired','session','conflict','off']);
export const PROTOCOL_TASK=Object.freeze({
  id:'admitted-forage-demo/1',schema:'iff.protocol-task-checkpoint/1',rounds:48,
  controller:NAVIGATION_POLICY.id,substrate:'handwritten-not-neural',
  settlement:'first eligible receiver in fixed roster; consumed food cannot settle twice',
});
// Fixed inputs are reconstructed by verifier, never trusted from the artifact.
export function taskPlan(mode='valid'){
  requireValue(TASK_MODES.includes(mode),'TASK_MODE');
  return {policy:PROTOCOL_TASK,mode,sessionId:'sim:protocol-task-1',task:'forage-v1',envId:'sim:protocol-task-world',
    observer:{instanceId:'sim:observer',body:{x:6800,y:5000}},
    receivers:[{instanceId:'sim:receiver-a',body:{x:5000,y:5000}},{instanceId:'sim:receiver-b',body:{x:5000,y:5000}}],
    world:{food:[{x:6200,y:5000,consumed:false}],threats:[]},
    limits:'Fixed trusted SIM roster, not network authentication. No learning, neural simulation, real funds or independent cooperation evidence. Duplicate receivers intentionally test settlement ties.'};
}
const d2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
const wireBytes=m=>new TextEncoder().encode(canonical(m)).byteLength;
function scope(plan,worldHash,receiver,round,own){
  return {task:plan.task,envId:plan.envId,worldHash,sessionId:plan.sessionId,
    members:[plan.observer.instanceId,...plan.receivers.map(r=>r.instanceId)],
    recipient:receiver.instanceId,round,body:receiver.body,own};
}
export async function createTask(mode='valid'){
  const plan=taskPlan(mode),worldHash=await hash({task:plan.task,envId:plan.envId,world:plan.world});
  const receivers=plan.receivers.map(r=>({...structuredClone(r),admission:createAdmissionState(scope(plan,worldHash,r,1,{food:0,threat:0,light:0}))}));
  return {schema:PROTOCOL_TASK.schema,audit:'SIM',plan,worldHash,round:0,world:structuredClone(plan.world),
    observer:structuredClone(plan.observer),receivers,pending:[],ledger:[],trace:[],
    budget:{actionSteps:0,neuralSteps:0,sent:0,rawDeliveries:0,acceptedDeliveries:0,rejectedDeliveries:0,rawBytes:0}};
}
function mutateWire(message,mode){
  const m=structuredClone(message);
  if(mode==='duplicate')return [m,structuredClone(m)];
  if(mode==='session')return [{...m,sessionId:'sim:foreign-session'}];
  if(mode==='conflict')return [m,{...m,x:(m.x+1)%10001}];
  return [m];
}
// Trusted-state step. Public advanceTask validates restored state by replay.
function tick(previous){
  const s=structuredClone(previous),{plan}=s,round=s.round+1;
  const delay=plan.mode==='expired'?2:1;
  const observations=observeLocal(s.world,s.observer.body).observations;
  const outgoing=plan.mode!=='off'&&round+delay<=PROTOCOL_TASK.rounds?observations.map(o=>({
    deliveryRound:round+delay,message:{schema:OBSERVATION_SCHEMA,id:`${round}:observer:${o.channel}`,
      task:plan.task,envId:plan.envId,worldHash:s.worldHash,sessionId:plan.sessionId,
      instanceId:s.observer.instanceId,observedRound:round,...o,observer:{...s.observer.body}}})):[];
  const wire=s.pending.filter(p=>p.deliveryRound===round).flatMap(p=>mutateWire(p.message,plan.mode));
  const frames=s.receivers.map(receiver=>{
    const before={...receiver.body},own=observeLocal(s.world,before);
    const inbox=receiveAdmitted(wire,scope(plan,s.worldHash,receiver,round,own.signal),receiver.admission);
    const known=[...own.observations,...inbox.accepted.map(({channel,x,y})=>({channel,x,y}))];
    const action=navigate(before,known);
    receiver.body={x:Math.max(0,Math.min(10000,before.x+action.dx)),y:Math.max(0,Math.min(10000,before.y+action.dy))};
    receiver.admission=inbox.state;
    s.budget.actionSteps++;s.budget.rawDeliveries+=wire.length;
    s.budget.acceptedDeliveries+=inbox.accepted.length;
    s.budget.rejectedDeliveries+=inbox.decisions.filter(d=>!d.accepted).length;
    s.budget.rawBytes+=wire.reduce((n,m)=>n+wireBytes(m),0);
    return {instanceId:receiver.instanceId,before,own,wire:structuredClone(wire),accepted:inbox.accepted,
      decisions:inbox.decisions,scalarApplied:inbox.applied,action,after:{...receiver.body}};
  });
  const settlements=[];
  s.world.food.forEach((food,index)=>{
    if(food.consumed)return;
    const eligible=s.receivers.filter(r=>d2(r.body,food)<=400**2);
    if(!eligible.length)return;
    const winner=eligible[0];food.consumed=true;
    const event={id:`food:${index}`,round,index,winner:winner.instanceId,eligible:eligible.map(r=>r.instanceId),
      actionRef:{round,instanceId:winner.instanceId},body:{...winner.body}};
    s.ledger.push(event);settlements.push(event);
  });
  s.budget.sent+=outgoing.length;s.round=round;
  s.pending=[...s.pending.filter(p=>p.deliveryRound>round),...outgoing];
  s.trace.push({round,observerObservations:observations,outgoing,frames,settlements});
  return s;
}

export async function replayTask(mode,round){
  integer(round,0,PROTOCOL_TASK.rounds,'round');let state=await createTask(mode);
  while(state.round<round)state=tick(state);
  return state;
}
export async function validateTask(state,expectedMode=state?.plan?.mode){
  requireValue(state?.schema===PROTOCOL_TASK.schema&&state.audit==='SIM','TASK_SCHEMA');
  integer(state.round,0,PROTOCOL_TASK.rounds,'round');
  requireValue(canonical(state.plan)===canonical(taskPlan(expectedMode)),'TASK_PLAN');
  const replay=await replayTask(expectedMode,state.round);
  requireValue(canonical(state)===canonical(replay),'TASK_REPLAY');
  return true;
}
export async function advanceTask(state,toRound=PROTOCOL_TASK.rounds){
  await validateTask(state);integer(toRound,state.round,PROTOCOL_TASK.rounds,'toRound');
  let next=structuredClone(state);while(next.round<toRound)next=tick(next);return next;
}
export async function checkpointTask(state){
  await validateTask(state);
  const payload={schema:'iff.protocol-task-artifact/1',audit:'SIM',state:structuredClone(state)};
  return {...payload,checkpointHash:await hash(payload)};
}
export async function restoreTask(artifact,expectedMode){
  requireValue(artifact?.schema==='iff.protocol-task-artifact/1'&&artifact.audit==='SIM','CHECKPOINT_SCHEMA');
  const {checkpointHash,...payload}=artifact;
  requireValue(await hash(payload)===checkpointHash,'CHECKPOINT_HASH');
  // Require caller-selected mode: artifact cannot silently select another task.
  requireValue(TASK_MODES.includes(expectedMode),'TASK_MODE');
  await validateTask(artifact.state,expectedMode);
  return structuredClone(artifact.state);
}
