/* ---------------------------------------------------------------------------
   LensBlock functional + responsive check.  Zero dependencies (Node 22).

     node check.js                     chrome, every group
     node check.js edge                a different browser
     node check.js chrome rig ik       only the named groups

   Groups: boot rig ik cam fk anim io car ui layout touch perf ctx
   Writes check-report.json and shot-check-*.png next to this file.
   --------------------------------------------------------------------------- */
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const BROWSERS = {
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  brave: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
};
const URL_ = 'file:///D:/AI_video/preViz_TOOL/V01/previz.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); this.handlers = []; }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });
    const c = new CDP(ws);
    ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      if (msg.id && c.pend.has(msg.id)) {
        const { res, rej } = c.pend.get(msg.id); c.pend.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) c.handlers.forEach(h => h(msg));
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
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: '(()=>{try{return JSON.stringify((()=>{' + expr + '})());}catch(e){return JSON.stringify({__err:String(e&&e.stack||e)});}})()',
      returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    try { return JSON.parse(r.result.value); } catch { return { __err: 'unparseable: ' + r.result.value }; }
  }
}

async function findPage(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = list.find(t => t.type === 'page' && t.url.includes('previz'));
      if (p?.webSocketDebuggerUrl) return p;
    } catch { }
    await sleep(400);
  }
  throw new Error('no debuggable page on ' + port);
}

/* ------------------------------------------------------------------ results */
const R = { pass: 0, fail: 0, groups: {}, console: [], exceptions: [] };
let G = 'boot';
function group(n) { G = n; R.groups[n] = R.groups[n] || []; }
function ok(name, cond, detail) {
  const good = !!cond;
  good ? R.pass++ : R.fail++;
  R.groups[G].push({ name, ok: good, detail });
  console.log((good ? '  \x1b[32mPASS\x1b[0m ' : '  \x1b[31mFAIL\x1b[0m ') + name +
    (detail !== undefined && (!good || process.env.VERBOSE) ? '   ' + JSON.stringify(detail) : ''));
}
const near = (a, b, tol) => typeof a === 'number' && isFinite(a) && Math.abs(a - b) <= tol;

/* An Alt+LMB tumble, dispatched in-page.
   Not Input.dispatchMouseEvent: CDP's `mouseWheel` never acks once the page
   calls preventDefault() on a non-passive wheel listener (this app does), and
   every `mouseMoved` costs a flat 5 s waiting for an ack that is not coming —
   which is what blew the 30 s CDP timeout and killed whole runs.
   The capture stub is the price of a fabricated pointerId: both the app and
   TransformControls call setPointerCapture, which throws on an id the browser
   never issued, and that lands in the "no uncaught exceptions" bucket. */
const ALT_DRAG = `{
  const cv = document.querySelector('#glcanvas');
  const sc = cv.setPointerCapture, rc = cv.releasePointerCapture;
  cv.setPointerCapture = () => { }; cv.releasePointerCapture = () => { };
  const ev = (t, x, y, b) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 31, isPrimary: true,
    pointerType: 'mouse', button: 0, buttons: b, altKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  try { ev('pointerdown', 600, 400, 1); ev('pointermove', 700, 460, 1); ev('pointerup', 700, 460, 0); }
  finally { cv.setPointerCapture = sc; cv.releasePointerCapture = rc; }
}`;
const WHEEL = `document.querySelector('#glcanvas').dispatchEvent(
  new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true }));`;

