LensBlock - 3D Blockout & Camera Previs
=======================================
by ilcaretz

HOW TO RUN
----------
Double-click  previz.html

That's it. It opens in your browser and runs.


WHAT YOU DO *NOT* NEED
----------------------
  - No Node.js
  - No Python
  - No npm / install step
  - No local server
  - No internet connection

three.js r185 and TransformControls are embedded directly inside previz.html,
so the file is completely self-contained. It makes zero network requests.
You can copy it to a USB stick, email it, or run it on a machine that has
never been online.


REQUIREMENTS
------------
A current browser with WebGL.

  Verified   Chrome, Edge and Brave, on desktop and with tablet / phone
             emulation, down to a 360 px wide screen.  205 automated checks,
             see ..\_test\README.txt.
  Expected   Firefox and Safari. Both are standards-clean here, but neither is
             installed on the machine this was built on, so neither has been
             run for real.  Treat them as untested rather than supported.

Works by finger as well as by mouse - see TOUCH below.


TROUBLESHOOTING
---------------
Blank page or "bundled three.js failed to boot"
    Your browser is too old, or WebGL/hardware acceleration is disabled.
    Check chrome://gpu (Chrome/Edge) and update the browser.

Your projects save to .json via the toolbar - keep those files, they are your
scene data. previz.html itself holds no project data.


FIGURES  -  posable, no skinning
-------------------------------
Female and Male add a jointed figure: 19 joints, correct anthropometric
proportions (hip .53 of height, knee .27, shoulder .80, elbow .63, crown 1.00),
about 1500 triangles, four shared geometry buffers.  There is no skinning and no
skeleton in the three.js sense - it is a hierarchy of solid parts, like a wooden
artist's mannequin.  That is what keeps it cheap enough to pose on a tablet with
no graphics chip, and it is why the pose drops straight into the keyframe system.

Three ways to pose, all live at the same time:

  raw    Pose panel -> pick a joint -> type or drag its X / Y / Z angle
  FK     tap the figure, then tap a limb -> the rotate gizmo (E) is on that joint
  IK     turn on a chain (L hand / R hand / L foot / R foot) -> drag the handle

Switching a chain to IK never moves anything: the goal snaps onto the limb and
the pole twist is solved to reproduce the elbow or knee you already had.  Turning
it off keeps the solved pose as FK.  IK blend is a keyable 0-1 value, so a hand
can let go of a prop mid-shot.

The goal handle - and the move gizmo on it - always appears on the limb itself,
wherever the figure is standing and however it is turned.  The goal is stored in
the figure's own space, so walking the figure across the set carries its whole
IK pose with it.

  Zero / Reset       one joint / the whole figure back to the A-pose
  L -> R,  R -> L    mirror one side of the pose onto the other
  Presets            A-pose, T-pose, Relaxed, Walk, Sit, Point
  Body               Build (female / male) and Height - the figure rebuilds
                     around the new size and keeps its pose, its IK handles and
                     whatever joint you had selected
  Escape             step out of a joint, back to the whole figure

S keys the whole pose - every joint and every IK channel - alongside the usual
transform.  A keyed figure shows about 86 curves in the Graph Editor; its channel
list scrolls.

Stand-in is the old three-part figure, unrigged.  It stays because twenty of them
still cost nothing to draw, where twenty rigs would not.

Car is a parametric vehicle blockout: Length, Width, Height, wheels on the floor.


VIEWPORT CAMERA
---------------
The camera name in the top-left corner of the viewport is a menu.  Click it and
pick any view in the scene:

  Perspective   the free-nav 3D view
  Top view      a plan view straight down, on a long lens so it reads almost
                orthographic - the framing does not change when you switch
  <any camera>  every shot camera in the scene, with its focal length

Picking a shot camera is the same as Look through.  Tumbling while in Top view
turns it back into Perspective, exactly as it does in Maya or Blender.

Next to it is the padlock.  Click it (or press L) to lock the camera: tumble,
track, dolly, pinch, F / A framing and the move gizmo on any camera all stop.
While it is on the badge is red and pulsing and the whole viewport carries a red
frame, so a viewport that will not move is never a mystery.  Selecting and
posing still work normally.  The lock and the chosen view are saved with the
scene, and neither counts as an unsaved change.


