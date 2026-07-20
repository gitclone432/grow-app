@echo off
setlocal EnableExtensions
title Grow Mentality - Dev Servers
cd /d "%~dp0"

echo.
echo ========================================
echo   Grow Mentality - starting local app
echo ========================================
echo.

where powershell >nul 2>&1
if errorlevel 1 (
  echo ERROR: PowerShell was not found on PATH.
  echo Install Windows PowerShell or add it to PATH, then try again.
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js was not found on PATH.
  echo Install Node.js LTS from https://nodejs.org then reopen this window.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm was not found on PATH.
  echo Reinstall Node.js LTS so npm is included.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-dev.ps1"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo Dev servers exited with error code %EXITCODE%.
) else (
  echo Dev servers stopped.
)
echo.
pause
exit /b %EXITCODE%
