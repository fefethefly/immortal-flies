import React, { useEffect, useState } from "react";
import bundle from "../reports/protocol-replay-smoke-v1.json";
import bundleUrl from "../reports/protocol-replay-smoke-v1.json?url";
import { hash } from "./brain/codec.mjs";
import { AdmissionPanel } from "./protocol-admission-panel.jsx";
import { AdmissionReplayPanel } from "./protocol-admission-replay.jsx";
import { TaskComparisonPanel } from "./protocol-task-comparison.jsx";
import "./fonts.css";
import "./protocol.css";

const arms = { off: "不通信", relay: "正常中继", duplicate: "重复投递", scrambled: "坐标打乱" };
const point = b => `${(b.x - 3000) / 5},${(b.y - 4000) / 5}`;
export function ProtocolPage() {
  const [arm, setArm] = useState("relay"), [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false), [integrity, setIntegrity] = useState("检查中");
  const run = bundle.runs[arm], max = run.config.rounds;
  useEffect(() => {
    document.title = "群体协议实验台 — IMMORTAL";
    let active = true;
    const { bundleHash, ...payload } = bundle;
    hash(payload).then(h => { if (active) setIntegrity(h === bundleHash ? "完整性校验通过" : "完整性校验失败"); }).catch(() => { if (active) setIntegrity("完整性校验不可用"); });
    const hide = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", hide);
    return () => { active = false; document.removeEventListener("visibilitychange", hide); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    if (tick >= max) { setPlaying(false); return; }
    const id = setTimeout(() => setTick(t => Math.min(max, t + 1)), 450);
    return () => clearTimeout(id);
  }, [playing, tick, max]);
  const frames = run.traces.filter(t => t.round === tick);
  const bodies = tick ? frames.map(t => t.after) : run.traces.slice(0, 2).map(t => t.before);
  const sent = run.messages.filter(m => m.observedRound === tick);
  const wire = run.transmissions.filter(m => m.round === tick);
  const receipts = run.receipts.filter(m => m.round === tick);
  const seek = n => { setPlaying(false); setTick(n); };
  return <main className="protocol">
    <header className="protocol-head"><a href="/">IMMORTAL <small> / LAB</small></a><nav><a href="/brain.html">连接组</a><a href="#comparison">四臂对照</a><a href={bundleUrl} download="protocol-replay-smoke-v1.json">下载复算包 ↓</a></nav></header>
    <section className="protocol-intro"><div><p className="eyebrow">FLYSWARM / PROTOCOL EVIDENCE / 01</p><h1>群体协议实验台</h1><p>看见一条消息，如何成为另一个生命的输入。</p></div><div className="protocol-stamp">SIM · 只读回放<br/><small>2 生命 · 合成 2 节点图 · 32 拍</small></div></section>
    <aside className="protocol-warning">证据边界：四臂采集均为 0。这是接收与去重链路验证，不是 MaleCNS 实验、实时模拟或 T3 协作增益证明。</aside>
    <section className="protocol-controls" aria-label="回放控制"><div className="protocol-arms">{Object.entries(arms).map(([key, label]) => <button key={key} data-arm={key} aria-pressed={arm === key} onClick={() => { setArm(key); setTick(0); setPlaying(false); }}>{label}</button>)}</div><div className="protocol-timeline"><button data-play onClick={() => { if (tick === max) setTick(0); setPlaying(p => !p); }}>{playing ? "暂停" : "播放"}</button><button aria-label="上一拍" disabled={!tick} onClick={() => seek(tick - 1)}>−</button><input aria-label="回放拍数" type="range" min="0" max={max} value={tick} onChange={e => seek(Number(e.target.value))}/><button aria-label="下一拍" disabled={tick === max} onClick={() => seek(tick + 1)}>+</button><output data-tick>{String(tick).padStart(2, "0")} / {max}</output></div></section>
    <div className="protocol-grid"><section className="protocol-panel"><div className="panel-title"><h2>01 / 身体与通信</h2><span>第 {tick} 拍结束后</span></div>
      <svg className="protocol-scene" viewBox="0 0 700 400" role="img" aria-label="两生命路径与本拍接收连线，局部坐标视图">
        <defs><pattern id="protocol-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#2f2a1f" strokeWidth="1"/></pattern></defs><rect width="700" height="400" fill="url(#protocol-grid)"/>
        {bodies.map((b, i) => { const [x,y] = point(b).split(','); return <g key={i}><circle cx={x} cy={y} r="200" className="sense-radius"/><polyline points={[run.traces[i].before, ...run.traces.filter(t => t.fly === i && t.round <= tick).map(t => t.after)].map(point).join(' ')} fill="none" stroke={i ? '#93a181' : '#f0ead9'} strokeWidth="3"/>{receipts.filter(r => r.to === i).map(r => { const m = run.messages.find(m => m.id === r.messageId); const [sx,sy] = point(m.observer).split(','); return <line key={r.messageId} x1={sx} y1={sy} x2={x} y2={y} className="message-line"/>; })}<circle cx={x} cy={y} r="9" fill={i ? '#93a181' : '#f0ead9'}/><text x={Number(x)+15} y={Number(y)-15}>生命 {i} · {b.heading}°</text></g>; })}
        {bundle.world.food.map((f,i) => { const [x,y]=point(f).split(','); return <g key={i}><circle cx={x} cy={y} r="8" fill="#f0b90b"/><text x={Number(x)+16} y={Number(y)+5}>食物</text></g>; })}
        <text x="15" y="380">x: 3000–6500 / y: 4000–6000 · 圆：本地观察半径</text>
      </svg><p className="protocol-note">虚线：发送时观察位置 → 接收者拍末位置，并非实时信号。坐标向右、向下增加；按原始坐标绘制，位移较小。</p>
    </section><section className="protocol-panel"><div className="panel-title"><h2>02 / 输入 → 行为</h2><span>本拍记录</span></div>{bodies.map((b,i) => <article className="protocol-life" key={i}><h3>生命 {i} <small>{i ? '接收者' : '观察者'}</small></h3><dl><dt>本地 food / own</dt><dd>{frames[i]?.own.food ?? '—'}</dd><dt>施加 food / applied</dt><dd data-input={i}>{frames[i]?.applied.food ?? '—'}</dd><dt>动作 / action</dt><dd>{frames[i]?.action ?? '初始状态'}</dd><dt>位置 x, y</dt><dd>{b.x}, {b.y}</dd><dt>本拍采集事件</dt><dd>{run.ledger.filter(e => e.round === tick && e.taker === i).length}</dd></dl></article>)}</section></div>
    <section className="protocol-panel protocol-events"><div className="panel-title"><h2>03 / 消息证据</h2><span>观察 {sent.length} · 原始投递 {wire.length} · 接收 {receipts.length}</span></div><div className="event-columns"><div><h3>观察 / 发送</h3>{sent.length ? sent.map(m => <p key={m.id}><code>{m.id}</code><br/>生命 {m.from} 观察 {m.channel} ({m.x}, {m.y})<br/>第 {m.deliveryRound} 拍送达</p>) : <p>本拍无新消息</p>}</div><div><h3>传输 / 含重复</h3>{wire.length ? wire.map((m,i) => <p key={i}><code>{m.messageId}</code> → 生命 {m.to}<br/>副本 {m.copy + 1} · {m.payloadBytes} B<br/>载荷 ({m.deliveredX}, {m.deliveredY})</p>) : <p>本拍无投递</p>}</div><div><h3>去重 / 接收</h3>{receipts.length ? receipts.map((m,i) => <p key={i}><code>{m.messageId}</code> → 生命 {m.to}<br/>候选强度 {m.value}<br/>收到 ≠ 输入增加；按 max 与 own 合并</p>) : <p>本拍无接收回执</p>}</div></div></section>
    <section id="comparison" className="protocol-panel"><div className="panel-title"><h2>04 / 四臂结果</h2><span>全程汇总，非当前拍</span></div><div className="protocol-table"><table><thead><tr>{['实验臂','采集','输入变化拍数','原始 / 有效投递','原始 / 有效载荷 B'].map(s => <th key={s}>{s}</th>)}</tr></thead><tbody>{Object.entries(bundle.summary).map(([key,s]) => <tr key={key} className={key === arm ? 'selected' : ''}><th>{arms[key]}</th><td>{s.collected}</td><td>{s.changedInputs}</td><td>{s.rawDeliveries} / {s.acceptedDeliveries}</td><td>{s.rawPayloadBytes} / {s.acceptedPayloadBytes}</td></tr>)}</tbody></table></div></section>
    <AdmissionPanel />
    <AdmissionReplayPanel />
    <TaskComparisonPanel />
    <footer className="protocol-evidence"><p role="status">{integrity} · 浏览器仅校验包哈希，不执行神经重算。</p><code>{bundle.bundleHash}</code><p>独立完整重放：在项目目录执行 <code>node scripts/protocol-replay.mjs verify</code></p><p>不连接钱包、不发送交易、不写入生命状态。数据来自固定历史复算包。</p></footer>
  </main>;
}
