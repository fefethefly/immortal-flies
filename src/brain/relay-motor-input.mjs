import { integer, requireValue } from './codec.mjs';
import { selectRelayInbox } from './relay-inbox.mjs';

// Calibrated engineering controller, NOT neural learning or biological labels.
// Single-source calibration on the historical 1400-node graph from rest at
// strength 1000: 904 turns positive, 941 negative, 994 nearly straight.
// The deadband around the target bearing uses 994. Rest measurements do not
// promise state-independent closed-loop authority.
export const MOTOR_INPUT = Object.freeze({
  id: 'calibrated-food-steering/1', positive: 904, negative: 941, forward: 994,
  strength: 1000, deadband: 22.5, modes: ['off', 'single', 'dual'],
});

export function validateMotorSources(graph) {
  const food = new Set(graph.metadata.groups.food);
  const motor = new Set([...graph.metadata.groups.left, ...graph.metadata.groups.right]);
  for (const i of [MOTOR_INPUT.positive, MOTOR_INPUT.negative, MOTOR_INPUT.forward]) {
    integer(i, 0, graph.n - 1, 'source index');
    requireValue(food.has(i) && !motor.has(i), 'MOTOR_INPUT_SOURCE');
  }
  // Indices are only meaningful on this exact historical graph.
  requireValue(graph.datasetHash === '0x4278c3cae84471b8a808391d5de5eddf8e54a2b75e01f8596743ec07e2f1e843', 'MOTOR_INPUT_GRAPH');
}

/** Only own observations, validated one-round messages and proprioception.
 * No world, consumed flags, future state, target handle or body mutation.
 * Gain deliberately saturates input, unlike the original distance scalar.
 * No bearing-dependent routing into motor groups. No use of threat/light.
 */
export function motorInput(pending, { to, round, body, observations }, mode) {
  requireValue(MOTOR_INPUT.modes.includes(mode), 'MOTOR_INPUT_MODE');
  integer(body.x, 0, 10000, 'x'); integer(body.y, 0, 10000, 'y');
  integer(body.heading, 0, 359, 'heading');
  requireValue(Array.isArray(observations), 'MOTOR_INPUT_OBSERVATIONS');
  for (const o of observations) {
    requireValue(['food', 'threat'].includes(o.channel), 'MOTOR_INPUT_CHANNEL');
    integer(o.x, 0, 10000, 'observation.x'); integer(o.y, 0, 10000, 'observation.y');
  }
  const messages = selectRelayInbox(pending, to, round);
  const distance2 = o => (o.x-body.x)**2 + (o.y-body.y)**2;
  // Own observations win equal-distance ties; no memory beyond current inbox.
  const target = [...observations, ...messages].filter(o=>o.channel==='food')
    .sort((a,b)=>distance2(a)-distance2(b))[0];
  let error = null;
  if (target && distance2(target)>0) {
    const angle = Math.atan2(target.y-body.y, target.x-body.x)*180/Math.PI;
    // Exact opposite deterministically chooses positive turning.
    error = (angle-body.heading+540)%360-180;
    if (error === -180) error = 180;
  }
  let source = null;
  if (mode !== 'off' && error !== null) {
    if (Math.abs(error) < MOTOR_INPUT.deadband) source = MOTOR_INPUT.forward;
    else if (error > 0) source = MOTOR_INPUT.positive;
    else source = MOTOR_INPUT.negative;
  }
  const active = source !== null && (mode === 'dual' || source !== MOTOR_INPUT.negative);
  return { policy:MOTOR_INPUT.id, mode, error, source: active ? source : null,
    signal:{food:active ? MOTOR_INPUT.strength : 0, threat:0, light:0},
    observation:target ? {x:target.x,y:target.y,source:target.id??'local'} : null };
}
