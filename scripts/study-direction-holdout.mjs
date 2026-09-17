#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {loadGraphFromDir} from "../server/src/shared/graph-fs.mjs";
import {verifySideFile} from "./audit-direction-paths.mjs";
import {runHoldoutArm,summarizeHoldout} from "./direction-holdout-core.mjs";
import {hash,hashBytes} from "../src/brain/codec.mjs";
async function main(){
 const root=resolve(import.meta.dirname,"..");
 const paths=["reports/direction-budget-holdout-plan-v1.json","scripts/study-direction-holdout.mjs","scripts/direction-holdout-core.mjs","scripts/direction-budget-core.mjs","scripts/audit-direction-paths.mjs","src/brain/runtime.mjs","src/brain/ethology.mjs","src/brain/codec.mjs","src/brain/task-direction.mjs","src/brain/task-local-relay.mjs","src/brain/graph.mjs","server/src/shared/graph-fs.mjs","reports/side-groups.json"];
 const fingerprints=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));
 const sources=await fingerprints();
 const plan=JSON.parse(await readFile(join(root,paths[0]),"utf8"));
 const planHash=await hash(plan);
 console.log("Fixed plan",planHash);
 const graph=await loadGraphFromDir(join(root,"public/data/malecns-circuit"));
 const binding=JSON.parse(await readFile(join(root,"reports/side-groups.json"),"utf8"));
 const sides=await verifySideFile(binding,graph);
 const results=[];
 for(const seed of plan.seeds){
  for(const heading of plan.headings)for(const placement of plan.placements)for(const axialPolicy of plan.axialPolicies){
   const arms={};
   for(const arm of plan.arms){
    const options={seed,heading,placement,axialPolicy,arm,rounds:plan.rounds,distance:plan.distance};
    arms[arm]=await runHoldoutArm(graph,sides,options);
    assert.deepEqual(await runHoldoutArm(graph,sides,options),arms[arm]);
   }
   for(let t=0;t<plan.rounds;t++){
    const frames=Object.values(arms).map(a=>a.trace[t]);
    assert.equal(new Set(frames.map(f=>f.budget.rng)).size,1);
    assert.equal(new Set(frames.map(f=>f.budget.attempts)).size,1);
   }
   results.push({seed,heading,placement,axialPolicy,arms});
  }
  console.log("Completed seed",seed);
 }
 assert.deepEqual(await fingerprints(),sources);
 const payload={schema:"iff.direction-holdout-study/1",audit:"SIM",plan,planHash,graph:graph.manifest,
  sideBinding:binding.reportHash,sources,replayedArms:results.length*plan.arms.length,
  summary:summarizeHoldout(results),results,
  limitations:["Repeated headings/placements are correlated within seed. Counts are descriptive; no independence or significance claim.","Silent policy suppresses both front and back whenever current body-relative lateral component is zero, including neutral control.","All arms match attempts and RNG, not effective/cumulative currents after feedback/refractory effects.","Sorted-index rotating subsets and sign-only lateral routing remain engineered choices; no biological tuning claim.","36-tick horizon, one distance, one graph; no post-result parameter selection. No legacy/full-graph comparison in this study."]};
 const file=join(root,"reports/direction-budget-holdout-v1.json");
 await writeFile(file,JSON.stringify({...payload,reportHash:await hash(payload)})+"\n");
 const {reportHash,...saved}=JSON.parse(await readFile(file,"utf8"));assert.equal(await hash(saved),reportHash);
 console.log(JSON.stringify({file,reportHash,replayedArms:payload.replayedArms,summary:payload.summary},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
