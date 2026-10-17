@echo off
title Punjab - pehli baar setup (npm install)
cd /d "%~dp0"

echo.
echo   ================================================================
echo    PUNJAB  --  pehli baar ka setup
echo   ================================================================
echo.
echo   Punjab ka dashboard main server ke ANDAR chalta hai (/punjab/),
echo   par uske liye apne node packages chahiye -- express aur mongodb.
echo   Ye sirf EK BAAR chalana hota hai.
echo.

where node >nul 2>&1
if errorlevel 1 (
  color 0C
  echo   !! Node.js is system par nahi mila.
  echo      nodejs.org se LTS version install karo, phir ye dobara chalao.
  echo.
  pause
  exit /b 1
)

if exist "node_modules\express\package.json" if exist "node_modules\mongodb\package.json" (
  echo   Packages pehle se lage hue hain -- kuch karne ki zaroorat nahi.
  echo.
  goto verify
)

echo   Packages install ho rahe hain... ^(internet chahiye, 1-2 minute^)
echo.
call npm install
if errorlevel 1 (
  color 0C
  echo.
  echo   !! npm install fail ho gaya.
  echo      - internet chalu hai?
  echo      - office network par ho to proxy ki wajah se ruk sakta hai
  echo.
  pause
  exit /b 1
)

:verify
echo.
echo   Jaanch...
set MISS=0
if exist "node_modules\express\package.json" (echo     [ok]      express) else (echo     [MISSING] express & set MISS=1)
if exist "node_modules\mongodb\package.json" (echo     [ok]      mongodb) else (echo     [MISSING] mongodb & set MISS=1)
if exist "server.js"   (echo     [ok]      server.js)   else (echo     [MISSING] server.js   & set MISS=1)
if exist "config.json" (echo     [ok]      config.json) else (echo     [MISSING] config.json & set MISS=1)
if exist "public\index.html" (echo     [ok]      public\index.html) else (echo     [MISSING] public\index.html & set MISS=1)

if %MISS% NEQ 0 (
  color 0C
  echo.
  echo   Upar [MISSING] wali cheez ke bina Punjab nahi chalega.
  echo.
  pause
  exit /b 1
)

echo.
echo   ================================================================
echo   HO GAYA.
echo   ================================================================
echo.
echo   AB YE KARO:
echo     1^) DASHBOARD\START_LIVE.bat  band karke DOBARA chalao
echo     2^) Uski black window me ye line dhoondho:
echo.
echo           Punjab dashboard juda: /punjab  ^(db: political_lens^)
echo.
echo        Agar uski jagah "[PUNJAB] mount skip: ..." likha ho,
echo        to wahi line bhej dijiye -- usme asli wajah hoti hai.
echo.
echo     3^) Browser:  http://localhost:3000/punjab/
echo.
pause
