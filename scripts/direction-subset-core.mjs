import assert from "node:assert/strict";
import {integer, hash, hashBytes} from "../src/brain/codec.mjs";
import {createState, step} from "../src/brain/runtime.mjs";
import {observeLocal} from "../src/brain/task-local-relay.mjs";
import {encodeDirection} from "../src/brain/task-direction.mjs";
import {budgetCohort,selectBudgetSources,injectionBudget} from "./direction-budget-core.mjs";
import {targetOffset,pairedStats} from "./direction-holdout-core.mjs";

export async function orderedCohort(graph,sides,order) {
  assert.ok(["index","subset-A","subset-B","subset-C"].includes(order));
  const cohort=budgetCohort(graph,sides);
  if(order==="index")return cohort;
  const encoder=new TextEncoder();
  for(const side of ["left","right"]){
    const keys=await Promise.all(cohort[side].map(async i=>({i,id:graph.metadata.nodes[i].id,
      key:await hashBytes(encoder.encode(`${order}:${side}:${graph.metadata.nodes[i].id}`))})));
    keys.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:a.id<b.id?-1:a.id>b.id?1:0);
    cohort[side]=keys.map(x=>x.i);
  }
  return cohort;
}
export function validateCohort(graph,sides,cohort){
  const original=budgetCohort(graph,sides);
  assert.equal(cohort.k,original.k);
  for(const side of ["left","right"]){
    assert.ok(Array.isArray(cohort[side]));
    assert.deepEqual([...cohort[side]].sort((a,b)=>a-b),original[side]);
  }
}
export async function runSubsetArm(graph,sides,cohort,{seed,heading,placement,arm,rounds=36,distance=600}){
  validateCohort(graph,sides,cohort);
  integer(seed,1,0xffffffff,"seed");integer(rounds,1,128,"rounds");
  const [dx,dy]=targetOffset(heading,placement,distance);
  selectBudgetSources(cohort,arm,0,0);
  let s=createState(graph,{seed,soulId:"budget-study",branchId:"experimental"});
  s.body.heading=heading;
  const initialStateHash=await hash(s);
  const target={x:5000+dx,y:5000+dy,consumed:false};
  const world={food:[target],threats:[]},path=[[5000,5000,heading]],trace=[],events=[];
  for(let tick=0;tick<rounds;tick++){
    const input=encodeDirection(observeLocal(world,s.body).observations,s.body).channels.food;
    const selected=selectBudgetSources(cohort,arm,input.right,tick);
    const budget=injectionBudget(s.rng,cohort.k,input.intensity);
    const view={...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:selected,threat:[],light:[]}}};
    s.signal={food:input.intensity,threat:0,light:0};s=step(s,view,1);
    assert.equal(s.rng,budget.rng);
    const d2=(s.body.x-target.x)**2+(s.body.y-target.y)**2;
    if(!target.consumed&&d2<=400**2){target.consumed=true;events.push(tick+1);}
    path.push([s.body.x,s.body.y,s.body.heading]);
    trace.push({tick:tick+1,input,selected,budget,distance2:d2});
  }
  return {seed,heading,placement,arm,rounds,distance,k:cohort.k,initialStateHash,
    target:{x:target.x,y:target.y},collected:events.length,events,path,trace,finalStateHash:await hash(s)};
}
export function summarizeSubsets(results){
  const summary={};
  const summarize=rows=>({scenarios:rows.length,
    collected:Object.fromEntries(["directional","swapped","neutral"].map(a=>[a,rows.reduce((n,r)=>n+r.arms[a].collected,0)])),
    vsNeutral:pairedStats(rows,"directional","neutral"),vsSwapped:pairedStats(rows,"directional","swapped")});
  for(const order of [...new Set(results.map(r=>r.order))]){
    const rows=results.filter(r=>r.order===order);
    const strata=key=>Object.fromEntries([...new Set(rows.map(r=>r[key]))].map(v=>[v,summarize(rows.filter(r=>r[key]===v))]));
    summary[order]={...summarize(rows),bySeed:strata("seed"),byHeading:strata("heading"),byPlacement:strata("placement")};
  }
  return summary;
}
