@echo off
REM ====================================================================
REM  MAKE_DUMP.bat   --  IS PC par chalao (jisse copy karna hai)
REM  --------------------------------------------------------------
REM  MongoDB ka poora dump banata hai: mongo_dump_py\
REM  Sirf PADHTA hai -- chalta hua dashboard bilkul safe hai.
REM  ~400 MB banega, 15-30 minute lagenge.
REM ====================================================================
cd /d "%~dp0"
title MongoDB DUMP  --  naye PC par le jaane ke liye

set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python

if not exist "mongo_backup.py" (
  echo.
  echo   !! mongo_backup.py is folder me nahi hai.
  echo      Is .bat ko project ROOT me rakho.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================================
echo   Dump banaya ja raha hai  ->  mongo_dump_py\
echo   pulse_master  india_Pulse  up_pulse  political_lens
echo   Ye window band MAT karna. 15-30 minute.
echo  ================================================================
echo.

powershell -NoProfile -Command "& '%PY%' -u mongo_backup.py 2>&1 | Tee-Object -FilePath make_dump.log"
if errorlevel 1 goto failed

echo.
echo  ================================================================
echo   HO GAYA.
echo.
echo   Ab poora "Main Twitter Project" folder naye PC par copy karo --
echo   mongo_dump_py SAMET. Ye chhod sakte ho (naye PC par khud ban
echo   jaayenge, aur inse copy bahut dheemi hoti hai):
echo        DASHBOARD\node_modules
echo        PunjabLens\node_modules
echo        _HATAYA_2026-09-02
echo.
echo   Naye PC par phir:  REPLICA_SETUP.bat
echo  ================================================================
echo.
pause
exit /b 0

:failed
echo.
echo   !! FAIL. Aam wajahein:
echo      - MongoDB band hai   -^> net start MongoDB
echo      - pymongo nahi hai   -^> "%PY%" -m pip install pymongo
echo   make_dump.log me poora output hai.
echo.
pause
exit /b 1
