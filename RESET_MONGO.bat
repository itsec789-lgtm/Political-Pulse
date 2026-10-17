@echo off
title MongoDB saaf karo - SIRF NAYE LAPTOP PAR
cd /d "%~dp0"

set PY=C:\Users\arpan\anaconda3\python.exe
if not exist "%PY%" set PY=python

echo.
echo   ==================================================================
echo     MONGODB RESET
echo   ==================================================================
echo.
echo   Ye chaar database hata dega:
echo        pulse_master     india_Pulse     up_pulse     political_lens
echo.
echo   Baaki kisi database ko haath nahi lagayega.
echo.
echo   ******************************************************************
echo     SIRF NAYE LAPTOP PAR CHALANA HAI.
echo     Purane laptop par chala diya to asli data chala jayega.
echo   ******************************************************************
echo.
echo   Pehle dekh lete hain ki abhi kya-kya hai...
echo.

"%PY%" RESET_MONGO.py
if errorlevel 1 goto done

echo.
echo   Ab data bharne ke liye SETUP.bat chalao.
echo.

:done
pause
