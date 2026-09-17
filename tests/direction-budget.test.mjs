import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {encodeGraph,bindManifest} from "../src/brain/graph.mjs";
import {budgetCohort,selectBudgetSources,injectionBudget,runBudgetArm} from "../scripts/direction-budget-core.mjs";
import {hash,hashBytes} from "../src/brain/codec.mjs";
function fixture(){return bindManifest(encodeGraph({schema:"iff.connectome/1",
 nodes:Array.from({length:10},(_,i)=>({id:String(i+1),sign:1})),
 groups:{food:[0,1,2,3,4,5],threat:[0],light:[1],left:[6,7],right:[8,9]}},
 [{pre:0,post:6,weight:100},{pre:1,post:7,weight:100},{pre:3,post:8,weight:100},{pre:4,post:9,weight:100}]));}
const sides={food:{left:[0,1,2],right:[3,4,5]}};
test("budget cohort: equal count, disjoint sensory routing, rotation and bilateral forward input",()=>{
 const g=fixture(),c=budgetCohort(g,sides);assert.equal(c.k,2);
 for(let t=0;t<12;t++)for(const arm of ["directional","swapped","neutral"])for(const direction of [-1000,0,1000]){
  const selected=selectBudgetSources(c,arm,direction,t);assert.equal(selected.length,2);assert.equal(new Set(selected).size,2);
  assert.ok(selected.every(i=>g.metadata.groups.food.includes(i)));
  if(direction===0||arm==="neutral"){assert.ok(c.left.includes(selected[0]));assert.ok(c.right.includes(selected[1]));}
 }
 assert.deepEqual(selectBudgetSources(c,"directional",1000,1),[4,5]);
 assert.deepEqual(selectBudgetSources(c,"swapped",1000,1),[1,2]);
 assert.throws(()=>budgetCohort(g,{food:{left:[0,6],right:[3,4]}}));
 assert.throws(()=>budgetCohort(g,{food:{left:[0,1],right:[1,2]}}));
 assert.throws(()=>selectBudgetSources(c,"unknown",0,0));
});
test("budget: open-loop RNG and attempted current match across arms using actual runtime",async()=>{
 const g=fixture(),before=structuredClone(g);const runs=[];
 for(const arm of ["directional","swapped","neutral"])runs.push(await runBudgetArm(g,sides,{mode:"open",arm,dx:0,dy:600,rounds:6}));
 for(let t=0;t<6;t++){
  assert.deepEqual(runs[0].trace[t].budget,runs[1].trace[t].budget);
  assert.deepEqual(runs[0].trace[t].budget,runs[2].trace[t].budget);
 }
 assert.deepEqual(g,before);
 assert.deepEqual(await runBudgetArm(g,sides,{mode:"open",dx:0,dy:600,rounds:6}),runs[0]);
 const ahead=await runBudgetArm(g,sides,{dx:600,dy:0,rounds:1});assert.equal(ahead.trace[0].input.intensity,576);assert.equal(ahead.trace[0].selected.length,2);
 assert.equal(injectionBudget(43,2,0).successes,0);assert.equal(injectionBudget(43,2,1000).successes,2);
 for(const config of [{rounds:0},{seed:0},{mode:"bad"},{dx:0,dy:0},{dx:999,dy:999}])await assert.rejects(runBudgetArm(g,sides,config));
});
test("budget report: sources, replay budget invariants and aggregate outcomes independently recompute",async()=>{
 const root=new URL("../",import.meta.url);const r=JSON.parse(await readFile(new URL("reports/direction-budget-v1.json",root),"utf8"));
 const {reportHash,...payload}=r;assert.equal(await hash(payload),reportHash);
 for(const [p,h]of Object.entries(r.sources))assert.equal(await hashBytes(await readFile(new URL(p,root))),h,p);
 assert.equal(r.results.length,32);
 for(const row of r.results){
  const arms=Object.values(row.arms);assert.equal(arms.length,3);
  for(let t=0;t<arms[0].rounds;t++){
   const frames=arms.map(a=>a.trace[t]);assert.equal(new Set(frames.map(f=>f.budget.rng)).size,1);
   assert.ok(frames.every(f=>f.selected.length===22 && f.budget.attempts===22));
   if(row.mode==="open")assert.equal(new Set(frames.map(f=>f.budget.attemptedCurrent)).size,1);
   for(const f of frames){assert.equal(f.budget.attemptedCurrent,f.budget.successes*1100);assert.equal(new Set(f.selected).size,22);}
  }
 }
 for(const arm of ["directional","swapped","neutral"])assert.equal(r.summary.collected[arm],r.results.filter(x=>x.mode==="closed").reduce((n,x)=>n+x.arms[arm].events.length,0));
});
