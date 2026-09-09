@echo off
title SPECTRE OSINT Platform
color 0A
echo ========================================================
echo       SPECTRE INTELLIGENCE PLATFORM (v3.5)
echo ========================================================
echo.
cd /d "%~dp0"

echo [*] Checking dependencies...
python -m pip install -r requirements.txt >nul 2>&1

echo [*] Launching SPECTRE Server on http://127.0.0.1:5000 ...
echo [*] Press CTRL+C to stop the server.
echo.
python app.py
pause
