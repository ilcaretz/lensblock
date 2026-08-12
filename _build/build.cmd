@echo off
REM ============================================================================
REM  Rebuilds three.bundle.js  --  DEV ONLY.
REM  You do NOT need this to run PreViz. V02\previz.html already has three.js
REM  baked in and opens by double-clicking. Run this only to upgrade three.js.
REM  Requires Node.js. See README.txt for what to do with the output.
REM ============================================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found on PATH.
  echo         Only needed to REBUILD the bundle - not to run PreViz.
  exit /b 1
)

if not exist "node_modules\" (
  echo [1/2] Installing build deps ^(esbuild + three^)...
  call npm install || exit /b 1
) else (
  echo [1/2] Deps present, skipping npm install.
)

echo [2/2] Bundling three.js + TransformControls...
call ".\node_modules\.bin\esbuild.cmd" entry.js ^
  --bundle --format=iife --global-name=THREE ^
  --charset=utf8 --minify --legal-comments=eof ^
  --outfile=three.bundle.js || exit /b 1

REM --- sanity checks --------------------------------------------------------
findstr /C:"TransformControls" three.bundle.js >nul || (
  echo [FAIL] TransformControls missing from bundle.
  exit /b 1
)
findstr /C:"</script" three.bundle.js >nul && (
  echo [FAIL] Bundle contains "^</script" - cannot be inlined into HTML.
  exit /b 1
)

REM three.js is MIT: the notice MUST travel with any redistribution, and
REM previz.html IS a redistribution. --legal-comments=none used to strip it,
REM which shipped a file that was quietly in breach. Do not set it back.
findstr /C:"MIT" three.bundle.js >nul || (
  echo [FAIL] No license notice in the bundle - check --legal-comments.
  exit /b 1
)

for %%A in (three.bundle.js) do echo.& echo OK - three.bundle.js  %%~zA bytes
echo Next: paste it into V02\previz.html - see README.txt.
