@echo off
REM ================================================================
REM  DATA PORTAL  -  MongoDB se date-range wise CSV download
REM  Port 4000. Dashboard (3000) se alag chalta hai - dono saath chal sakte hain.
REM  Is window ko band mat karo.
REM ================================================================
cd /d "%~dp0"
title Data Portal - port 4000

echo Starting MongoDB (agar service ke roop me install hai)...
net start MongoDB >nul 2>&1

REM purana portal band karo (port 4000 clash)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":4000" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting portal -^> http://localhost:4000
start "Data Portal Server" cmd /k "cd /d %~dp0 && node portal.js"

REM ---- ngrok public URL ----
set NGROK=C:\ngrok\ngrok.exe
if exist "%NGROK%" (
  "%NGROK%" config add-authtoken 3HOwYJbdyIKfkpBijs3GVKLPTKr_212qBETQfAFxouvA3Vsf6 >nul 2>&1
  start "Public URL - Data Portal" cmd /k ""%NGROK%" http 4000"
  echo.
  echo Public URL ngrok window me dikhega: https://....ngrok-free.app
  echo Wahi link logon ko bhejo. Unko login karna padega.
) else (
  echo (ngrok nahi mila C:\ngrok\ me - sirf local chalega)
)

timeout /t 6 /nobreak >nul
start "" http://localhost:4000
echo.
echo Portal chalu hai. Band karne ke liye ye window aur server window close kar do.
pause
