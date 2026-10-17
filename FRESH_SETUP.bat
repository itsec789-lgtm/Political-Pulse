@echo off
REM ====================================================================
REM  FRESH_SETUP.bat
REM  --------------------------------------------------------------
REM  Is laptop par teeno dashboard ka data naye sire se banata hai
REM  aur phir live kar deta hai.
REM
REM  MITEGA : india_Pulse, up_pulse, political_lens  (banaya hua data)
REM  SAFE   : pulse_master ke asli tweets aur saari config
REM
REM  Poora output fresh_setup.log me bhi likha jaata hai.
REM ====================================================================
cd /d "%~dp0"
title FRESH SETUP  --  poora data naye sire se

set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python

if not exist "FRESH_SETUP.py" (
  echo.
  echo   !! FRESH_SETUP.py is folder me nahi hai.
  echo      Ise project ROOT me rakho -- wahan jahan DASHBOARD,
  echo      UP-DASHBOARD aur PunjabLens folder hain.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================================
echo   1/2  Code ki jaanch  (jo pehle se laga hai wo dobara nahi lagega)
echo  ================================================================
echo.
if exist "APPLY_ALL_SEPT.py" (
  powershell -NoProfile -Command "& '%PY%' -u APPLY_ALL_SEPT.py --apply 2>&1 | Tee-Object -FilePath fresh_setup.log"
) else (
  echo   (APPLY_ALL_SEPT.py nahi mili -- ye step skip)
  echo APPLY_ALL_SEPT.py nahi mili -- skip > fresh_setup.log
)

echo.
echo  ================================================================
echo   2/2  Data naye sire se  --  10-20 minute
echo        Ye window band MAT karna.
echo  ================================================================
echo.
powershell -NoProfile -Command "& '%PY%' -u FRESH_SETUP.py --yes 2>&1 | Tee-Object -FilePath fresh_setup.log -Append"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo  ================================================================
  echo   HO GAYA. Dashboard live hai:
  echo      http://localhost:3000          All India
  echo      http://localhost:3000/up       Uttar Pradesh
  echo      http://localhost:3000/punjab   Punjab
  echo   Browser me Ctrl + Shift + R dabao.
  echo  ================================================================
) else (
  echo  ================================================================
  echo   !! Adhoora raha  ^(exit %RC%^)
  echo   fresh_setup.log me poora output hai -- wahi bhej dena.
  echo  ================================================================
)
echo.
pause
