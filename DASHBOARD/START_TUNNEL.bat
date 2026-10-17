@echo off
REM ============================================================
REM  Public URL (ngrok)
REM  Pehle START_LIVE.bat (dashboard), phir isko double-click.
REM  Neeche APNA static domain daalna (ngrok dashboard se claim karo).
REM  Window band = URL band.
REM ============================================================
title Public URL - ngrok
set NGROK=C:\ngrok\ngrok.exe
REM  Ye wahi domain hona chahiye jo START_LIVE.bat me hai, warna purana link marr jaata hai.
set DOMAIN=unripe-thwarting-chewable.ngrok-free.dev

REM purana tunnel band karo, warna "already online" error aata hai
taskkill /F /IM ngrok.exe >nul 2>&1
timeout /t 2 /nobreak >nul

if not exist "%NGROK%" (
  echo.
  echo  !! %NGROK% nahi mila.
  echo     https://ngrok.com/download se zip lo, ngrok.exe ko C:\ngrok\ me rakho.
  echo     Phir ek baar: C:\ngrok\ngrok.exe config add-authtoken APNA_TOKEN
  echo.
  pause
  exit /b 1
)
"%NGROK%" http --url=%DOMAIN% 3000
pause
