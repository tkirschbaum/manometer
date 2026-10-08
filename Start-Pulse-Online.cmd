@echo off
rem Pulse online for Windows: double-click. Starts Pulse and a free Cloudflare tunnel and sets the address on the
rem slides by itself, so phones can join from anywhere (mobile data too). Close this window to stop.
cd /d "%~dp0"
set PULSE_ONLINE=1
call Start-Pulse.cmd
