@echo off
REM sirf dashboard server chalu karta hai (http://localhost:3001)
REM Fully-automatic wale setup me isko Windows Startup me daalo.
cd /d "%~dp0"
net start MongoDB >nul 2>&1
start "" http://localhost:3001
npm start
