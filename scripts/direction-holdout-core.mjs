import assert from "node:assert/strict";
import {integer, hash} from "../src/brain/codec.mjs";
import {createState, step} from "../src/brain/runtime.mjs";
import {observeLocal} from "../src/brain/task-local-relay.mjs";
import {encodeDirection} from "../src/brain/task-direction.mjs";
import {budgetCohort, selectBudgetSources, injectionBudget} from "./direction-budget-core.mjs";

export function targetOffset(heading, placement, distance=600) {
  assert.ok([0,90,180,270].includes(heading));
  integer(distance,401,999,"distance");
  const offsets={ahead:[distance,0],left:[0,-distance],right:[0,distance],behind:[-distance,0]};
  assert.ok(Object.hasOwn(offsets,placement));
  const [x,y]=offsets[placement];
  // Integer quarter-turns in screen coordinates, no trigonometric rounding.
  return [[x,y],[-y,x],[-x,-y],[y,-x]][heading/90].map(v=>v||0);
}
export async function runHoldoutArm(graph,sides,{
 seed,heading,placement,arm,axialPolicy,rounds=36,distance=600
}) {
  integer(seed,1,0xffffffff,"seed");integer(rounds,1,128,"rounds");
  assert.ok(["bilateral","silent"].includes(axialPolicy));
  const [dx,dy]=targetOffset(heading,placement,distance);
  const cohort=budgetCohort(graph,sides);
  // Validate arm even before the first step.
  selectBudgetSources(cohort,arm,0,0);
  let s=createState(graph,{seed,soulId:"budget-study",branchId:"experimental"});
  s.body.heading=heading; // Initial condition only; stepping never overrides heading.
  const initialStateHash=await hash(s);
  const target={x:5000+dx,y:5000+dy,consumed:false};
  const world={food:[target],threats:[]};
  const path=[[s.body.x,s.body.y,s.body.heading]],trace=[],events=[];
  for(let tick=0;tick<rounds;tick++) {
    const input=encodeDirection(observeLocal(world,s.body).observations,s.body).channels.food;
    const suppressed=axialPolicy==="silent" && input.right===0;
    const intensity=suppressed?0:input.intensity;
    const selected=selectBudgetSources(cohort,arm,input.right,tick);
    const budget=injectionBudget(s.rng,cohort.k,intensity);
    const view={...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:selected,threat:[],light:[]}}};
    s.signal={food:intensity,threat:0,light:0};s=step(s,view,1);
    assert.equal(s.rng,budget.rng);
    const d2=(s.body.x-target.x)**2+(s.body.y-target.y)**2;
    if(!target.consumed && d2<=400**2){target.consumed=true;events.push(tick+1);}
    path.push([s.body.x,s.body.y,s.body.heading]);
    trace.push({tick:tick+1,input,intensity,suppressed,selected,budget,distance2:d2});
  }
  return {seed,heading,placement,arm,axialPolicy,rounds,distance,k:cohort.k,
    target:{x:target.x,y:target.y},initialStateHash,collected:events.length,events,path,trace,
    finalStateHash:await hash(s)};
}
export function pairedStats(rows, treatment, control) {
  let wins=0,ties=0,losses=0,delta=0;
  for(const row of rows){const d=row.arms[treatment].collected-row.arms[control].collected;
    delta+=d;if(d>0)wins++;else if(d<0)losses++;else ties++;}
  return {n:rows.length,wins,ties,losses,delta};
}
export function summarizeHoldout(results) {
  const output={};
  for(const policy of ["bilateral","silent"]){
    const rows=results.filter(r=>r.axialPolicy===policy);
    const collected=group=>Object.fromEntries(["directional","swapped","neutral"].map(a=>[a,group.reduce((n,r)=>n+r.arms[a].collected,0)]));
    const strata=key=>Object.fromEntries([...new Set(rows.map(r=>r[key]))].map(value=>{
      const subset=rows.filter(r=>r[key]===value);
      return [value,{collected:collected(subset),vsNeutral:pairedStats(subset,"directional","neutral")}];
    }));
    output[policy]={scenarios:rows.length,collected:collected(rows),
      vsNeutral:pairedStats(rows,"directional","neutral"),vsSwapped:pairedStats(rows,"directional","swapped"),
      bySeed:strata("seed"),byHeading:strata("heading"),byPlacement:strata("placement")};
  }
  const axial={};
  for(const arm of ["directional","swapped","neutral"]){
    let wins=0,ties=0,losses=0,delta=0;
    for(const row of results.filter(r=>r.axialPolicy==="bilateral")){
      const other=results.find(r=>r.axialPolicy==="silent"&&r.seed===row.seed&&r.heading===row.heading&&r.placement===row.placement);
      assert.ok(other);const d=row.arms[arm].collected-other.arms[arm].collected;
      delta+=d;if(d>0)wins++;else if(d<0)losses++;else ties++;
    }
    axial[arm]={wins,ties,losses,delta};
  }
  return {policies:output,bilateralVsSilent:axial};
}
