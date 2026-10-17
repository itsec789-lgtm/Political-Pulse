@echo off
setlocal enabledelayedexpansion
REM ================================================================
REM  ALL-INDIA DASHBOARD - LIVE (All India + UP switch)
REM  Ek double-click: server (port 3000) chalu + har 1 ghante auto-update.
REM  Sirf All-India data update hota hai -> UP apne aap filtered view.
REM  Is window ko band mat karo - yehi 30-min loop chala raha hai.
REM ================================================================
cd /d "%~dp0"
title All-India Dashboard - Live Auto-Updater (har 1 ghanta)
set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python

echo Starting MongoDB (agar service ke roop me install hai)...
net start MongoDB >nul 2>&1

REM purana server band karo (port 3000 clash / purana report_lib memory me na rahe)
REM auto-restart (10-Oct): purani server window bhi band karo, warna do loop
REM aapas me port 3000 ke liye ladte rehte hain.
taskkill /F /FI "WINDOWTITLE eq All-India Dashboard Server*" >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting dashboard server -> http://localhost:3000
REM RUN_SERVER.bat ek loop hai -- server kabhi gir jaaye to khud wapas chalu
REM kar deta hai. Pehle "npm start" tha, aur crash ke baad dashboard band hi
REM pada rehta tha jab tak koi haath se na chalaye.
start "All-India Dashboard Server" "%~dp0RUN_SERVER.bat"

REM ---- ngrok public URL (agar installed hai) ----
set NGROK=C:\ngrok\ngrok.exe
set NGROK_DOMAIN=unripe-thwarting-chewable.ngrok-free.dev
REM purana tunnel/server band karo warna "already online" error aata hai
taskkill /F /IM ngrok.exe >nul 2>&1
timeout /t 2 /nobreak >nul
if exist "%NGROK%" (
  "%NGROK%" config add-authtoken 3HOwYJbdyIKfkpBijs3GVKLPTKr_212qBETQfAFxouvA3Vsf6 >nul 2>&1
  if "%NGROK_DOMAIN%"=="" (
    start "Public URL - ngrok" cmd /k ""%NGROK%" http 3000"
  ) else (
    start "Public URL - ngrok" cmd /k ""%NGROK%" http --url=%NGROK_DOMAIN% 3000"
  )
  echo Public URL: ngrok window me dekho (https://....ngrok-free.app)
) else (
  echo (ngrok nahi mila C:\ngrok\ me - public URL skip)
)

echo Server warm-up (7s)...
timeout /t 7 /nobreak >nul
start "" http://localhost:3000

set FAILS=0

:loop
echo.
echo ============================================================
echo   AUTO-UPDATE run  @  %date% %time%
echo ============================================================
"%PY%" run_pipeline.py

REM ---- audit-fix T4 : pipeline fail hua to dikhna chahiye ----
REM Pehle yahan koi jaanch nahi thi. run_pipeline.py traceback de kar mar
REM jaata to wo screen par upar chala jaata aur agle ghante sab normal
REM dikhne lagta -- kisi ko pata hi nahi chalta ki data rukа hua hai.
REM Ab fail hone par window laal ho jaati hai aur ginti chalti hai.
if errorlevel 1 (
  set /a FAILS+=1
  color 0C
  echo.
  echo ============================================================
  echo   !! PIPELINE FAIL HUA  --  lagatar !FAILS! baar
  echo   Upar ki lines padho. Aam wajah:
  echo     * MongoDB band hai            ^(net start MongoDB^)
  echo     * network folder nahi mila    ^(\\192.168.2.85 par pahunch^)
  echo     * disk bhar gayi
  echo   Dashboard purana data dikhata rahega -- naya nahi aayega.
  echo ============================================================
  echo.
) else (
  if not "!FAILS!"=="0" (
    echo   ^(pichhli !FAILS! fail ke baad ab theek chal gaya^)
    set FAILS=0
  )
  color 0A
)

echo.
echo   Agla update 1 ghante me. (window open rehne do)
timeout /t 3600 /nobreak >nul
goto loop
