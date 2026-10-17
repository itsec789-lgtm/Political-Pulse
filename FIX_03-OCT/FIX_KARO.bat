@echo off
setlocal enabledelayedexpansion
title Pipeline Fix - 03 Oct
color 0A

echo ======================================================================
echo   PIPELINE FIX  --  03 October
echo.
echo   Do error theek karta hai:
echo     1. No module named 'mongo_conf'
echo     2. NameError: name 'MARK' is not defined
echo ======================================================================
echo.

set "ROOT=%~dp0.."
set "SRC=%~dp0nayi-files"

if not exist "%ROOT%\DASHBOARD\run_pipeline.py" (
  echo   [RUK JAO] Ye folder galat jagah par hai.
  echo.
  echo   "FIX_03-OCT" folder ko seedha apne project folder ke ANDAR rakho
  echo   ^(wahi folder jisme DASHBOARD aur UP-DASHBOARD hain^), phir ye
  echo   dobara chalao.
  echo.
  echo   Abhi dhoonda yahan:  %ROOT%\DASHBOARD\run_pipeline.py
  echo.
  pause
  exit /b 1
)

echo   Project mila:  %ROOT%
echo.

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set "LDT=%%I"
set "STAMP=%LDT:~0,8%-%LDT:~8,6%"
set "BAK=%ROOT%\BACKUP-fix-%STAMP%"
mkdir "%BAK%\DASHBOARD" 2>nul

set ERR=0
set ADDED=0

echo   [1] Tooti hui file badal rahe hain ^(backup lekar^):
echo.
call :fix "DASHBOARD" "push_all_scopes.py"

echo.
echo   [2] Kami wali files daal rahe hain ^(jo pehle se hain unhe chhuenge nahi^):
echo.
call :put "DASHBOARD"    "mongo_conf.py"
call :put "DASHBOARD"    "src_chunks.py"
call :put "UP-DASHBOARD" "mongo_conf.py"
call :put "UP-DASHBOARD" "src_chunks.py"

echo.
if %ERR% NEQ 0 (
  color 0C
  echo   Kuch copy nahi hui -- upar dekho.
  echo.
  pause
  exit /b 1
)

REM ================== poori jaanch ==================
echo.
echo   Jaanch: pipeline ^(Python^) ko jo files chahiye...
set MISS=0
for %%M in (mongo_conf.py src_chunks.py mongo_swap.py safe_write.py master_to_mongo.py phase2_push.py daily_report.py smart_import.py push_all_scopes.py update_dashboard.py run_pipeline.py) do (
  if exist "%ROOT%\DASHBOARD\%%M" (echo     [ok]      DASHBOARD\%%M) else (echo     [MISSING] DASHBOARD\%%M & set MISS=1)
)
for %%M in (mongo_conf.py src_chunks.py mongo_swap.py safe_write.py update_dashboard.py push_tweets.py) do (
  if exist "%ROOT%\UP-DASHBOARD\%%M" (echo     [ok]      UP-DASHBOARD\%%M) else (echo     [MISSING] UP-DASHBOARD\%%M & set MISS=1)
)
echo.
echo   Jaanch: server.js ^(Node^) ko jo files chahiye...
for %%M in (mongo_conf.js mongo_pool.js auth_lib.js ha_lib.js x_live.js login_page.js mailer.js report_lib.js news_lib.js) do (
  if exist "%ROOT%\DASHBOARD\%%M" (echo     [ok]      DASHBOARD\%%M) else (echo     [MISSING] DASHBOARD\%%M & set MISS=1)
)

if !MISS! NEQ 0 (
  color 0C
  echo.
  echo   ====================================================================
  echo   Upar [MISSING] wali file is system par hai hi nahi.
  echo   Uske bina pipeline ya server chalega nahi.
  echo   Us file ka naam mujhe bata do.
  echo   ====================================================================
  echo.
  pause
  exit /b 1
)

echo.
color 0A
echo ======================================================================
echo   SAB THEEK
echo ======================================================================
echo.
echo   AB YE KARO:
echo.
echo     1^) START_LIVE.bat chalao
echo.
echo   Agle run me push ho jaayega. Jo data abhi atka pada hai wo bhi
echo   apne aap chala jaayega -- ".push_pending" nishaan laga hua hai.
echo.
echo     2^) Phir browser me kholo:  http://localhost:3000/healthz
echo        "all" aur "up" ka lastUpdate ab EK JAISA hona chahiye.
echo.
echo   Backup ^(agar zaroorat pade^): %BAK%
echo.
pause
exit /b 0

REM ---- tooti file badlo, backup lekar ----
:fix
if not exist "%SRC%\%~1\%~2" (
  echo     [MISSING]       %~1\%~2  -- is folder me hai hi nahi
  set ERR=1
  goto :eof
)
if exist "%ROOT%\%~1\%~2" copy /y "%ROOT%\%~1\%~2" "%BAK%\%~1\%~2" >nul
copy /y "%SRC%\%~1\%~2" "%ROOT%\%~1\%~2" >nul
if errorlevel 1 (
  echo     [FAIL]          %~1\%~2
  set ERR=1
) else (
  echo     [BADAL DI]      %~1\%~2
)
goto :eof

REM ---- file sirf tab daalo jab wahan hai hi nahi ----
:put
if exist "%ROOT%\%~1\%~2" (
  echo     [pehle se hai]  %~1\%~2  -- chhua nahi
  goto :eof
)
if not exist "%SRC%\%~1\%~2" (
  echo     [MISSING]       %~1\%~2  -- is folder me hai hi nahi
  set ERR=1
  goto :eof
)
copy /y "%SRC%\%~1\%~2" "%ROOT%\%~1\%~2" >nul
if errorlevel 1 (
  echo     [FAIL]          %~1\%~2
  set ERR=1
) else (
  echo     [NAYI DAALI]    %~1\%~2
  set /a ADDED+=1
)
goto :eof
