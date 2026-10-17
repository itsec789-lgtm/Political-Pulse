@echo off
REM ================================================================
REM  UPDATE_DASHBOARD.bat  --  ek double-click, poora update.
REM  Code bhi lagta hai aur sentiment ka data bhi dobara banta hai.
REM  Data / config ko haath nahi lagta. 10-15 minute lag sakte hain.
REM ================================================================
cd /d "%~dp0"
title Dashboard Update  (code + sentiment data)

set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python

if not exist "APPLY_ALL_SEPT.py" (
  echo.
  echo   !! APPLY_ALL_SEPT.py is folder me nahi mili.
  echo      Is .bat ko project ROOT me rakho -- wahan jahan
  echo      DASHBOARD, UP-DASHBOARD aur PunjabLens folder hain.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================================
echo   Dashboard update chalu ho raha hai...
echo   Ye window band MAT karna. 10-15 minute lag sakte hain.
echo  ================================================================
echo.

"%PY%" APPLY_ALL_SEPT.py --apply --rebuild

echo.
echo  ================================================================
echo   HO GAYA.
echo   Ab: 1) START_LIVE.bat band karke dobara chalao
echo       2) browser me Ctrl + Shift + R
echo  ================================================================
echo.
pause
