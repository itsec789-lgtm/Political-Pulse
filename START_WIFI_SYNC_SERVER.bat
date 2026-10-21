@echo off
setlocal enabledelayedexpansion
title Political Pulse - Wi-Fi Mongo Sync Server (Laptop 1)
color 0B
cd /d "%~dp0"

echo ======================================================================
echo    POLITICAL PULSE - WI-FI MONGODB SYNC SERVER (LAPTOP 1)
echo ======================================================================
echo.
echo Is server ke through dusra laptop (Laptop 2) isi Wi-Fi par aapse
echo MongoDB ka poora data fast download kar sakta hai.
echo.
echo Chuniye:
echo   [1] Start Server with current package (Turant chalu - 5 seconds)
echo   [2] Fresh Export from Live MongoDB first, then start Server
echo.
set /p CHOICE="Aapka chunav [Default: 1]: "
if "%CHOICE%"=="" set CHOICE=1

if "%CHOICE%"=="2" (
    echo.
    echo [*] Live MongoDB se fresh backup generate ho raha hai...
    python sync_server.py --export
) else (
    echo.
    echo [*] Sync Server chalu ho raha hai...
    python sync_server.py
)

pause
