@echo off
setlocal enabledelayedexpansion
title Political Pulse - Local Dashboard Server (Replica)
color 0B
cd /d "%~dp0"

echo ========================================================
echo    Political Pulse - Local Dashboard Server (Replica)
echo ========================================================
echo.

REM 1. MongoDB chalu karo. Is laptop par MongoDB service nahi hai (user folder
REM    me install hai), isliye "net start" fail ho jaata tha aur dashboard bina
REM    database ke khulta tha. Ab service na mile to mongod.exe khud chalate hain.
echo Starting MongoDB...
call :start_mongo

REM 2. Check and clean existing port 3000 process
echo Checking port 3000...
taskkill /F /FI "WINDOWTITLE eq All-India Dashboard Server*" >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
timeout /t 2 /nobreak >nul

REM 2b. Sync latest dashboard snapshot into local MongoDB if files are newer
echo Checking local MongoDB data snapshot...
python "%~dp0SYNC_SNAPSHOT_TO_MONGO.py" --if-newer

REM 3. Launch the dashboard server from DASHBOARD folder
echo Starting dashboard server -> http://localhost:3000
if exist "%~dp0DASHBOARD\RUN_SERVER.bat" (
    start "All-India Dashboard Server" "%~dp0DASHBOARD\RUN_SERVER.bat"
) else (
    cd /d "%~dp0DASHBOARD"
    start "All-India Dashboard Server" cmd /k "node --max-old-space-size=3072 server.js"
    cd /d "%~dp0"
)

REM 4. Server warm-up (wait 4 seconds)
echo Server warming up (4s)...
timeout /t 4 /nobreak >nul

REM 5. Open browser automatically
echo Opening Dashboard in browser...
start "" http://localhost:3000

echo.
echo ========================================================
echo   Dashboard live ho chuka hai!
echo      All-India:  http://localhost:3000
echo      UP:         http://localhost:3000/up
echo      Punjab:     http://localhost:3000/punjab
echo ========================================================
echo.
echo Is window ko aap minimize kar sakte hain ya band kar sakte hain.
echo (Server alag window me background me chal raha hai).
timeout /t 5 >nul
exit /b

REM ----------------------------------------------------------------
:start_mongo
call :port_up 27017
if !UP!==1 ( echo    MongoDB pehle se chal raha hai. & exit /b )

net start MongoDB >nul 2>&1
call :wait_mongo 5
if !UP!==1 ( echo    MongoDB service chalu. & exit /b )

set "MONGOD="
for /f "delims=" %%m in ('where mongod 2^>nul') do if not defined MONGOD set "MONGOD=%%m"
if not defined MONGOD if exist "%LOCALAPPDATA%\Programs\MongoDB\bin\mongod.exe" set "MONGOD=%LOCALAPPDATA%\Programs\MongoDB\bin\mongod.exe"
if not defined MONGOD for /d %%d in ("%ProgramFiles%\MongoDB\Server\*") do if exist "%%d\bin\mongod.exe" set "MONGOD=%%d\bin\mongod.exe"
if not defined MONGOD (
    color 0C
    echo    ERROR: mongod.exe nahi mila. MongoDB install karo, warna dashboard khaali dikhega.
    exit /b
)

REM data folder: mongod.exe ke bagal wala "data" (user install), warna C:\data\db
for %%b in ("!MONGOD!") do for %%r in ("%%~dpb..") do set "MROOT=%%~fr"
if exist "!MROOT!\data" (
    set "MDATA=!MROOT!\data"
    set "MLOG=!MROOT!\mongod.log"
) else (
    if not exist "C:\data\db" mkdir "C:\data\db"
    set "MDATA=C:\data\db"
    set "MLOG=C:\data\mongod.log"
)

echo    mongod chala rahe hain: !MONGOD!
echo    data: !MDATA!
start "MongoDB" /min "!MONGOD!" --dbpath "!MDATA!" --bind_ip 127.0.0.1,::1 --logpath "!MLOG!" --logappend
call :wait_mongo 30
if !UP!==1 ( echo    MongoDB chalu. & exit /b )
color 0C
echo    ERROR: MongoDB 30 second me chalu nahi hua. Log dekho: !MLOG!
exit /b

:wait_mongo
set /a _W=%1
:wait_loop
call :port_up 27017
if !UP!==1 exit /b
if !_W! LEQ 0 exit /b
ping -n 2 127.0.0.1 >nul
set /a _W-=1
goto wait_loop

:port_up
set UP=0
netstat -ano | findstr ":%1 " | findstr LISTENING >nul && set UP=1
exit /b
