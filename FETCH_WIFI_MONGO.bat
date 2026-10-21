@echo off
setlocal enabledelayedexpansion
title Political Pulse - Fetch MongoDB from Laptop 1 (Wi-Fi)
color 0A
cd /d "%~dp0"

echo ======================================================================
echo    POLITICAL PULSE - FETCH MONGODB OVER WI-FI (LAPTOP 2)
echo ======================================================================
echo.
echo Dhyan dein:
echo 1. Laptop 1 par "START_WIFI_SYNC_SERVER.bat" chalu hona chahiye.
echo 2. Dono laptops SAME WI-FI se jude hone chahiye.
echo.

python sync_client.py

echo.
pause
