import {integer,requireValue} from './codec.mjs';
import {step,validateState} from './runtime.mjs';
import {motorInput,validateMotorSources} from './relay-motor-input.mjs';

// External model-predictive controller. Full state/model access and extra
// simulation are privileges, NOT neural learning or equal-compute capability.
export const PREDICTIVE_MOTOR = Object.freeze({
  id:'predictive-food-input/1',horizon:5,
  sources:Object.freeze([null,904,941,994]),
  objective:'minimum endpoint squared distance to current observed coordinate',
  tieBreak:'first candidate in [null,904,941,994]',
  execution:'constant source in each forecast; execute only first step',
});
export function sensoryView(graph,source){
  requireValue(PREDICTIVE_MOTOR.sources.includes(source),'PREDICTIVE_SOURCE');
  return {...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:[source??994]}}};
}
export function sensoryStep(state,graph,source){
  return step({...state,signal:{food:source===null?0:1000,threat:0,light:0}},sensoryView(graph,source),1);
}
const edgeWork=(s,g)=>s.spikes.reduce((n,i)=>n+(g.metadata.nodes[i].sign?g.offsets[i+1]-g.offsets[i]:0),0);
export function predictMotor(state,graph,pending,{to,round,observations}){
  validateMotorSources(graph);validateState(state,graph);integer(round,1,1000,'round');
  const {observation}=motorInput(pending,{to,round,body:state.body,observations},'dual');
  if(!observation)return {policy:PREDICTIVE_MOTOR.id,observation:null,source:null,candidates:[],
    predictionSteps:0,predictionEdgeVisits:0};
  let best=null,predictionEdgeVisits=0;
  const candidates=[];
  for(const source of PREDICTIVE_MOTOR.sources){
    let forecast=state,first=null;
    for(let i=0;i<PREDICTIVE_MOTOR.horizon;i++){
      predictionEdgeVisits+=edgeWork(forecast,graph);
      forecast=sensoryStep(forecast,graph,source);
      if(i===0)first={body:{...forecast.body},spikes:[...forecast.spikes],rng:forecast.rng};
    }
    const distance2=(forecast.body.x-observation.x)**2+(forecast.body.y-observation.y)**2;
    const candidate={source,distance2,endpoint:{...forecast.body},first};candidates.push(candidate);
    if(best===null||distance2<best.distance2)best=candidate;
  }
  return {policy:PREDICTIVE_MOTOR.id,observation,source:best.source,candidates,
    predictionSteps:PREDICTIVE_MOTOR.horizon*PREDICTIVE_MOTOR.sources.length,predictionEdgeVisits};
}