TOUCH
-----
  1 finger drag     tumble
  2 finger drag     track
  pinch             dolly
  tap               select - tap a figure, then a limb, to grab that joint

A tap and a tumble are told apart by distance, so tapping still selects.  IK goal
handles carry an invisible target three times their visible size, because 7 cm at
arm's length is a fine mouse target and a hopeless finger one.

Below 900 px the Outliner and the Inspector stop being columns and become drawers
behind the two buttons at the ends of the top bar, so the viewport always keeps
the full width.  The toolbar scrolls sideways; New / Save / Load / Render and the
quality setting are always reachable under the ... menu, at any width.


SPEED
-----
The HUD shows the median viewport frame time and the current quality tier.

  High     device pixel ratio up to 2, 2048px shadows, anti-aliasing
  Medium   ratio up to 1.25, 1024px shadows, no anti-aliasing
  Low      ratio 1, no shadows, no anti-aliasing

Auto picks a tier from the GPU and steps DOWN on its own if frames stay slow for
about a second and a half.  It never steps back up by itself - that would
oscillate on any scene sitting near the threshold, which reads as the viewport
flickering resolution.  Set a tier by hand in the ... menu; it is remembered.
Anti-aliasing is fixed when the page loads, so changing that one needs a reload.


IF THE SCREEN GOES BLACK
------------------------
It should not any more.  A tablet drops the WebGL context every time you switch
away from the tab; the app now catches that, rebuilds, and tells you.  Your scene
is never lost with it.

There is also an autosave: the scene goes to browser storage whenever it changes
and comes back on the next start.  Closing the tab with unsaved changes warns
first.  Neither replaces Save - autosave lives in one browser on one machine.


PIVOTS
------
Every object is created with its pivot on the ground: y = 0 means "standing on
the floor", the move gizmo appears where the object touches it, rotation turns
it about that contact point, and raising Height in the Geometry section grows
the object upward instead of sinking half of it. Drop to floor still works for
anything you have lifted.


GRAPH EDITOR
------------
The panel under the Inspector is a Maya-style curve editor. Its header has two
docking buttons:

  ⬓  (or shift+V)   split it under the shot - camera POV on top, curves below.
                    Drag the line between them to change the balance.
  ⤢  (or double-click the header)   blow it up over the whole viewport.

Either button, pressed again, puts the panel back in the side column. The split
switches the top half to a camera POV for you if it was not already showing one.
Docking is workspace state, not scene data - it is not written into the .json.

  click / shift-click   select keys           drag        move them
  drag a handle         set that tangent      F / A       frame selected / all
  alt+LMB, alt+MMB      pan                   alt+RMB     zoom (wheel works too)
  click a channel       solo that curve       Del         delete selected keys

Dragging a handle switches that key to a Fixed tangent. Picking any of the six
interp modes - in the Inspector, or the glyph row that appears once the panel
leaves the side column - hands the key back to automatic tangents.

Scene files are now version 4. Older files still load and look exactly the same:
a version 1 file simply has no hand-set tangents in it, and a version 1 or 2 file
is migrated to the ground pivots on load, positions and keys together. Version 4
added the car and human kinds and the per-figure pose block. The magic word
inside the .json is still "previz", so nothing already on disk is orphaned by the
rename, and an object of a kind this build does not know is loaded as a labelled
box rather than dropped - its transform, name and keys all survive the round trip.


LICENSE
-------
MIT - Copyright (c) 2026 ilcaretz. See ..\LICENSE for the full text; the same
notice is also inside previz.html, at the top, so the single file carries its
own licence wherever it is copied.

previz.html embeds three.js r185, which is MIT and Copyright (c) 2010-2025 the
three.js authors. Its notice sits above the bundled <script> in previz.html and
in ..\THIRD_PARTY_NOTICES.md.


FILES
-----
previz.html   the whole application, ~950 KB, self-contained
README.txt    this file

The ..\_build\ folder is developer tooling for upgrading three.js and the
..\_test\ folder is the automated check harness. Neither is needed to run
LensBlock and neither is meant to be distributed.

previz.html exposes one debugging handle, window.LB, so the check harness can
drive the app the way a person would - the app itself never reads it.
