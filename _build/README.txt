_build - DEVELOPER TOOLING ONLY
===============================

Nothing in this folder is needed to RUN PreViz. V01\previz.html is already
self-contained. Do not ship this folder to users.

The only reason to come here is to upgrade the embedded three.js.


SOURCE OF TRUTH
---------------
  V01\previz.html   <-- edit this. It is the app. There is no other copy.

History: this file was briefly called V02. It replaced an older V01 that loaded
three.js from the jsDelivr CDN (so it needed a network connection, or a local
server, to run) and was MISSING the 6-mode interpolation picker. Every line the
old V01 had is present here. A frozen copy of it is kept as
old-cdn-version.archive.html for reference only - do not build from it and do
not copy it over previz.html.

There is deliberately no script that regenerates previz.html from the archive.
One used to exist (transform.py) and it would have silently overwritten newer
work. It was removed.


UPGRADING three.js
------------------
1. Edit package.json - set the "three" version you want (pinned exactly,
   no ^ or ~, so builds stay reproducible).

2. Double-click build.cmd (needs Node.js on PATH).
   It runs npm install if needed, bundles three + TransformControls into an
   IIFE that assigns the global THREE, and sanity-checks the output.

3. Open V01\previz.html in a text editor and replace the inlined bundle:

       line  415   <!-- three.js r185 + TransformControls, bundled ... -->
       line  416   <script>
       line  417   /*! three r185 + TransformControls - esbuild IIFE */
       line  418   ...the entire minified bundle, ONE long line...
       line 4527   </script>

   Replace only line 418 with the new contents of three.bundle.js.
   Leave the surrounding <script> tags alone. Update the r185 comments.

   KEEP the /*! ... */ license block above the bundle. three.js is MIT and the
   notice has to ship with the file - previz.html is a redistribution of it.
   build.cmd now bundles with --legal-comments=eof and fails if no notice
   survives, so the copy in the bundle and the block above it are both there
   on purpose. Belt and braces; do not "tidy" either one away.

   (Line numbers are from the current previz.html. Search for "esbuild IIFE" if the
   file has since been edited.)

4. Verify: open V01\previz.html from disk and check in the browser console
       THREE.REVISION                  -> the new version
       typeof THREE.TransformControls  -> "function"
   and confirm the Network tab shows 0 requests.


WHY A BUNDLE AT ALL
-------------------
Modern three.js ships ESM only - there is no UMD/global build anymore, and the
addons (TransformControls) are ESM too. ES modules cannot be imported from a
file:// page, so a plain <script src> or importmap will not work offline.
Bundling to an IIFE with a global THREE is what makes the single-file,
double-click, no-server version possible.

Node.js is required for THIS STEP ONLY, and only for whoever upgrades three.js.
End users never need it.


FILES
-----
build.cmd            Windows build script (this is the entry point)
entry.js             what gets bundled: three + TransformControls
package.json         pinned dependency versions
package-lock.json    exact resolved tree
three.bundle.js      build output, currently three r185 (753 KB minified)
previz.backup.html   snapshot of V01\previz.html taken before cleanup
old-cdn-version.archive.html   frozen copy of the pre-bundle version
node_modules\        created by npm install, safe to delete anytime
