import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {encodeGraph,bindManifest} from "../src/brain/graph.mjs";
import {hash} from "../src/brain/codec.mjs";
import {l2oCohort,runL2OArm,summarizeL2O} from "../scripts/direction-l2o-core.mjs";
import {runHoldoutArm} from "../scripts/direction-holdout-core.mjs";
import {readCheckpoint} from "../scripts/study-direction-l2o.mjs";
const sides={food:{left:[0,1,2],right:[3,4,5]}};
function fixture(){return bindManifest(encodeGraph({schema:"iff.connectome/1",
 nodes:Array.from({length:8},(_,i)=>({id:String(i+1),sign:1})),
 groups:{food:[0,1,2,3,4,5],threat:[0],light:[1],left:[6],right:[7]}},
 [{pre:0,post:6,weight:100},{pre:3,post:7,weight:100}]));}
test("leave-one-out preserves budget, removes only member, leaves source unchanged",()=>{
 const graph=fixture(),before=structuredClone(sides);
 for(const excluded of [null,0,1,2,3,4,5]){
  const c=l2oCohort(graph,sides,excluded);assert.equal(c.k,2);
  assert.equal(c.left.length+c.right.length,excluded===null?6:5);
  assert.ok(![...c.left,...c.right].includes(excluded));
 }
 assert.deepEqual(sides,before);assert.throws(()=>l2oCohort(graph,sides,6));
 assert.throws(()=>l2oCohort(graph,{food:{left:[0,1],right:[3,4]}},0));
});
test("control matches holdout; exclusions fully replay and retain per-tick RNG parity",async()=>{
 const g=fixture();
 for(const seed of [201,202])for(const excluded of [null,0]){
  const c=l2oCohort(g,sides,excluded),runs=[];
  for(const arm of ["directional","neutral"]){
   const options={seed,heading:90,placement:"right",arm,rounds:4};
   const run=await runL2OArm(g,c,options);assert.deepEqual(await runL2OArm(g,c,options),run);
   assert.ok(run.trace.every(t=>t.selected.length===2&&!t.selected.includes(excluded)));
   if(excluded===null){const old=await runHoldoutArm(g,sides,{...options,axialPolicy:"bilateral"});
    assert.equal(run.finalStateHash,old.finalStateHash);assert.deepEqual(run.path,old.path);}
   runs.push(run);
  }
  assert.deepEqual(runs[0].trace.map(t=>t.budget.rng),runs[1].trace.map(t=>t.budget.rng));
 }
});
test("paired summary includes negative changes in margin and rejects incomplete matching",()=>{
 const row=(seed,d,n,excluded=null)=>({seed,heading:0,placement:"left",excluded,arms:{directional:{collected:d},neutral:{collected:n}}});
 const control=[row(201,1,0),row(202,0,0)],rows=[row(201,0,1,0),row(202,0,0,0)];
 const s=summarizeL2O(rows,control);
 assert.equal(s.exclusions[0].deltaVsControl.margin,-2);assert.equal(s.exclusions[0].vsNeutral.losses,1);
 assert.throws(()=>summarizeL2O(rows.slice(1),control));
 assert.throws(()=>summarizeL2O([rows[0],rows[0]],control));
});
test("checkpoints round-trip and fail closed on corruption, stale sources or wrong node",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"iff-l2o-test-")),file=join(dir,"control.json");
 try{
  assert.equal(await readCheckpoint(file,"binding",null),null);
  const payload={binding:"binding",excluded:null,rows:[]};
  const saved={...payload,checkpointHash:await hash(payload)};
  await writeFile(file,JSON.stringify(saved));assert.deepEqual(await readCheckpoint(file,"binding",null),payload);
  await assert.rejects(readCheckpoint(file,"other",null));await assert.rejects(readCheckpoint(file,"binding",0));
  await writeFile(file,JSON.stringify({...saved,rows:[1]}));await assert.rejects(readCheckpoint(file,"binding",null));
 }finally{await rm(dir,{recursive:true,force:true});}
});
