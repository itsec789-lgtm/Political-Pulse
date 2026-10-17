@echo off
title Political Lens - daily auto update
cd /d "%~dp0"

echo.
echo   This sets up a daily automatic data update.
echo   (It appears in Windows Task Scheduler as "PoliticalLens_DailyBuild")
echo.
set /p HH=  What hour should it run? 24-hour format, e.g. 07: 
if "%HH%"=="" set HH=07

schtasks /Create /TN "PoliticalLens_DailyBuild" /TR "\"%~dp0UPDATE_DATA.bat\"" /SC DAILY /ST %HH%:15 /F
if errorlevel 1 (
  echo.
  echo   !! Could not create the task. Right-click this file -^> "Run as administrator" and try again.
) else (
  echo.
  echo   Done. The data will rebuild every day at %HH%:15.
  echo   A running server picks up the new data within 3 minutes -
  echo   no need to hit Reload.
  echo.
  echo   To remove it:  schtasks /Delete /TN "PoliticalLens_DailyBuild" /F
)
echo.
pause
