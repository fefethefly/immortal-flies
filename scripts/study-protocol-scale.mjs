#!/usr/bin/env node
// Inspection only: the original scale plan reused previously observed seeds.
// No simulation, report generation or statistical promotion is authorized here.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash, hashBytes } from '../src/brain/codec.mjs';
import { prepareGraph } from '../src/brain/graph.mjs';

const root = resolve(import.meta.dirname, '..');
export async function loadCommittedGraph(plan) {
  assert.match(plan.graph.sourceCommit, /^[0-9a-f]{40}$/);
  const prefix = `${plan.graph.sourceCommit}:public/data/malecns-circuit/`;
  const read = name => execFileSync('git', ['show', prefix + name], {
    cwd: root, maxBuffer: 8 << 20,
  });
  const manifest = JSON.parse(read('manifest.json').toString('utf8'));
  assert.equal(manifest.schema, 'iff.dataset/1');
  assert.equal(manifest.id, plan.graph.id);
  assert.equal(manifest.metadata.path, 'metadata.json');
  assert.equal(manifest.connectivity.path, 'graph.bin');
  assert.equal(manifest.metadata.sha256, plan.graph.metadataSha256);
  assert.equal(manifest.connectivity.sha256, plan.graph.connectivitySha256);
  const metadata = read('metadata.json'), binary = read('graph.bin');
  for (const [bytes, entry] of [[metadata, manifest.metadata], [binary, manifest.connectivity]]) {
    assert.equal(bytes.byteLength, entry.bytes);
    assert.equal(await hashBytes(bytes), entry.sha256);
  }
  const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  const graph = prepareGraph(JSON.parse(metadata.toString('utf8')), buffer);
  graph.manifest = manifest;
  graph.datasetHash = manifest.connectivity.sha256;
  graph.metadataHash = manifest.metadata.sha256;
  assert.equal(graph.n, manifest.neurons);
  assert.equal(graph.e, manifest.edges);
  return graph;
}
export async function inspectPlan(plan) {
  assert.equal(plan.schema, 'iff.protocol-scale-plan/1');
  assert.equal(plan.preregistered, false);
  assert.equal(plan.status, 'PAUSED - NOT AUTHORIZED FOR EXECUTION');
  const graph = await loadCommittedGraph(plan);
  return {
    status: plan.status, planHash: await hash(plan), graphVerified: true,
    neurons: graph.n, edges: graph.e, executedEnvironments: 0,
    reasons: plan.pauseReasons,
  };
}
async function main() {
  assert.deepEqual(process.argv.slice(2), ['inspect'],
    'Scale execution is paused. Only: node study-protocol-scale.mjs inspect');
  const plan = JSON.parse(await readFile(resolve(root, 'reports/protocol-scale-plan-v1.json'), 'utf8'));
  console.log(JSON.stringify(await inspectPlan(plan), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
