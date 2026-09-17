import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {encodeGraph,bindManifest} from "../src/brain/graph.mjs";
import {hash,hashBytes} from "../src/brain/codec.mjs";
import {orderedCohort,validateCohort,runSubsetArm,summarizeSubsets} from "../scripts/direction-subset-core.mjs";
import {runHoldoutArm} from "../scripts/direction-holdout-core.mjs";
import {selectBudgetSources} from "../scripts/direction-budget-core.mjs";
function fixture(){return bindManifest(encodeGraph({schema:"iff.connectome/1",
 nodes:Array.from({length:10},(_,i)=>({id:String(i+1),sign:1})),
 groups:{food:[0,1,2,3,4,5],threat:[0],light:[1],left:[6,7],right:[8,9]}},
 [{pre:0,post:6,weight:100},{pre:1,post:7,weight:100},{pre:3,post:8,weight:100},{pre:4,post:9,weight:100}]));}
const sides={food:{left:[0,1,2],right:[3,4,5]}};
test("subset order: deterministic permutations retain membership, budget and inputs",async()=>{
 const g=fixture(),before=structuredClone(g),original=structuredClone(sides);
 for(const order of ["index","subset-A","subset-B","subset-C"]){
  const c=await orderedCohort(g,sides,order);assert.equal(c.k,2);
  assert.deepEqual([...c.left].sort((a,b)=>a-b),sides.food.left);
  assert.deepEqual([...c.right].sort((a,b)=>a-b),sides.food.right);
  assert.deepEqual(await orderedCohort(g,sides,order),c);
  for(let t=0;t<10;t++)for(const arm of ["directional","swapped","neutral"]){
   const selected=selectBudgetSources(c,arm,1000,t);assert.equal(selected.length,2);assert.equal(new Set(selected).size,2);
  }
 }
 assert.deepEqual(g,before);assert.deepEqual(sides,original);
 await assert.rejects(orderedCohort(g,sides,"chosen-winner"));
 const c=await orderedCohort(g,sides,"index");
 assert.throws(()=>validateCohort(g,sides,{...c,k:4}));
 assert.throws(()=>validateCohort(g,sides,{...c,left:[0,1,6]}));
 assert.throws(()=>validateCohort(g,sides,{...c,left:[0,0,1]}));
});
test("subset runner: original ordering exactly reproduces bilateral holdout",async()=>{
 const g=fixture(),c=await orderedCohort(g,sides,"index");
 for(const heading of [0,90,180,270])for(const placement of ["ahead","left","right","behind"])for(const arm of ["directional","swapped","neutral"]){
  const options={seed:101,heading,placement,arm,rounds:3};
  const old=await runHoldoutArm(g,sides,{...options,axialPolicy:"bilateral"});
  const run=await runSubsetArm(g,sides,c,options);
  assert.equal(run.finalStateHash,old.finalStateHash);assert.equal(run.initialStateHash,old.initialStateHash);
  assert.deepEqual(run.events,old.events);assert.deepEqual(run.path,old.path);
  assert.deepEqual(run.trace.map(t=>t.budget),old.trace.map(t=>t.budget));
 }
});
test("subset runner: alternative order replays and rejects invalid geometry/budgets",async()=>{
 const g=fixture(),c=await orderedCohort(g,sides,"subset-B"),options={seed:101,heading:90,placement:"right",arm:"directional",rounds:3};
 const a=await runSubsetArm(g,sides,c,options);assert.deepEqual(await runSubsetArm(g,sides,c,options),a);
 for(const patch of [{seed:0},{rounds:0},{heading:45},{placement:"bad"},{arm:"bad"},{distance:400}])await assert.rejects(runSubsetArm(g,sides,c,{...options,...patch}));
});
test("subset report: fixed plan, full coverage, reconstructed traces and summary",async()=>{
 const root=new URL("../",import.meta.url);const r=JSON.parse(await readFile(new URL("reports/direction-subset-v1.json",root),"utf8"));
 const {reportHash,...payload}=r;assert.equal(await hash(payload),reportHash);
 assert.equal(await hash(r.plan),r.planHash);
 assert.deepEqual(r.plan,JSON.parse(await readFile(new URL("reports/direction-subset-plan-v1.json",root),"utf8")));
 for(const [p,h]of Object.entries(r.sources))assert.equal(await hashBytes(await readFile(new URL(p,root))),h,p);
 assert.equal(r.results.length,512);assert.equal(r.replayedArms,1536);
 assert.equal(new Set(r.results.map(x=>[x.order,x.seed,x.heading,x.placement].join(':'))).size,512);
 assert.deepEqual(summarizeSubsets(r.results),r.summary);
 for(const row of r.results){
  const cohort=r.cohorts[row.order];
  const arms=Object.values(row.arms);assert.equal(new Set(arms.map(a=>a.initialStateHash)).size,1);
  for(const a of arms){
   assert.equal(a.path.length,37);assert.equal(a.collected,a.events.length);
   const trace=a.inputs.map((input,t)=>({tick:t+1,input,selected:selectBudgetSources(cohort,a.arm,input.right,t),budget:a.budgets[t],
    distance2:(a.path[t+1][0]-a.target.x)**2+(a.path[t+1][1]-a.target.y)**2}));
   assert.equal(await hash(trace),a.traceHash);
  }
  for(let t=0;t<36;t++){
   assert.equal(new Set(arms.map(a=>a.budgets[t].rng)).size,1);
   assert.ok(arms.every(a=>a.budgets[t].attempts===22));
  }
 }
});
