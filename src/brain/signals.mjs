export const SIGNAL_GROUPS = Object.freeze([
  ['food', '食物感受器', '#f0b90b'],
  ['threat', '威胁感受器', '#b57660'],
  ['light', '光感受器', '#a9c4bb'],
  ['left', '左侧运动', '#93a181'],
  ['right', '右侧运动', '#c0c9a1'],
]);

export function summarizeSignals(state, graph) {
  const active = new Set(state.spikes);
  const groups = {};
  for (const [name, ids] of Object.entries(graph.metadata.groups)) {
    let spikes = 0;
    for (const index of ids) if (active.has(index)) spikes++;
    groups[name] = { size: ids.length, spikes };
  }
  const sample = Math.min(state.voltage.length, 2048);
  const voltageHist = [0, 0, 0, 0, 0, 0, 0, 0];
  let voltageSum = 0;
  for (let i = 0; i < sample; i++) {
    const voltage = state.voltage[i];
    voltageSum += voltage;
    voltageHist[Math.min(7, Math.max(0, Math.floor((voltage + 10000) / 2500)))]++;
  }
  return {
    groups,
    voltageHist,
    voltageMean: sample ? Math.round(voltageSum / sample) : 0,
    voltagePreview: state.voltage.slice(0, 160),
  };
}
