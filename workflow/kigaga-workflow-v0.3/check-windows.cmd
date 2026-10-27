@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 exit /b 1
where node.exe >nul 2>nul
if errorlevel 1 goto missing_node
node scripts\doctor.mjs
set "KG_CHECK_EXIT=%ERRORLEVEL%"
if exist "diagnostics\local-check.txt" start "" notepad.exe "%~dp0diagnostics\local-check.txt"
popd
pause
exit /b %KG_CHECK_EXIT%
:missing_node
echo Node.js 24 or newer is required. Run setup-windows.cmd first.
popd
pause
exit /b 1
