@echo off
REM ================================================================
REM  UPDATE 29-Oct-2026  --  main system ko 27, 28 + 29 Oct ke saare badlaav
REM
REM  Ye folder project ke andar rakhiye:
REM      C:\Main Twitter Project\UPDATE_29-OCT\
REM  phir is file par double-click.  15-20 minute lagenge.
REM
REM  RUN_UPDATE.bat --check      sirf jaanch (kuch nahi badalta)
REM  RUN_UPDATE.bat --rollback   purani files wapas
REM ================================================================
title UPDATE 29-OCT
cd /d "%~dp0"
python "%~dp0run_update.py" %*
echo.
pause
