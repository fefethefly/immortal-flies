import React, { useState } from 'react';
import { admissionExample, ADMISSION_EXAMPLES, ADMISSION_REASONS } from './protocol-admission-demo.mjs';

export function AdmissionPanel() {
  const [kind,setKind]=useState('valid');
  const {context,messages,result}=admissionExample(kind);
  return <section className="protocol-panel" id="admission" aria-label="消息接纳策略验证">
    <div className="panel-title"><h2>05 / 消息接纳策略</h2><span>relay-admission/1 · 独立固定场景</span></div>
    <div className="protocol-life">
      <p>此区在浏览器执行固定消息校验，不修改上方历史四臂回放，也不推进神经模拟。任务、环境和实例名单由本地测试提供，不代表网络身份认证。</p>
      <div className="protocol-arms">{Object.entries(ADMISSION_EXAMPLES).map(([key,label])=><button key={key} data-admission={key} aria-pressed={kind===key} onClick={()=>setKind(key)}>{label}</button>)}</div>
      <p>本地 food <strong>{context.own.food}</strong> → 施加 food <strong data-admission-input>{result.applied.food}</strong> · 接纳 {result.accepted.length} / 投递 {messages.length}</p>
      <p><code>{context.task} / {context.envId} / {context.sessionId}</code><br/>接收者 {context.recipient} · 第 {context.round} 拍</p>
    </div>
    <div className="protocol-table"><table><thead><tr><th>消息 / 来源实例</th><th>决定</th><th>原因码</th><th>本条输入变化</th></tr></thead><tbody>
      {result.decisions.map((d,i)=><tr key={i} data-decision={d.reason}><td>{d.messageId ?? '无 ID'}<br/>{d.instanceId ?? '未知来源'}</td><td>{ADMISSION_REASONS[d.reason]}</td><td><code>{d.reason}</code></td><td>{d.accepted ? `${d.before} → ${d.after}` : '不施加输入'}</td></tr>)}
    </tbody></table></div>
    <details className="protocol-life"><summary>查看本场景消息与决策 JSON</summary><pre style={{overflowX:'auto',fontSize:12}}>{JSON.stringify({context,messages,decisions:result.decisions},null,2)}</pre></details>
    <p className="protocol-note">有效消息也可能不增加输入；同批次同 ID 内容冲突全部拒绝。跨调用去重要求调用方携带 state；本页切换场景会重置它。不验证观察事实真伪、不做学习或经验晋升。</p>
  </section>;
}
