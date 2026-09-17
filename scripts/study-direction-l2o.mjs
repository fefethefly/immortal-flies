#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile,writeFile,mkdir,rename} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {loadGraphFromDir} from "../server/src/shared/graph-fs.mjs";
import {verifySideFile} from "./audit-direction-paths.mjs";
import {l2oCohort,runL2OArm,summarizeL2O} from "./direction-l2o-core.mjs";
import {runHoldoutArm} from "./direction-holdout-core.mjs";
import {hash,hashBytes} from "../src/brain/codec.mjs";

export async function readCheckpoint(file,binding,excluded){
 let text;try{text=await readFile(file,"utf8");}catch(e){if(e.code==="ENOENT")return null;throw e;}
 const {checkpointHash,...payload}=JSON.parse(text);
 assert.equal(await hash(payload),checkpointHash,"checkpoint checksum");
 assert.equal(payload.binding,binding,"stale checkpoint");
 assert.equal(payload.excluded,excluded,"wrong exclusion");
 return payload;
}
async function save(file,payload,key){
 await writeFile(`${file}.tmp`,JSON.stringify({...payload,[key]:await hash(payload)})+"\n");
 await rename(`${file}.tmp`,file);
}
async function main(){
 const root=resolve(import.meta.dirname,"..");
 const args=process.argv.slice(2);
 assert.ok(args.length===0||(args.length===2&&args[0]==="--max-blocks"),"usage: --max-blocks N");
 const limit=args.length?Number(args[1]):81;
 assert.ok(Number.isInteger(limit)&&limit>=0&&limit<=81);
 const paths=["reports/direction-l2o-plan-v1.json","scripts/study-direction-l2o.mjs","scripts/direction-l2o-core.mjs","scripts/direction-budget-core.mjs","scripts/direction-holdout-core.mjs","scripts/audit-direction-paths.mjs","src/brain/runtime.mjs","src/brain/adapters.mjs","src/brain/ethology.mjs","src/brain/codec.mjs","src/brain/task-direction.mjs","src/brain/task-local-relay.mjs","src/brain/graph.mjs","server/src/shared/graph-fs.mjs","reports/side-groups.json","reports/direction-subset-v1.json"];
 const fingerprints=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));
 const sources=await fingerprints();
 const plan=JSON.parse(await readFile(join(root,paths[0]),"utf8"));
 assert.equal(plan.pickupRadius,400);assert.equal(plan.axialPolicy,"bilateral");assert.equal(plan.order,"index");
 assert.deepEqual(plan.arms,["directional","neutral"]);
 const graph=await loadGraphFromDir(join(root,"public/data",plan.graph));
 const sideFile=JSON.parse(await readFile(join(root,"reports/side-groups.json"),"utf8"));
 const sides=await verifySideFile(sideFile,graph);
 const {reportHash:baselineHash,...baseline}=JSON.parse(await readFile(join(root,"reports/direction-subset-v1.json"),"utf8"));
 assert.equal(await hash(baseline),baselineHash);
 const planHash=await hash(plan);
 const binding=await hash({sources,planHash,graph:graph.manifest,sideBinding:sideFile.reportHash});
 const dir=join(root,"reports/direction-l2o-checkpoints",binding.slice(2));await mkdir(dir,{recursive:true});
 const members=[...sides.food.left,...sides.food.right].sort((a,b)=>a-b);
 const blocks=[];let computed=0;
 console.log(JSON.stringify({planHash,binding,checkpointDirectory:dir}));
 for(const excluded of [null,...members]){
  const file=join(dir,`${excluded??"control"}.json`);
  let block=await readCheckpoint(file,binding,excluded);
  if(!block){
   if(computed>=limit)break;
   const cohort=l2oCohort(graph,sides,excluded),rows=[];
   for(const seed of plan.seeds)for(const heading of plan.headings)for(const placement of plan.placements){
    const arms={},runs=[];
    for(const arm of plan.arms){
     const options={seed,heading,placement,arm,rounds:plan.rounds,distance:plan.distance};
     const run=await runL2OArm(graph,cohort,options);
     assert.deepEqual(await runL2OArm(graph,cohort,options),run);
     if(excluded===null){
      const old=await runHoldoutArm(graph,sides,{...options,axialPolicy:"bilateral"});
      assert.equal(run.finalStateHash,old.finalStateHash);assert.deepEqual(run.path,old.path);assert.deepEqual(run.events,old.events);
     }
     runs.push(run);
     const {trace,...record}=run;
     arms[arm]={...record,traceHash:await hash(trace)};
    }
    assert.equal(runs[0].initialStateHash,runs[1].initialStateHash);
    for(let t=0;t<plan.rounds;t++){
     assert.equal(runs[0].trace[t].budget.rng,runs[1].trace[t].budget.rng);
     assert.ok(runs.every(r=>r.trace[t].budget.attempts===cohort.k));
    }
    rows.push({excluded,seed,heading,placement,arms});
   }
   assert.deepEqual(await fingerprints(),sources);
   await save(file,{binding,excluded,cohort,rows},"checkpointHash");
   block=await readCheckpoint(file,binding,excluded);computed++;
  }
  blocks.push(block);console.log(JSON.stringify({excluded,completedBlocks:blocks.length,newBlocks:computed}));
 }
 const control=blocks.find(b=>b.excluded===null)?.rows??[];
 const results=blocks.filter(b=>b.excluded!==null).flatMap(b=>b.rows);
 const summary=summarizeL2O(results,control);
 const complete=blocks.length===members.length+1;
 if(complete){
  assert.deepEqual(await fingerprints(),sources);
  await save(join(root,"reports/direction-l2o-v1.json"),{
   schema:"iff.direction-l2o-study/1",audit:"SIM",plan,planHash,binding,sources,
   graph:graph.manifest,sideBinding:sideFile.reportHash,baselineHash,
   members:members.map(index=>({index,id:graph.metadata.nodes[index].id,side:sides.food.left.includes(index)?"left":"right"})),
   replayedArms:(control.length+results.length)*plan.arms.length,control,results,summary,
   limitations:[plan.limits,"Removal reindexes subsequent rotation slots; this is not isolated neuronal necessity or sufficiency. Trace hashes require rerunning the recorded cohort and scenario to verify."]
  },"reportHash");
 }
 console.log(JSON.stringify({complete,completedBlocks:blocks.length,totalBlocks:members.length+1,summary},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
