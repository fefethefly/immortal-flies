#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {pathToFileURL} from "node:url";
import {loadGraphFromDir} from "../server/src/shared/graph-fs.mjs";
import {verifySideFile} from "./audit-direction-paths.mjs";
import {orderedCohort,runSubsetArm,summarizeSubsets} from "./direction-subset-core.mjs";
import {hash,hashBytes} from "../src/brain/codec.mjs";
async function main(){
 const root=resolve(import.meta.dirname,"..");
 const paths=["reports/direction-subset-plan-v1.json","scripts/study-direction-subsets.mjs","scripts/direction-subset-core.mjs","scripts/direction-budget-core.mjs","scripts/direction-holdout-core.mjs","scripts/audit-direction-paths.mjs","src/brain/runtime.mjs","src/brain/ethology.mjs","src/brain/codec.mjs","src/brain/task-direction.mjs","src/brain/task-local-relay.mjs","src/brain/graph.mjs","server/src/shared/graph-fs.mjs","reports/side-groups.json","reports/direction-budget-holdout-v1.json"];
 const fingerprints=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hashBytes(await readFile(join(root,p)))])));
 const sources=await fingerprints();
 const plan=JSON.parse(await readFile(join(root,paths[0]),"utf8"));
 const planHash=await hash(plan);console.log("Fixed plan",planHash);
 const graph=await loadGraphFromDir(join(root,"public/data/malecns-circuit"));
 const binding=JSON.parse(await readFile(join(root,"reports/side-groups.json"),"utf8"));
 const sides=await verifySideFile(binding,graph);
 const baseline=JSON.parse(await readFile(join(root,"reports/direction-budget-holdout-v1.json"),"utf8"));
 const {reportHash:baselineHash,...baselinePayload}=baseline;assert.equal(await hash(baselinePayload),baselineHash);
 const cohorts={},results=[];
 for(const order of plan.orders){
  const cohort=await orderedCohort(graph,sides,order);cohorts[order]=cohort;
  for(const seed of plan.seeds)for(const heading of plan.headings)for(const placement of plan.placements){
   const arms={},runs=[];
   for(const arm of plan.arms){
    const options={seed,heading,placement,arm,rounds:plan.rounds,distance:plan.distance};
    const run=await runSubsetArm(graph,sides,cohort,options);
    assert.deepEqual(await runSubsetArm(graph,sides,cohort,options),run);
    if(order==="index"){
     const old=baseline.results.find(r=>r.seed===seed&&r.heading===heading&&r.placement===placement&&r.axialPolicy==="bilateral").arms[arm];
     assert.equal(run.finalStateHash,old.finalStateHash);assert.deepEqual(run.path,old.path);assert.deepEqual(run.events,old.events);
    }
    runs.push(run);
    // Compact replayable evidence: cohort + per-tick input reconstruct selections.
    const {trace,...record}=run;
    arms[arm]={...record,traceHash:await hash(trace),inputs:trace.map(t=>t.input),
      budgets:trace.map(t=>t.budget)};
   }
   for(let t=0;t<plan.rounds;t++){
    assert.equal(new Set(runs.map(r=>r.trace[t].budget.rng)).size,1);
    assert.ok(runs.every(r=>r.trace[t].budget.attempts===cohort.k));
   }
   results.push({order,seed,heading,placement,arms});
  }
  console.log(order,JSON.stringify(summarizeSubsets(results)[order].collected));
 }
 assert.deepEqual(await fingerprints(),sources);
 const payload={schema:"iff.direction-subset-study/1",audit:"SIM",plan,planHash,graph:graph.manifest,
  sideBinding:binding.reportHash,baselineHash,sources,cohorts,replayedArms:results.length*3,
  summary:summarizeSubsets(results),results,
  limitations:["Order changes both selected identities and RNG-to-node assignment; not a pure single-neuron effect.","Same eight seeds as prior holdout: sensitivity analysis, not new independent validation. Rotations are correlated.","Three fixed salts are not an exhaustive subset search; no best order is promoted.","Equal count and RNG draws do not imply equal closed-loop cumulative or refractory-effective input.","Inputs, cohorts and selection algorithm reconstruct the hashed full traces; no runtime or historical report edits."]};
 const file=join(root,"reports/direction-subset-v1.json");
 await writeFile(file,JSON.stringify({...payload,reportHash:await hash(payload)})+"\n");
 const {reportHash,...saved}=JSON.parse(await readFile(file,"utf8"));assert.equal(await hash(saved),reportHash);
 console.log(JSON.stringify({file,reportHash,replayedArms:payload.replayedArms},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
