import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encodeGraph, bindManifest } from "../src/brain/graph.mjs";
import { studyGraph } from "../scripts/study-direction-full.mjs";
import { remapSidesByBodyId } from "../scripts/audit-direction-paths.mjs";
import { hash, hashBytes } from "../src/brain/codec.mjs";
const sides = { food: { left: [0], right: [1] }, threat: { left: [0], right: [] } };
function fixture() {
  return bindManifest(encodeGraph({schema:"iff.connectome/1",
    nodes:[1,2,3,4].map(id=>({id:String(id),sign:1})),
    groups:{food:[0,1],threat:[0],light:[1],left:[2],right:[3]}},
    [{pre:0,post:2,weight:100},{pre:1,post:3,weight:100}]));
}
test("full study: matched placements replay, body metrics exclude input/hash differences", async () => {
  const g=fixture(), before=structuredClone(g);
  const r=await studyGraph(g,sides,{seeds:[43],rounds:4});
  assert.equal(r.closed.length,4);
  for(const row of r.closed){
    const {worldHash,...world}=row.world; assert.equal(await hash(world),worldHash);
    assert.equal(row.world.threats.length,0);
    assert.equal(row.arms.directional.path.length,5);
    assert.equal(row.directionalVsLegacyPathDifferent,
      JSON.stringify(row.arms.directional.path)!==JSON.stringify(row.arms.legacy.path));
  }
  assert.deepEqual(g,before);
  assert.deepEqual(await studyGraph(g,sides,{seeds:[43],rounds:4}),r);
  await assert.rejects(studyGraph(g,{...sides,food:{left:[2],right:[1]}},{seeds:[43],rounds:1}));
});
test("full remapping uses body IDs, not source positions", () => {
  const a=fixture(), b=fixture();
  b.metadata.nodes=structuredClone([a.metadata.nodes[1],a.metadata.nodes[0],a.metadata.nodes[2],a.metadata.nodes[3]]);
  b.metadata.groups.threat=[1];
  const r=remapSidesByBodyId(a,b,sides);
  assert.deepEqual(r.food,{left:[1],right:[0]});
  b.metadata.nodes[0].id="99";
  assert.throws(()=>remapSidesByBodyId(a,b,sides));
});
test("published full study hashes, worlds, source bindings and summaries recompute", async () => {
  const root=new URL("../",import.meta.url);
  const r=JSON.parse(await readFile(new URL("reports/direction-full-study-v1.json",root),"utf8"));
  const {reportHash,...payload}=r;assert.equal(await hash(payload),reportHash);
  for(const [p,h] of Object.entries(r.sources)) assert.equal(await hashBytes(await readFile(new URL(p,root))),h,p);
  for(const result of Object.values(r.results)) {
    assert.equal(result.summary.scenarios,result.closed.length);
    assert.equal(result.summary.pathDifferentFromLegacy,result.closed.filter(x=>x.directionalVsLegacyPathDifferent).length);
    for(const row of result.closed) {const {worldHash,...w}=row.world;assert.equal(await hash(w),worldHash);}
    for(const arm of ["directional","swapped","legacy"]) assert.equal(result.summary.collected[arm],result.closed.reduce((n,x)=>n+x.arms[arm].collected,0));
  }
});
