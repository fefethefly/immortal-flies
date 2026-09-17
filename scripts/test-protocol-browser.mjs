// Read-only browser smoke for /protocol.html. Builds the real bundle, serves it,
// drives headless Chrome and asserts the four replay arms actually switch.
// No chain access, no transactions, no simulation is started from the page.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const dist = await mkdtemp(join(tmpdir(), 'ifs-protocol-dist-'));
await new Promise((resolve, reject) => {
  const build = spawn('npm', ['run', 'build', '--', `--outDir=${dist}`, '--emptyOutDir'], { stdio: 'ignore' });
  build.on('exit', (code) => (code === 0 ? resolve() : reject(Error(`vite build failed: ${code}`))));
});
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
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
const profile = await mkdtemp(join(tmpdir(), 'ifs-protocol-browser-'));
const chrome = spawn(process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let ws;
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  assert.ok(port, 'Chrome started');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let seq = 0; const calls = new Map(); const errors = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; calls.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) { const pending = calls.get(msg.id); calls.delete(msg.id); if (msg.error) pending?.reject(Error(msg.error.message)); else pending?.resolve(msg.result); return; }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
  });
  await send('Runtime.enable'); await send('Page.enable');
  const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
  const wait = async (expression, timeout = 15000) => {
    for (let end = Date.now() + timeout; Date.now() < end; await new Promise(r => setTimeout(r, 120))) {
      if (await evaluate(expression)) return true;
    }
    return false;
  };
  await send('Page.navigate', { url: `${base}/protocol.html` });
  assert.ok(await wait(`document.querySelectorAll('.protocol-arms button[data-arm]').length === 4`), 'four arm tabs must render');
  assert.ok(await evaluate(`document.body.innerText.includes('采集均为 0')`), 'evidence boundary must be shown');
  assert.ok(await wait(`document.body.innerText.includes('完整性校验通过')`), 'in-browser bundle hash check must pass');
  assert.ok(await evaluate(`document.querySelector('.protocol-evidence code').textContent.startsWith('0x')`));
  const tick = () => evaluate(`document.querySelector('[data-tick]').textContent`);
  assert.equal(await tick(), '00 / 32', 'replay starts paused at tick zero');
  const expected = { off: '0', relay: '216', duplicate: '216', scrambled: '0' };
  for (const [key, input] of Object.entries(expected)) {
    await evaluate(`document.querySelector('button[data-arm="${key}"]').click()`);
    assert.equal(await tick(), '00 / 32', `${key} arm resets to tick zero`);
    await evaluate(`document.querySelector('button[aria-label="下一拍"]').click()`);
    await evaluate(`document.querySelector('button[aria-label="下一拍"]').click()`);
    assert.equal(await tick(), '02 / 32', `${key} stepping works`);
    assert.equal(await evaluate(`document.querySelector('[data-input="1"]').textContent`), input, `${key} receiver input at tick 2`);
  }
  assert.ok(await evaluate(`document.body.innerText.includes('SIM')`));
  for (const [kind,reason,value] of [['valid','ACCEPTED_INPUT','216'],['duplicate','DUPLICATE','216'],['conflict','ID_CONFLICT','0'],['environment','ENVIRONMENT_MISMATCH','0'],['expired','EXPIRED','0'],['no-gain','ACCEPTED_NO_GAIN','500']]) {
    await evaluate(`document.querySelector('[data-admission="${kind}"]').click()`);
    assert.ok(await wait(`!!document.querySelector('[data-decision="${reason}"]')`), `${kind} decision rendered`);
    assert.equal(await evaluate(`document.querySelector('[data-admission-input]').textContent`),value);
    assert.equal(await tick(),'02 / 32','admission examples must not alter historical replay');
  }

  assert.ok(await evaluate(`!!document.querySelector('a[download="protocol-replay-smoke-v1.json"]')`));
  assert.deepEqual(errors, []);
  console.log('PASS /protocol.html: 4 arms switch, receiver input 0/216/216/0 at tick 2, bundle hash verified, no page errors.');
} finally {
  ws?.close(); chrome.kill(); http.close();
  await new Promise(r => setTimeout(r, 300));
  await rm(profile, { recursive: true, force: true }); await rm(dist, { recursive: true, force: true });
}
