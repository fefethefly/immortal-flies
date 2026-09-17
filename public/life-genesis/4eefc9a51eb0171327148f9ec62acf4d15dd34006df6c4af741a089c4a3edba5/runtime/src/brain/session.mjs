import { hash, clone, requireValue, canonical } from './codec.mjs';
import { createState, validateState, reduceEvent } from './runtime.mjs';
import { createAdapters } from './adapters.mjs';

export class BrainSession {
  constructor(graph, initial=createState(graph), adapters=createAdapters()) {
    validateState(initial,graph); this.graph=graph; this.initial=clone(initial); this.state=clone(initial); this.events=[]; this.adapters=adapters;
  }
  async dispatch(event) {
    // Caller serializes commands; mutations occur only after validation and hashing succeed.
    requireValue(this.events.length<20000,'JOURNAL_LIMIT','请导出本次生命档案后开启新会话');
    const saved=clone(event), next=reduceEvent(this.state,saved,this.graph,this.adapters);
    next.historyRoot=await hash({parent:this.state.historyRoot,event:saved});
    next.eventCount=this.state.eventCount+1;
    this.events.push(saved); this.state=next;
    return this.state;
  }
  async checkpoint() {
    const payload={schema:'iff.archive/1', engine:'iff-runtime/1', manifest:this.graph.manifest,
      initial:clone(this.initial),events:clone(this.events),state:clone(this.state)};
    return {payload,sha256:await hash(payload)};
  }
  async prove() {
    const replay=await BrainSession.restore(await this.checkpoint(),this.graph,this.adapters);
    return { equal:canonical(replay.state)===canonical(this.state), ticks:this.state.ticks, events:this.events.length,
      stateHash:await hash(this.state), historyRoot:this.state.historyRoot };
  }
  static async restore(archive,graph,adapters=createAdapters()) {
    requireValue(archive?.payload?.schema==='iff.archive/1' && archive.payload.engine==='iff-runtime/1','ARCHIVE_SCHEMA');
    requireValue(await hash(archive.payload)===archive.sha256,'ARCHIVE_HASH','档案完整性校验失败');
    const p=archive.payload;
    requireValue(Array.isArray(p.events)&&p.events.length<=20000,'ARCHIVE_EVENTS');
    requireValue(canonical(p.manifest)===canonical(graph.manifest),'ARCHIVE_DATASET');
    validateState(p.initial,graph); validateState(p.state,graph);
    const restored=new BrainSession(graph,p.initial,adapters);
    let work=p.initial.ticks;
    for(const event of p.events) {
      if(event.type==='step') work+=event.count;
      requireValue(work<=1000000,'REPLAY_LIMIT','档案超过当前浏览器重放预算');
      await restored.dispatch(event);
    }
    requireValue(canonical(restored.state)===canonical(p.state),'REPLAY_MISMATCH','档案状态与历史重放结果不一致');
    return restored;
  }
}

