import { clone, requireValue, integer, identifier, ZERO_HASH } from './codec.mjs';
import { createAdapters, validateInput } from './adapters.mjs';
import { decodeEthology } from './ethology.mjs';

export const PROFILES = Object.freeze({
  'lif-integer/1': Object.freeze({ leak: 95, threshold: 1000, gain: 16, refractory: 2 }),
  'lif-integer/2': Object.freeze({ leak: 93, threshold: 1000, gain: 16, refractory: 2 }),
});
export const ENCODER = 'sensory-groups/1';
export const DECODER = 'motor-balance/1';
export function createState(graph, {soulId = 'genesis-001', branchId = 'local', model = 'lif-integer/1', seed = 43} = {}) {
  requireValue(PROFILES[model], 'UNKNOWN_MODEL'); identifier(soulId); identifier(branchId); integer(seed, 1, 0xffffffff, 'seed');
  return { schema:'iff.state/1', soulId, branchId, model, encoder:ENCODER, decoder:DECODER,
    datasetHash:graph.datasetHash, metadataHash:graph.metadataHash, ticks:0, rng:seed,
    voltage:Array(graph.n).fill(0), refractory:Array(graph.n).fill(0), spikes:[],
    body:{ x:5000, y:5000, heading:0, energy:1000 }, signal:{food:0, threat:0, light:0},
    enabledSources:['environment','market'], cursors:{}, lastObservedAt:0, exposure:{food:0,threat:0,light:0},
    historyRoot:ZERO_HASH, eventCount:0, lastAction:'REST', migrationCount:0 };
}
export function validateState(s, graph) {
  requireValue(s?.schema === 'iff.state/1' && PROFILES[s.model], 'STATE_SCHEMA');
  requireValue(s.datasetHash === graph.datasetHash && s.metadataHash === graph.metadataHash, 'DATASET_MISMATCH');
  requireValue(s.encoder === ENCODER && s.decoder === DECODER, 'CODEC_VERSION');
  identifier(s.soulId); identifier(s.branchId);
  integer(s.ticks,0,1e12,'ticks'); integer(s.rng,1,0xffffffff,'rng'); integer(s.eventCount,0,1e9,'eventCount'); integer(s.migrationCount,0,1e9,'migrationCount');
  requireValue(/^0x[0-9a-f]{64}$/.test(s.historyRoot), 'HISTORY_ROOT');
  requireValue(Array.isArray(s.enabledSources) && s.enabledSources.length <= 32 && new Set(s.enabledSources).size === s.enabledSources.length, 'SOURCES');
  s.enabledSources.forEach(v=>identifier(v));
  requireValue(s.cursors && Object.keys(s.cursors).length <= 32, 'CURSORS');
  Object.entries(s.cursors).forEach(([k,v])=>{identifier(k);integer(v,0,1e12,'cursor');});
  integer(s.lastObservedAt,0,Number.MAX_SAFE_INTEGER,'lastObservedAt');
  for(const [key, min, max] of [['voltage',-10000,10000],['refractory',0,2]]) {
    requireValue(Array.isArray(s[key]) && s[key].length === graph.n, 'STATE_DIMENSION');
    s[key].forEach(v=>integer(v,min,max,key));
  }
  requireValue(Array.isArray(s.spikes) && s.spikes.length <= graph.n && new Set(s.spikes).size === s.spikes.length, 'STATE_SPIKES');
  s.spikes.forEach(v=>integer(v,0,graph.n-1,'spike'));
  for(const key of ['food','threat','light']) { integer(s.signal[key],0,1000,key); integer(s.exposure[key],0,1e15,key); }
  integer(s.body.x,0,10000,'x'); integer(s.body.y,0,10000,'y'); integer(s.body.heading,0,359,'heading'); integer(s.body.energy,0,1000,'energy');
  requireValue(['REST','FORAGE','AVOID','EXPLORE'].includes(s.lastAction), 'STATE_ACTION');
  return s;
}
function random(s) { let x=s.rng; x^=x<<13; x^=x>>>17; x^=x<<5; s.rng=x>>>0; return s.rng; }

