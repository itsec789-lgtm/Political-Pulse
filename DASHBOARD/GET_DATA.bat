@echo off
REM Data chahiye? Isko double-click karo - ye poochega kab se kab tak.
cd /d "%~dp0"
title Data Export - Political Pulse
set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python
"%PY%" GET_DATA.py
