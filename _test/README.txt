LensBlock test harness
======================

Zero dependencies. Node 22 (global WebSocket + fetch), a real browser driven
over CDP, no puppeteer.


check.js  -  the one to run
---------------------------
    cd D:\AI_video\preViz_TOOL\_test
    node check.js                      chrome, every group
    node check.js edge                 a different browser
    node check.js brave
    node check.js chrome rig ik        only the named groups

Groups:

  boot     module loads, three r185, no exceptions, no console noise, it draws
  rig      both figures: joint count, anthropometric landmarks, triangle
           budget, shared geometry, channel count, handle cleanup on delete
  ik       240 solves against generated goals; out-of-reach behaviour; blend
           does not creep; blend 0 returns to FK; FK -> IK is seamless from
           every preset pose; the goal handle (and so the translate gizmo's
           pivot) lands on the limb of a figure standing off the world centre,
           survives a render pass, follows "Snap to limb" and follows the figure
  cam      the camera picker on the HUD name: perspective / top view / every
           scene camera; top view is axis-aligned, near-orthographic and holds
           its framing; tumbling out of it relabels it; the camera lock goes
           red, refuses tumble / wheel / frame / gizmo, and survives save+load
  fk       parent rotation moves the child, mirroring, every preset stays sane
  anim     keying a pose, IK blend is keyable, interpolation, keys land exactly
  io       pose survives save/load, IK settings survive, unknown kinds survive
  car      dimensions match the params, sits on the floor, 6 parts
  ui       duplicate, snapshot/restore, the real Inspector rebuild paths for
           Height and Length, v2 -> v4 migration, graph editor with a full rig,
           quality tiers, stand-in, autosave -> reload -> recover, export
  layout   7 viewport profiles from 1920 down to 360: viewport usable, no
           sideways scroll, pinned controls never clip, it draws, drawers,
           the ... menu.  Writes shot-check-<profile>.png.
  touch    1-finger tumble, 2-finger track, pinch dolly, tap-still-selects
  perf     frame time at 1 and 6 rigs, high and low tiers; IK solve cost;
           the frame-time readout itself
  ctx      forces WEBGL_lose_context, restores, proves the viewport comes back

Writes check-report.json and shot-check-*.png.  Exit code is the failure count.

Last full run: 205 / 205 on Chrome, Edge and Brave, ~33 s each.


look.js  -  eyeball one thing
-----------------------------
    node look.js <name> <jsFileOrInlineJS> [width] [height]

Boots the app, runs the JS against window.LB, screenshots to look-<name>.png.

    node look.js pose _s2.js 1440 940

Handy expressions, all on window.LB:
    LB.addPrimitive('human',{params:{sex:'m',h:1.81}})
    LB.setPose(o,'Walk')   LB.snapGoal(o,chain)   LB.solveRigs()
    LB.setSubsel(o.userData.rig.joints.foreL)
    LB.snap()              a pixel digest of the drawing buffer


cdp.js / probe.js / sum.js  -  the original audit sweep
------------------------------------------------------
Broader device-emulation matrix, kept from the pre-fix audit. check.js has
superseded it for regression work.

    node cdp.js chrome desktop-1920 laptop-1280 tablet-ipad-land phone-iphone14
    node sum.js chrome edge brave


Things that will waste your time
-------------------------------
  * getBoundingClientRect() during a CSS transition returns the ANIMATED value,
    and an automated browser window is usually occluded, which throttles the
    animation timeline. Measure final layout with `style.transition='none'` and
    a forced reflow, not with a sleep. Same reason rAF barely runs unless you
    call Page.bringToFront first.
  * drawImage()-ing #glcanvas into a 2D canvas always returns transparent black:
    the renderer runs with preserveDrawingBuffer:false. Use LB.snap(), which
    readPixels inside the same task as the draw, or Page.captureScreenshot.
  * A small centre patch is not a render test. It can land entirely on one flat
    lit face and report a single colour on a perfectly good frame. LB.snap()
    reads a full-width band for this reason.
  * The app guards unload when the scene is unsaved. A driver must answer
    Page.javascriptDialogOpening or Page.navigate hangs until it times out.
  * Emulation.setTouchEmulationEnabled throws on maxTouchPoints:0. Pass >= 1
    always, and use `enabled` to turn touch off.
  * Clear localStorage before navigating, or the app recovers its autosave and
    the checks grade a scene from the previous run.
  * exportWebCodecs probing avc1.42E01E and getting false is NOT a bug: that
    string pins Level 3.0, max 720x576. The two codecs before it are supported.
  * DuckDuckGo cannot be driven over CDP here - it forwards a command-line URL
    into the already-running instance, which never saw the debugging port.
    Screenshot it with shot3.ps1 instead.
