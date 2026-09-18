import { integer, requireValue } from './codec.mjs';
import { receiveRelayInbox, selectRelayInbox } from './relay-inbox.mjs';

// Experimental engineered code, NOT anatomical direction labels or a production adapter.
export const RELAY_DIRECTION = Object.freeze({
  id: 'relay-quadrant-routing/1',
  modes: ['neutral', 'directional', 'rotated'],
  partition: 'sort original food indices; four consecutive equally sized cohorts; discard remainder',
  bearing: 'body-relative 45-degree heading bins; dominant axis; forward wins ties',
  neutral: 'cohort (round - 1) modulo 4, independent of payload bearing',
  rotated: 'quadrant plus two modulo four',
  fallback: 'neutral cohort when relay does not strictly exceed own food or has zero displacement',
});
const AXES = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

export function relayCohorts(graph) {
  const food = [...graph.metadata.groups.food].sort((a,b)=>a-b);
  const motor = new Set([...graph.metadata.groups.left, ...graph.metadata.groups.right]);
  requireValue(new Set(food).size === food.length, 'ROUTING_DUPLICATE');
  for (const i of food) {
    integer(i, 0, graph.n - 1, 'food index');
    requireValue(!motor.has(i), 'ROUTING_MOTOR_OVERLAP');
  }
  const k = Math.floor(food.length / 4);
  requireValue(k > 0, 'ROUTING_EMPTY');
  return Array.from({length:4}, (_,q)=>food.slice(q*k, (q+1)*k));
}

/** No world, target, voltage or motor access. Receipts determine the strongest
 * admitted relay input. Local scalar sensing is deliberately NOT re-encoded. */
export function routeRelayDirection(pending, context, cohorts, mode) {
  requireValue(RELAY_DIRECTION.modes.includes(mode), 'ROUTING_MODE');
  integer(context.body.heading, 0, 359, 'heading');
  requireValue(Array.isArray(cohorts) && cohorts.length === 4, 'ROUTING_COHORTS');
  const k = cohorts[0].length, seen = new Set();
  requireValue(k > 0, 'ROUTING_EMPTY');
  for (const group of cohorts) {
    requireValue(group.length === k, 'ROUTING_BUDGET');
    for (const i of group) {
      integer(i, 0, 2**31-1, 'index');
      requireValue(!seen.has(i), 'ROUTING_DUPLICATE'); seen.add(i);
    }
  }
  const inbox = receiveRelayInbox(pending, context);
  const messages = selectRelayInbox(pending, context.to, context.round);
  let strongest = null;
  for (let i=0;i<messages.length;i++) {
    if (messages[i].channel === 'food' && inbox.receipts[i].value > context.own.food &&
      (!strongest || inbox.receipts[i].value > strongest.value)) {
      strongest = {...messages[i], value:inbox.receipts[i].value};
    }
  }
  let quadrant = null;
  if (strongest) {
    const dx = strongest.x-context.body.x, dy = strongest.y-context.body.y;
    const [hx,hy] = AXES[Math.floor(context.body.heading/45)];
    const forward = dx*hx+dy*hy, right = -dx*hy+dy*hx;
    if (forward || right) quadrant = Math.abs(forward) >= Math.abs(right)
      ? (forward >= 0 ? 0 : 2) : (right >= 0 ? 1 : 3);
  }
  const neutral = (context.round-1)%4;
  const cohort = mode === 'neutral' || quadrant === null ? neutral
    : (quadrant + (mode === 'rotated' ? 2 : 0))%4;
  return {...inbox, routing:{adapter:RELAY_DIRECTION.id, mode, quadrant, cohort,
    messageId:strongest?.id??null, selected:[...cohorts[cohort]], attempts:k}};
}
