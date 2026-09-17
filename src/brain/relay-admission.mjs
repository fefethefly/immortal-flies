import { canonical, integer, identifier, requireValue } from './codec.mjs';
import { LOCAL_RELAY } from './task-local-relay.mjs';

export const ADMISSION_POLICY = 'relay-admission/1';
export const OBSERVATION_SCHEMA = 'iff.relay-observation/1';
const fields = ['schema','id','task','envId','worldHash','sessionId','instanceId','observedRound','channel','x','y','observer'];
const isId = s => typeof s === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(s);
const isInt = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const point = p => p && Object.keys(p).sort().join(',') === 'x,y' && isInt(p.x,0,10000) && isInt(p.y,0,10000);
const digest = s => typeof s === 'string' && /^0x[0-9a-f]{64}$/.test(s);
function shape(m) {
  return m && Object.getPrototypeOf(m) === Object.prototype &&
    Object.keys(m).sort().join(',') === [...fields].sort().join(',') &&
    ['id','task','envId','sessionId','instanceId'].every(k => isId(m[k])) && digest(m.worldHash) &&
    isInt(m.observedRound,1,1000) && ['food','threat'].includes(m.channel) &&
    isInt(m.x,0,10000) && isInt(m.y,0,10000) && point(m.observer);
}
function scopeOf(c) {
  return { task:c.task, envId:c.envId, worldHash:c.worldHash, sessionId:c.sessionId,
    recipient:c.recipient, members:[...c.members].sort() };
}
export function createAdmissionState(context) {
  return { policy:ADMISSION_POLICY, scope:scopeOf(context), lastRound:0, seen:[] };
}
// Trusted caller supplies scope, membership, body, own input and carried state.
// No world access, body write, wallet authentication, or implicit global state.
export function receiveAdmitted(messages, context, state = createAdmissionState(context)) {
  const c = context;
  for (const k of ['task','envId','sessionId','recipient']) identifier(c[k]);
  requireValue(digest(c.worldHash), 'ADMISSION_WORLD_HASH');
  requireValue(Array.isArray(c.members) && c.members.length <= 10 && c.members.every(isId) &&
    new Set(c.members).size === c.members.length && c.members.includes(c.recipient), 'ADMISSION_MEMBERS');
  integer(c.round,1,1000,'round'); requireValue(point(c.body), 'ADMISSION_BODY');
  for (const k of ['food','threat','light']) integer(c.own[k],0,1000,k);
  requireValue(Array.isArray(messages) && messages.length <= 40, 'ADMISSION_BATCH');
  requireValue(state.policy === ADMISSION_POLICY && canonical(state.scope) === canonical(scopeOf(c)), 'ADMISSION_SCOPE');
  integer(state.lastRound,0,c.round,'lastRound');
  const seen = new Map(state.seen.map(e => [canonical([e.instanceId,e.id]),e.signature]));
  const signatures = new Map();
  const classified = messages.map(m => {
    let reason = null;
    if (m?.schema !== OBSERVATION_SCHEMA) reason = 'UNKNOWN_SCHEMA';
    else if (!shape(m)) reason = 'MALFORMED';
    else if (m.task !== c.task) reason = 'TASK_MISMATCH';
    else if (m.envId !== c.envId || m.worldHash !== c.worldHash) reason = 'ENVIRONMENT_MISMATCH';
    else if (m.sessionId !== c.sessionId) reason = 'SESSION_MISMATCH';
    else if (!c.members.includes(m.instanceId)) reason = 'UNKNOWN_INSTANCE';
    else if (m.instanceId === c.recipient) reason = 'SELF_MESSAGE';
    if (reason) return { m, reason };
    const key = canonical([m.instanceId,m.id]), signature = canonical(m);
    if (!signatures.has(key)) signatures.set(key,new Set());
    signatures.get(key).add(signature);
    return { m, key, signature };
  });
  const applied = { ...c.own }, decisions = [], accepted = [];
  for (const { m, key, signature, reason: invalid } of classified) {
    let reason = invalid;
    if (!reason && (signatures.get(key).size > 1 || (seen.has(key) && seen.get(key) !== signature))) reason = 'ID_CONFLICT';
    if (!reason && seen.has(key)) reason = 'DUPLICATE';
    if (!reason && m.observedRound >= c.round) reason = 'NOT_YET_DUE';
    if (!reason && m.observedRound !== c.round - LOCAL_RELAY.delayRounds) reason = 'EXPIRED';
    let value = 0, before = null, after = null;
    if (!reason) {
      const radius2 = LOCAL_RELAY.relayRadius ** 2;
      const d2 = (c.body.x-m.x)**2 + (c.body.y-m.y)**2;
      value = Math.floor(Math.max(0,Math.floor(900*(radius2-d2)/radius2))*LOCAL_RELAY.relayGainPercent/100);
      before = applied[m.channel]; after = Math.max(before,value); applied[m.channel] = after;
      reason = after > before ? 'ACCEPTED_INPUT' : 'ACCEPTED_NO_GAIN';
      accepted.push(structuredClone(m)); seen.set(key,signature);
    }
    decisions.push({ messageId:isId(m?.id)?m.id:null, instanceId:isId(m?.instanceId)?m.instanceId:null,
      recipient:c.recipient, round:c.round, accepted:reason.startsWith('ACCEPTED_'), reason, value, before, after });
  }
  return { policy:ADMISSION_POLICY, applied, accepted, decisions,
    state:{ policy:ADMISSION_POLICY, scope:scopeOf(c), lastRound:c.round,
      seen:[...seen].map(([key,signature]) => { const [instanceId,id]=JSON.parse(key); return {instanceId,id,signature}; }) } };
}
