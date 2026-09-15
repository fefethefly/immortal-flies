import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity,ArrowUpRight,Pause,Play,Download,Upload,ShieldCheck,Network,Database,ChevronRight,Radio,Eye} from 'lucide-react';
import {VitruvianFly} from './vitruvian.jsx';
import {SiteBar} from './site-chrome.jsx';
import {captureMarket} from './brain/chain.mjs';
import {proposeAction,proposeTrade} from './brain/policy.mjs';
import {decodeTrade} from './swarm.mjs';
import {SIGNAL_GROUPS} from './brain/signals.mjs';
import {LocaleContext, useTx} from './locale-context.jsx';
import {useLocale} from './use-locale.mjs';
import './fonts.css';
import './brain.css';

const OFFICIAL_NEURONS = 166700;
const FULL_NEURONS = 161839;

const count=n=>Number(n||0).toLocaleString('en-US');
const short=(s,wait)=>s?`${s.slice(0,12)}…${s.slice(-6)}`:wait;
const store={
  async db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('iff-connectome',1);r.onupgradeneeded=()=>r.result.createObjectStore('archives');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
  async get(key){const db=await this.db();try{return await new Promise((resolve,reject)=>{const r=db.transaction('archives').objectStore('archives').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}},
  async put(key,data){const db=await this.db();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('archives','readwrite');tx.objectStore('archives').put(data,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
};

function groupColors(groups){
  const map=new Map();
  for(const [name,,color] of SIGNAL_GROUPS) for(const i of groups?.[name]||[]) map.set(i,color);
  return map;
}

function NeuralScene({nodes,edges,state,bodyView,groups}) {
  const tx=useTx();
  const ref=useRef(), latest=useRef({nodes,edges,state,bodyView,groups:groupColors(groups),tx});
  useEffect(()=>{latest.current={nodes,edges,state,bodyView,groups:groupColors(groups),tx};},[nodes,edges,state,bodyView,groups,tx]);
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas.getContext('2d'); let width=0,height=0,raf,angle=0;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resize=new ResizeObserver(([e])=>{width=e.contentRect.width;height=e.contentRect.height;const d=Math.min(devicePixelRatio,2);canvas.width=width*d;canvas.height=height*d;ctx.setTransform(d,0,0,d,0,0);});resize.observe(canvas);
    function draw(){raf=requestAnimationFrame(draw);if(document.hidden||!width)return;ctx.clearRect(0,0,width,height);
      const {nodes,edges,state,bodyView,groups,tx}=latest.current;if(!nodes.length)return;const role=groups instanceof Map?groups:new Map();
      const cx=width/2,cy=height/2;
      ctx.strokeStyle='#2a261c';ctx.lineWidth=.7;
      for(let i=0;i<12;i++){const y=height*.18+i*height*.07;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
      for(let i=-8;i<9;i++){ctx.beginPath();ctx.moveTo(cx+i*28,height*.13);ctx.lineTo(cx+i*100,height);ctx.stroke();}
      if(bodyView){
        ctx.strokeStyle='#6e675c';ctx.beginPath();ctx.ellipse(cx,cy,width*.4,height*.34,0,0,Math.PI*2);ctx.stroke();
        const x=width*.1+state.body.x/10000*width*.8,y=height*.16+state.body.y/10000*height*.68;
        const foodX=width*.7,foodY=height*.35;
        ctx.fillStyle='#b08a4a';ctx.shadowColor='#b08a4a';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(foodX,foodY,5+state.signal.food/120,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
        ctx.fillStyle='#9a9284';ctx.font='10px monospace';ctx.fillText(tx('brain.stimulusMark'),foodX+15,foodY-12);
        ctx.save();ctx.translate(x,y);ctx.rotate((state.body.heading+90)*Math.PI/180);
        ctx.strokeStyle='#e8e2d6';ctx.fillStyle='#16140f';ctx.shadowColor='#b08a4a';ctx.shadowBlur=10;
        for(const direction of [-1,1]){ctx.beginPath();ctx.ellipse(direction*14,0,8,22,direction*.5,0,Math.PI*2);ctx.fill();ctx.stroke();for(let j=-1;j<2;j++){ctx.beginPath();ctx.moveTo(direction*4,j*7);ctx.lineTo(direction*18,j*12+7);ctx.stroke();}}
        ctx.fillStyle='#e8e2d6';ctx.beginPath();ctx.ellipse(0,3,5,15,0,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.fillStyle='#c4b89a';ctx.font='12px monospace';ctx.fillText(tx('brain.act.'+state.lastAction),x+30,y+30);return;
      }
      if(!reduced)angle+=.001;
      const active=new Set(state?.spikes||[]), take=Math.min(nodes.length,1500), points=[];
      for(let i=0;i<take;i++){
        const p=nodes[i].position||[Math.sin(i)*.6,Math.cos(i*2)*.5,Math.sin(i*3)*.3];
        const x=p[0]*Math.cos(angle)+p[2]*Math.sin(angle),z=-p[0]*Math.sin(angle)+p[2]*Math.cos(angle);
        const scale=1+z*.12;points.push([cx+x*width*.36*scale,cy+p[1]*height*.38*scale,scale]);
      }
      for(const [from,to] of edges){if(!points[from]||!points[to])continue;const lit=active.has(from);ctx.strokeStyle=lit?'rgba(176,138,74,.5)':'rgba(196,184,154,.1)';ctx.lineWidth=lit?1:.45;ctx.beginPath();ctx.moveTo(points[from][0],points[from][1]);ctx.lineTo(points[to][0],points[to][1]);ctx.stroke();}
      points.forEach(([x,y,k],i)=>{const lit=active.has(i);ctx.fillStyle=lit?'#b08a4a':role.get(i)||(nodes[i].sign<0?'#8a7358':'#7d8b6e');ctx.shadowBlur=lit?10:0;ctx.shadowColor='#b08a4a';ctx.beginPath();ctx.arc(x,y,lit?3.2:k*.9,0,Math.PI*2);ctx.fill();});ctx.shadowBlur=0;
    }draw();return()=>{cancelAnimationFrame(raf);resize.disconnect();};
  },[]);
  return <canvas ref={ref} aria-label={bodyView?tx('brain.ariaSceneBody'):tx('brain.ariaSceneGraph')} />;
}

function SignalRack({state, trace}) {
  const tx=useTx();
  const wave=useRef();
  useEffect(()=>{
    const canvas=wave.current; if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const cssW=canvas.clientWidth, cssH=84, d=Math.min(devicePixelRatio,2);
    canvas.width=cssW*d; canvas.height=cssH*d; ctx.setTransform(d,0,0,d,0,0);
    ctx.clearRect(0,0,cssW,cssH);
    ctx.strokeStyle='#2a261c'; ctx.lineWidth=1;
    for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,cssH*i/4);ctx.lineTo(cssW,cssH*i/4);ctx.stroke();}
    if(!trace.length) return;
    const max=Math.max(1,...trace.map(frame=>frame.spikeCount||0));
    ctx.beginPath(); ctx.strokeStyle='#b08a4a'; ctx.lineWidth=1.4;
    trace.forEach((frame,i)=>{
      const x=i/(Math.max(trace.length-1,1))*cssW, y=cssH-6-(frame.spikeCount||0)/max*(cssH-16);
      i?ctx.lineTo(x,y):ctx.moveTo(x,y);
    }); ctx.stroke();
    ctx.beginPath(); ctx.strokeStyle='#7d8b6e'; ctx.lineWidth=1;
    trace.forEach((frame,i)=>{
      const preview=frame.voltagePreview||[];
      const mean=preview.length?preview.reduce((a,b)=>a+b,0)/preview.length:0;
      const x=i/(Math.max(trace.length-1,1))*cssW, y=cssH/2-mean/4000*(cssH/2-8);
      i?ctx.lineTo(x,y):ctx.moveTo(x,y);
    }); ctx.stroke();
  },[trace]);
  const groups=state?.groups||{};
  return <div className="signal-rack" aria-label="本步神经信号">
    <div className="signal-head"><span>{tx('brain.signalHead')}</span><small>{tx('brain.signalHint')}</small></div>
    <canvas ref={wave} className="signal-scope"/>
    <div className="signal-groups">{SIGNAL_GROUPS.map(([key,label,color])=>{
      const row=groups[key]||{size:0,spikes:0}; const ratio=row.size?row.spikes/row.size:0;
      const drive=state?.signal?.[key];
      return <div key={key}><span style={{color}}>{tx('brain.group.'+key)}</span><b>{row.spikes} / {row.size}</b><i><em style={{width:`${Math.round(ratio*100)}%`,background:color}}/></i>{drive!=null&&<small>{drive}</small>}</div>;
    })}</div>
    <div className="signal-hist" aria-hidden="true">{(state?.voltageHist||[]).map((n,i)=><em key={i} style={{height:`${8+n/Math.max(1,...(state.voltageHist||[1]))*28}px`}}/>)}</div>
  </div>;
}

function App(){
  const [locale,setLocale,tx]=useLocale('brain.title','meta.canonDesc');
  const worker=useRef(),pending=useRef(new Map()),serial=useRef(0),upload=useRef(),busyRef=useRef(false);
  const [data,setData]=useState(null),[state,setState]=useState(null),[events,setEvents]=useState([]),[busy,setBusy]=useState(true),[running,setRunning]=useState(false),[dataset,setDataset]=useState('circuit'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[proof,setProof]=useState(null),[bodyView,setBodyView]=useState(false),[archiveText,setArchiveText]=useState(''),[intent,setIntent]=useState(null),[pair,setPair]=useState(''),[input,setInput]=useState({food:650,threat:100,light:300}),[market,setMarket]=useState({changeBps:1200,activity:350}),[trace,setTrace]=useState([]),[fullReady,setFullReady]=useState(false);
  const ask=(command)=>new Promise((resolve,reject)=>{const id=++serial.current;pending.current.set(id,{resolve,reject});worker.current.postMessage({...command,id});});
  async function act(fn){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{return await fn();}catch(e){setError(e.message);setRunning(false);}finally{busyRef.current=false;setBusy(false);}}
  const save=async(silent=false)=>{const r=await ask({type:'export'});await store.put(dataset,r.result);if(!silent)setNotice(tx('brain.notice.saved'));return r.result;};
  useEffect(()=>{
    const w=new Worker(new URL('./brain/worker.mjs',import.meta.url),{type:'module'});worker.current=w;
    w.onmessage=({data:r})=>{const p=pending.current.get(r.id);if(!p)return;pending.current.delete(r.id);if(r.error)p.reject(new Error(`${r.error.code} · ${r.error.message}`));else{if(r.state)setState(r.state);if(r.events)setEvents(r.events);p.resolve(r);}};
    w.onerror=e=>{setError(e.message||tx('brain.workerErr'));setRunning(false);for(const p of pending.current.values())p.reject(new Error(tx('brain.workerErr')));pending.current.clear();};
    return()=>{w.terminate();for(const p of pending.current.values())p.reject(new Error(tx('brain.workerClosed')));pending.current.clear();};
  },[]);
  useEffect(()=>{fetch('/data/malecns-full/manifest.json').then(r=>setFullReady(r.ok)).catch(()=>setFullReady(false));},[]);
  useEffect(()=>{if(!state)return;setTrace(prev=>{const last=prev[prev.length-1];if(last&&last.ticks===state.ticks&&last.spikeCount===state.spikeCount)return prev;return[...prev,{ticks:state.ticks,spikeCount:state.spikeCount,voltagePreview:state.voltagePreview}].slice(-64);});},[state]);
  useEffect(()=>{let cancelled=false;setRunning(false);setProof(null);setIntent(null);act(async()=>{
    setTrace([]);setNotice(dataset==='full'?tx('brain.notice.full'):tx('brain.notice.circuit'));
    let r;try{r=await ask({type:'load',url:`/data/malecns-${dataset}/manifest.json`});}catch(e){throw new Error(dataset==='full'?tx('brain.fullNeed',{msg:e.message}):e.message);}if(cancelled)return;setData(r.result);
    try{const archive=await store.get(dataset);if(archive){await ask({type:'restore',archive});setNotice(tx('brain.notice.restored'));}else setNotice(tx('brain.notice.ready'));}catch(e){setNotice(tx('brain.notice.loaded'));setError(tx('brain.restoreFail',{msg:e.message}));}
  });return()=>{cancelled=true;};},[dataset]);
  useEffect(()=>{if(!running)return;const timer=setInterval(()=>{if(!document.hidden)act(async()=>{await ask({type:'event',event:{type:'step',count:8}});});},500);return()=>clearInterval(timer);},[running]);
  useEffect(()=>{const persist=()=>{setRunning(false);act(async()=>{if(worker.current)await save(true);});};const onVisible=()=>{if(document.visibilityState==='hidden')persist();};document.addEventListener('visibilitychange',onVisible);window.addEventListener('pagehide',persist);return()=>{document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('pagehide',persist);};},[dataset]);
  const pulse=adapter=>act(async()=>{await ask({type:'input',adapter,payload:adapter==='environment'?input:market});await ask({type:'event',event:{type:'step',count:32}});setNotice(adapter==='environment'?tx('brain.notice.env'):tx('brain.notice.marketIn'));});
  const download=()=>act(async()=>{setRunning(false);const archive=await save(),text=JSON.stringify(archive);setArchiveText(text);const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`immortal-${dataset}-${state.ticks}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);});
  const importFile=async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;await act(async()=>{setRunning(false);if(file.size>32*1024*1024)throw new Error(tx('brain.oversize'));const archive=JSON.parse(await file.text());await ask({type:'restore',archive});await store.put(dataset,archive);setProof(null);setNotice(tx('brain.notice.import'));});};
  const full=data?.manifest, enabled=id=>state?.enabledSources.includes(id);
  return <LocaleContext.Provider value={{locale,tx}}><div className="brain-app">
    <SiteBar locale={locale} setLocale={setLocale} tx={tx} current="canon" />
    <main>
      <div className="brain-title"><div><div className="eyebrow">THE CONTINUITY EXPERIMENT <span>{tx('brain.eyebrow')}</span></div><h1>{tx('brain.h1')}</h1><p>{tx('brain.lead')}</p></div><div className="identity-stamp"><span>SEAL ID</span><strong>GENESIS — 001</strong><small>{tx('brain.localSeal')}</small></div></div>
      <section className="brain-stats" aria-label={tx('brain.statsAria')}><Stat label={dataset==='full'?tx('brain.statNeuronsFull'):tx('brain.statNeuronsCircuit')} value={count(full?.neurons)}/><Stat label={tx('brain.statEdges')} value={count(full?.edges)}/><Stat label={tx('brain.statLife')} value={count(state?.ticks)}/><Stat label={tx('brain.statActive')} value={count(state?.spikeCount)} accent/></section>
      <div className="scale-note"><div><strong>{dataset==='full'?tx('brain.runningFull'):tx('brain.runningCircuit')}</strong><p>{dataset==='circuit'?tx('brain.bodyCircuit'):tx('brain.bodyFull')}</p></div><label>{tx('brain.scaleLabel')}<select aria-label={tx('brain.scaleLabel')} disabled={busy||running} value={dataset} onChange={e=>setDataset(e.target.value)}><option value="circuit">{tx('brain.optCircuit')}</option><option value="full">{fullReady?tx('brain.optFull',{n:count(FULL_NEURONS)}):tx('brain.optFullNeed')}</option></select></label><small>{tx('brain.scaleFoot',{official:count(OFFICIAL_NEURONS),full:count(FULL_NEURONS)})}</small></div>
      <div className="brain-grid">
        <aside className="brain-panel inputs-panel"><PanelTitle number="01" title={tx('brain.panel.sense')} english={tx('brain.panel.senseEn')}/><div className="source-heading"><Radio size={14}/><strong>{tx('brain.env')}</strong><Toggle label={tx('brain.envToggle')} checked={enabled('environment')} disabled={busy||!state} onChange={()=>act(()=>ask({type:'event',event:{type:'source',sourceId:'environment',enabled:!enabled('environment')}}))}/></div>
          {[['food','pit.stim.food'],['threat','pit.stim.threat'],['light','pit.stim.light']].map(([key,label])=><Slider key={key} label={tx(label)} value={input[key]} onChange={v=>setInput({...input,[key]:v})}/>)}
          <button className="brain-primary full" disabled={busy||!enabled('environment')} onClick={()=>pulse('environment')}><Activity size={15}/>{tx('brain.inject')}<ChevronRight size={14}/></button>
          <div className="source-heading market-heading"><Activity size={14}/><strong>{tx('brain.marketSrc')}</strong><Toggle label={tx('brain.marketToggle')} checked={enabled('market')} disabled={busy||!state} onChange={()=>act(()=>ask({type:'event',event:{type:'source',sourceId:'market',enabled:!enabled('market')}}))}/></div>
          <Slider label={tx('brain.priceBps')} min={-10000} max={10000} value={market.changeBps} onChange={v=>setMarket({...market,changeBps:v})}/><Slider label={tx('brain.reserve')} value={market.activity} onChange={v=>setMarket({...market,activity:v})}/>
          <button className="brain-secondary full" disabled={busy||!enabled('market')} onClick={()=>pulse('market')}>{tx('brain.runMarket')} <ArrowUpRight size={14}/></button>
          <details className="rpc-input"><summary>{tx('brain.rpc')}</summary><label>{tx('brain.pair')}<input aria-label={tx('brain.pair')} placeholder="0x…" value={pair} onChange={e=>setPair(e.target.value)}/></label><button className="brain-secondary full" disabled={busy||!enabled('market')||!/^0x[0-9a-f]{40}$/i.test(pair)} onClick={()=>act(async()=>{if(!window.ethereum)throw new Error(tx('brain.needWallet'));const observation=await captureMarket(window.ethereum,pair);await ask({type:'input',adapter:'market',...observation});await ask({type:'event',event:{type:'step',count:32}});setNotice(tx('brain.sampled',{n:observation.provenance.blockNumber}));})}>{tx('brain.sample')}</button><p>{tx('brain.rpcNote')}</p></details>
          <div className="input-foot"><span className="small-dot"/> {tx('brain.twoInputs')}<p>{tx('brain.mapNote')}</p></div>
        </aside>
        <section className="brain-panel chamber"><div className="chamber-head"><span><i className={running?'live-dot':'idle-dot'}/>{running?'RUNNING':'STANDBY'} <b>{state?.model||'INITIALIZING'}</b></span><div className="scene-tabs"><button aria-pressed={!bodyView} onClick={()=>setBodyView(false)}><Network size={13}/>{tx('brain.connectome')}</button><button aria-pressed={bodyView} onClick={()=>setBodyView(true)}><Eye size={13}/>{tx('brain.body')}</button></div></div>
          <div className="neural-stage"><div className="stage-corner tl"/><div className="stage-corner br"/><NeuralScene nodes={data?.nodes||[]} edges={data?.edges||[]} state={state} bodyView={bodyView} groups={data?.groups}/><div className="stage-mark"><span>MALE CNS</span><small>v1.0 / {dataset==='full'?tx('brain.fullMark'):tx('brain.graphMark')}</small></div><div className="action-readout"><span>BEHAVIOR → TRADE</span><strong>{state?.lastAction?tx('brain.act.'+state.lastAction):tx('brain.waitLoad')} · {state?decodeTrade(state.lastAction):'—'}</strong><small>{state?.body?.energy??'—'} / 1000 {tx('brain.energyTrade')}</small></div><div className="stage-caption">{bodyView?tx('brain.captionBody'):tx('brain.captionGraph')}</div></div>
          <SignalRack state={state} trace={trace}/>
          <div className="run-controls"><button className="brain-primary" disabled={busy||!state} onClick={()=>{const next=!running;setRunning(next);if(running)act(()=>save(true));}}>{running?<Pause size={15}/>:<Play size={15}/>} {running?tx('brain.pauseClock'):tx('brain.startClock')}</button><button className="brain-secondary" disabled={busy||!state} onClick={()=>act(()=>ask({type:'event',event:{type:'step',count:32}}))}>{tx('brain.step32')}</button><span>{busy?'PROCESSING…':tx('brain.integer')}</span></div>
        </section>
        <aside className="brain-panel continuity-panel"><PanelTitle number="02" title={tx('brain.panel.cont')} english="CONTINUITY"/><div className="soul-mini"><VitruvianFly/><div><span>ONE IDENTITY</span><strong>{tx('brain.archiveTitle')}</strong><small>{tx('brain.archiveSub')}</small></div></div><dl className="identity-list"><dt>{tx('brain.connectomeLabel')}</dt><dd>MaleCNS v1.0</dd><dt>{tx('brain.runtime')}</dt><dd>{tx('brain.runtimeVal')}</dd><dt>{tx('brain.events')}</dt><dd>{count(state?.eventCount)}</dd><dt>{tx('brain.migrations')}</dt><dd>{tx('brain.timesUnit',{n:state?.migrationCount||0})}</dd></dl>
          <div className="hash-box"><label>HISTORY ROOT</label><code title={state?.historyRoot}>{short(state?.historyRoot, tx('brain.waitRecord'))}</code></div>
          <button className="brain-secondary full" disabled={busy||!state} onClick={()=>act(async()=>{setRunning(false);const r=await ask({type:'prove'});setProof(r.result);setNotice(tx('brain.notice.prove'));})}><ShieldCheck size={15}/>{tx('brain.prove')}</button>
          {proof&&<div className="proof-result"><ShieldCheck size={14}/> {tx('brain.replayed',{n:count(proof.ticks)})}<small>{short(proof.stateHash, tx('brain.waitRecord'))}</small></div>}
          <div className="archive-buttons"><button disabled={busy||!state} onClick={download}><Download size={14}/>{tx('brain.export')}</button><button disabled={busy||!state} onClick={()=>upload.current.click()}><Upload size={14}/>{tx('brain.restore')}</button></div><input hidden type="file" ref={upload} accept="application/json,.json" onChange={importFile}/>
          <button className="text-button" disabled={busy||!state} onClick={()=>act(save)}>{tx('brain.saveLocal')} <Database size={12}/></button>
          <div className="migration"><label htmlFor="model-select">{tx('brain.modelLabel')}</label><select id="model-select" disabled={busy||!state} value={state?.model||'lif-integer/1'} onChange={e=>{const to=e.target.value;act(async()=>{setRunning(false);await ask({type:'event',event:{type:'migration',from:state.model,to}});setProof(null);setNotice(tx('brain.notice.migrate'));});}}><option value="lif-integer/1">{tx('brain.v1')}</option><option value="lif-integer/2">{tx('brain.v2')}</option></select><p>{tx('brain.noLearn')}</p></div>
        </aside>
      </div>
      <div className="brain-status" role="status"><span><i/>{notice}</span><span>{full?`DATA SHA-256 ${short(full.connectivity.sha256, tx('brain.waitRecord'))}`:'CHECKING DATA INTEGRITY'}</span></div>{error&&<div className="brain-error" role="alert">{error}</div>}
      <div className="brain-bottom"><section className="brain-panel history-panel"><PanelTitle number="03" title={tx('brain.panel.journal')} english="EVENT JOURNAL"/><div className="event-list">{events.length?events.slice().reverse().slice(0,6).map((event,i)=><div key={`${state.eventCount}-${i}`}><span>{String(state.eventCount-i).padStart(4,'0')}</span><b>{event.type==='input'?'SENSE':event.type==='step'?'LIVE':event.type==='migration'?'EVOLVE':'SOURCE'}</b><p>{event.type==='input'?`${event.frame.adapter} · ${event.frame.provenance.kind==='simulation'?tx('brain.simInput'):tx('brain.chainSample')} · #${event.frame.sequence}`:event.type==='step'?tx('brain.stepped',{n:event.count}):event.type==='migration'?`${event.from} → ${event.to}`:`${event.sourceId} / ${event.enabled?tx('brain.on'):tx('brain.off')}`}</p><span>RECORDED</span></div>):<p className="empty-journal">{tx('brain.emptyJournal')}</p>}</div></section>
        <section className="brain-panel expansion-panel"><PanelTitle number="04" title={tx('brain.panel.ports')} english="EXTENSION PORTS"/><div className="extension-row"><Network size={19}/><div><strong>{tx('brain.loader')}</strong><p>{tx('brain.loaderP')}</p></div><select aria-label={tx('brain.scaleLabel')} disabled={busy||running} value={dataset} onChange={e=>setDataset(e.target.value)}><option value="circuit">{tx('brain.optCircuit')}</option><option value="full">{fullReady?tx('brain.optFull',{n:count(FULL_NEURONS)}):tx('brain.optFullNeed')}</option></select></div><div className="extension-row"><Database size={19}/><div><strong>{tx('brain.intent')}</strong><p>{tx('brain.intentP')}</p></div><button className="text-button" disabled={busy||!state} onClick={()=>act(async()=>{const r=await ask({type:'commitment'});setIntent(await proposeTrade(state,{checkpointHash:r.result.stateHash}));})}>{tx('brain.readOut')} <ArrowUpRight size={14}/></button></div><div className="extension-row"><Database size={19}/><div><strong>{tx('brain.flapPort')}</strong><p>{tx('brain.flapP')}</p></div><button className="text-button" disabled={busy||!state} onClick={()=>act(async()=>{const r=await ask({type:'commitment'});setIntent(await proposeAction(state,{checkpointHash:r.result.stateHash,budgetWei:'100000000000000000',perActionWei:'1000000000000000'}));})}>{tx('brain.preview')} <ArrowUpRight size={14}/></button></div>{intent&&<div className="intent-result">{intent.action}{intent.side?` · ${intent.side}`:''} · {intent.amountWei} wei <small>{intent.reason} · mode={intent.mode} · {tx('brain.noSend')}</small></div>}<p className="extension-note">{tx('brain.extNote')}</p></section></div>
      {archiveText&&<details className="archive-fallback"><summary>{tx('brain.backup')}</summary><textarea readOnly aria-label="archive JSON" value={archiveText}/></details>}
      <footer className="brain-footer"><span>IMMORTAL / BUILD 01 <b>ONGOING EXISTENCE.</b></span><p>{tx('brain.foot')} <a href="https://male-cns.janelia.org/download/" target="_blank" rel="noreferrer">FlyEM / MaleCNS · CC BY</a>.</p></footer>
    </main>
  </div></LocaleContext.Provider>;
}
function Stat({label,value,accent}){return <div><span>{label}</span><strong className={accent?'accent':''}>{value}</strong></div>;}
function PanelTitle({number,title,english}){return <h2 className="panel-title"><span>{number}</span>{title}<small>{english}</small></h2>;}
function Toggle({label,checked,disabled,onChange}){return <button className={`source-toggle ${checked?'on':''}`} aria-label={label} role="switch" aria-checked={!!checked} disabled={disabled} onClick={onChange}><i/></button>;}
function Slider({label,value,onChange,min=0,max=1000}){return <label className="brain-slider"><span>{label}<b>{value}</b></span><input type="range" min={min} max={max} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;}
createRoot(document.getElementById('root')).render(<App/>);
