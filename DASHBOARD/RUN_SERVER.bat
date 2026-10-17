@echo off
REM ================================================================
REM  RUN_SERVER.bat  --  dashboard server, KHUD WAPAS CHALNE WALA
REM
REM  Pehle server seedha "npm start" se chalta tha. Agar wo kabhi gir
REM  jaata (memory bhar jaane par Node ko koi handler bacha nahi sakta)
REM  to dashboard tab tak band rehta jab tak koi haath se dobara na
REM  chalaye. Ab ye window use dobara chalu kar deti hai.
REM
REM  Ise seedha chalane ki zaroorat nahi -- START_LIVE.bat khud chalati hai.
REM  Server band hi rakhna ho to is window ko X se band kar dein.
REM ================================================================
setlocal enabledelayedexpansion
title All-India Dashboard Server
cd /d "%~dp0"

REM gzip wagairah ke liye thode zyada background thread
set UV_THREADPOOL_SIZE=16

REM Node ki default memory hadd ~1.5 GB hai. Dash-cache ke baad itni
REM zaroorat nahi padti, par thodi gunjaish rakhna theek hai.
set NODE_MEM=3072

set TRIES=0

:loop
REM port 3000 par koi purana server baitha ho to use hatao
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1

echo.
echo ============================================================
echo   Dashboard server chalu  @  %date% %time%
echo   http://localhost:3000
echo ============================================================
echo.

node --max-old-space-size=%NODE_MEM% server.js

set /a TRIES+=1
color 0C
echo.
echo ============================================================
echo   !! SERVER BAND HO GAYA   (baar: !TRIES!)
echo
echo   Agar aapne khud band kiya hai to is window ko X se band kar dein.
echo   Warna 5 second me khud dobara chalu ho jaayega.
echo ============================================================
timeout /t 5 /nobreak >nul
color 07
goto loop
