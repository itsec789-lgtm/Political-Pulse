@echo off
title Punjab - "Cannot GET /punjab/" ki asli wajah
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo.
echo   ================================================================
echo    PUNJAB MOUNT CHECK   --  sirf PADHTA hai, kuch badalta NAHI
echo   ================================================================
echo.
echo   Folder: %CD%
echo.

echo   [1/4]  Files hain ya nahi
echo   ----------------------------------------------------------------
set MISS=0
call :chk "PunjabLens"
call :chk "PunjabLens\server.js"
call :chk "PunjabLens\config.json"
call :chk "PunjabLens\mongo_conf.js"
call :chk "PunjabLens\public\index.html"
call :chk "PunjabLens\node_modules\express\package.json"
call :chk "PunjabLens\node_modules\mongodb\package.json"
call :chk "DASHBOARD\server.js"
echo.

echo   [2/4]  Main server me Punjab ka code hai ya nahi
echo   ----------------------------------------------------------------
findstr /C:"PunjabLens', 'server.js'" "DASHBOARD\server.js" >nul 2>&1
if errorlevel 1 (
  echo      ** DASHBOARD\server.js me Punjab ka mount MILA HI NAHI.
  echo         Matlab wahan purani server.js padi hai.
  echo         -^> UPDATE_07-OCT\UPDATE_KARO.bat dobara chalao.
  set MISS=1
) else (
  echo      [ok]  mount ka code maujood hai
)
echo.

echo   [3/4]  ASLI WAJAH  -- wahi require jo server karta hai
echo   ----------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo      !! Node.js nahi mila -- is step ko chhod rahe hain.
  goto step4
)
node -e "try{var a=require('./PunjabLens/server.js');console.log('      [ok]  mount ho jayega. routes: '+((a._router&&a._router.stack||[]).filter(function(l){return l.route}).length)+'  db: '+((a.CFG&&a.CFG.targetDb)||'?'));}catch(e){console.log('      ** MOUNT SKIP: '+String(e.message).split('\n')[0]);console.log('');console.log('      Iska matlab:');var m=String(e.message);if(/Cannot find module '(express|mongodb)'/.test(m)){console.log('        node packages nahi lage -> PunjabLens\\SETUP_PUNJAB.bat chalao');}else if(/Cannot find module/.test(m)){console.log('        upar likhi file gayab hai -- wo copy karni padegi');}else{console.log('        ye line poori copy karke bhej dijiye');}}"
echo.

:step4
echo   [4/4]  Punjab ka data
echo   ----------------------------------------------------------------
curl -s --max-time 8 http://localhost:3000/punjab/api/status
if errorlevel 1 echo      ^(server abhi chal nahi raha -- koi baat nahi^)
echo.

echo   ================================================================
if %MISS% NEQ 0 (
  echo   Upar [NAHI] ya ** wali line hi asli dikkat hai.
) else (
  echo   Files to sab theek hain -- [3/4] wali line dekhiye.
)
echo   Poora output copy karke bhej dijiye.
echo   ================================================================
echo.
pause
exit /b 0

:chk
if exist "%~1" (echo      [ok]   %~1) else (echo      [NAHI] %~1 & set MISS=1)
goto :eof
