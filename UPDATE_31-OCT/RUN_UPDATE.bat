@echo off
REM ================================================================
REM  UPDATE 31-Oct-2026  --  main system ko 30 + 31 Oct ke saare badlaav
REM  (UPDATE_29-OCT ke baad se)
REM
REM  Ye folder project ke andar rakhiye:
REM      C:\Main Twitter Project\UPDATE_31-OCT\
REM  phir is file par double-click.  2-3 minute lagenge.
REM
REM  RUN_UPDATE.bat --dry        sirf jaanch (kuch nahi badalta)
REM  RUN_UPDATE.bat --check      update ke baad dobara jaanch
REM  RUN_UPDATE.bat --rollback   purani files wapas
REM ================================================================
title UPDATE 31-OCT
cd /d "%~dp0"
python "%~dp0run_update.py" %*
echo.
pause
