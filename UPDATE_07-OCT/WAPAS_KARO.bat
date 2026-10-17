@echo off
setlocal
title Wapas purana - Dashboard
color 0E

echo ======================================================================
echo   WAPAS PURANA  --  update se pehle wali files laut aayengi
echo ======================================================================
echo.

set "ROOT=%~dp0.."

if not exist "%~dp0last-backup.txt" (
  echo   Koi backup ka record nahi mila.
  echo   Matlab UPDATE_KARO.bat abhi tak chala hi nahi.
  echo.
  pause
  exit /b 1
)
set /p BAK=<"%~dp0last-backup.txt"

if not exist "%BAK%\DASHBOARD" (
  echo   Backup folder nahi mila:
  echo     %BAK%
  echo.
  pause
  exit /b 1
)

echo   Yahan se wapas la rahe hain:
echo     %BAK%
echo.
set /p OK="Pakka? (y/n): "
if /i not "%OK%"=="y" (
  echo   Kuch nahi kiya.
  pause
  exit /b 0
)

xcopy /y /e "%BAK%\DASHBOARD\*"    "%ROOT%\DASHBOARD\"    >nul
xcopy /y /e "%BAK%\UP-DASHBOARD\*" "%ROOT%\UP-DASHBOARD\" >nul
if exist "%BAK%\PunjabLens" xcopy /y /e "%BAK%\PunjabLens\*" "%ROOT%\PunjabLens\" >nul

echo.
echo   Ho gaya -- purani files wapas aa gayin.
echo   Ab START_LIVE.bat chalao aur browser me Ctrl+F5 dabao.
echo.
pause
