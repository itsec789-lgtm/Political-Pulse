@echo off
title MongoDB backup - naye laptop par le jaane ke liye
cd /d "%~dp0"

set PY=C:\Users\arpan\anaconda3\python.exe
if not exist "%PY%" set PY=python

echo.
echo   ==================================================================
echo     MONGODB BACKUP
echo   ==================================================================
echo.
echo   Ye chaar database padhi jaayengi:
echo        pulse_master     india_Pulse     up_pulse     political_lens
echo.
echo   Dump yahin banega:   mongo_dump_py\
echo.
echo   Ye script sirf PADHTI hai -- chalta hua dashboard bilkul safe hai.
echo   10-20 minute lagenge. Window band mat karna.
echo.
pause

"%PY%" mongo_backup.py
if errorlevel 1 goto failed

echo.
echo   ==================================================================
echo     HO GAYA
echo   ==================================================================
echo.
echo   Ab poora "Main Twitter Project" folder naye laptop par copy karo
echo   (mongo_dump_py bhi saath jana chahiye), phir wahan SETUP.bat chalao.
echo.
echo   Chhota rakhna ho to ye chhod sakte ho -- SETUP khud bana lega:
echo      DASHBOARD\node_modules
echo      PunjabLens\node_modules
echo      _HATAYA_2026-09-02
echo.
pause
exit /b 0

:failed
echo.
echo   !! FAIL. Aam wajahein:
echo      - MongoDB band hai   -^> net start MongoDB
echo      - pymongo nahi hai   -^> "%PY%" -m pip install pymongo
echo.
pause
exit /b 1
