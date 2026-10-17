@echo off
title Political Pulse - GitHub Auto Sync
color 0A
echo ========================================================
echo    Political Pulse - GitHub Background Auto-Sync
echo ========================================================
echo.
echo Running auto-sync...
echo Whenever Harshit pushes updates, this script will
echo automatically download them into your project folder.
echo.
echo Keep this window open or minimized.
echo ========================================================
echo.

python "%~dp0auto_sync_github.py"

pause
