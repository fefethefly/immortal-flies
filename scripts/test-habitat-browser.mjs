// Self-contained local browser smoke. RPC is intercepted in the browser:
// this test never contacts or writes a public chain and sends no transactions.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { Interface } from 'ethers';
import { habitatStorageKey } from '../src/life/habitat-storage.mjs';

const dist = await mkdtemp(join(tmpdir(), 'ifs-habitat-dist-'));
await new Promise((resolve, reject) => {
  const build = spawn('npm', ['run', 'build', '--', `--outDir=${dist}`, '--emptyOutDir'], { stdio: 'ignore' });
  build.on('exit', (code) => (code === 0 ? resolve() : reject(Error(`vite build failed: ${code}`))));
});
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const http = createServer(async (req, res) => {
  try {
    const file = join(dist, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    const body = await readFile(file).catch(() => readFile(join(dist, 'index.html')));
    res.writeHead(200, { 'content-type': types[join(file).slice(file.lastIndexOf('.'))] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${http.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'ifs-habitat-browser-'));
const chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws;
try {
  let port;
  for (let i=0;i<100;i++) { try { port=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]; break; } catch { await new Promise(r=>setTimeout(r,100)); } }
  assert.ok(port, 'Chrome started');
  const pages=await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  let seq=0; const calls=new Map(); const errors=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq; calls.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  const deployment=JSON.parse(await readFile(new URL('../public/contract/life/ImmortalSoul.deployment.json',import.meta.url),'utf8'));
  const artifact=JSON.parse(await readFile(new URL('../public/contract/life/ImmortalSoul.json',import.meta.url),'utf8'));
  const abi=new Interface(artifact.abi);
  const soul={tokenId:1,life:`0x${'ab'.repeat(32)}`,owner:`0x${'11'.repeat(20)}`,seed:11};
  ws.addEventListener('message',async ({data})=>{
    const msg=JSON.parse(data);
    if(msg.id){const pending=calls.get(msg.id);calls.delete(msg.id);if(msg.error)pending?.reject(Error(msg.error.message));else pending?.resolve(msg.result);return;}
    if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text);
    if(msg.method!=='Fetch.requestPaused')return;
    const {requestId,request}=msg.params;
    try {
      if(request.method==='OPTIONS'){await send('Fetch.fulfillRequest',{requestId,responseCode:204,responseHeaders:[{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'}]});return;}
      const input=JSON.parse(request.postData);
      const answer=q=>{
        let result='0x100';
        if(q.method==='eth_call'){
          const call=abi.parseTransaction({data:q.params[0].data});
          const values={totalSupply:[1n],genesisRoot:[deployment.genesisRoot],ownerOf:[soul.owner],lifeId:[soul.life],getGenome:[[11,123,123]],givenName:['BrowserTest'],getDescent:[[0,0,0]]};
          result=abi.encodeFunctionResult(call.fragment,values[call.name]);
        }
        if(q.method==='eth_getLogs')result=[];
        return {jsonrpc:'2.0',id:q.id,result};
      };
      await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify(Array.isArray(input)?input.map(answer):answer(input))).toString('base64')});
    } catch(e) {errors.push(e.message); await send('Fetch.failRequest',{requestId,errorReason:'Failed'});}
  });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});` });
  const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  await send('Page.navigate', { url: `${base}/habitat.html?lang=zh&soul=1` });
  for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(document.querySelector('.life-holo-canvas'))`)) break; await new Promise(r => setTimeout(r, 100)); }
  assert.equal(await evaluate(`Boolean(document.querySelector('.life-holo-canvas'))`), true);
  assert.equal(await evaluate(`document.body.innerText.includes('养育进度自动保存')`), false);
  assert.equal(await evaluate(`document.body.innerText.includes('打开官方一口价盘')`), false);
  assert.equal(await evaluate(`document.body.innerText.includes('生命记录')`), false);
  const key = habitatStorageKey(deployment);
  for (let i = 0; i < 50; i++) { if (await evaluate(`localStorage.getItem(${JSON.stringify(key)}) !== null`)) break; await new Promise(r => setTimeout(r, 100)); }
  const before = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).bodies[0].energy`);
  await evaluate(`(() => { const c = document.querySelector('.life-canvas'); c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 300, clientY: 300 })); return true; })()`);
  await new Promise(r => setTimeout(r, 3300));
  const after = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).bodies[0].energy`);
  assert.equal(await evaluate(`document.body.innerText.includes('已恢复本地养育进度')`), false);
  assert.ok(after > before, `feeding must raise saved energy (${before} -> ${after})`);
  await send('Page.reload'); await new Promise(r => setTimeout(r, 2500));
  assert.equal(await evaluate(`document.body.innerText.includes('已恢复本地养育进度')`), false);
  const restored = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).bodies[0].energy`);
  assert.ok(Math.abs(restored - after) <= 3, `reload must resume near saved energy (${after} -> ${restored})`);
  assert.deepEqual(errors, []);
  console.log(`PASS real Habitat DOM: fresh boot saves care, feeding raised energy ${before} -> ${after}, reload restored ${restored}; RPC mocked, no transactions.`);
} finally { ws?.close(); chrome.kill(); http.close(); await new Promise(r => setTimeout(r, 300)); await rm(profile, { recursive: true, force: true }); await rm(dist, { recursive: true, force: true }); }
