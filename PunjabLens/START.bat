@echo off
title Political Lens - Punjab
cd /d "%~dp0"

echo.
echo   Political Lens - Punjab
echo   ------------------------------------
echo.

if not exist node_modules (
  echo   First run - installing packages...
  call npm install
  if errorlevel 1 (
    echo.
    echo   !! npm install failed. Is Node.js installed? Get the LTS build from nodejs.org
    pause
    exit /b 1
  )
)

echo   Starting the server...
echo   Open in your browser:  http://localhost:3000
echo   Press Ctrl + C in this window to stop it.
echo.
node server.js
pause
