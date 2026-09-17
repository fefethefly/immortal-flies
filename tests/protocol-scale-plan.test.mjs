import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { inspectPlan, loadCommittedGraph } from '../scripts/study-protocol-scale.mjs';
import { createWorld } from '../src/brain/task.mjs';
const planURL = new URL('../reports/protocol-scale-plan-v1.json', import.meta.url);
test('paused scale plan verifies pinned graph without running environments', async () => {
  const plan = JSON.parse(await readFile(planURL, 'utf8'));
  const result = await inspectPlan(plan);
  assert.equal(result.executedEnvironments, 0);
  assert.equal(result.neurons, 1400); assert.equal(result.edges, 42031);
  await assert.rejects(loadCommittedGraph({ ...plan, graph: { ...plan.graph, metadataSha256: 'bad' } }));
  const cli = new URL('../scripts/study-protocol-scale.mjs', import.meta.url).pathname;
  assert.throws(() => execFileSync(process.execPath, [cli, 'run'], { stdio: 'pipe', timeout: 5000 }), /paused/);
});
test('changing envId does not create new held-out task geometry', async () => {
  const a = await createWorld('local-relay', 1000), b = await createWorld('protocol-relay', 1000);
  assert.deepEqual(a.food, b.food); assert.deepEqual(a.threats, b.threats);
  assert.notEqual(a.worldHash, b.worldHash);
});
