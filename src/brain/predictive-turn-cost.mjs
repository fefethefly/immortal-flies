import {integer} from './codec.mjs';
import {predictMotor,PREDICTIVE_MOTOR} from './predictive-motor-input.mjs';

// External full-state model-predictive controller, not neural learning.
// Only rescores v1's identical forecasts; no new graph or motor intervention.
export const TURN_COST = Object.freeze({
  id:'predictive-turn-cost/1',horizon:PREDICTIVE_MOTOR.horizon,
  sources:PREDICTIVE_MOTOR.sources,distanceScale:35,angleScale:9,
  objective:'endpoint Euclidean distance / 35 + absolute wrapped bearing error / 9',
  tieBreak:PREDICTIVE_MOTOR.tieBreak,
  limits:'Heuristic units, not a time bound: diagonal motion and simultaneous turning violate additive travel-time assumptions.',
});
export function turnCost(body,observation){
  integer(body.x,0,10000,'body.x');integer(body.y,0,10000,'body.y');
  integer(body.heading,0,359,'heading');
  integer(observation.x,0,10000,'observation.x');integer(observation.y,0,10000,'observation.y');
  const dx=observation.x-body.x,dy=observation.y-body.y;
  const distance=Math.hypot(dx,dy);
  const error=distance===0?0:(Math.atan2(dy,dx)*180/Math.PI-body.heading+540)%360-180;
  return {distance,error,score:distance/TURN_COST.distanceScale+Math.abs(error)/TURN_COST.angleScale};
}
export function predictTurnCost(state,graph,pending,context){
  const base=predictMotor(state,graph,pending,context);
  const candidates=base.candidates.map(c=>({...c,...turnCost(c.endpoint,base.observation)}));
  let best=null;
  for(const candidate of candidates)if(best===null||candidate.score<best.score)best=candidate;
  return {...base,policy:TURN_COST.id,source:best?.source??null,candidates};
}
