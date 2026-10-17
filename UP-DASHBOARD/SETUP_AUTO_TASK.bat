@echo off
REM ================================================================
REM  FULLY AUTOMATIC (background) - ek hi baar chalao.
REM  Windows Task Scheduler me task banata hai jo har 30 min
REM  data auto-update karega - bina koi window khole, reboot ke baad bhi.
REM  (Dashboard DEKHNE ke liye server alag se chalu hona chahiye:
REM   START_SERVER.bat ko Startup me daal do - README dekho.)
REM ================================================================
cd /d "%~dp0"
schtasks /Create /TN "UP Dashboard Auto Update" /TR "\"%~dp0run_once.bat\"" /SC MINUTE /MO 30 /RL LIMITED /F
echo.
echo Ho gaya. Har 30 min me background me update chalega.
echo.
echo   Status dekhna:   schtasks /Query /TN "UP Dashboard Auto Update"
echo   Abhi ek baar chalana: schtasks /Run /TN "UP Dashboard Auto Update"
echo   Band/hatana:     schtasks /Delete /TN "UP Dashboard Auto Update" /F
echo.
pause
