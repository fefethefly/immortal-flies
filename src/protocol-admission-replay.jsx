import React, { useEffect, useState } from 'react';
import bundle from '../reports/admission-replay-v1.json';
import bundleUrl from '../reports/admission-replay-v1.json?url';
import { hash } from './brain/codec.mjs';
import { ADMISSION_REASONS } from './protocol-admission-demo.mjs';
const labels={off:'不通信',valid:'有效消息',duplicate:'重复投递',mixed:'有效 + 跨环境',environment:'全跨环境',expired:'延迟过期',conflict:'内容冲突'};

export function AdmissionReplayPanel() {
  const [arm,setArm]=useState('valid'),[round,setRound]=useState(0),[playing,setPlaying]=useState(false);
  const [verified,setVerified]=useState('检查中');
  const run=bundle.runs[arm],total=run.config.rounds;
  useEffect(()=>{
    let active=true;
    const {bundleHash,...payload}=bundle;
    hash(payload).then(h=>{if(active)setVerified(h===bundleHash?'完整性校验通过':'完整性校验失败');}).catch(()=>{if(active)setVerified('校验不可用');});
    const hide=()=>{if(document.hidden)setPlaying(false);};
    document.addEventListener('visibilitychange',hide);
    return ()=>{active=false;document.removeEventListener('visibilitychange',hide);};
  },[]);
  useEffect(()=>{
    if(!playing)return;
    if(round===total){setPlaying(false);return;}
    const timer=setTimeout(()=>setRound(r=>Math.min(total,r+1)),450);
    return ()=>clearTimeout(timer);
  },[playing,round,total]);
  const frames=round?run.traces.filter(t=>t.round===round):run.traces.slice(0,2);
  const entries=run.transmissions.map((t,i)=>({t,d:run.decisions[i]})).filter(({t})=>t.round===round);
  const jump=n=>{setPlaying(false);setRound(n);};
  return <section className="protocol-panel" id="admission-replay" aria-label="任务级接纳回放">
    <div className="panel-title"><h2>06 / 任务级接纳回放</h2><span>admission-relay/1 · 保存的完整执行日志</span></div>
    <div className="protocol-life"><p>七个固定场景 · 两生命各 32 拍 · 合成 2 节点图。这里回放新运行器的记录，不是上方独立消息示例，也不在浏览器重算神经状态。所有场景采集均为 0，不证明协作增益。</p>
      <div className="protocol-arms">{Object.entries(labels).map(([key,label])=><button key={key} data-run-arm={key} aria-pressed={arm===key} onClick={()=>{setArm(key);jump(0);}}>{label}</button>)}</div>
      <div className="protocol-timeline" style={{marginTop:16}}><button data-run-play onClick={()=>{if(round===total)setRound(0);setPlaying(p=>!p);}}>{playing?'暂停任务回放':'播放任务回放'}</button><button aria-label="任务上一拍" disabled={!round} onClick={()=>jump(round-1)}>−</button><input aria-label="任务回放拍数" type="range" min="0" max={total} value={round} onChange={e=>jump(Number(e.target.value))}/><button aria-label="任务下一拍" disabled={round===total} onClick={()=>jump(round+1)}>+</button><output data-run-tick>{round} / {total}</output></div>
      <p role="status" data-run-integrity>{verified}（仅包哈希）</p>
      <p>全程：原始投递 {run.budget.rawDeliveries} / 接纳 {run.budget.deliveries} / 拒绝 {run.budget.rejectedDeliveries}；载荷字节 {run.budget.rawDeliveryPayloadBytes} / 接纳字节 {run.budget.deliveryPayloadBytes}。</p>
    </div>
    <div className="event-columns">{frames.map((f,i)=>{const body=round?f.after:f.before;return <article className="protocol-life" key={i}><h3>{run.members[i]}</h3><dl><dt>本地 → 施加 food</dt><dd data-run-input={i}>{round?`${f.own.food} → ${f.applied.food}`:'初始状态'}</dd><dt>动作</dt><dd>{round?f.action:'—'}</dd><dt>拍末坐标 / 朝向</dt><dd data-run-body={i}>{body.x}, {body.y} / {body.heading}°</dd><dt>本拍采集</dt><dd>{run.ledger.filter(e=>e.round===round&&e.taker===i).length}</dd></dl></article>;})}</div>
    <div className="protocol-table"><table><thead><tr><th>消息 / 原始投递</th><th>观察 → 接收拍</th><th>接纳决定</th><th>本条输入变化</th></tr></thead><tbody>{entries.length?entries.map(({t,d},i)=><tr key={i} data-run-decision={d.reason}><td><code>{t.messageId}</code><br/>{t.message.instanceId} → {d.recipient}<br/>{t.payloadBytes} B · 副本 {t.copy+1}</td><td>{t.message.observedRound} → {t.round}</td><td>{ADMISSION_REASONS[d.reason]}<br/><code>{d.reason}</code></td><td>{d.accepted?`${d.before} → ${d.after}`:'不施加输入'}</td></tr>):<tr><td colSpan="4">本拍无投递；过期场景首条消息第 3 拍才送达。</td></tr>}</tbody></table></div>
    <details className="protocol-life"><summary>本拍完整投递载荷与决策</summary><pre style={{overflowX:'auto',fontSize:12}}>{JSON.stringify(entries,null,2)}</pre></details>
    <div className="protocol-life"><a href={bundleUrl} download="admission-replay-v1.json">下载任务级决策复算包 ↓</a><p><code style={{overflowWrap:'anywhere'}}>{bundle.bundleHash}</code></p><p>完整重算命令：<code>node scripts/admission-replay.mjs verify</code></p><p>每接收者状态由运行器持有；名单不是认证，环境绑定不是观察真实性证明。原始投递与决策逐条对应，拒绝不等于没有传输成本。</p></div>
  </section>;
}
