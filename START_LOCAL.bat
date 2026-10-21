@echo off
setlocal enabledelayedexpansion
title Political Pulse - Local Dashboard Server (Replica)
color 0B
cd /d "%~dp0"

echo ========================================================
echo    Political Pulse - Local Dashboard Server (Replica)
echo ========================================================
echo.

REM 1. Start MongoDB service if installed
echo Starting MongoDB (agar service ke roop me hai)...
net start MongoDB >nul 2>&1

REM 2. Check and clean existing port 3000 process
echo Checking port 3000...
taskkill /F /FI "WINDOWTITLE eq All-India Dashboard Server*" >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
timeout /t 2 /nobreak >nul

REM 3. Launch the dashboard server from DASHBOARD folder
echo Starting dashboard server -> http://localhost:3000
if exist "%~dp0DASHBOARD\RUN_SERVER.bat" (
    start "All-India Dashboard Server" "%~dp0DASHBOARD\RUN_SERVER.bat"
) else (
    cd /d "%~dp0DASHBOARD"
    start "All-India Dashboard Server" cmd /k "node --max-old-space-size=3072 server.js"
    cd /d "%~dp0"
)

REM 4. Server warm-up (wait 4 seconds)
echo Server warming up (4s)...
timeout /t 4 /nobreak >nul

REM 5. Open browser automatically
echo Opening Dashboard in browser...
start "" http://localhost:3000

echo.
echo ========================================================
echo   Dashboard live ho chuka hai!
echo      All-India:  http://localhost:3000
echo      UP:         http://localhost:3000/up
echo      Punjab:     http://localhost:3000/punjab
echo ========================================================
echo.
echo Is window ko aap minimize kar sakte hain ya band kar sakte hain.
echo (Server alag window me background me chal raha hai).
timeout /t 5 >nul
