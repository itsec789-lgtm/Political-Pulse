@echo off
REM ================================================================
REM  Mapping.xlsx  ->  handle_master.json  ->  MongoDB  ->  dashboard
REM
REM  Double-click karo. Pehle sirf REPORT dikhega, phir puchhega.
REM  ('python' seedha mat chalana -- har python me pandas/pymongo nahi hote)
REM ================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM ---- SURAKSHA : package wale folder se mat chalo ----
REM  'nayi-files' sirf copy rakhne ki jagah hai -- wahan Mapping\ folder
REM  hota hi nahi. Pehle log yahin se chala dete the aur "Mapping.xlsx
REM  nahi mili" aata tha. Ab seedha sahi raasta bata dete hain.
echo "%~dp0" | find /I "nayi-files" >nul
if not errorlevel 1 (
  color 0C
  echo.
  echo   ====================================================================
  echo   YE FILE YAHAN SE MAT CHALAO
  echo   ====================================================================
  echo   Abhi aap yahan ho:
  echo     %~dp0
  echo   Ye to UPDATE package ke andar ki copy hai ^(nayi-files^).
  echo.
  echo   Pehle UPDATE_KARO.bat chalao, phir ASLI wali file chalao:
  echo     ^<aapka project folder^>\DASHBOARD\%~nx0
  echo   jaise:  C:\Main Twitter Project\DASHBOARD\%~nx0
  echo   ====================================================================
  echo.
  pause
  exit /b 1
)
title Mapping Update

REM ---- SURAKSHA 2 : Mapping.xlsx hai bhi ya nahi ----
if not exist "..\Mapping\Mapping.xlsx" (
  color 0C
  echo.
  echo   ====================================================================
  echo   Mapping.xlsx nahi mili
  echo   ====================================================================
  echo   Dhoondhi yahan:  %~dp0..\Mapping\Mapping.xlsx
  echo.
  echo   Matlab ye file GALAT jagah se chal rahi hai. Ise apne project ke
  echo   DASHBOARD folder se chalao, jaise:
  echo      C:\Main Twitter Project\DASHBOARD\%~nx0
  echo   ^(Mapping folder DASHBOARD ke bagal me hona chahiye^)
  echo   ====================================================================
  echo.
  pause
  exit /b 1
)

color 0B

REM ---- Python dhoondho : wahi jisme pandas + pymongo DONO hon ----
REM  Pehle yahan seedha C:\Users\hp\...\Python313 likha tha -- doosre
REM  system par (C:\Users\Lenovo jaise) wo milta hi nahi tha aur kaam
REM  chup-chaap aam 'python' par chala jaata tha.
set "PY="
call :pick "%PYTHON%"
call :pick "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
call :pick "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
call :pick "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
call :pick "python"
call :pick "py"

if "%PY%"=="" (
  color 0C
  echo.
  echo  !! Koi aisa Python nahi mila jisme pandas + pymongo + openpyxl teeno hon.
  echo.
  echo     Pehle ye chalao:   FIX_EXCEL_READER.bat
  echo     Ya haath se:       python -m pip install pandas pymongo openpyxl
  echo.
  pause
  exit /b 1
)

echo.
echo  Python: %PY%
echo.
echo ============================================================
echo   STEP 1 / 4   --  sirf REPORT (kuch nahi badlega)
echo ============================================================
"%PY%" mapping_sync.py --check
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo   Upar ki report dhyan se dekho.
echo ============================================================
set /p GO="  Aage badhein aur mapping lagayein? (Y/N): "
if /i not "%GO%"=="Y" (
  echo.
  echo   Rok diya. Kuch nahi badla.
  pause
  exit /b 0
)

echo.
echo ============================================================
echo   STEP 2 / 4   --  Mapping.xlsx se handle_master.json
echo ============================================================
"%PY%" rebuild_mapping.py --apply
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo   STEP 3 / 4   --  MongoDB par mapping lagayi ja rahi hai
echo ============================================================
"%PY%" mapping_sync.py --force
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo   STEP 4 / 4   --  dashboard data dobara banaya ja raha hai
echo ============================================================
"%PY%" push_all_scopes.py MONGO
if errorlevel 1 goto :fail

color 0A
echo.
echo ============================================================
echo   HO GAYA.
echo   Ab START_LIVE.bat band karke dobara chalao,
echo   phir browser me Ctrl+F5 dabao.
echo ============================================================
pause
exit /b 0

:pick
if not "%PY%"=="" exit /b
set "C=%~1"
if "%C%"=="" exit /b
where "%C%" >nul 2>&1 || if not exist "%C%" exit /b
"%C%" -c "import pandas, pymongo, openpyxl" >nul 2>&1
if errorlevel 1 exit /b
set "PY=%C%"
exit /b

:fail
color 0C
echo.
echo   !! Kuch galat hua -- upar ka error padho.
echo      Agar 'openpyxl' ka zikr hai to FIX_EXCEL_READER.bat chalao.
echo.
pause
exit /b 1
