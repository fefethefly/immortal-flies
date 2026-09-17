import assert from "node:assert/strict";
import {integer, hash} from "../src/brain/codec.mjs";
import {createState, step} from "../src/brain/runtime.mjs";
import {observeLocal} from "../src/brain/task-local-relay.mjs";
import {encodeDirection} from "../src/brain/task-direction.mjs";
import {budgetCohort, selectBudgetSources, injectionBudget} from "./direction-budget-core.mjs";
import {targetOffset} from "./direction-holdout-core.mjs";

export function l2oCohort(graph,sides,exclude){
  if(exclude!==null){
    integer(exclude,0,graph.n-1,"exclude index");
    const members=new Set([...sides.food.left,...sides.food.right]);
    assert.ok(members.has(exclude),"excluded node must be a cohort member");
  }
  const base=budgetCohort(graph,sides);
  const drop=side=>base[side].filter(i=>i!==exclude);
  const left=exclude===null?base.left:drop("left"),right=exclude===null?base.right:drop("right");
  assert.equal(left.length+right.length,base.left.length+base.right.length-(exclude===null?0:1));
  assert.ok(!left.includes(exclude)&&!right.includes(exclude));
  // Equal-budget invariant: k is recomputed by budgetCohort from remaining sides.
  const k=2*Math.floor(Math.min(left.length,right.length)/2);
  assert.equal(k,base.k,"leave-one-out must not change the per-tick budget");
  return {left,right,k,excluded:exclude};
}
export async function runL2OArm(graph,cohort,{seed,heading,placement,arm,rounds=36,distance=600}){
  integer(seed,1,0xffffffff,"seed");integer(rounds,1,128,"rounds");
  assert.ok(["directional","neutral"].includes(arm));
  const [dx,dy]=targetOffset(heading,placement,distance);
  selectBudgetSources(cohort,arm,0,0);
  let s=createState(graph,{seed,soulId:"budget-study",branchId:"experimental"});
  s.body.heading=heading;
  const initialStateHash=await hash(s);
  const target={x:5000+dx,y:5000+dy,consumed:false};
  const world={food:[target],threats:[]},path=[[5000,5000,heading]],events=[],trace=[];
  for(let tick=0;tick<rounds;tick++){
    const input=encodeDirection(observeLocal(world,s.body).observations,s.body).channels.food;
    const selected=selectBudgetSources(cohort,arm,input.right,tick);
    const budget=injectionBudget(s.rng,cohort.k,input.intensity);
    const view={...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:selected,threat:[],light:[]}}};
    s.signal={food:input.intensity,threat:0,light:0};s=step(s,view,1);
    assert.equal(s.rng,budget.rng);
    const d2=(s.body.x-target.x)**2+(s.body.y-target.y)**2;
    if(!target.consumed&&d2<=400**2){target.consumed=true;events.push(tick+1);}
    assert.equal(selected.length,cohort.k);assert.equal(new Set(selected).size,cohort.k);
    assert.ok(!selected.includes(cohort.excluded));
    trace.push({tick:tick+1,input,selected,budget,distance2:d2});
    path.push([s.body.x,s.body.y,s.body.heading]);
  }
  return {seed,heading,placement,arm,rounds,distance,k:cohort.k,excluded:cohort.excluded,
    initialStateHash,collected:events.length,events,path,trace,
    pathHash:await hash(path),finalStateHash:await hash(s)};
}
export function summarizeL2O(rows,control){
  const paired=(group)=>{let wins=0,ties=0,losses=0,delta=0;
    for(const r of group){const d=r.arms.directional.collected-r.arms.neutral.collected;
      delta+=d;if(d>0)wins++;else if(d<0)losses++;else ties++;}
    return {n:group.length,wins,ties,losses,delta};};
  const collect=group=>Object.fromEntries(["directional","neutral"].map(a=>[a,group.reduce((n,r)=>n+r.arms[a].collected,0)]));
  const key=r=>`${r.seed}:${r.heading}:${r.placement}`;
  const controls=new Map(control.map(r=>[key(r),r]));
  assert.equal(controls.size,control.length,"duplicate control scenario");
  const summarize=group=>({scenarios:group.length,collected:collect(group),vsNeutral:paired(group)});
  const out={control:summarize(control),exclusions:{}};
  for(const excluded of [...new Set(rows.map(r=>r.excluded))].sort((a,b)=>a-b)){
    const group=rows.filter(r=>r.excluded===excluded);
    assert.equal(group.length,control.length,"incomplete exclusion");
    assert.equal(new Set(group.map(key)).size,control.length,"duplicate exclusion scenario");
    assert.ok(group.every(r=>controls.has(key(r))),"unmatched scenario");
    const stats=summarize(group);
    out.exclusions[excluded]={...stats,
      bySeed:Object.fromEntries([...new Set(group.map(r=>r.seed))].map(seed=>[seed,summarize(group.filter(r=>r.seed===seed))])),
      deltaVsControl:{directional:stats.collected.directional-out.control.collected.directional,
        neutral:stats.collected.neutral-out.control.collected.neutral,
        margin:stats.vsNeutral.delta-out.control.vsNeutral.delta,
        wins:stats.vsNeutral.wins-out.control.vsNeutral.wins}};
  }
  return out;
}
