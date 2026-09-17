#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, hashBytes } from '../src/brain/codec.mjs';
import { materialize, scenario } from './protocol-replay-core.mjs';
import { runAdmissionRelay } from '../src/brain/task-admission-relay.mjs';

const root = resolve(import.meta.dirname, '..');
export const SOURCE_PATHS = Object.freeze([
  'scripts/admission-replay.mjs', 'scripts/protocol-replay-core.mjs',
  'src/brain/task-admission-relay.mjs', 'src/brain/relay-admission.mjs',
  'src/brain/task-protocol-relay.mjs', 'src/brain/relay-inbox.mjs',
  'src/brain/task-local-relay.mjs', 'src/brain/runtime.mjs',
  'src/brain/codec.mjs', 'src/brain/graph.mjs', 'src/brain/adapters.mjs', 'src/brain/ethology.mjs',
]);
export async function fingerprints() {
  return Object.fromEntries(await Promise.all(SOURCE_PATHS.map(async p => [p, await hashBytes(await readFile(join(root,p)))])));
}
export async function buildAdmissionBundle(sources) {
  const base = scenario(), {graph,world} = await materialize(base);
  const arms = {
    off:{mode:'off'}, valid:{mode:'relay'}, duplicate:{mode:'relay',deliveryCopies:2},
    mixed:{mode:'relay',fault:'mixed-environment'}, environment:{mode:'relay',fault:'environment'},
    expired:{mode:'relay',fault:'expired'}, conflict:{mode:'relay',fault:'conflict'},
  };
  const plan = { graph:base.graph, world:base.world, config:{...base.config, sessionId:'sim:admission-replay-1'}, arms };
  const runs = {};
  for (const [arm,options] of Object.entries(arms)) runs[arm] = await runAdmissionRelay(graph,world,{...plan.config,...options});
  for (const key of ['traces','ledger','finalStateHashes','outcome']) {
    assert.deepEqual(runs.valid[key],runs.duplicate[key]);
    assert.deepEqual(runs.valid[key],runs.mixed[key]);
  }
  for (const arm of ['environment','expired','conflict']) {
    assert.deepEqual(runs[arm].finalStateHashes,runs.off.finalStateHashes);
    assert.ok(runs[arm].decisions.length > 0 && runs[arm].decisions.every(d=>!d.accepted));
  }
  const summary = Object.fromEntries(Object.entries(runs).map(([arm,r])=>[arm,{
    collected:r.outcome.collected, changedInputs:r.outcome.changedInputs,
    rawDeliveries:r.budget.rawDeliveries, accepted:r.budget.deliveries,
    rejected:r.budget.rejectedDeliveries, rawBytes:r.budget.rawDeliveryPayloadBytes,
    acceptedBytes:r.budget.deliveryPayloadBytes,
    reasons:Object.fromEntries([...new Set(r.decisions.map(d=>d.reason))].map(reason=>[reason,r.decisions.filter(d=>d.reason===reason).length])),
  }]));
  const payload = {schema:'iff.admission-replay-bundle/1',audit:'SIM',plan,planHash:await hash(plan),world,
    graphHash:graph.datasetHash,metadataHash:graph.metadataHash,sources,runs,summary,
    limitations:['Fixed synthetic two-node graph / two lives, not MaleCNS or T3 gain evidence.',
      'Transport fault interventions are fixed demonstrations; no learning, authentication or observation truth validation.',
      'Matching repository sources and Node are required for full replay; browser hash check is not neural re-execution.']};
  return {...payload,bundleHash:await hash(payload)};
}
export async function verifyAdmissionBundle(bundle,sources) {
  const {bundleHash,...payload}=bundle;
  assert.equal(bundle.schema,'iff.admission-replay-bundle/1');
  assert.equal(await hash(payload),bundleHash,'bundle hash');
  assert.deepEqual(bundle.sources,sources,'source fingerprints');
  assert.deepEqual(bundle,await buildAdmissionBundle(sources),'full replay mismatch');
  return {verified:true,replayedArms:7,stateSteps:448,bundleHash};
}
async function main() {
  const [command,output,...extra]=process.argv.slice(2);
  assert.ok(['build','verify'].includes(command)&&extra.length===0,'Usage: admission-replay.mjs build|verify [bundle path]');
  const file=resolve(output??join(root,'reports/admission-replay-v1.json'));
  const sources=await fingerprints();
  if(command==='build') {
    const bundle=await buildAdmissionBundle(sources);
    await verifyAdmissionBundle(bundle,sources);
    assert.deepEqual(await fingerprints(),sources,'source changed during build');
    await writeFile(file,JSON.stringify(bundle)+'\n',{flag:'wx'});
  }
  const saved=JSON.parse(await readFile(file,'utf8'));
  const check=await verifyAdmissionBundle(saved,sources);
  assert.deepEqual(await fingerprints(),sources,'source changed during verification');
  console.log(JSON.stringify({file,...check,summary:saved.summary},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
