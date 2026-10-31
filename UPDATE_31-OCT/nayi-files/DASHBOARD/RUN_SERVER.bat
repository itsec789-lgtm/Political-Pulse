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
REM one-server (30-Oct): port 3000 par pehle se server ho to use MAT maaro --
REM ye window khud band ho jaati hai. Pehle har window doosre ka server maar
REM deti thi: START_LOCAL do-teen baar chalane par 6 window aapas me ladti
REM rahin aur page kabhi turant nahi khulta tha. (Win 11 Terminal me title se
REM purani window band nahi hoti.) START_LOCAL / START_LIVE naya server chalane
REM se PEHLE port khud khaali karte hain, isliye restart pehle jaisa chalta hai.
set BUSY=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do set BUSY=%%p
if defined BUSY (
  echo.
  echo   Port 3000 par server pehle se chal raha hai ^(PID !BUSY!^).
  echo   Dusra server nahi chalayenge -- ye window band ho rahi hai.
  timeout /t 3 /nobreak >nul
  exit
)

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
