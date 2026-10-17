@echo off
REM ================================================================
REM  UP DASHBOARD - LIVE
REM  Ek hi double-click: server chalu + har 30 min data auto-update.
REM  System band karne ke baad -> bas isko dobara double-click karo.
REM  (Is window ko band mat karo - yehi loop chala raha hai.)
REM ================================================================
cd /d "%~dp0"
title UP Dashboard - Live Auto-Updater (har 30 min)
set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python

echo Starting MongoDB (agar service ke roop me install hai)...
net start MongoDB >nul 2>&1

echo Starting dashboard server -> http://localhost:3001
start "UP Dashboard Server" cmd /k "cd /d %~dp0 && npm start"

echo Server warm-up (7s)...
timeout /t 7 /nobreak >nul
start "" http://localhost:3001

:loop
echo.
echo ============================================================
echo   AUTO-UPDATE run  @  %date% %time%
echo ============================================================
"%PY%" auto_update.py
echo.
echo   Ho gaya. Agla update 30 min me. (window open rehne do)
timeout /t 1800 /nobreak >nul
goto loop
