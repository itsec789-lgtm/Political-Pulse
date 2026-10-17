@echo off
REM ================================================================
REM  All-India dashboard RESTORE (CM map wapas laata hai)
REM  Ye data\*.json (Jul 9 ka accha build) ko india_Pulse me daalta
REM  hai aur server chalu karta hai -> http://localhost:3000
REM ================================================================
cd /d "%~dp0"
title All-India Dashboard - Restore + Start

echo Starting MongoDB (agar service hai)...
net start MongoDB >nul 2>&1

echo.
echo Restoring All-India data (30 CMs, state CM-map)...
node import_data.js
if errorlevel 1 (
  echo.
  echo  !! ERROR - upar dekho. MongoDB chal raha hai? services.msc -> MongoDB -> Start
  pause
  exit /b 1
)

echo.
echo Starting server -> http://localhost:3000
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
npm start
