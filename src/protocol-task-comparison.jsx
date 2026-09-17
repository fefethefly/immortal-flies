import React from 'react';
import legacy from '../reports/protocol-replay-smoke-v1.json';
import admission from '../reports/admission-replay-v1.json';
import { taskComparison } from './protocol-task-comparison.mjs';
const labels={off:'不通信',simple:'简单中继',admitted:'接纳策略中继'};

export function TaskComparisonPanel() {
  let rows;
  try { rows=taskComparison(legacy,admission); }
  catch { return <section className="protocol-panel" id="task-comparison"><p role="alert" className="protocol-life">任务证据不匹配，拒绝合并比较。</p></section>; }
  return <section className="protocol-panel" id="task-comparison" aria-label="匹配任务结果对照">
    <div className="panel-title"><h2>07 / 行为变化 ≠ 任务收益</h2><span>已有固定场景 · 正常通信三组对照</span></div>
    <div className="protocol-life"><p>相同世界、图、模型、初始状态和执行步数已匹配。数据来自两份既有复算包，不是新开发集、留出验证或规模实验。故障场景不参与本表。</p>
      <p data-task-conclusion>三组均未采集到食物，采集净差为 0。消息改变了接收者位移，但此场景没有证明任务收益；不把未成功的首次采集时间记为 0。</p></div>
    <div className="protocol-table"><table><caption className="protocol-note">全程两生命、32 拍；位移为接收者终点减起点，不是路径长度或朝食物的进展。</caption><thead><tr><th scope="col">组别</th><th scope="col">团队采集 / 净差</th><th scope="col">首次采集拍</th><th scope="col">威胁暴露</th><th scope="col">总状态步数</th><th scope="col">输入变化帧</th><th scope="col">接收者 Δx, Δy</th><th scope="col">投递数</th><th scope="col">原始 / 接纳字节</th></tr></thead><tbody>
      {rows.map(r=><tr key={r.arm} data-task-row={r.arm}><th scope="row">{labels[r.arm]}</th><td>{r.collected} / {r.collectionDelta}</td><td>{r.firstCollection===null?'未采集':r.firstCollection}</td><td>{r.hazardExposure}</td><td>{r.executedSteps}</td><td>{r.changedInputs}</td><td>{r.dx}, {r.dy}</td><td>{r.rawDeliveries}</td><td>{r.rawBytes} / {r.acceptedBytes}</td></tr>)}
    </tbody></table></div>
    <p className="protocol-note">接纳策略消息含任务／环境／会话字段，载荷更大；相同投递数不等于相同字节成本。威胁暴露为 0 不能证明安全优势：该固定场景没有威胁。此处只做记录对照，完整重算仍需运行包校验命令。</p>
    <details className="protocol-life"><summary>三组来源结果哈希</summary>{rows.map(r=><p key={r.arm}>{labels[r.arm]}<br/><code>{r.resultHash}</code></p>)}</details>
  </section>;
}
