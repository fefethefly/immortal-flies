import { OBSERVATION_SCHEMA, receiveAdmitted } from './brain/relay-admission.mjs';

// New fixed admission examples, NOT retroactive labels for the four-arm report.
export function admissionExample(kind = 'valid') {
  const context = { task:'forage-v1',envId:'admission-demo',worldHash:`0x${'ab'.repeat(32)}`,
    sessionId:'sim:session-1',recipient:'sim:child',members:['sim:mother','sim:child'],
    round:2,body:{x:3800,y:5000},own:{food:0,threat:0,light:0} };
  const message = { schema:OBSERVATION_SCHEMA,id:'observation-1',task:context.task,
    envId:context.envId,worldHash:context.worldHash,sessionId:context.sessionId,
    instanceId:'sim:mother',observedRound:1,channel:'food',x:5600,y:5000,observer:{x:5000,y:5000} };
  let messages = [message];
  switch (kind) {
    case 'valid': break;
    case 'duplicate': messages.push(structuredClone(message)); break;
    case 'conflict': messages.push({...message,x:5700}); break;
    case 'environment': messages=[{...message,worldHash:`0x${'cd'.repeat(32)}`}]; break;
    case 'task': messages=[{...message,task:'other-task'}]; break;
    case 'session': messages=[{...message,sessionId:'sim:old-session'}]; break;
    case 'instance': messages=[{...message,instanceId:'sim:unknown'}]; break;
    case 'expired': context.round=3; break;
    case 'future': context.round=1; break;
    case 'schema': messages=[{...message,schema:'iff.relay-observation/99'}]; break;
    case 'no-gain': context.own.food=500; break;
    default: throw new Error('Unknown admission example');
  }
  return { context, messages, result:receiveAdmitted(messages,context) };
}
export const ADMISSION_EXAMPLES = {
  valid:'有效观察', duplicate:'重复投递', conflict:'同 ID 冲突', environment:'跨环境',
  task:'跨任务', session:'旧会话', instance:'未知实例', expired:'已过期',
  future:'尚未到达', schema:'未知版本', 'no-gain':'本地输入更强',
};
export const ADMISSION_REASONS = {
  ACCEPTED_INPUT:'接纳：增加输入', ACCEPTED_NO_GAIN:'接纳：不增加输入', DUPLICATE:'拒绝：重复消息',
  ID_CONFLICT:'拒绝：同 ID 内容冲突', ENVIRONMENT_MISMATCH:'拒绝：环境不匹配', TASK_MISMATCH:'拒绝：任务不匹配',
  SESSION_MISMATCH:'拒绝：会话不匹配', UNKNOWN_INSTANCE:'拒绝：未知实例', EXPIRED:'拒绝：观察过期',
  NOT_YET_DUE:'拒绝：尚未到达', UNKNOWN_SCHEMA:'拒绝：未知版本', MALFORMED:'拒绝：格式错误', SELF_MESSAGE:'拒绝：自发消息',
};
