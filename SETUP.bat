@echo off
title Political Pulse - naye system ka setup
cd /d "%~dp0"

echo.
echo   ==================================================================
echo     POLITICAL PULSE  --  SETUP
echo     All India  +  Uttar Pradesh  +  Punjab
echo   ==================================================================
echo.
echo   Ek baar chalana hai. 20-30 minute lag sakte hain
echo   (zyada time MongoDB me data bharne me lagta hai).
echo.

rem Python dhoondo -- pehle Anaconda, phir PATH wala, phir py launcher
set PY=
if exist "%USERPROFILE%\anaconda3\python.exe" set PY=%USERPROFILE%\anaconda3\python.exe
if not defined PY if exist "C:\Users\arpan\anaconda3\python.exe" set PY=C:\Users\arpan\anaconda3\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python310\python.exe
if not defined PY goto trypath
goto found

:trypath
where python >nul 2>&1
if not errorlevel 1 set PY=python
if defined PY goto found
where py >nul 2>&1
if not errorlevel 1 set PY=py
if defined PY goto found

echo   [X] Python nahi mila.
echo.
echo       python.org se Python 3.10 ya usse naya install karo.
echo       Install karte waqt "Add Python to PATH" par TICK zaroor lagana.
echo.
pause
exit /b 1

:found
echo   Python: %PY%
echo.
"%PY%" setup.py
set RC=%ERRORLEVEL%

echo.
if not "%RC%"=="0" goto failed
echo   ==================================================================
echo     Ab ye chalao:   DASHBOARD\START_LIVE.bat
echo   ==================================================================
echo.
pause
exit /b 0

:failed
echo   Setup adhoora raha. Upar ka message padho aur theek karke
echo   SETUP.bat dobara chala do -- jo ho chuka hai wo dobara nahi hoga.
echo.
pause
exit /b 1
