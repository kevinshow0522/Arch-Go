@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 exit /b 1
echo KiGAGA - local setup
echo Keep this folder in a permanent location before continuing.
where node.exe >nul 2>nul
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 24 ? 0 : 1)"
if errorlevel 1 goto missing_node
echo.
echo [1/3] Installing locked dependencies. Internet access is required.
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed
echo.
echo [2/3] Preparing local paths. Existing different settings will be preserved.
node scripts\configure.mjs
if errorlevel 1 goto failed
echo.
echo [3/3] Checking local storage and restart recovery.
node scripts\doctor.mjs
if errorlevel 1 goto check_failed
echo.
echo Local setup passed. ChatGPT connection has NOT been verified.
echo Next: read docs\local-deployment.md and connection-settings.txt.
start "" notepad.exe "%~dp0connection-settings.txt"
popd
pause
exit /b 0
:missing_node
echo Node.js 24 or newer, including npm, is required.
echo Install Node.js from https://nodejs.org/ and reopen this file.
goto failed
:check_failed
if exist "diagnostics\local-check.txt" start "" notepad.exe "%~dp0diagnostics\local-check.txt"
:failed
echo.
echo Setup did not finish. Keep the error text above for diagnosis.
echo Do not overwrite the old workbench folder or change proxy settings.
popd
pause
exit /b 1
