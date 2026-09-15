import { loadGraph } from './graph.mjs';
import { BrainSession } from './session.mjs';
import { makeInput } from './adapters.mjs';
import { hash } from './codec.mjs';
import { summarizeSignals } from './signals.mjs';

let session;
// Serial mailbox prevents asynchronous digest calls from racing canonical state.
let queue=Promise.resolve();
self.onmessage=({data})=> { queue=queue.then(async()=> {
  try {
    let result;
    if(data.type==='load') { const graph=await loadGraph(data.url); session=new BrainSession(graph); result={manifest:graph.manifest,nodes:graph.metadata.nodes.slice(0,1500),groups:graph.metadata.groups,edges:sampleEdges(graph)}; }
    else if(!session) throw new Error('请先载入连接组');
    else if(data.type==='input') { const now=Date.now(); await session.dispatch({type:'input',frame:makeInput(session.state,data.adapter,data.payload,{now,provenance:data.provenance||{kind:'simulation'}}),acceptedAt:now}); }
    else if(data.type==='event') await session.dispatch(data.event);
    else if(data.type==='export') result=await session.checkpoint();
    else if(data.type==='restore') { const restored=await BrainSession.restore(data.archive,session.graph); session=restored; result={restored:true}; }
    else if(data.type==='prove') result=await session.prove();
    else if(data.type==='commitment') result={stateHash:await hash(session.state),historyRoot:session.state.historyRoot,model:session.state.model,ticks:session.state.ticks};
    else throw new Error('未知命令');
    const s=session.state, signals=summarizeSignals(s,session.graph);
    self.postMessage({id:data.id,result,state:{...s,voltage:undefined,refractory:undefined,...signals,spikes:s.spikes.filter(i=>i<1500).slice(0,3000),spikeCount:s.spikes.length},events:session.events.slice(-12)});
  } catch(error) { self.postMessage({id:data.id,error:{code:error.code||'RUNTIME_ERROR',message:error.message}}); }
}); };
function sampleEdges(graph) {
  const edges=[];
  for(let i=0;i<Math.min(graph.n,1500);i++) for(let j=graph.offsets[i];j<Math.min(graph.offsets[i+1],graph.offsets[i]+5);j++) if(graph.targets[j]<1500) edges.push([i,graph.targets[j],graph.weights[j]]);
  return edges;
}
