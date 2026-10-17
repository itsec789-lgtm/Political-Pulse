@echo off
title Punjab - data check (sirf padhta hai)
cd /d "%~dp0"

echo.
echo   PUNJAB DATA CHECK
echo   ---------------------------------------------------------------
echo   Ye script sirf PADHTI hai. Kuch likhti ya mitati NAHI.
echo   Connection string kahin dikhaya nahi jayega.
echo.

node check_punjab_data.js
set RC=%ERRORLEVEL%

echo.
echo   ---------------------------------------------------------------
echo   DAILY TASK ki haalat (PoliticalLens_DailyBuild):
echo.
schtasks /query /TN "PoliticalLens_DailyBuild" /V /FO LIST 2>nul | findstr /I "TaskName Status Last Next Result"
if errorlevel 1 (
  echo      ** Aisa koi task hai hi nahi. Isiliye data apne aap update
  echo         nahi hota. SCHEDULE_DAILY.bat ko admin se chalao.
)

echo.
echo   Upar ka poora output copy karke bhej dijiye.
echo.
pause
exit /b %RC%
