// Injected into the page. Returns a JSON-able report.
// Runs after boot, so it sees the live app.
(() => {
  const out = { ok: true };
  const $ = s => document.querySelector(s);
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };

  out.ua = navigator.userAgent;
  out.brands = (navigator.userAgentData && navigator.userAgentData.brands) || null;
  out.dpr = devicePixelRatio;
  out.inner = [innerWidth, innerHeight];
  out.maxTouchPoints = navigator.maxTouchPoints;

  // ---- boot / three ----
  out.three = (typeof THREE !== 'undefined') ? THREE.REVISION : null;
  out.transformControls = (typeof THREE !== 'undefined') ? typeof THREE.TransformControls : 'no THREE';
  const boot = $('#boot');
  out.bootStillUp = !!boot && cs(boot, 'display') !== 'none';
  out.bootMsg = $('#bootMsg') ? $('#bootMsg').textContent.trim().slice(0, 300) : null;
  out.appHidden = $('#app') ? $('#app').hidden : 'missing';

  // ---- WebGL ----
  const gc = $('#glcanvas');
  out.glcanvas = gc ? { attr: [gc.width, gc.height], css: [gc.clientWidth, gc.clientHeight] } : null;
  try {
    const gl = gc && (gc.getContext('webgl2') || gc.getContext('webgl'));
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      out.gl = {
        version: gl.getParameter(gl.VERSION),
        webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        lost: gl.isContextLost(),
      };
    } else out.gl = 'NO CONTEXT';
  } catch (e) { out.gl = 'ERR ' + e.message; }

  // ---- does the canvas actually have pixels drawn? ----
  try {
    const t = document.createElement('canvas'); t.width = 40; t.height = 30;
    t.getContext('2d').drawImage(gc, 0, 0, 40, 30);
    const d = t.getContext('2d').getImageData(0, 0, 40, 30).data;
    let sum = 0, uniq = new Set();
    for (let i = 0; i < d.length; i += 4) { sum += d[i] + d[i + 1] + d[i + 2]; uniq.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); }
    out.pixels = { avg: +(sum / (40 * 30 * 3)).toFixed(1), distinctColors: uniq.size };
  } catch (e) { out.pixels = 'ERR ' + e.message; }

  // ---- export capability matrix (mirrors the app's CAP object) ----
  const mimes = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  out.cap = {
    webcodecs: typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined',
    recorder: typeof MediaRecorder !== 'undefined',
    captureStream: typeof HTMLCanvasElement.prototype.captureStream === 'function',
    mimes: {},
  };
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported)
    for (const m of mimes) { try { out.cap.mimes[m] = MediaRecorder.isTypeSupported(m); } catch (e) { out.cap.mimes[m] = 'ERR'; } }

  // ---- LAYOUT: the meat of the responsive testing ----
  const app = $('#app'), top = $('#topbar'), vp = $('#viewPane'), left = $('#leftPane'), right = $('#rightCol');
  out.layout = {
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    appRect: R(app), topbar: R(top), viewPane: R(vp), leftPane: R(left), rightCol: R(right),
    gridCols: cs(app, 'gridTemplateColumns'),
    gridRows: cs(app, 'gridTemplateRows'),
  };
  // topbar horizontal overflow + which controls are clipped off the right edge
  if (top) {
    out.layout.topbarScrollW = top.scrollWidth;
    out.layout.topbarClientW = top.clientWidth;
    out.layout.topbarOverflowPx = top.scrollWidth - top.clientWidth;
    const tr = top.getBoundingClientRect();
    const clipped = [];
    for (const b of top.querySelectorAll('button')) {
      const r = b.getBoundingClientRect();
      if (r.right > tr.right + 0.5 || r.left < tr.left - 0.5 || r.width === 0)
        clipped.push((b.id || b.dataset.add || b.dataset.giz || b.textContent.trim()).slice(0, 14));
    }
    out.layout.topbarClippedControls = clipped;
  }
  // is the 3D viewport actually usable?
  const vr = vp ? vp.getBoundingClientRect() : null;
  out.layout.viewportUsable = vr ? (vr.width > 120 && vr.height > 120) : false;

  // vertical: does the bottom timeline row survive?
  const bot = $('#botPane'), tl = $('#tlTop');
  out.layout.botPane = R(bot);
  if (tl) { out.layout.tlTopOverflowPx = tl.scrollWidth - tl.clientWidth; }

  // ---- touch readiness ----
  out.touch = {
    glcanvasTouchAction: cs($('#glcanvas'), 'touchAction'),
    overlayTouchAction: cs($('#overlay'), 'touchAction'),
    tlCanvasTouchAction: cs($('#tlCanvas'), 'touchAction'),
    geCanvasTouchAction: cs($('#geCanvas'), 'touchAction'),
    bodyTouchAction: cs(document.body, 'touchAction'),
    bodyOverscroll: cs(document.body, 'overscrollBehavior'),
  };

  // ---- CSS feature checks that differ per engine ----
  out.css = {
    backdropFilter: CSS.supports('backdrop-filter', 'blur(6px)'),
    webkitBackdropFilter: CSS.supports('-webkit-backdrop-filter', 'blur(6px)'),
    hudBackdrop: cs(document.querySelector('.hud'), 'backdropFilter'),
    accentColor: CSS.supports('accent-color', 'red'),
    dvh: CSS.supports('height', '100dvh'),
  };

  // ---- globals the module leaks (for further probing) ----
  out.globals = ['THREE', 'S', 'CAP', 'EX', 'GE', 'app'].filter(k => k in window);

  return out;
})();
