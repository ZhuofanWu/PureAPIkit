@echo off
setlocal
cd /d "%~dp0"
echo Starting Echo Server on http://127.0.0.1:3001
echo Press Ctrl+C to stop.
node server.mjs
pause
