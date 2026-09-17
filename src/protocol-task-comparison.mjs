// Read-only comparison of recorded, matched normal-traffic runs; no simulation.
import { canonical, requireValue } from './brain/codec.mjs';

export function taskComparison(legacy, admission) {
  const runs = { off: admission.runs.off, simple: legacy.runs.relay, admitted: admission.runs.valid };
  const base = runs.off;
  for (const r of Object.values(runs)) {
    for (const key of ['worldHash','graphHash','metadataHash','model','initialStateHashes']) {
      requireValue(canonical(r[key]) === canonical(base[key]), 'COMPARISON_MISMATCH', key);
    }
    for (const key of ['flies','seedBase','rounds','positions']) {
      requireValue(canonical(r.config[key]) === canonical(base.config[key]), 'COMPARISON_MISMATCH', key);
    }
    requireValue(r.budget.executedSteps === base.budget.executedSteps, 'COMPARISON_BUDGET');
    requireValue(r.config.deliveryCopies === 1 && (!r.config.fault || r.config.fault === 'none'), 'COMPARISON_FAULT');
  }
  requireValue(runs.off.config.mode === 'off' && runs.simple.config.mode === 'relay' && runs.admitted.config.mode === 'relay', 'COMPARISON_MODE');
  return Object.entries(runs).map(([arm,r]) => {
    const receiver = r.config.flies - 1;
    const first = r.traces.find(t => t.fly === receiver);
    const last = r.traces.find(t => t.fly === receiver && t.round === r.config.rounds);
    requireValue(first && last, 'COMPARISON_TRACE');
    return { arm, collected:r.outcome.collected, firstCollection:r.ledger.length ? Math.min(...r.ledger.map(e=>e.round)) : null,
      hazardExposure:r.outcome.hazardExposure, executedSteps:r.budget.executedSteps,
      rawDeliveries:r.budget.rawDeliveries, rawBytes:r.budget.rawDeliveryPayloadBytes,
      acceptedBytes:r.budget.deliveryPayloadBytes, changedInputs:r.outcome.changedInputs,
      receiver, dx:last.after.x-first.before.x, dy:last.after.y-first.before.y,
      collectionDelta:r.outcome.collected-base.outcome.collected,
      resultHash:r.resultHash };
  });
}