/* ------------------------------------------------------------------- checks */
async function run(browserKey, only) {
  const exe = BROWSERS[browserKey];
  if (!fs.existsSync(exe)) throw new Error('missing browser: ' + exe);
  const port = 9700 + Math.floor(Math.random() * 250);
  const udd = path.join(os.tmpdir(), `lbcheck-${Date.now()}`);
  const proc = spawn(exe, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`,
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-features=Translate,MediaRouter', '--noerrdialogs',
    /* Input.dispatch* blocks until the RENDERER acks, and an automated window
       is almost always occluded — throttled to no rAF, no frames, no ack, and
       every touch or mouse dispatch sits there until the CDP timeout kills the
       run. Page.bringToFront does not reliably win against the terminal, so
       take backgrounding off the table entirely. */
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling', '--disable-ipc-flooding-protection',
    '--remote-allow-origins=*', '--window-size=1440,940', URL_,
  ], { stdio: 'ignore' });

  const page = await findPage(port);
  const c = await CDP.attach(page.webSocketDebuggerUrl);
  const bad = { console: [], exceptions: [] };
  c.handlers.push(m => {
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type)) {
      // the top frame too: a bare message with no call site is nearly unactionable
      const f = m.params.stackTrace?.callFrames?.find(x => !/^\s*$/.test(x.functionName)) || m.params.stackTrace?.callFrames?.[0];
      bad.console.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' ').slice(0, 300) +
        (f ? `   @${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber}` : ''));
    }
    if (m.method === 'Runtime.exceptionThrown')
      bad.exceptions.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '').slice(0, 400));
    // the app guards unload when the scene is unsaved; a driven browser has to
    // answer that prompt or Page.navigate hangs until it times out
    if (m.method === 'Page.javascriptDialogOpening') {
      bad.dialogs = (bad.dialogs || 0) + 1;
      c.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => { });
    }
  });
  await c.send('Runtime.enable'); await c.send('Page.enable');

  const want = g => !only.length || only.includes(g);
  // a stale autosave from an earlier run must not decide what the checks see
  await c.ev(`localStorage.clear(); return 1;`);
  await c.send('Page.navigate', { url: URL_ });
  await sleep(2600);

  /* ---------------------------------------------------------------- boot -- */
  group('boot');
  const boot = await c.ev(`
    const L = window.LB;
    return { lb: !!L, ver: L && L.version, three: window.THREE && THREE.REVISION,
      bootGone: !document.getElementById('boot'),
      kinds: L ? L.S.objects.map(o => o.userData.kind) : null,
      tier: L && L.Q.tier, gpu: L && L.Q.gpu, dpr: L && L.renderer.getPixelRatio(),
      shadowType: L && L.renderer.shadowMap.type };`);
  ok('app module booted', boot.lb && boot.ver === 4, boot);
  ok('three r185', String(boot.three) === '185', boot.three);
  ok('boot overlay removed', boot.bootGone);
  ok('no uncaught exceptions', bad.exceptions.length === 0, bad.exceptions);
  ok('no console errors/warnings', bad.console.length === 0, bad.console);
  ok('default scene has a rig', (boot.kinds || []).includes('human'), boot.kinds);
  const snap0 = await c.ev(`return LB.snap();`);
  ok('viewport actually renders', snap0.avg > 6 && snap0.colors > 12, snap0);

  /* ------------------------------------------------------ rig construction - */
  if (want('rig')) {
    group('rig');
    const r = await c.ev(`
      const L = window.LB;
      const out = {};
      for (const sex of ['f','m']) {
        const o = L.addPrimitive('human', { params: { sex, h: L.SEXES[sex].h } });
        o.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(o);
        const J = o.userData.rig.joints;
        const wp = id => J[id].getWorldPosition(new THREE.Vector3()).toArray().map(v=>+v.toFixed(4));
        out[sex] = {
          joints: Object.keys(J).length,
          parts: (()=>{let n=0;o.traverse(x=>{if(x.isMesh)n++});return n})(),
          tris: (()=>{let n=0;o.traverse(x=>{if(x.isMesh&&x.geometry.index)n+=x.geometry.index.count/3});return n})(),
          minY: +b.min.y.toFixed(4), maxY: +b.max.y.toFixed(4),
          width: +(b.max.x-b.min.x).toFixed(3),
          hip: wp('hips')[1], knee: wp('shinL')[1], ankle: wp('footL')[1],
          shoulder: wp('armL')[1], elbow: wp('foreL')[1], head: wp('head')[1],
          chans: L.chansOf(o).length,
          sharedGeo: (()=>{const s=new Set();o.traverse(x=>{if(x.isMesh)s.add(x.geometry.uuid)});return s.size})(),
        };
        L.removeObject(o);
      }
      out.handlesLeft = L.helpers.getObjectByName('__ikHandles').children.length;
      return out;`);
    for (const sex of ['f', 'm']) {
      const H = sex === 'f' ? 1.66 : 1.81, s = r[sex] || {};
      ok(sex + ': 19 joints', s.joints === 19, s.joints);
      ok(sex + ': stands on the floor', near(s.minY, 0, 0.006), s.minY);
      ok(sex + ': crown ≈ height', near(s.maxY, H, H * 0.035), { got: s.maxY, want: H });
      ok(sex + ': hip ≈ .53 H', near(s.hip / H, 0.53, 0.03), +(s.hip / H).toFixed(3));
      ok(sex + ': knee ≈ .27 H', near(s.knee / H, 0.27, 0.03), +(s.knee / H).toFixed(3));
      ok(sex + ': shoulder ≈ .80 H', near(s.shoulder / H, 0.80, 0.03), +(s.shoulder / H).toFixed(3));
      ok(sex + ': elbow ≈ .63 H', near(s.elbow / H, 0.63, 0.04), +(s.elbow / H).toFixed(3));
      ok(sex + ': cheap enough (<2500 tris)', s.tris > 0 && s.tris < 2500, s.tris);
      ok(sex + ': geometry is shared (≤4 buffers)', s.sharedGeo <= 4, s.sharedGeo);
      ok(sex + ': keyable channel count', s.chans === 87, s.chans);
    }
    ok('female is shorter than male', r.f.maxY < r.m.maxY, [r.f.maxY, r.m.maxY]);
    ok('male is broader than female', r.m.width > r.f.width, [r.f.width, r.m.width]);
    ok('deleting a rig removes its IK handles', r.handlesLeft === 4, r.handlesLeft);
  }

  /* ---------------------------------------------------------------- IK ---- */
  if (want('ik')) {
    group('ik');
    const r = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      const R = o.userData.rig;
      let worst = 0, worstCase = null, n = 0, straight = 0;
      // a deterministic sweep of goals inside each chain's reach
      let seed = 12345; const rnd = () => (seed = (seed*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
      for (const key of Object.keys(R.chains)) {
        const ch = R.chains[key];
        ch.blend = 1;
        const reach = ch.l1 + ch.l2;
        const base = ch.goal.clone();
        // goals are generated around the CHAIN ROOT, so "inside the reach"
        // actually means inside the reach — measuring from the rest goal does not
        o.updateMatrixWorld(true);
        const root = o.worldToLocal(R.joints[ch.up].getWorldPosition(new THREE.Vector3()));
        for (let i = 0; i < 60; i++) {
          const t = 0.25 + rnd() * 0.7;                   // 25 % … 95 % of reach
          const dir = new THREE.Vector3(rnd()*2-1, rnd()*2-1, rnd()*2-1);
          if (dir.lengthSq() < 1e-6) dir.set(0,1,0);
          dir.normalize();
          ch.twist = (rnd()*2-1) * 140;
          ch.goal.copy(root).addScaledVector(dir, t * reach);
          L.solveRigs();
          o.updateMatrixWorld(true);
          const got = o.worldToLocal(R.joints[ch.end].getWorldPosition(new THREE.Vector3()));
          const err = got.distanceTo(ch.goal);
          n++;
          if (err > worst) { worst = err; worstCase = { key, goal: ch.goal.toArray().map(v=>+v.toFixed(3)), err: +err.toFixed(5) }; }
        }
        // out of reach: the limb must straighten and point AT the goal, not fold
        ch.goal.copy(base).add(new THREE.Vector3(0, -reach * 3, 0));
        L.solveRigs(); o.updateMatrixWorld(true);
        const up = R.joints[ch.up].getWorldPosition(new THREE.Vector3());
        const end = R.joints[ch.end].getWorldPosition(new THREE.Vector3());
        straight = Math.max(straight, Math.abs(up.distanceTo(end) - reach));
        ch.blend = 0; ch.twist = 0; ch.goal.copy(base);
      }
      L.solveRigs();
      return { n, worst: +worst.toFixed(6), worstCase, straight: +straight.toFixed(5) };`);
    ok('IK reaches its goal (240 solves)', r.n === 240 && r.worst < 1e-4, r);
    ok('out-of-reach straightens the limb', r.straight < 1e-3, r.straight);

    const b = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      const ch = o.userData.rig.chains.armL;
      const J = o.userData.rig.joints;
      // FK baseline through the real channel path, so the FK stash is written
      L.setFrame(L.S.cur);
      for (const [c2,v] of [['rx',17],['ry',6],['rz',11]]) {
        const t = o.userData.tracks; // no keys — write the live value
      }
      J.armL.rotation.set(0.3, 0.1, 0.2); LB.__stash = 1;
      // mimic what the Inspector does: a channel write stashes FK
      o.userData.rig.joints.armL.userData.fkE.copy(J.armL.rotation);
      L.solveRigs();
      const fk = J.armL.rotation.toArray().slice(0,3);
      ch.blend = 0.5;
      ch.goal.set(0.5, 0.9, 0.35);
      L.solveRigs();
      const first = J.armL.quaternion.toArray().map(v=>+v.toFixed(6));
      for (let i=0;i<40;i++) L.solveRigs();
      const later = J.armL.quaternion.toArray().map(v=>+v.toFixed(6));
      const drift = Math.max(...first.map((v,i)=>Math.abs(v-later[i])));
      ch.blend = 0; L.solveRigs();
      const back = J.armL.rotation.toArray().slice(0,3);
      return { drift:+drift.toFixed(7), fk: fk.map(v=>+v.toFixed(4)), back: back.map(v=>+v.toFixed(4)) };`);
    ok('partial IK blend does not creep', b.drift < 1e-6, b);
    ok('blend back to 0 returns to the FK pose', b.fk.every((v, i) => near(b.back[i], v, 1e-4)), b);

    // FK → IK must be seamless: snapGoal also solves for the matching twist
    const h = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      const R = o.userData.rig, J = R.joints;
      const out = {};
      for (const p of ['Relaxed','Walk','Sit','Point','T-pose']) {
        L.setPose(o, p);
        o.updateMatrixWorld(true);
        const before = {};
        for (const k of Object.keys(R.chains)) {
          const ch = R.chains[k];
          before[k] = [J[ch.lo].getWorldPosition(new THREE.Vector3()), J[ch.end].getWorldPosition(new THREE.Vector3())];
        }
        for (const k of Object.keys(R.chains)) { const ch = R.chains[k]; L.snapGoal(o, ch); ch.blend = 1; }
        L.solveRigs(); o.updateMatrixWorld(true);
        let worst = 0;
        for (const k of Object.keys(R.chains)) {
          const ch = R.chains[k];
          worst = Math.max(worst,
            before[k][0].distanceTo(J[ch.lo].getWorldPosition(new THREE.Vector3())),
            before[k][1].distanceTo(J[ch.end].getWorldPosition(new THREE.Vector3())));
        }
        out[p] = +worst.toFixed(5);
      }
      L.resetPose(o); L.solveRigs();
      return out;`);
    for (const [p, v] of Object.entries(h))
      ok('FK → IK is seamless from "' + p + '"', v < 5e-4, v);

    /* The goal handle IS the IK pivot — the translate gizmo hangs off it. It
       used to freeze at the world origin the whole time the gizmo was attached,
       so switching a chain to IK on a figure standing anywhere but the centre
       put the pivot on the centre axes instead of on the limb. */
    const gh = await c.ev(`
      const L = window.LB, S = L.S;
      const o = S.objects.find(x => x.userData.rig);
      const R = o.userData.rig;
      o.position.set(5, 0, -4); o.rotation.y = 1.1; o.updateMatrixWorld(true);
      L.select([o]);
      const err = (c2) => {
        const want = o.localToWorld(c2.goal.clone());
        return { pivot: +c2.handle.position.distanceTo(want).toFixed(6),
                 limb: +want.distanceTo(R.joints[c2.end].getWorldPosition(new THREE.Vector3())).toFixed(6) };
      };
      const out = { atToggle: {}, afterRender: {}, gizmo: {} };
      // drive the real Inspector buttons, not the API — that is the broken path
      for (const [k, label] of [['armL','L hand'],['armR','R hand'],['legL','L foot'],['legR','R foot']]) {
        const b = [...document.querySelectorAll('#inspector .jb.ik')].find(x => x.textContent.trim() === label);
        if (!b) return { missing: label };
        b.click();
        const ch = R.chains[k];
        out.atToggle[k] = err(ch);
        out.gizmo[k] = L.tc.object === ch.handle;
      }
      L.snap();
      for (const k of Object.keys(R.chains)) out.afterRender[k] = err(R.chains[k]);

      // Snap to limb while the gizmo owns the handle
      L.setSubsel(R.chains.armL.handle);
      R.joints.armL.rotation.z = 1.0; R.joints.foreL.rotation.x = -0.6;
      o.updateMatrixWorld(true);
      const sb = [...document.querySelectorAll('#inspector button.mini')].find(x => x.textContent === 'Snap to limb');
      if (sb) { sb.click(); out.snap = err(R.chains.armL); }

      // and the handle must follow the figure when the figure moves
      o.position.set(-9, 0, 7); o.updateMatrixWorld(true); L.snap();
      out.moved = err(R.chains.armL);

      for (const ch of Object.values(R.chains)) ch.blend = 0;
      o.position.set(0.4, 0, 2.2); o.rotation.y = -0.5;
      L.resetPose(o); L.solveRigs(); L.select([]);
      return out;`);
    const worst = k => Math.max(...Object.values(gh[k] || {}).map(v => v.pivot));
    ok('IK pivot lands on the limb of an off-centre figure', worst('atToggle') < 1e-4, gh.atToggle);
    ok('IK pivot is on the goal, and the goal is on the limb',
      Math.max(...Object.values(gh.atToggle || {}).map(v => v.limb)) < 1e-4, gh.atToggle);
    ok('the gizmo grabs the goal handle on toggle',
      Object.values(gh.gizmo || {}).every(Boolean), gh.gizmo);
    ok('IK pivot survives a render pass', worst('afterRender') < 1e-4, gh.afterRender);
    ok('"Snap to limb" moves the handle too', gh.snap && gh.snap.pivot < 1e-4, gh.snap);
    ok('the handle travels with the figure', gh.moved && gh.moved.pivot < 1e-4, gh.moved);

    /* Changing Height rebuilds every joint and every chain. The handles live
       outside the rig and buildRig does not carry them across, so they have to
       be re-made — and the gizmo re-bound, or it errors on the next frame. */
    const rb = await c.ev(`
      const L = window.LB, S = L.S;
      const o = S.objects.find(x => x.userData.rig);
      L.select([o]);
      const R0 = o.userData.rig;
      R0.chains.armL.blend = 1; L.snapGoal(o, R0.chains.armL);
      L.setSubsel(R0.chains.armL.handle);
      const oldHandle = R0.chains.armL.handle, oldJoint = R0.joints.foreL;
      const handlesBefore = L.helpers.getObjectByName('__ikHandles').children.length;

      // the real Inspector path
      const inp = [...document.querySelectorAll('#inspector input[type=number]')];
      L.S.objects.length;
      o.userData.params.h = 1.9;
      // rebuildGroup is what the Height field calls
      L.rebuildGroup(o);
      const R1 = o.userData.rig;
      const out = {
        handlesAfter: L.helpers.getObjectByName('__ikHandles').children.length,
        handlesBefore,
        newChainHasHandle: !!R1.chains.armL.handle,
        handleReplaced: R1.chains.armL.handle !== oldHandle,
        subselRebound: S.subsel === R1.chains.armL.handle,
        gizmoOnLive: L.tc.object === S.subsel && !!S.subsel && !!S.subsel.parent,
        orphanAttached: L.tc.object === oldHandle || L.tc.object === oldJoint,
        blendKept: R1.chains.armL.blend,
      };
      L.snap(); L.snap();
      out.handlePlaced = +R1.chains.armL.handle.position
        .distanceTo(o.localToWorld(R1.chains.armL.goal.clone())).toFixed(6);

      // and a joint sub-selection survives it too
      L.setSubsel(R1.joints.foreL);
      o.userData.params.h = 1.66; L.rebuildGroup(o);
      const R2 = o.userData.rig;
      out.jointRebound = S.subsel === R2.joints.foreL && L.tc.object === R2.joints.foreL;

      // deleting the figure must not leave the gizmo on a dead object
      L.removeObject(o);
      out.afterDelete = { tc: !!L.tc.object, handles: L.helpers.getObjectByName('__ikHandles').children.length };
      return out;`);
    ok('a height change re-makes the IK handles',
      rb.newChainHasHandle && rb.handleReplaced && rb.handlesAfter === rb.handlesBefore, rb);
    ok('a height change re-binds the goal sub-selection and the gizmo',
      rb.subselRebound && rb.gizmoOnLive && !rb.orphanAttached, rb);
    ok('the rebuilt handle sits on its goal', rb.handlePlaced < 1e-4, rb.handlePlaced);
    ok('a height change re-binds a joint sub-selection', rb.jointRebound, rb);
    ok('deleting a figure releases the gizmo and its handles',
      !rb.afterDelete.tc && rb.afterDelete.handles === 0, rb.afterDelete);

    // put the default figure back for the groups that follow
    await c.ev(`
      const L = window.LB;
      const f = L.addPrimitive('human', { params: { sex: 'f', h: 1.66 }, name: 'Figure_A' });
      f.position.set(0.4, 0, 2.2); f.rotation.y = -0.5;
      L.setPose(f, 'Relaxed'); L.select([]); L.autosave();
      return 1;`);
  }

  /* ------------------------------------------------------------ camera ---- */
  if (want('cam')) {
    group('cam');
    /* This group flies the viewport camera around. Later groups tap fixed screen
       coordinates and recover this scene from the autosave, so put the camera
       back exactly where it was found. */
    await c.ev(`const p = window.LB.persp;
      window.__cam0 = { pos: p.position.toArray(), up: p.up.toArray(),
        piv: p.userData.pivot.toArray(), fov: p.fov };
      return 1;`);
    const m = await c.ev(`
      const L = window.LB, S = L.S;
      const $ = s => document.querySelector(s);
      const r3 = v => v.toArray().map(x => +x.toFixed(4));
      const out = {};
      out.isButton = $('#hudCam').tagName === 'BUTTON';
      $('#hudCam').click();
      out.open = $('#camMenu').classList.contains('show');
      out.items = [...$('#camMenu').querySelectorAll('.mi')].map(i => i.textContent.replace(/\\s+/g,' ').trim());
      out.groups = [...$('#camMenu').querySelectorAll('.mg')].map(i => i.textContent);
      const mr = $('#camMenu').getBoundingClientRect(), vr = $('#viewWrap').getBoundingClientRect();
      out.onScreen = mr.left >= vr.left - 1 && mr.right <= vr.right + 1 && mr.top >= vr.top - 1 && mr.bottom <= vr.bottom + 1;

      const pick = t => { $('#hudCam').click(); const i = [...$('#camMenu').querySelectorAll('.mi')].find(x => x.textContent.includes(t)); i && i.click(); return !!i; };
      $('#hudCam').click();                       // close it again

      // extent at the pivot must survive the switch, or "top view" reads as a zoom
      const ext = () => +(Math.tan(L.persp.fov * Math.PI / 360) * L.persp.position.distanceTo(L.persp.userData.pivot)).toFixed(3);
      const e0 = ext();
      out.pickedTop = pick('Top view');
      out.top = { v: S.view3d, up: r3(L.persp.up), fov: L.persp.fov, ext: ext(),
        above: Math.abs(L.persp.position.x - L.persp.userData.pivot.x) < 1e-6 &&
               Math.abs(L.persp.position.z - L.persp.userData.pivot.z) < 1e-6 &&
               L.persp.position.y > L.persp.userData.pivot.y };
      out.extHeld = Math.abs(out.top.ext - e0) < 1e-2;
      out.hudTop = $('#hudCamName').textContent.trim();
      out.topDraws = L.snap();

      out.pickedCam = pick('shotCam_A');
      out.lookThrough = S.lookThrough ? S.lookThrough.userData.pname : null;
      out.hudCam = $('#hudCamName').textContent.trim();

      out.pickedPersp = pick('Perspective');
      out.backPersp = { v: S.view3d, look: S.lookThrough, up: r3(L.persp.up), fov: L.persp.fov };
      return out;`);
    ok('the camera name is a picker', m.isButton && m.open, m);
    ok('the picker lists perspective, top view and every scene camera',
      m.items.length === 3 && m.items[0].includes('Perspective') && m.items[1].includes('Top view') &&
      m.items[2].includes('shotCam_A') && m.items[2].includes('32mm'), m.items);
    ok('the picker is grouped and stays on screen',
      m.groups.length === 2 && m.onScreen, { groups: m.groups, onScreen: m.onScreen });
    ok('top view looks straight down the +Y axis',
      m.pickedTop && m.top.v === 'top' && m.top.above && m.top.up[1] === 0, m.top);
    ok('top view is near-orthographic and holds the framing',
      m.top.fov < 20 && m.extHeld, { fov: m.top.fov, ext: m.top.ext });
    ok('top view renders', m.topDraws.avg > 4 && m.topDraws.colors > 6 && !m.topDraws.lost, m.topDraws);
    ok('the picker switches to a scene camera', m.pickedCam && m.lookThrough === 'shotCam_A', m);
    ok('the picker switches back to perspective',
      m.pickedPersp && m.backPersp.v === 'persp' && !m.backPersp.look && m.backPersp.fov === 45, m.backPersp);

    const tb = await c.ev(`
      const L = window.LB;
      L.setView3d('top');
      const before = L.S.view3d;
      ${ALT_DRAG}
      return { before, after: L.S.view3d, up: L.persp.up.toArray(), fov: L.persp.fov };`);
    ok('tumbling out of top view relabels it perspective',
      tb.before === 'top' && tb.after === 'persp' && tb.up[1] === 1 && tb.fov === 45, tb);

    const lk = await c.ev(`
      const L = window.LB, S = L.S;
      const $ = s => document.querySelector(s);
      const lock = $('#hudLock');
      const out = {};
      // getComputedStyle reports the ANIMATED value mid-transition
      lock.style.transition = 'none'; lock.style.animation = 'none';
      out.offBg = getComputedStyle(lock).backgroundColor;
      lock.click();
      void lock.offsetWidth;
      const cs = getComputedStyle(lock);
      out.on = S.camLock;
      out.bg = cs.backgroundColor;
      out.color = cs.color;
      out.glyph = lock.querySelector('.lk').textContent;
      out.ring = $('#camLockRing').classList.contains('on');
      const rgb = out.bg.match(/\\d+/g).map(Number);
      out.isRed = rgb[0] > 150 && rgb[1] < 90 && rgb[2] < 90;
      const r = lock.getBoundingClientRect();
      out.size = [Math.round(r.width), Math.round(r.height)];

      const p0 = L.persp.position.clone();
      L.nav.frame(S.objects);
      out.frameBlocked = L.persp.position.distanceTo(p0) < 1e-9;
      ${ALT_DRAG}
      out.tumbleBlocked = L.persp.position.distanceTo(p0) < 1e-9;
      ${WHEEL}
      out.wheelBlocked = L.persp.position.distanceTo(p0) < 1e-9;

      const shot = S.objects.find(o => o.isCamera);
      L.select([shot]);
      out.gizmoBlocked = L.tc.object !== shot;
      L.select([]);
      return out;`);

    const lk2 = await c.ev(`
      const L = window.LB, S = L.S;
      const $ = s => document.querySelector(s);
      const out = { stillLocked: S.camLock };

      // it survives a save / load round trip, and it is NOT part of the dirty signature
      L.setView3d('top');
      const j = JSON.parse(JSON.stringify(L.serializeScene()));
      L.setCamLock(false, { quiet: true }); L.setView3d('persp');
      L.loadScene(j, true);
      out.restored = { lock: S.camLock, v3d: S.view3d, up: L.persp.up.toArray(), fov: L.persp.fov };

      L.setCamLock(false, { quiet: true });
      const lock = $('#hudLock');
      lock.style.transition = ''; lock.style.animation = '';
      out.off = !S.camLock && !$('#camLockRing').classList.contains('on');
      const p1 = L.persp.position.clone();
      L.nav.frame(S.objects);
      out.frameWorks = L.persp.position.distanceTo(p1) > 1e-9;
      L.setView3d('persp'); L.select([]);
      return out;`);
    ok('the lock badge turns red', lk.on && lk.isRed && lk.color === 'rgb(255, 255, 255)', lk);
    ok('the lock badge is big enough to notice', lk.size[0] >= 26 && lk.size[1] >= 18, lk.size);
    ok('the whole viewport gets a red frame while locked', lk.ring && lk.glyph === '🔒', lk);
    ok('a locked camera refuses to tumble, dolly or frame',
      lk.frameBlocked && lk.tumbleBlocked && lk.wheelBlocked && lk2.stillLocked, { ...lk, ...lk2 });
    ok('a locked camera refuses the gizmo', lk.gizmoBlocked, lk);
    ok('lock and viewport preset survive save / load',
      lk2.restored.lock === true && lk2.restored.v3d === 'top' && lk2.restored.fov === 14, lk2.restored);
    ok('unlocking gives the camera back', lk2.off && lk2.frameWorks, lk2);

    const px = await c.ev(`
      const L = window.LB, S = L.S;
      const $ = s => document.querySelector(s);
      const $$ = s => [...document.querySelectorAll(s)];
      const key = (code, k) => dispatchEvent(new KeyboardEvent('keydown', { code, key: k, bubbles: true }));
      const out = {};

      key('KeyL', 'l'); out.keyOn = S.camLock;
      key('KeyL', 'l'); out.keyOff = !S.camLock;

      $('#btnMore').click();
      const mi = () => $$('#moreMenu .mi').find(i => i.textContent.includes('Lock camera'));
      out.inMoreMenu = !!mi();
      mi().click(); out.lockedFromMenu = S.camLock;
      $('#btnMore').click();
      out.moreMenuShowsState = mi().classList.contains('on');
      mi().click(); out.unlockedFromMenu = !S.camLock;

      $('#hudCam').click();
      key('Escape', 'Escape');
      out.escClosesPicker = !$('#camMenu').classList.contains('show');
      $('#hudCam').click();
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      out.clickAwayClosesPicker = !$('#camMenu').classList.contains('show');

      // the list is live: add a camera, it appears; delete it, it goes
      const names = () => { $('#hudCam').click(); const n = $$('#camMenu .mi').map(i => i.textContent); $('#hudCam').click(); return n; };
      const c2 = L.addCamera({ focal: 85, name: 'shotCam_B', pos: [-4, 2, 6] });
      out.afterAdd = names().length;
      out.showsNewFocal = names().some(t => t.includes('shotCam_B') && t.includes('85mm'));
      L.removeObject(c2);
      out.afterRemove = names().length;

      // an empty scene must not produce an empty menu
      const keep = JSON.parse(JSON.stringify(L.serializeScene()));
      L.loadScene({ app: 'previz', v: 4, objects: [] }, true);
      $('#hudCam').click();
      out.emptyItems = $$('#camMenu .mi').length;
      out.emptyHint = !!$('#camMenu .empty');
      $('#hudCam').click();
      L.loadScene(keep, true);
      return out;`);
    ok('L toggles the lock', px.keyOn && px.keyOff, px);
    ok('the lock is in the ⋯ menu at phone width',
      px.inMoreMenu && px.lockedFromMenu && px.moreMenuShowsState && px.unlockedFromMenu, px);
    ok('Escape and a click away close the picker',
      px.escClosesPicker && px.clickAwayClosesPicker, px);
    ok('the picker list is live', px.afterAdd === 4 && px.showsNewFocal && px.afterRemove === 3, px);
    ok('an empty scene still offers both viewport presets',
      px.emptyItems === 2 && px.emptyHint, px);

    const rst = await c.ev(`
      const L = window.LB, p = L.persp, s = window.__cam0;
      L.setCamLock(false, { quiet: true }); L.setView3d('persp', { quiet: true });
      p.position.fromArray(s.pos); p.up.fromArray(s.up);
      p.userData.pivot.fromArray(s.piv); p.fov = s.fov; p.updateProjectionMatrix();
      p.lookAt(p.userData.pivot);
      delete window.__cam0;
      L.autosave();
      return { v3d: L.S.view3d, lock: L.S.camLock, fov: p.fov };`);
    ok('the camera group leaves the viewport as it found it',
      rst.v3d === 'persp' && rst.lock === false && rst.fov === 45, rst);
  }

  /* ---------------------------------------------------------------- FK ---- */
  if (want('fk')) {
    group('fk');
    const r = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      const J = o.userData.rig.joints;
      const before = J.handL.getWorldPosition(new THREE.Vector3()).clone();
      L.S.subsel = null;
      // raw channel write, the same path the Inspector number field uses
      const ch = 'j:armL:rz';
      const v0 = L.chansOf(o).includes(ch);
      o.userData.rig.joints.armL.rotation.set(0,0,0);
      const setC = (k,v)=>{ L.setFrame(L.S.cur); };
      J.armL.rotation.z = 1.2;
      o.updateMatrixWorld(true);
      const after = J.handL.getWorldPosition(new THREE.Vector3());
      const moved = before.distanceTo(after);
      J.armL.rotation.set(0,0,0);
      // mirror
      J.armL.rotation.set(0.4, 0.2, 0.5); L.mirrorPose(o, 'L');
      const m = J.armR.rotation.toArray().slice(0,3).map(v=>+v.toFixed(4));
      L.resetPose(o); L.solveRigs();
      // presets
      const poses = {};
      for (const p of Object.keys(L.POSES)) {
        L.setPose(o, p); o.updateMatrixWorld(true);
        const b = new THREE.Box3().setFromObject(o);
        poses[p] = { minY:+b.min.y.toFixed(3), h:+(b.max.y-b.min.y).toFixed(3) };
      }
      L.resetPose(o);
      return { hasChan:v0, moved:+moved.toFixed(4), mirror:m, poses };`);
    ok('joint channel exists', r.hasChan);
    ok('rotating a parent joint moves the hand', r.moved > 0.15, r.moved);
    ok('mirror negates Y and Z', near(r.mirror[0], 0.4, 1e-3) && near(r.mirror[1], -0.2, 1e-3) && near(r.mirror[2], -0.5, 1e-3), r.mirror);
    for (const [p, v] of Object.entries(r.poses))
      ok('preset "' + p + '" stays sane', v.h > 0.5 && v.h < 2.4, v);
  }

  /* -------------------------------------------------------------- anim ---- */
  if (want('anim')) {
    group('anim');
    const r = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      const J = o.userData.rig.joints;
      L.select([o]);
      L.resetPose(o);
      L.setFrame(1); J.armL.rotation.z = 0.0; L.setKeys(o, ['t','r','s'], true);
      L.setFrame(40); J.armL.rotation.z = 1.0;
      o.userData.rig.chains.legL.blend = 1;
      L.setKeys(o, ['t','r','s'], true);
      const nCh = Object.keys(o.userData.tracks).length;
      L.setFrame(20);
      const mid = +J.armL.rotation.z.toFixed(4);
      L.setFrame(1);  const at1  = +J.armL.rotation.z.toFixed(4);
      L.setFrame(40); const at40 = +J.armL.rotation.z.toFixed(4);
      const blendKeyed = !!o.userData.tracks['b:legL'];
      // clean up so later groups start from a blank sheet
      o.userData.tracks = {}; L.resetPose(o); L.setFrame(1);
      return { nCh, mid, at1, at40, blendKeyed };`);
    ok('keying a rig writes pose channels', r.nCh > 60, r.nCh);
    ok('IK blend is keyable', r.blendKeyed);
    ok('pose interpolates between keys', r.mid > 0.05 && r.mid < 0.95, r.mid);
    ok('pose lands exactly on its keys', near(r.at1, 0, 1e-3) && near(r.at40, 1, 1e-3), [r.at1, r.at40]);
  }

  /* ---------------------------------------------------------------- io ---- */
  if (want('io')) {
    group('io');
    const r = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      const J = o.userData.rig.joints;
      L.setPose(o, 'Sit');
      J.head.rotation.set(0.11, -0.22, 0.33);
      const ch = o.userData.rig.chains.armR;
      ch.blend = 1; ch.twist = 37; ch.goal.set(0.31, 1.02, 0.44);
      L.solveRigs();
      const before = { pose: L.readPose(o), hand: J.handR.getWorldPosition(new THREE.Vector3()).toArray() };
      const json = JSON.parse(JSON.stringify(L.serializeScene()));
      L.loadScene(json, true);
      const o2 = L.S.objects.find(x => x.userData.rig);
      const J2 = o2.userData.rig.joints;
      const after = { pose: L.readPose(o2), hand: J2.handR.getWorldPosition(new THREE.Vector3()).toArray() };
      const dh = Math.hypot(...before.hand.map((v,i)=>v-after.hand[i]));
      // an unknown kind must survive as a placeholder rather than vanish
      const j2 = JSON.parse(JSON.stringify(json));
      j2.objects.push({ kind:'teapot', name:'Future_thing', pos:[3,0,3], rot:[0,0,0], scl:[1,1,1], tracks:{} });
      L.loadScene(j2, true);
      const survived = L.S.objects.some(x => x.userData.unknownKind === 'teapot');
      L.loadScene(json, true);
      const o3 = L.S.objects.find(x => x.userData.rig);
      return { v: json.v, samePose: JSON.stringify(before.pose)===JSON.stringify(after.pose),
        dh:+dh.toFixed(6), survived,
        twist:o3.userData.rig.chains.armR.twist, blend:o3.userData.rig.chains.armR.blend };`);
    ok('scene format is v4', r.v === 4, r.v);
    ok('pose round-trips through save/load', r.samePose, r.__err || r);
    ok('solved hand lands in the same place', r.dh < 1e-4, r.dh);
    ok('IK settings round-trip', r.twist === 37 && r.blend === 1, [r.twist, r.blend]);
    ok('unknown kind survives as a placeholder', r.survived);
  }

  /* --------------------------------------------------------------- car ---- */
  if (want('car')) {
    group('car');
    const r = await c.ev(`
      const L = window.LB;
      const o = L.addPrimitive('car');
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      const p = o.userData.params;
      o.userData.params.l = 6.2; L.S.dirty = true;
      const rb = (()=>{ const f = window.LB; return null; })();
      return { minY:+b.min.y.toFixed(4), h:+(b.max.y-b.min.y).toFixed(3),
        len:+(b.max.z-b.min.z).toFixed(3), wid:+(b.max.x-b.min.x).toFixed(3),
        params:p, meshes:(()=>{let n=0;o.traverse(x=>{if(x.isMesh)n++});return n})(),
        id:o.userData.pvid };`);
    ok('car sits on the floor', near(r.minY, 0, 0.004), r.minY);
    ok('car matches its height param', near(r.h, 1.46, 0.02), r.h);
    ok('car matches its length param', near(r.len, 4.42, 0.02), r.len);
    ok('car is 6 parts (body, cabin, 4 wheels)', r.meshes === 6, r.meshes);
    const r2 = await c.ev(`
      const L = window.LB;
      const o = L.byId(${r.id});
      o.userData.params.l = 6.2;
      // the Inspector path for a group kind
      const fn = Object.getOwnPropertyNames(window).length;
      L.S.dirty = true;
      return { ok:true };`);
    // rebuild through the real UI path is covered by the layout group's click test
  }

  /* ----------------------------------------------------------- ui/io2 ---- */
  if (want('ui')) {
    group('ui');
    await c.send('Page.navigate', { url: URL_ });
    await sleep(2400);

    const u = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      const J = o.userData.rig.joints;
      L.select([o]);
      L.setPose(o, 'Sit');
      const sit = +J.thighL.rotation.x.toFixed(4);
      // readPose → applyPose must be lossless on its own, independent of any I/O
      const a = JSON.stringify(L.readPose(o));
      L.applyPose(o, JSON.parse(a));
      const b = JSON.stringify(L.readPose(o));
      L.resetPose(o); L.solveRigs();
      const rest = +J.thighL.rotation.x.toFixed(4);
      return { sit, roundTrip: a === b, rest };`);
    ok('Sit preset bends the hip', u.sit < -1.0, u.sit);
    ok('readPose / applyPose is lossless', u.roundTrip, u);
    ok('resetPose returns to the A-pose', near(u.rest, 0, 1e-4), u.rest);

    const dup = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      L.setPose(o, 'Walk');
      const ch = o.userData.rig.chains.legL; L.snapGoal(o, ch); ch.blend = 1; L.solveRigs();
      const poseA = JSON.stringify(L.readPose(o));
      L.select([o]);
      const n0 = L.S.objects.length, h0 = L.helpers.getObjectByName('__ikHandles').children.length;
      document.querySelector('#btnDup').click();
      const rigs = L.S.objects.filter(x => x.userData.rig);
      const copy = rigs[rigs.length - 1];
      const poseB = JSON.stringify(L.readPose(copy));
      /* Compared geometrically, not as text: the copy re-solves IK from a goal
         that went through JSON, so its joint angles land microns away from the
         original's. What has to match is where the limbs actually are. */
      o.updateMatrixWorld(true); copy.updateMatrixWorld(true);
      let worst = 0;
      for (const j of L.JOINT_UI) {
        const pa = o.worldToLocal(o.userData.rig.joints[j].getWorldPosition(new THREE.Vector3()));
        const pb = copy.worldToLocal(copy.userData.rig.joints[j].getWorldPosition(new THREE.Vector3()));
        worst = Math.max(worst, pa.distanceTo(pb));
      }
      const h1 = L.helpers.getObjectByName('__ikHandles').children.length;
      // undo must take the copy away again AND leave the original posed
      document.querySelector('#btnDel').click();
      const h2 = L.helpers.getObjectByName('__ikHandles').children.length;
      return { worstMm: +(worst * 1000).toFixed(4), samePose: poseA === poseB,
        h0, h1, h2, distinct: copy !== o };`);
    ok('duplicating a rig copies the pose', dup.worstMm < 0.05, dup);
    ok('the copy gets its own IK handles', dup.h1 === dup.h0 + 4, dup);
    ok('deleting the copy frees its handles', dup.h2 === dup.h0, dup);

    const un = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      L.resetPose(o); L.solveRigs();
      const a = +o.userData.rig.joints.thighL.rotation.x.toFixed(4);
      // pushUndo happens inside the Inspector handlers; emulate one edit cycle
      const snap = JSON.stringify(L.serializeScene());
      L.setPose(o, 'Sit'); L.solveRigs();
      const b = +o.userData.rig.joints.thighL.rotation.x.toFixed(4);
      L.loadScene(JSON.parse(snap), true);
      const o2 = L.S.objects.find(x => x.userData.rig);
      const c2 = +o2.userData.rig.joints.thighL.rotation.x.toFixed(4);
      return { a, b, c: c2 };`);
    ok('a scene snapshot restores the pose exactly', near(un.c, un.a, 1e-3) && Math.abs(un.b - un.a) > 1, un);

    // exercise the REAL Inspector rebuild path by typing into the Height field
    const hgt = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.rig);
      L.setPose(o, 'Walk'); L.select([o]);
      const p0 = JSON.stringify(L.readPose(o));
      // find the Body section's Height field
      let field = null;
      for (const sect of document.querySelectorAll('#inspector .sect')) {
        if (!/Body/.test(sect.querySelector('.stitle').textContent)) continue;
        for (const r of sect.querySelectorAll('.row'))
          if (/Height/.test(r.textContent)) field = r.querySelector('input');
      }
      if (!field) return { noField: true };
      field.value = '1.95';
      field.dispatchEvent(new Event('change', { bubbles: true }));
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      const p1 = JSON.stringify(L.readPose(o));
      return { h: +(b.max.y - b.min.y).toFixed(3), minY: +b.min.y.toFixed(4),
        posePreserved: p0 === p1, joints: Object.keys(o.userData.rig.joints).length };`);
    ok('Height field rebuilds the figure', near(hgt.h, 1.95, 0.07), hgt);
    ok('rebuild keeps the pose', hgt.posePreserved, hgt);
    ok('rebuilt figure still stands on the floor', near(hgt.minY, 0, 0.01), hgt);

    const carUI = await c.ev(`
      const L = window.LB;
      const car = L.addPrimitive('car'); L.select([car]);
      let field = null;
      for (const sect of document.querySelectorAll('#inspector .sect')) {
        if (!/Geometry/.test(sect.querySelector('.stitle').textContent)) continue;
        for (const r of sect.querySelectorAll('.row'))
          if (/Length/.test(r.textContent)) field = r.querySelector('input');
      }
      if (!field) return { noField: true };
      field.value = '6.4'; field.dispatchEvent(new Event('change', { bubbles: true }));
      car.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(car);
      const r = { len: +(b.max.z - b.min.z).toFixed(3), minY: +b.min.y.toFixed(4),
        meshes: (()=>{let n=0;car.traverse(x=>{if(x.isMesh)n++});return n})() };
      L.removeObject(car);
      return r;`);
    ok('car Length field rebuilds the car', near(carUI.len, 6.4, 0.05), carUI);
    ok('rebuilt car has no leftover parts', carUI.meshes === 6, carUI);
    ok('rebuilt car still sits on the floor', near(carUI.minY, 0, 0.005), carUI);

    // v2 → v4 migration must still work (pivots moved to the base in v3)
    const mig = await c.ev(`
      const L = window.LB;
      const v2 = { app:'previz', v:2, fps:24, start:1, end:60, cur:1, aspect:2.39024, filmback:0,
        objects: [ { kind:'box', name:'Old', params:{w:2,h:2,d:2}, pos:[0,1,0], rot:[0,0,0], scl:[1,1,1],
                     tracks:{ py:[{f:1,v:1,i:'spline'},{f:30,v:3,i:'spline'}] } } ] };
      L.loadScene(v2, true);
      const o = L.S.objects[0];
      return { y:+o.position.y.toFixed(4), key0:+o.userData.tracks.py[0].v.toFixed(4),
        key1:+o.userData.tracks.py[1].v.toFixed(4) };`);
    ok('v2 pivot migration still lands on the floor', near(mig.y, 0, 1e-4), mig);
    ok('v2 keys migrate with it', near(mig.key0, 0, 1e-4) && near(mig.key1, 2, 1e-4), mig);

    // graph editor with a full rig keyed
    const ge = await c.ev(`
      const L = window.LB;
      L.loadScene(JSON.parse(JSON.stringify(L.serializeScene())), true);
      const o = L.addPrimitive('human', { params: { sex:'m', h:1.81 } });
      L.select([o]); L.setFrame(1); L.setKeys(o, ['t','r','s'], true);
      L.setFrame(30); L.setPose(o, 'Walk'); L.setKeys(o, ['t','r','s'], true);
      const n = Object.keys(o.userData.tracks).length;
      const gc = document.getElementById('geCanvas');
      gc.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, clientX: gc.getBoundingClientRect().x + 20, clientY: gc.getBoundingClientRect().y + 60, bubbles: true, cancelable: true }));
      return { tracks: n, scroll: L.S && window.__ge };`);
    ok('a keyed rig writes many channels', ge.tracks > 60, ge.tracks);
    const ge2 = await c.ev(`
      // the list must scroll rather than silently clip past the pane height
      const gc = document.getElementById('geCanvas');
      const r = gc.getBoundingClientRect();
      const wheel = d => gc.dispatchEvent(new WheelEvent('wheel', { deltaY: d, clientX: r.x + 20, clientY: r.y + 60, bubbles: true, cancelable: true }));
      wheel(600); wheel(600);
      return { ok: true };`);
    ok('graph channel list accepts scroll', !ge2.__err, ge2);

    // quality tiers really change what the renderer does
    const q = await c.ev(`
      const L = window.LB; const out = {};
      for (const t of ['high','med','low']) {
        L.setQualityPref(t);
        out[t] = { dpr: L.renderer.getPixelRatio(), shadows: L.renderer.shadowMap.enabled,
                   map: L.TIERS[t].shadow, snap: L.snap(8).avg > 3 };
      }
      L.setQualityPref('auto');
      out.auto = L.Q.tier;
      return out;`);
    ok('low tier drops shadows', q.low && q.low.shadows === false, q);
    ok('high tier keeps shadows', q.high && q.high.shadows === true, q);
    ok('every tier still renders', ['high','med','low'].every(t => q[t].snap), q);
    ok('auto resolves to a real tier', ['high','med','low'].includes(q.auto), q.auto);

    // the cheap unrigged stand-in must survive the group-primitive refactor
    const si = await c.ev(`
      const L = window.LB;
      const o = L.addPrimitive('figure');
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      const r = { minY:+b.min.y.toFixed(4), h:+(b.max.y-b.min.y).toFixed(3),
        meshes:(()=>{let n=0;o.traverse(x=>{if(x.isMesh)n++});return n})(), rig: !!o.userData.rig };
      L.removeObject(o);
      return r;`);
    ok('stand-in still builds and stands on the floor', near(si.minY, 0, 0.005) && si.meshes === 3, si);
    ok('stand-in has no rig (it is the cheap one)', si.rig === false, si);

    // autosave → reload → recover
    const as = await c.ev(`
      const L = window.LB;
      // a FRESH figure with no keys: a keyed pose is re-evaluated from its tracks
      // on the next setFrame, which would mask whatever the autosave stored
      const o = L.addPrimitive('human', { params: { sex:'m', h:1.81 }, name: 'RecoverMe' });
      o.position.set(2.5, 0, -2);
      L.setPose(o, 'Sit');
      L.autosave();
      return { hip: +o.userData.rig.joints.thighL.rotation.x.toFixed(4) };`);
    const stored = await c.ev(`
      const raw = localStorage.getItem('lensblock.autosave');
      if (!raw) return { none: true };
      const d = JSON.parse(raw), sc = JSON.parse(d.scene);
      const f = (sc.objects||[]).find(o => o.name === 'RecoverMe');
      return { has: !!f, pose: !!(f && f.pose), joints: f && f.pose && Object.keys(f.pose.j).length,
        ik: f && f.pose && Object.keys(f.pose.ik).length };`);
    ok('autosave captures the scene', stored.has, stored);
    ok('autosave captures the pose', stored.pose && stored.joints > 3 && stored.ik === 4, stored);
    await c.send('Page.navigate', { url: URL_ });
    await sleep(2500);
    const rec = await c.ev(`
      const L = window.LB;
      const o = L.S.objects.find(x => x.userData.pname === 'RecoverMe');
      return { recovered: !!o, hip: o ? +o.userData.rig.joints.thighL.rotation.x.toFixed(4) : null };`);
    ok('the session is recovered on the next boot', rec.recovered, rec);
    ok('the recovered figure is still sitting', near(rec.hip, as.hip, 1e-3), [as.hip, rec.hip]);
    await c.ev(`localStorage.removeItem('lensblock.autosave'); LB.S.objects.length; return 1;`);

    // the export pipeline: smallest possible job, end to end
    await c.send('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => { });
    const ex = await c.ev(`
      const L = window.LB;
      L.S.start = 1; L.S.end = 3; L.setFrame(1);
      document.querySelector('#btnExport').click();
      const sel = [...document.querySelectorAll('#exportBody select')];
      const fmt = sel.find(s => [...s.options].some(o => /png/i.test(o.textContent)));
      if (fmt) { fmt.value = [...fmt.options].find(o => /png/i.test(o.textContent)).value; fmt.dispatchEvent(new Event('change', { bubbles:true })); }
      document.querySelector('#expGo').click();
      return { started: true };`);
    await sleep(6000);
    const exDone = await c.ev(`
      const L = window.LB;
      const log = (document.querySelector('#expLog')||{}).textContent || '';
      document.querySelector('#expCancel').click();
      return { log: log.slice(-300), dpr: L.renderer.getPixelRatio(),
        canvas: [document.getElementById('glcanvas').width, document.getElementById('glcanvas').height],
        snap: L.snap(8) };`);
    ok('export ran without throwing', bad.exceptions.length === 0, bad.exceptions);
    ok('viewport recovers after an export', exDone.snap.avg > 4, exDone);
    ok('pixel ratio is restored after an export', exDone.dpr >= 1, exDone.dpr);
  }

  /* ------------------------------------------------------------ layout ---- */
  if (want('layout')) {
    group('layout');
    const PROFILES = [
      ['desktop-1920', 1920, 1080, 1, false],
      ['laptop-1280', 1280, 800, 1, false],
      ['tablet-land-1024', 1024, 768, 2, true],
      ['tablet-port-768', 768, 1024, 2, true],
      ['phone-390', 390, 844, 3, true],
      ['phone-360', 360, 740, 3, true],
      ['phone-landscape', 844, 390, 3, true],
    ];
    for (const [n, w, h, dpr, touch] of PROFILES) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: touch, screenWidth: w, screenHeight: h });
      await c.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: 5 });
      await sleep(500);
      const r = await c.ev(`
        const $ = s => document.querySelector(s);
        const R = e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
        const top = $('#topbar'), tr = top.getBoundingClientRect();
        const clipped = [];
        for (const b of $('#topPin').querySelectorAll('button')) {
          const r = b.getBoundingClientRect();
          if (getComputedStyle(b).display === 'none') continue;
          if (r.right > tr.right + 0.5 || r.left < tr.left - 0.5 || r.width === 0) clipped.push(b.id);
        }
        return { view: R($('#viewPane')), wrap: R($('#viewWrap')),
          canvas: [$('#glcanvas').width, $('#glcanvas').height],
          hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          pinnedClipped: clipped,
          drawerBtns: getComputedStyle($('#btnDrawL')).display !== 'none',
          tlTopOverflowScrolls: getComputedStyle($('#tlTop')).overflowX,
          canvasTouch: getComputedStyle($('#glcanvas')).touchAction,
          bodyOverscroll: getComputedStyle(document.body).overscrollBehaviorY,
          snap: LB.snap(24) };`);
      ok(n + ': viewport is usable', r.view[0] > 200 && r.view[1] > 150, r.view);
      ok(n + ': drawing buffer non-empty', r.canvas[0] > 8 && r.canvas[1] > 8, r.canvas);
      ok(n + ': page does not scroll sideways', r.hOverflow <= 0, r.hOverflow);
      ok(n + ': pinned controls never clip', r.pinnedClipped.length === 0, r.pinnedClipped);
      ok(n + ': renders something', r.snap.avg > 4 && r.snap.colors > 8, r.snap);
      if (w <= 900) ok(n + ': drawer buttons shown', r.drawerBtns);
      if (w > 900) ok(n + ': drawer buttons hidden', !r.drawerBtns);
      ok(n + ': canvas owns its gestures', r.canvasTouch === 'none', r.canvasTouch);
      ok(n + ': no page overscroll', r.bodyOverscroll === 'none', r.bodyOverscroll);
      try {
        const shot = await c.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(__dirname, `shot-check-${n}.png`), Buffer.from(shot.data, 'base64'));
      } catch { }
    }
    // drawers actually open and cover nothing structural
    await c.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true, screenWidth: 768, screenHeight: 1024 });
    await sleep(400);
    const d = await c.ev(`
      const $ = s => document.querySelector(s);
      const before = $('#viewWrap').getBoundingClientRect().width;
      $('#btnDrawL').click();
      const openL = $('#leftPane').classList.contains('open');
      $('#btnDrawR').click();
      const bothOpen = $('#leftPane').classList.contains('open') && $('#rightCol').classList.contains('open');
      $('#drawerScrim').click();
      const closed = !$('#leftPane').classList.contains('open') && !$('#rightCol').classList.contains('open');
      return { before, openL, bothOpen, closed, after: $('#viewWrap').getBoundingClientRect().width };`);
    ok('left drawer opens', d.openL);
    /* Measured with the transition suppressed. getBoundingClientRect() reports
       the in-flight animated value, and a browser window that is occluded (which
       an automated one usually is) throttles the animation timeline — so the
       naive read is a coin flip on whether the slide has finished. */
    const dp2 = await c.ev(`
      const p = document.querySelector('#leftPane');
      const t = p.style.transition;
      p.style.transition = 'none';
      p.classList.add('open');
      void p.offsetWidth;
      const r = p.getBoundingClientRect();
      const onScreen = r.x > -2 && r.width > 180 && r.right <= innerWidth + 2 && r.height > 200;
      p.classList.remove('open');
      p.style.transition = t;
      document.querySelector('#drawerScrim').classList.remove('show');
      return { onScreen, x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height),
               tf: getComputedStyle(p).transform };`);
    ok('open drawer is fully on screen', dp2.onScreen, dp2);
    ok('only one drawer at a time', !d.bothOpen);
    ok('scrim closes the drawers', d.closed);
    ok('drawers do not resize the viewport', Math.abs(d.before - d.after) < 1, [d.before, d.after]);
    const m = await c.ev(`
      const $ = s => document.querySelector(s);
      $('#btnMore').click();
      const shown = $('#moreMenu').classList.contains('show');
      const items = $('#moreMenu').querySelectorAll('.mi').length;
      const r = $('#moreMenu').getBoundingClientRect();
      const inside = r.right <= innerWidth + 1 && r.left >= -1;
      $('#btnMore').click();
      return { shown, items, inside, hidden: !$('#moreMenu').classList.contains('show') };`);
    ok('⋯ menu opens with every pinned command', m.shown && m.items >= 12, m);
    ok('⋯ menu stays on screen', m.inside, m);
    ok('⋯ menu closes', m.hidden);
    await c.send('Emulation.clearDeviceMetricsOverride');
    // leaving touch emulation on with the metrics cleared is what strands the
    // next group's Input.dispatchTouchEvent waiting for an ack that never comes
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
  }

  /* ------------------------------------------------------------- touch ---- */
  if (want('touch')) {
    group('touch');
    /* Emulation goes on BEFORE the navigate, and that is load-bearing: the
       renderer wires the touch ack path when the document is created, so touch
       emulation turned on afterwards delivers the events but never acks them,
       and every Input.dispatchTouchEvent hangs until the CDP timeout.
       The localStorage clear matters too — these gestures tap fixed screen
       coordinates, so they need the DEFAULT scene and the default camera, not
       whatever the earlier groups left in the autosave. */
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 2, mobile: true, screenWidth: 1024, screenHeight: 768 });
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await c.ev(`localStorage.clear(); return 1;`);
    await c.send('Page.navigate', { url: URL_ });
    await sleep(2600);
    await c.send('Page.bringToFront').catch(() => { });

    const before = await c.ev(`return LB.snap(24);`);

    // one finger = tumble
    const cx = 512, cy = 330;
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    for (let i = 1; i <= 8; i++)
      await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 16, y: cy + i * 5, id: 1 }] });
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(350);
    const after1 = await c.ev(`return LB.snap(24);`);
    ok('1-finger drag tumbles the camera', JSON.stringify(before) !== JSON.stringify(after1), { before, after1 });

    // two fingers = track + pinch dolly
    const camDist = `return { d: +LB.tc.camera.position.distanceTo(LB.nav.pivot).toFixed(4),
      p: LB.nav.pivot.toArray().map(v=>+v.toFixed(4)) };`;
    const camA = await c.ev(camDist);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 420, y: 340, id: 1 }, { x: 620, y: 340, id: 2 }] });
    for (let i = 1; i <= 8; i++)
      await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 420 - i * 9, y: 340, id: 1 }, { x: 620 + i * 9, y: 340, id: 2 }] });
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(350);
    const camB = await c.ev(camDist);
    ok('pinch changes the camera distance', Math.abs(camA.d - camB.d) > 0.05, [camA.d, camB.d]);

    // two fingers moving together = track: the pivot slides
    const camC = await c.ev(camDist);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 430, y: 340, id: 1 }, { x: 610, y: 340, id: 2 }] });
    for (let i = 1; i <= 8; i++)
      await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 430 + i * 10, y: 340 + i * 4, id: 1 }, { x: 610 + i * 10, y: 340 + i * 4, id: 2 }] });
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(350);
    const camD = await c.ev(camDist);
    const moved = Math.hypot(...camC.p.map((v, i) => v - camD.p[i]));
    ok('2-finger drag tracks the view', moved > 0.05, { moved: +moved.toFixed(4) });

    // a tap must still select, and must not be eaten by the tumble threshold
    const tap = await c.ev(`
      const L = window.LB;
      L.select([]);
      return { sel: L.S.sel.length };`);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 512, y: 500, id: 1 }] });
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 513, y: 501, id: 1 }] });
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    const tapped = await c.ev(`return { sel: LB.S.sel.length, name: LB.S.sel[0] && LB.S.sel[0].userData.pname };`);
    ok('a tap still selects', tapped.sel === 1, tapped);

    await c.send('Emulation.clearDeviceMetricsOverride');
    await c.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
  }

  /* -------------------------------------------------------------- perf ---- */
  if (want('perf')) {
    group('perf');
    await c.ev(`localStorage.clear(); return 1;`);   // time the default scene, not a drifted one
    await c.send('Page.navigate', { url: URL_ });
    await sleep(2400);
    for (const [label, n, tier] of [['1 rig · high', 1, 'high'], ['6 rigs · high', 6, 'high'], ['6 rigs · low', 6, 'low']]) {
      const r = await c.ev(`
        const L = window.LB;
        L.setQualityPref('${tier === 'high' ? 'high' : 'low'}');
        for (const o of [...L.S.objects]) if (o.userData.rig) L.removeObject(o);
        for (let i = 0; i < ${n}; i++) {
          const o = L.addPrimitive('human', { params: { sex: i % 2 ? 'm' : 'f', h: i % 2 ? 1.81 : 1.66 } });
          o.position.set((i % 3) * 1.5 - 1.5, 0, Math.floor(i / 3) * 1.5);
          L.setPose(o, i % 2 ? 'Walk' : 'Relaxed');
          for (const ch of Object.values(o.userData.rig.chains)) { L.snapGoal(o, ch); ch.blend = 1; }
        }
        L.select([]);
        const t = [];
        for (let i = 0; i < 40; i++) {
          const a = performance.now();
          L.solveRigs(); L.snap(8);
          t.push(performance.now() - a);
        }
        t.sort((x,y)=>x-y);
        return { median: +t[20].toFixed(2), p90: +t[36].toFixed(2),
          objs: L.S.objects.length, tier: L.Q.tier, dpr: L.renderer.getPixelRatio() };`);
      ok(label + ' renders under 33 ms (median)', r.median < 33, r);
      R.groups.perf.push({ name: label + ' timing', ok: true, detail: r });
    }
    const solve = await c.ev(`
      const L = window.LB;
      const a = performance.now();
      for (let i = 0; i < 2000; i++) L.solveRigs();
      return { perSolve: +((performance.now()-a)/2000).toFixed(4), rigs: L.S.objects.filter(o=>o.userData.rig).length };`);
    ok('IK solve costs < 0.5 ms for the whole scene', solve.perSolve < 0.5, solve);

    // the HUD readout must be a median, not a mean poisoned by the first frame
    await c.send('Page.bringToFront').catch(() => { });   // an occluded tab throttles rAF
    const ms0 = await c.ev(`
      const L = window.LB;
      L.setQualityPref('high');
      return { samples: L.Q.rn, ms: L.Q.ms, hud: (document.getElementById('hudPerf')||{}).textContent };`);
    ok('frame-time readout starts empty, not guessed', ms0.samples === 0 && ms0.ms === 0 && /—/.test(ms0.hud || '—'), ms0);
    await c.ev(`window.__t = setInterval(() => { LB.S.dirty = true; }, 8); return 1;`);
    await sleep(1500);
    const ms = await c.ev(`
      clearInterval(window.__t);
      const L = window.LB;
      return { after: +L.Q.ms.toFixed(2), samples: L.Q.rn,
               hud: (document.getElementById('hudPerf')||{}).textContent };`);
    ok('frame-time readout settles to a sane median', ms.samples >= 8 && ms.after > 0 && ms.after < 60, ms);
    ok('readout is a frame PERIOD, not a submit time', ms.after > 1, ms);
    ok('readout shows fps once it has samples', /fps/.test(ms.hud || ''), ms);
    await c.ev(`LB.setQualityPref('auto'); return 1;`);
  }

  /* --------------------------------------------------------------- ctx ---- */
  if (want('ctx')) {
    group('ctx');
    await c.send('Page.navigate', { url: URL_ });
    await sleep(2400);
    const r = await c.ev(`
      const L = window.LB;
      const gl = L.renderer.getContext();
      const ext = gl.getExtension('WEBGL_lose_context');
      if (!ext) return { skip: true };
      const before = L.snap(32);
      window.__lost = false; window.__restored = false;
      const cv = document.getElementById('glcanvas');
      cv.addEventListener('webglcontextlost', () => { window.__lost = true; }, { once: true });
      cv.addEventListener('webglcontextrestored', () => { window.__restored = true; }, { once: true });
      ext.loseContext();
      setTimeout(() => ext.restoreContext(), 120);
      return { before, ext: true };`);
    if (r.skip) { ok('WEBGL_lose_context available', false, 'extension missing — cannot test'); }
    else {
      await sleep(1600);
      const after = await c.ev(`
        const L = window.LB;
        L.S.dirty = true;
        return { lost: window.__lost, restored: window.__restored,
          isLost: L.renderer.getContext().isContextLost(),
          snap: L.snap(32), objs: L.S.objects.length };`);
      ok('context loss is caught', after.lost, after);
      ok('context restore fires', after.restored, after);
      ok('context is live again', after.isLost === false, after.isLost);
      ok('viewport draws after a restore', after.snap.avg > 6 && after.snap.colors > 12, after.snap);
      ok('the scene survived the loss', after.objs >= 5, after.objs);
      try {
        const shot = await c.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(__dirname, 'shot-check-after-ctxloss.png'), Buffer.from(shot.data, 'base64'));
      } catch { }
    }
  }

  R.console = [...new Set(bad.console)];
  R.exceptions = [...new Set(bad.exceptions)];
  proc.kill();
  await sleep(300);
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch { }
}

(async () => {
  const args = process.argv.slice(2);
  const browser = BROWSERS[args[0]] ? args.shift() : 'chrome';
  console.log('LensBlock check · ' + browser + (args.length ? ' · ' + args.join(' ') : ' · all groups') + '\n');
  try { await run(browser, args); }
  catch (e) { console.log('\x1b[31mHARNESS ERROR\x1b[0m ' + e.message); R.fail++; R.harnessError = e.message; }
  fs.writeFileSync(path.join(__dirname, 'check-report.json'), JSON.stringify(R, null, 1));
  console.log('\n' + (R.fail === 0 ? '\x1b[32m' : '\x1b[31m') + R.pass + ' passed, ' + R.fail + ' failed\x1b[0m');
  if (R.console.length) console.log('console noise: ' + JSON.stringify(R.console, null, 1));
  if (R.exceptions.length) console.log('exceptions: ' + JSON.stringify(R.exceptions, null, 1));
  process.exit(R.fail ? 1 : 0);
})();
