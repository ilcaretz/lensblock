// Zero-dependency CDP driver (Node 22 global WebSocket + fetch).
// usage: node cdp.js <browserKey> [profile ...]
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const BROWSERS = {
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  brave: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
};
const URL_ = 'file:///D:/AI_video/preViz_TOOL/V01/previz.html';

const PROFILES = {
  'desktop-1920': { w: 1920, h: 1080, dpr: 1, touch: false, mobile: false },
  'desktop-1366': { w: 1366, h: 768, dpr: 1, touch: false, mobile: false },
  'laptop-1280': { w: 1280, h: 800, dpr: 1, touch: false, mobile: false },
  'tablet-ipad-land': { w: 1024, h: 768, dpr: 2, touch: true, mobile: true, ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  'tablet-ipad-port': { w: 768, h: 1024, dpr: 2, touch: true, mobile: true, ua: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  'tablet-android': { w: 800, h: 1280, dpr: 2, touch: true, mobile: true },
  'phone-iphone14': { w: 390, h: 844, dpr: 3, touch: true, mobile: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  'phone-pixel7': { w: 412, h: 915, dpr: 2.625, touch: true, mobile: true, ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
  'phone-small': { w: 360, h: 740, dpr: 3, touch: true, mobile: true },
  'phone-landscape': { w: 844, h: 390, dpr: 3, touch: true, mobile: true },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.ev = []; this.handlers = []; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = e => rej(new Error('ws fail')); });
    const c = new CDP(ws);
    ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      if (msg.id && c.pend.has(msg.id)) {
        const { res, rej } = c.pend.get(msg.id); c.pend.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) { c.ev.push(msg); c.handlers.forEach(h => h(msg)); }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pend.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pend.has(id)) { this.pend.delete(id); rej(new Error('timeout ' + method)); } }, 30000);
    });
  }
  async evalJS(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, allowUnsafeEvalBlockedByCSP: true });
    if (r.exceptionDetails) return { __evalError: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  }
}

async function findPage(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = list.find(t => t.type === 'page' && t.url.includes('previz'));
      if (p && p.webSocketDebuggerUrl) return p;
      const any = list.find(t => t.type === 'page');
      if (any && i > 20) return any;
    } catch (e) { }
    await sleep(500);
  }
  throw new Error('no debuggable page found on port ' + port);
}

async function run(browserKey, profileNames) {
  const exe = BROWSERS[browserKey];
  if (!fs.existsSync(exe)) throw new Error('missing browser exe: ' + exe);
  const port = 9500 + Math.floor(Math.random() * 400);
  const udd = path.join(os.tmpdir(), `cdp-${browserKey}-${Date.now()}`);
  const args = [
    `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-features=Translate,MediaRouter', '--noerrdialogs',
    '--remote-allow-origins=*', '--window-size=1400,900',
    URL_,
  ];
  const proc = spawn(exe, args, { detached: false, stdio: 'ignore' });
  const report = { browser: browserKey, exe, profiles: {} };

  try {
    const page = await findPage(port);
    const c = await CDP.attach(page.webSocketDebuggerUrl);

    const bucket = { console: [], exceptions: [], logs: [], netRequests: [], netFailed: [] };
    c.handlers.push(m => {
      if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type))
        bucket.console.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' ').slice(0, 400));
      if (m.method === 'Runtime.exceptionThrown')
        bucket.exceptions.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 600));
      if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level))
        bucket.logs.push(`${m.params.entry.level} [${m.params.entry.source}] ${m.params.entry.text}`.slice(0, 400));
      if (m.method === 'Network.requestWillBeSent') bucket.netRequests.push(m.params.request.url.slice(0, 150));
      if (m.method === 'Network.loadingFailed') bucket.netFailed.push(m.params.errorText);
    });

    await c.send('Runtime.enable'); await c.send('Log.enable');
    await c.send('Page.enable'); await c.send('Network.enable');

    const probeSrc = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8');

    for (const pn of profileNames) {
      const p = PROFILES[pn];
      bucket.console = []; bucket.exceptions = []; bucket.logs = []; bucket.netRequests = []; bucket.netFailed = [];
      try {

      await c.send('Emulation.setDeviceMetricsOverride', {
        width: p.w, height: p.h, deviceScaleFactor: p.dpr, mobile: p.mobile,
        screenWidth: p.w, screenHeight: p.h,
      });
      await c.send('Emulation.setTouchEmulationEnabled', { enabled: p.touch, maxTouchPoints: 5 });
      try {
        await c.send('Emulation.setEmitTouchEventsForMouse', { enabled: p.touch, configuration: p.touch ? 'mobile' : 'desktop' });
      } catch (e) { }
      if (p.ua) await c.send('Emulation.setUserAgentOverride', { userAgent: p.ua });
      else await c.send('Emulation.setUserAgentOverride', { userAgent: '' }).catch(() => { });

      await c.send('Page.navigate', { url: URL_ });
      await sleep(3800);

      const res = await c.evalJS(probeSrc);
      report.profiles[pn] = {
        device: p,
        probe: res,
        console: [...new Set(bucket.console)].slice(0, 15),
        exceptions: [...new Set(bucket.exceptions)].slice(0, 10),
        logs: [...new Set(bucket.logs)].slice(0, 15),
        networkRequestCount: bucket.netRequests.length,
        networkRequests: [...new Set(bucket.netRequests)].slice(0, 10),
        networkFailed: [...new Set(bucket.netFailed)].slice(0, 10),
      };

      // ---- interaction probes on touch profiles ----
      if (p.touch) {
        const cx = Math.round(p.w * 0.5), cy = Math.round(p.h * 0.45);
        const before = await c.evalJS(`(()=>{const c=document.getElementById('glcanvas');const t=document.createElement('canvas');t.width=32;t.height=24;const x=t.getContext('2d');x.drawImage(c,0,0,32,24);return x.getImageData(0,0,32,24).data.join(',');})()`);
        try {
          await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
          for (let i = 1; i <= 6; i++)
            await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 14, y: cy + i * 6 }] });
          await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } catch (e) { report.profiles[pn].touchDispatchError = e.message; }
        await sleep(700);
        const after = await c.evalJS(`(()=>{const c=document.getElementById('glcanvas');const t=document.createElement('canvas');t.width=32;t.height=24;const x=t.getContext('2d');x.drawImage(c,0,0,32,24);return x.getImageData(0,0,32,24).data.join(',');})()`);
        report.profiles[pn].touchDragChangedView = (typeof before === 'string' && typeof after === 'string') ? (before !== after) : 'unknown';
        report.profiles[pn].pageScrolledByTouch = await c.evalJS('[scrollX,scrollY,visualViewport?visualViewport.scale:null]');
      }

      // ---- screenshot ----
      try {
        const shot = await c.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(__dirname, `shot-${browserKey}-${pn}.png`), Buffer.from(shot.data, 'base64'));
      } catch (e) { report.profiles[pn].shotError = e.message; }

      } catch (e) {
        report.profiles[pn] = Object.assign(report.profiles[pn] || {}, { profileError: e.message, device: p });
      }
    }

    proc.kill();
  } catch (e) {
    report.error = e.message;
    try { proc.kill(); } catch (_) { }
  }
  await sleep(400);
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch (e) { }
  return report;
}

(async () => {
  const [, , key, ...profs] = process.argv;
  const list = profs.length ? profs : Object.keys(PROFILES);
  const rep = await run(key, list);
  const outFile = path.join(__dirname, `report-${key}.json`);
  fs.writeFileSync(outFile, JSON.stringify(rep, null, 1));
  console.log('WROTE ' + outFile);
  process.exit(0);
})();
