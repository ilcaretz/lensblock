const fs = require('fs'), path = require('path');
for (const key of process.argv.slice(2)) {
  const f = path.join(__dirname, `report-${key}.json`);
  if (!fs.existsSync(f)) { console.log(`\n##### ${key}: NO REPORT`); continue; }
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`\n##### ${r.browser.toUpperCase()} ${r.error ? 'FATAL: ' + r.error : ''}`);
  for (const [k, v] of Object.entries(r.profiles)) {
    const p = v.probe || {}, L = p.layout || {}, T = p.touch || {};
    const d = v.device || {};
    console.log(`\n--- ${k}  ${d.w}x${d.h} dpr${d.dpr}${d.touch ? ' TOUCH' : ''} ---`);
    if (v.profileError) { console.log('  PROFILE ERROR:', v.profileError); continue; }
    if (p.__evalError) { console.log('  EVAL ERROR:', p.__evalError); continue; }
    console.log(`  boot: three=${p.three} TC=${p.transformControls} bootStillUp=${p.bootStillUp} appHidden=${p.appHidden}`);
    console.log(`  gl: ${p.gl && p.gl.version} lost=${p.gl && p.gl.lost} renderer=${String(p.gl && p.gl.renderer).slice(0, 48)}`);
    console.log(`  pixels: ${JSON.stringify(p.pixels)}   net=${v.networkRequestCount} ${JSON.stringify(v.networkRequests || [])}`);
    console.log(`  layout: hOverflow=${L.hOverflow}  viewPane=${JSON.stringify(L.viewPane)} usable=${L.viewportUsable}`);
    console.log(`  topbar: overflow=${L.topbarOverflowPx}px clipped=${JSON.stringify(L.topbarClippedControls)}`);
    console.log(`  timeline row: overflow=${L.tlTopOverflowPx}px  botPane=${JSON.stringify(L.botPane)}`);
    console.log(`  glcanvas attr=${JSON.stringify(p.glcanvas && p.glcanvas.attr)} css=${JSON.stringify(p.glcanvas && p.glcanvas.css)}`);
    console.log(`  touch-action gl/tl/ge/body: ${T.glcanvasTouchAction} / ${T.tlCanvasTouchAction} / ${T.geCanvasTouchAction} / ${T.bodyTouchAction}  overscroll=${T.bodyOverscroll}  maxTouchPoints=${p.maxTouchPoints}`);
    if (d.touch) console.log(`  >> TOUCH DRAG changed 3D view: ${v.touchDragChangedView}   scroll/scale=${JSON.stringify(v.pageScrolledByTouch)}`);
    console.log(`  cap: webcodecs=${p.cap && p.cap.webcodecs} recorder=${p.cap && p.cap.recorder} captureStream=${p.cap && p.cap.captureStream} mimes=${JSON.stringify(p.cap && p.cap.mimes)}`);
    console.log(`  css: ${JSON.stringify(p.css)}`);
    if (v.exceptions && v.exceptions.length) console.log('  EXCEPTIONS: ' + JSON.stringify(v.exceptions, null, 2));
    if (v.console && v.console.length) console.log('  CONSOLE: ' + JSON.stringify(v.console, null, 2));
    if (v.logs && v.logs.length) console.log('  LOGS: ' + JSON.stringify(v.logs, null, 2));
    if (v.networkFailed && v.networkFailed.length) console.log('  NET FAILED: ' + JSON.stringify(v.networkFailed));
  }
}