/** Integer discrete-time LIF approximation. Measured edges; engineered sensory/motor mapping. No biological-time claim. */
export function step(state, graph, count) {
  integer(count,1,128,'步数');
  const s=clone(state), p=PROFILES[s.model], incoming=new Float64Array(graph.n);
  for(let t=0;t<count;t++) {
    incoming.fill(0);
    for(const pre of s.spikes) {
      const sign=graph.metadata.nodes[pre].sign;
      if (!sign) continue;
      for(let edge=graph.offsets[pre];edge<graph.offsets[pre+1];edge++) incoming[graph.targets[edge]] += graph.weights[edge]*sign*p.gain;
    }
    for(const channel of ['food','threat','light']) {
      const intensity=s.signal[channel]; s.exposure[channel]+=intensity;
      for(const i of graph.metadata.groups[channel]) if(random(s)%1000 < intensity) incoming[i]+=1100;
    }
    const spikes=[];
    for(let i=0;i<graph.n;i++) {
      if(s.refractory[i]) { s.refractory[i]--; s.voltage[i]=0; continue; }
      const v=Math.max(-10000,Math.min(10000,Math.trunc(s.voltage[i]*p.leak/100)+incoming[i]));
      if(v>=p.threshold) { spikes.push(i); s.voltage[i]=0; s.refractory[i]=p.refractory; } else s.voltage[i]=v;
    }
    s.spikes=spikes; s.ticks++;
    const active=new Set(spikes);
    const left=graph.metadata.groups.left.reduce((n,i)=>n+Number(active.has(i)),0);
    const right=graph.metadata.groups.right.reduce((n,i)=>n+Number(active.has(i)),0);
    // Discrete body integrator keeps replay independent of floating-point trig implementations.
    s.body.heading=(s.body.heading+Math.sign(right-left)*9+360)%360;
    const heading=Math.floor(s.body.heading/45), directions=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    const speed=Math.min(35,(left+right)*3);
    s.body.x=Math.max(0,Math.min(10000,s.body.x+directions[heading][0]*speed));
    s.body.y=Math.max(0,Math.min(10000,s.body.y+directions[heading][1]*speed));
    if (s.body.x===0||s.body.x===10000||s.body.y===0||s.body.y===10000) s.body.heading=(s.body.heading+135)%360;
    s.body.energy=Math.max(0,Math.min(1000,s.body.energy+(s.signal.food>500?2:-1)));
    s.lastAction=decodeEthology(s,graph).action;
  }
  return s;
}

export function reduceEvent(state, event, graph, adapters=createAdapters()) {
  let s=clone(state);
  if(event.type==='input') {
    const signal=validateInput(event.frame,s,adapters,event.acceptedAt);
    s.signal=signal; s.cursors[event.frame.sourceId]=event.frame.sequence; s.lastObservedAt=event.frame.observedAt;
  } else if(event.type==='step') return step(s,graph,event.count);
  else if(event.type==='source') {
    identifier(event.sourceId); requireValue(typeof event.enabled==='boolean','SOURCE_ENABLED');
    const sources=new Set(s.enabledSources);
    event.enabled?sources.add(event.sourceId):sources.delete(event.sourceId);
    requireValue(sources.size<=32,'SOURCE_LIMIT'); s.enabledSources=[...sources].sort();
    // Clearing stimuli prevents a disabled source from continuing to drive the next steps.
    s.signal={food:0,threat:0,light:0};
  } else if(event.type==='migration') {
    requireValue(PROFILES[event.to] && event.to!==s.model && event.from===s.model,'INVALID_MIGRATION');
    s.model=event.to; s.migrationCount++;
  } else requireValue(false,'UNKNOWN_EVENT');
  return s;
}

