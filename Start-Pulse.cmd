@echo off
rem Pulse for Windows: double-click to set up (first time) and start. Close this window to stop Pulse.
setlocal
cd /d "%~dp0"
title Pulse

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is missing. Install the LTS version from https://nodejs.org and run this file again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo Installing pnpm ...
  call npm install -g pnpm
  if errorlevel 1 goto :fail
)

if not exist node_modules (
  echo Installing dependencies ...
  call pnpm install
  if errorlevel 1 goto :fail
)

if not exist .env (
  echo First start: setting up Pulse on this computer ...
  call pnpm setup:local
  if errorlevel 1 goto :fail
)

if not exist apps\server\dist\index.js (
  call pnpm build
  if errorlevel 1 goto :fail
)

echo.
echo Pulse runs on https://localhost:3443  -  keep this window open while presenting.
start "" https://localhost:3443/
call pnpm start
goto :eof

:fail
echo.
echo Something went wrong. Scroll up for the error message, or see README.md.
pause
exit /b 1
