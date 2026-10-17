@echo off
REM ====================================================================
REM  REBUILD_ONLY.bat
REM  --------------------------------------------------------------
REM  Sirf DATA dobara banata hai -- code ko haath nahi lagata.
REM  Hosted PC par code pehle se laga hua hai, sirf ginti purani hai
REM  (Pro-BJP / Anti-BJP / Pro-Govt / Anti-Govt par 0 dikh raha hai).
REM
REM  Isko project root me rakho -- wahan jahan DASHBOARD,
REM  UP-DASHBOARD aur PunjabLens folder hain -- aur double-click karo.
REM
REM  master_tweets ko sirf PADHA jaata hai. Badla kuch nahi jaata.
REM  10-15 minute lag sakte hain. Window band mat karna.
REM ====================================================================
cd /d "%~dp0"

if not exist "REBUILD_SENTIMENT.py" (
  echo.
  echo   REBUILD_SENTIMENT.py isi folder me nahi hai.
  echo   Dono file ek saath project root me rakho.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================================
echo   DATA DOBARA BANA RAHE HAIN  -- 10-15 minute
echo  ================================================================
echo.

python REBUILD_SENTIMENT.py
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo  ================================================================
  echo   HO GAYA. Ab browser me  Ctrl + Shift + R  dabao.
  echo   Server restart karne ki zaroorat nahi.
  echo  ================================================================
) else (
  echo  ================================================================
  echo   !! FAIL HUA  ^(exit %RC%^)
  echo   Upar ka poora output copy karke bhej dena -- wahi asli wajah hai.
  echo  ================================================================
)
echo.
pause
