@echo off
REM Roz ki report - double-click karo, HTML report khud khul jaayegi.
cd /d "%~dp0"
title Daily Report - Political Pulse
set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python
"%PY%" daily_report.py --open
echo.
pause
