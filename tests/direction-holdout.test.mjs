import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {encodeGraph,bindManifest} from "../src/brain/graph.mjs";
import {hash,hashBytes} from "../src/brain/codec.mjs";
import {runBudgetArm} from "../scripts/direction-budget-core.mjs";
import {targetOffset,runHoldoutArm,summarizeHoldout} from "../scripts/direction-holdout-core.mjs";
const sides={food:{left:[0,1,2],right:[3,4,5]}};
function fixture(){return bindManifest(encodeGraph({schema:"iff.connectome/1",
 nodes:Array.from({length:10},(_,i)=>({id:String(i+1),sign:1})),
 groups:{food:[0,1,2,3,4,5],threat:[0],light:[1],left:[6,7],right:[8,9]}},
 [{pre:0,post:6,weight:100},{pre:1,post:7,weight:100},{pre:3,post:8,weight:100},{pre:4,post:9,weight:100}]));}
test("holdout: quarter-turn geometry and invalid configuration",async()=>{
 assert.deepEqual(targetOffset(90,"ahead"),[0,600]);
 assert.deepEqual(targetOffset(90,"left"),[600,0]);
 assert.deepEqual(targetOffset(270,"right"),[600,0]);
 const base={seed:101,heading:0,placement:"left",arm:"directional",axialPolicy:"bilateral",rounds:2};
 for(const patch of [{heading:45},{placement:"bad"},{arm:"bad"},{axialPolicy:"bad"},{rounds:0},{seed:0},{distance:400}])await assert.rejects(runHoldoutArm(fixture(),sides,{...base,...patch}));
});
test("holdout: bilateral heading zero reproduces original budget policy exactly",async()=>{
 const g=fixture(),before=structuredClone(g);
 for(const placement of ["ahead","left","right","behind"])for(const arm of ["directional","swapped","neutral"]){
  const [dx,dy]=targetOffset(0,placement);
  const old=await runBudgetArm(g,sides,{seed:101,arm,dx,dy,rounds:5});
  const next=await runHoldoutArm(g,sides,{seed:101,heading:0,placement,arm,axialPolicy:"bilateral",rounds:5});
  assert.equal(next.finalStateHash,old.finalStateHash);assert.deepEqual(next.events,old.events);
  assert.deepEqual(next.path.slice(1),old.trace.map(t=>t.body));
 }
 assert.deepEqual(g,before);
});
test("holdout: axial silence preserves RNG calls but suppresses current for every arm",async()=>{
 for(const heading of [0,90,180,270])for(const arm of ["directional","swapped","neutral"]){
  const options={seed:101,heading,placement:"ahead",arm,rounds:3};
  const bilateral=await runHoldoutArm(fixture(),sides,{...options,axialPolicy:"bilateral"});
  const silent=await runHoldoutArm(fixture(),sides,{...options,axialPolicy:"silent"});
  assert.equal(bilateral.trace[0].intensity,576);
  assert.ok(silent.trace.every(t=>t.intensity===0&&t.budget.attemptedCurrent===0));
  assert.deepEqual(silent.trace.map(t=>t.budget.rng),bilateral.trace.map(t=>t.budget.rng));
  assert.ok(silent.path.every(p=>p[0]===5000&&p[1]===5000&&p[2]===heading));
 }
});
test("holdout report: plan, hashes, coverage, pairing and summaries recompute",async()=>{
 const root=new URL("../",import.meta.url);
 const r=JSON.parse(await readFile(new URL("reports/direction-budget-holdout-v1.json",root),"utf8"));
 const {reportHash,...payload}=r;assert.equal(await hash(payload),reportHash);
 const plan=JSON.parse(await readFile(new URL("reports/direction-budget-holdout-plan-v1.json",root),"utf8"));
 assert.deepEqual(r.plan,plan);assert.equal(await hash(plan),r.planHash);
 assert.equal(r.results.length,256);assert.equal(r.replayedArms,768);
 assert.equal(new Set(r.results.map(x=>[x.seed,x.heading,x.placement,x.axialPolicy].join(':'))).size,256);
 assert.deepEqual(summarizeHoldout(r.results),r.summary);
 for(const [p,h]of Object.entries(r.sources))assert.equal(await hashBytes(await readFile(new URL(p,root))),h,p);
 for(const row of r.results){
  const arms=Object.values(row.arms);assert.equal(arms.length,3);
  assert.equal(new Set(arms.map(a=>a.initialStateHash)).size,1);
  for(const a of arms){assert.equal(a.path.length,37);assert.equal(a.collected,a.events.length);assert.equal(a.k,22);}
  for(let t=0;t<36;t++){
   assert.equal(new Set(arms.map(a=>a.trace[t].budget.rng)).size,1);
   assert.ok(arms.every(a=>a.trace[t].selected.length===22&&a.trace[t].budget.attempts===22));
  }
 }
});
