@echo off
title Punjab - data build (pulse_master -> political_lens)
cd /d "%~dp0"

rem Wahi python jo main pipeline use karta hai. Na mile to PATH wala.
set PY=C:\Users\hp\AppData\Local\Programs\Python\Python313\python.exe
if not exist "%PY%" set PY=python

echo.
echo   PUNJAB DATA BUILD
echo   ---------------------------------------------------------------
echo   Source : pulse_master.master_tweets   (poora master, Apr se aaj tak)
echo   Target : political_lens.tweets / .aggregates / .meta
echo.
echo   Poora master padha jaata hai aur usme se sirf Punjab chhaana
echo   jaata hai, isliye 5-15 minute lag sakte hain. Window band mat karna.
echo.

"%PY%" build_punjab_data.py --push
if errorlevel 1 goto failed

echo.
echo   HO GAYA. Punjab ka data MongoDB me aa gaya.
echo   Dashboard khula ho to 3 minute me apne aap naya data uthaa lega,
echo   ya page refresh kar lo:  http://localhost:3000/punjab/
echo.
pause
exit /b 0

:failed
echo.
echo   !! FAIL. Aam wajahein:
echo      - MongoDB band hai   -^> Win+R -^> services.msc -^> "MongoDB Server" -^> Start
echo      - pymongo nahi hai   -^> "%PY%" -m pip install pymongo
echo      - python nahi mila   -^> is file me upar wali "set PY=" line theek karo
echo.
pause
exit /b 1
