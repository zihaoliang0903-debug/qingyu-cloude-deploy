@echo off
cd /d "%~dp0"
title Qingyu Forum Server
echo Starting Qingyu forum server...
echo.

set "CODEX_PY=C:\Users\25010\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%CODEX_PY%" (
  "%CODEX_PY%" -u server.py
) else (
  python --version >nul 2>nul
  if %errorlevel%==0 (
    python -u server.py
  ) else (
    py -u server.py
  )
)

echo.
echo Server stopped. Press any key to close this window.
pause >nul
