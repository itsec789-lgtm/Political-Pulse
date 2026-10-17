@echo off
REM ek baar auto-update chalata hai (Task Scheduler isko har 30 min bulata hai)
cd /d "%~dp0"
set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python
"%PY%" auto_update.py
