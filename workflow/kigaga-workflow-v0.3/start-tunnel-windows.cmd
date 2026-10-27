@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title KiGAGA v0.3 - ChatGPT Tunnel
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-tunnel.ps1"
set "KG_TUNNEL_EXIT=%ERRORLEVEL%"
echo.
pause
exit /b %KG_TUNNEL_EXIT%
