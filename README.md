# LensBlock

**Previsualisation and 3D blockout in a single HTML file.**

### ▶ [Open LensBlock](https://ilcaretz.github.io/lensblock/)

![LensBlock — a blockout set in the 3D view above, the same moment framed through a 35mm shot camera below, with the pose panel, graph editor and timeline alongside](docs/screenshot.png)

*Split view: the free 3D perspective above, the shot camera's POV below, gated to
2.39:1 scope. The pose panel, animation curves and timeline update together.*

LensBlock is a browser-based previs tool for planning a shot before it is shot.
Block out a set with primitives, place posable stand-in actors, frame the action
through a camera with a real focal length and film back, animate it on a
timeline, and export the result to video.

It runs entirely on the client. three.js and its transform controls are compiled
into the page, so the application is one ~1 MB file that makes no network
requests, needs no build step and no server, and runs offline from a local disk.

## Run it

In the browser: **[ilcaretz.github.io/lensblock](https://ilcaretz.github.io/lensblock/)**

Offline: download [`V01/previz.html`](V01/previz.html) and double-click it.

That is the entire installation procedure. No Node.js, no Python, no npm, no
local server, no internet connection. You can put it on a USB stick, email it, or
run it on a machine that has never been online — the page makes zero network
requests either way.

## What it does

- **Blockout primitives** — cube, sphere, cylinder, cone, plane, plus a
  parametric **car** (length / width / height, wheels on the floor). Every
  object is created with its pivot **on the ground**, so `y = 0` means standing
  on the floor and raising Height grows the object upward.
- **Posable figures** — female and male, 19 joints, anthropometrically correct
  proportions, ~1500 triangles. **No skinning and no skeleton** — a hierarchy of
  solid parts, like a wooden artist's mannequin. That is what makes it cheap
  enough to pose on a tablet with no graphics chip.
- **Three ways to pose, all live at once** — raw typed joint angles, FK on the
  rotate gizmo, and **IK** on four chains (L/R hand, L/R foot) with an analytic
  two-bone solver. Switching a chain to IK never moves anything: the goal snaps
  onto the limb and the pole twist is solved to reproduce the elbow or knee you
  already had. IK blend is a keyable 0–1 value, so a hand can let go of a prop
  mid-shot.
- **Cameras** — the camera name in the viewport corner is a picker: free
  perspective, a long-lens top view that reads as plan, or any shot camera in
  the scene with its focal length. A padlock (`L`) freezes the viewport, with a
  red frame so a view that will not move is never a mystery.
- **Animation** — keyframes on every channel including the full pose (a keyed
  figure carries ~86 curves), six interpolation modes, editable tangents, and a
  graph editor that docks under the shot or takes over the viewport.
- **Export** — render to video via WebCodecs / MediaRecorder.
- **Scenes** — save and load `.json`. Older files (v1–v3) migrate on load; an
  object of a kind the build does not know survives the round trip as a
  labelled box rather than being dropped.

## Controls

| | |
|---|---|
| Navigate | Maya-style — tumble / track / dolly |
| Touch | 1 finger tumble · 2 fingers track · pinch dolly · tap to select |
| Gizmos | `Q` `W` `E` `R` select / move / rotate / scale |
| Framing | `F` frame selected · `A` frame all |
| Keying | `S` keys the whole pose alongside the transform |
| Camera lock | `L` |
| Split view | `V` |

Tap a figure, then tap a limb, to grab that joint. Shortcuts key off physical
key position, so they survive Cyrillic, Greek, Hebrew and AZERTY layouts.

Below 900 px the Outliner and Inspector become drawers behind the buttons at the
ends of the top bar, so the viewport always keeps the full width — it stays
usable down to a 360 px phone.

## Browser support

A current browser with WebGL.

- **Verified** — Chrome, Edge and Brave, desktop and mobile emulation, down to
  360 px wide. 205 automated checks pass across seven viewport profiles, with
  zero uncaught exceptions and zero console warnings.
- **Expected** — Firefox and Safari. The CSS is guarded for both, but neither
  has been run for real. Treat them as untested rather than supported.

If you get a blank page, WebGL or hardware acceleration is off — check
`chrome://gpu`.

## Repository layout

```
V01/previz.html   the application — this is the whole thing
V01/README.txt    the end-user manual
_build/           dev tooling: rebuilds the inlined three.js bundle
_test/            automated check harness (205 checks, CDP-driven)
huggingface/      deployment bundle for the Hugging Face static Space
docs/             images used by this README
```

`V01/previz.html` is the source of truth. There is no build step to run it —
`_build/` exists only to upgrade the embedded three.js, and `_test/` only to
verify the result.

## Development

Upgrading three.js:

```bash
cd _build && ./build.cmd
```

Then paste the new bundle into `V01/previz.html` as described in
`_build/README.txt`. Keep the `/*! … */` licence block above the bundle.

Running the checks (needs Node.js and Chrome):

```bash
cd _test && node check.js chrome
```

The app exposes one deliberate seam, `window.LB`, so the harness can drive it the
way a person would. Nothing inside the app reads it.

## Licence

MIT — see [LICENSE](LICENSE).

Bundles [three.js](https://threejs.org) r185 (MIT) — see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
