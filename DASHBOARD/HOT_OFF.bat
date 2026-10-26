@echo off
title Political Pulse - HOT OFF
cd /d "%~dp0"
set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python
"%PY%" -u hot_switch.py off
echo.
pause
