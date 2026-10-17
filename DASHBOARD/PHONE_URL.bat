@echo off
REM ============================================================
REM  Phone par dashboard kholne ka LOCAL URL (ngrok ke bina)
REM  Shart: phone aur computer EK HI WiFi par hone chahiye.
REM  ngrok band ho to bhi ye chalta hai.
REM ============================================================
title Phone URL
echo.
echo   ---- Phone par ye URL kholo (ek hi WiFi par raho) ----
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  for /f "tokens=1" %%b in ("%%a") do echo        http://%%b:3000
)
echo.
echo   Agar phone par na khule to Windows Firewall rok raha hai.
echo   Ek baar ye chalao (Admin PowerShell me):
echo.
echo     New-NetFirewallRule -DisplayName "Pulse 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
echo.
echo   ---- ngrok chal raha hai ya nahi, ye check karo ----
echo        http://127.0.0.1:4040     (ngrok ka apna status page)
echo.
tasklist /FI "IMAGENAME eq ngrok.exe" 2>nul | find /i "ngrok.exe" >nul
if errorlevel 1 (
  echo   NGROK ABHI BAND HAI  ->  START_TUNNEL.bat double-click karo
) else (
  echo   ngrok chal raha hai  ->  https://unripe-thwarting-chewable.ngrok-free.dev
)
echo.
pause
