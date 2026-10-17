@echo off
REM ================================================================
REM  EXCEL PADHNE WALA PURZA (openpyxl) LAGAO
REM
REM  Dikkat: "ImportError: 'Import openpyxl' failed" aur
REM          "[Mapping Sync] FAIL -- mapping banayi nahi ja saki"
REM  Wajah : pandas bina openpyxl ke .xlsx padh hi nahi sakta.
REM
REM  Ye file har us Python me openpyxl daal deti hai jisme pandas hai,
REM  taaki jo bhi Python server/pipeline chalata ho, usme lag jaaye.
REM  Ek baar chalana kaafi hai.
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
title openpyxl lagao  -  India Political Pulse
color 0B

set FOUND=0
set DONE=0

echo.
echo   Python dhoondh rahe hain...
echo.

call :try "%PYTHON%"
call :try "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python313\python.exe"
call :try "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python312\python.exe"
call :try "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe"
call :try "python"
call :try "py"

echo.
if "!DONE!"=="0" (
  color 0C
  echo   ====================================================================
  if "!FOUND!"=="0" (
    echo   Koi Python nahi mila jisme pandas ho.
    echo   Pehle pandas lagao:   python -m pip install pandas openpyxl
  ) else (
    echo   openpyxl lag nahi paya -- upar ki lines padho.
    echo   Aam wajah: internet band hai, ya proxy chahiye.
  )
  echo   ====================================================================
) else (
  color 0A
  echo   ====================================================================
  echo   HO GAYA -- !DONE! Python me openpyxl lag gaya.
  echo.
  echo   Ab chalao:  RUN_MAPPING_UPDATE.bat
  echo   (ya agli ghante wali Mapping Sync apne aap theek chal jaayegi)
  echo   ====================================================================
)
echo.
pause
exit /b

:try
set "PY=%~1"
if "%PY%"=="" exit /b
where "%PY%" >nul 2>&1 || if not exist "%PY%" exit /b
"%PY%" -c "import pandas" >nul 2>&1 || exit /b
set /a FOUND+=1
echo   - %PY%
"%PY%" -c "import openpyxl" >nul 2>&1
if not errorlevel 1 (
  echo       openpyxl pehle se hai  [theek]
  set /a DONE+=1
  exit /b
)
echo       openpyxl daal rahe hain...
"%PY%" -m pip install openpyxl
if errorlevel 1 (
  echo       NAHI LAGA  [upar ki lines padho]
) else (
  echo       LAG GAYA  [theek]
  set /a DONE+=1
)
exit /b
