#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {loadGraphFromDir} from "../server/src/shared/graph-fs.mjs";
import {verifySideFile} from "./audit-direction-paths.mjs";
import {runBudgetArm,BUDGET_POLICY} from "./direction-budget-core.mjs";
import {hash,hashBytes} from "../src/brain/codec.mjs";
async function main(){
 const root=resolve(import.meta.dirname,"..");
 const paths=["scripts/study-direction-budget.mjs","scripts/direction-budget-core.mjs","scripts/audit-direction-paths.mjs","src/brain/runtime.mjs","src/brain/ethology.mjs","src/brain/codec.mjs","src/brain/task-direction.mjs","src/brain/task-local-relay.mjs","src/brain/graph.mjs","server/src/shared/graph-fs.mjs","reports/side-groups.json"];
 const fingerprints=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));
 const sources=await fingerprints();
 const graph=await loadGraphFromDir(join(root,"public/data/malecns-circuit"));
 const binding=JSON.parse(await readFile(join(root,"reports/side-groups.json"),"utf8"));
 const sides=await verifySideFile(binding,graph);
 const results=[];
 for(const mode of ["open","closed"]) for(const seed of [43,44,45,46]) for(const [dx,dy] of [[600,0],[0,-600],[0,600],[-600,0]]){
  const arms={};
  for(const arm of BUDGET_POLICY.arms){
   const options={mode,seed,dx,dy,arm,rounds:mode==="open"?6:36};
   arms[arm]=await runBudgetArm(graph,sides,options);
   assert.deepEqual(await runBudgetArm(graph,sides,options),arms[arm]);
  }
  for(let t=0;t<arms.directional.rounds;t++){
   const entries=Object.values(arms).map(a=>a.trace[t]);
   assert.equal(new Set(entries.map(e=>e.budget.rng)).size,1);
   assert.equal(new Set(entries.map(e=>e.budget.attempts)).size,1);
   if(mode==="open") assert.equal(new Set(entries.map(e=>e.budget.attemptedCurrent)).size,1);
  }
  results.push({mode,seed,dx,dy,arms});
 }
 const closed=results.filter(r=>r.mode==="closed");
 const summary={openScenarios:16,closedScenarios:16,replayedArms:results.length*3,
  collected:Object.fromEntries(BUDGET_POLICY.arms.map(a=>[a,closed.reduce((n,r)=>n+r.arms[a].collected,0)])),
  pathsDifferentFromNeutral:Object.fromEntries(BUDGET_POLICY.arms.map(a=>[a,closed.filter(r=>JSON.stringify(r.arms[a].trace.map(t=>t.body))!==JSON.stringify(r.arms.neutral.trace.map(t=>t.body))).length]))};
 assert.deepEqual(await fingerprints(),sources);
 const payload={schema:"iff.direction-budget-study/1",audit:"SIM",graph:graph.manifest,sideBinding:binding.reportHash,policy:BUDGET_POLICY,sources,summary,results,
 limitations:["Engineered fixed-budget routing, not biological response tuning. Deterministic rotating subsets are not anatomical matched pairs.","Open loop matches RNG and attempted external injection totals, not effective voltage: refractory states can discard input.","Closed loop matches attempts/RNG only; sensed intensity and cumulative current may differ as trajectories diverge.","Ahead and behind both receive neutral bilateral drive; this restores intensity, not front/back discrimination.","No legacy comparison here: neutral is a new matched-budget baseline. Four seeds are exploratory, not significance evidence."]};
 const file=join(root,"reports/direction-budget-v1.json");
 await writeFile(file,JSON.stringify({...payload,reportHash:await hash(payload)})+"\n");
 const {reportHash,...saved}=JSON.parse(await readFile(file,"utf8"));assert.equal(await hash(saved),reportHash);
 console.log(JSON.stringify({file,reportHash,summary},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
