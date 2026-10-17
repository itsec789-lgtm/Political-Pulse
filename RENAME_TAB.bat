@echo off
REM ====================================================================
REM  RENAME_TAB.bat  --  sidebar ka tab naam badal deta hai
REM     "MLA Tracker"  ->  "Elected Representatives"
REM
REM  Dono dashboard me ek saath:
REM     DASHBOARD\dashboard.template.html        (All India)
REM     UP-DASHBOARD\dashboard.template.html     (UP)
REM
REM  Sirf DIKHNE WALA naam badalta hai. Tab ka kaam-kaaj waisa hi.
REM  Backup khud ban jaata hai (.bak_tabname).
REM  Server restart ki zaroorat NAHI -- bas browser Ctrl+F5.
REM ====================================================================
cd /d "%~dp0"
title Tab ka naam badlo - Elected Representatives

set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=C:\Users\arpan\anaconda3\python.exe
if not exist "%PY%" set PY=python
"%PY%" -c "pass" >nul 2>&1
if errorlevel 1 set PY=py

"%PY%" RENAME_TAB.py
if errorlevel 1 goto failed
echo.
pause
exit /b 0

:failed
echo.
echo  !! Kuch file nahi badli -- upar wala message padho.
echo.
pause
exit /b 1
