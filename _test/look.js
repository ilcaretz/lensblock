/* Visual spot-check: frames a subject, screenshots it, and can drive the UI.
   node look.js [name] [jsFile|inlineJS]                                     */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_ = 'file:///D:/AI_video/preViz_TOOL/V01/previz.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); }
  static async attach(u) {
    const ws = new WebSocket(u);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
    const c = new CDP(ws);
    ws.onmessage = m => {
      const g = JSON.parse(m.data);
      if (g.id && c.pend.has(g.id)) { const { res, rej } = c.pend.get(g.id); c.pend.delete(g.id); g.error ? rej(new Error(g.error.message)) : res(g.result); }
      else if (g.method === 'Page.javascriptDialogOpening') c.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => { });
    };
    return c;
  }
  send(m, p = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pend.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method: m, params: p })); setTimeout(() => { if (this.pend.has(id)) { this.pend.delete(id); rej(new Error('timeout ' + m)); } }, 20000); });
  }
  async ev(e) {
    const r = await this.send('Runtime.evaluate', { expression: '(()=>{try{return JSON.stringify((()=>{' + e + '})())||"null"}catch(err){return JSON.stringify({__err:String(err&&err.stack||err)})}})()', returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description };
    try { return JSON.parse(r.result.value); } catch { return r.result.value; }
  }
}

(async () => {
  const name = process.argv[2] || 'look';
  const arg = process.argv[3];
  const js = arg ? (fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg) : 'return 1;';
  const w = +(process.argv[4] || 1440), h = +(process.argv[5] || 940);
  const port = 9960 + Math.floor(Math.random() * 30);
  const udd = path.join(os.tmpdir(), 'lblook-' + Date.now());
  const proc = spawn(EXE, [`--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, '--no-first-run',
    '--no-default-browser-check', '--disable-sync', '--remote-allow-origins=*', `--window-size=${w},${h}`, URL_], { stdio: 'ignore' });
  let page;
  for (let i = 0; i < 60; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = l.find(t => t.type === 'page' && t.url.includes('previz')); if (page?.webSocketDebuggerUrl) break; } catch { }
    await sleep(400);
  }
  const c = await CDP.attach(page.webSocketDebuggerUrl);
  await c.send('Page.enable'); await c.send('Runtime.enable');
  await c.ev('localStorage.clear(); return 1;');
  await c.send('Page.navigate', { url: URL_ });
  await sleep(2600);
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false, screenWidth: w, screenHeight: h });
  await sleep(300);
  const out = await c.ev(js);
  await sleep(700);
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(__dirname, `look-${name}.png`), Buffer.from(shot.data, 'base64'));
  console.log(JSON.stringify(out, null, 1));
  console.log('wrote look-' + name + '.png');
  proc.kill(); await sleep(300);
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch { }
  process.exit(0);
})();
