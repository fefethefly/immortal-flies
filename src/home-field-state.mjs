// Presentation only: the renderer consumes recorded body coordinates unchanged.
// This fixed basis is shared by the specimen and its path, including wraparound.
export function projectHomeBody(body) {
  const angle = 1.02;
  const x = (body.x - 5000) / 1800;
  const y = (body.y - 5000) / 1800;
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
    heading: (body.heading * Math.PI) / 180 - Math.PI / 2 + angle,
  };
}

export function summarizeHomeRecord(record) {
  const frames = record.frames;
  let distance = 0;
  for (let i = 1; i < frames.length; i++) {
    distance += Math.hypot(
      frames[i].body.x - frames[i - 1].body.x,
      frames[i].body.y - frames[i - 1].body.y,
    );
  }
  const actions = [...new Set(frames.slice(1).map((frame) => frame.action))];
  return { distance: Math.round(distance), actions, peak: record.peak };
}
