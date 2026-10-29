@echo off
REM ====================================================================
REM  REPLICA_SETUP.bat   --  NAYE PC par chalao (purane par nahi)
REM  --------------------------------------------------------------
REM  Is PC ki MongoDB saaf karta hai, purane PC ke dump se saara data
REM  dobara banata hai, aur dashboard live kar deta hai.
REM
REM  replica-kit 27-Oct: ID/password + login rakhe jaate hain, Atlas HOT is PC par band
REM  Pehle ye teen install hone chahiye: Python 3.10+, Node.js 18+, MongoDB
REM  Aur 'mongo_dump_py' folder isi jagah hona chahiye.
REM
REM  Poora output replica_setup.log me bhi likha jaata hai.
REM
REM  NOTE: pehle wale version me sawaal python ke andar poochha jaata tha,
REM  par output Tee-Object ke pipe se guzarta hai -- isliye typing dikhti
REM  hi nahi thi aur window ruki hui lagti thi. Ab sawaal YAHIN, pipe se
REM  BAHAR poochha jaata hai. Jawab saaf dikhta hai.
REM ====================================================================
cd /d "%~dp0"
title REPLICA SETUP  --  naye PC par poora dashboard

rem python dhoondo -- PATH, phir aam jagahein
set PY=
where python >nul 2>&1
if not errorlevel 1 set PY=python
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe
if not defined PY if exist "%USERPROFILE%\anaconda3\python.exe" set PY=%USERPROFILE%\anaconda3\python.exe
if not defined PY (
  echo.
  echo   [X] Python nahi mila.
  echo       python.org se Python 3.10 ya naya install karo --
  echo       install karte waqt "Add Python to PATH" par TICK lagana.
  echo.
  pause
  exit /b 1
)

if not exist "REPLICA_SETUP.py" (
  echo.
  echo   !! REPLICA_SETUP.py is folder me nahi hai.
  echo      Ise project ROOT me rakho -- wahan jahan DASHBOARD,
  echo      UP-DASHBOARD, PunjabLens aur mongo_dump_py folder hain.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================================
echo   MongoDB chalu kar rahe hain (agar service ke roop me hai)...
echo  ================================================================
net start MongoDB >nul 2>&1

echo.
echo  ================================================================
echo   PEHLE DEKH LO  --  is PC ki MongoDB me abhi kya hai
echo  ================================================================
"%PY%" -u REPLICA_SETUP.py --check
if errorlevel 1 (
  echo.
  echo   !! Upar wali dikkat pehle theek karo, phir dobara chalao.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================================
echo   Is PC ki MongoDB kitni saaf karni hai?
echo.
echo     Enter          = sirf Pulse ki database (baaki projects ki nahi)
echo     ALL  likho     = POORI MongoDB saaf (saari user database)
echo                      -- sirf admin/config/local aur ID-password bachenge
echo  ================================================================
set WIPE=
set WA=
set /p WA=  Kya karna hai (Enter ya ALL):
if /i "%WA%"=="ALL" (
  set WIPE=--wipe-all
  echo.
  echo   Poori MongoDB saaf hogi. Ye list dekho -- jo "HATEGI" likha hai wo sab jaayega:
  echo.
  "%PY%" -u REPLICA_SETUP.py --check --wipe-all
)

echo.
echo  ================================================================
echo   HATNE WALI DATABASE  (isi PC par):
echo        pulse_master   india_Pulse   up_pulse   political_lens
echo        (aur pulse_hot / pulse_hot_test agar yahan hon)
echo.
if defined WIPE (
  echo   !! ALL chuna hai: is PC ki SAARI user database hategi ^(admin/config/local ke alawa^).
) else (
  echo   Is PC ki baaki database nahi chhui jaayegi.
)
echo   MongoDB ka ID/password aur is PC ke dashboard login RAKHE jaayenge.
echo   PURANE PC par kuch bhi nahi hoga.
echo   Ye wapas nahi aayega.
echo  ================================================================
echo.
set OK=
set /p OK=  Aage badhne ke liye  CLEAN  likho (aur kuch bhi = ruk jao):
if /i not "%OK%"=="CLEAN" (
  echo.
  echo   Kuch nahi hataya. Sab waise ka waisa hai.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================================
echo   Chalu ho gaya. 30-50 minute lag sakte hain --
echo   zyada time data bharne me lagta hai.
echo   Ye window band MAT karna. Ab kuch poochha nahi jayega.
echo  ================================================================
echo.

powershell -NoProfile -Command "& '%PY%' -u REPLICA_SETUP.py --yes %WIPE% 2>&1 | Tee-Object -FilePath replica_setup.log"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo  ================================================================
  echo   HO GAYA. Dashboard live hai:
  echo      http://localhost:3000          All India
  echo      http://localhost:3000/up       Uttar Pradesh
  echo      http://localhost:3000/punjab   Punjab
  echo   Browser me Ctrl + Shift + R dabao.
  echo  ================================================================
) else (
  echo  ================================================================
  echo   !! Adhoora raha  ^(exit %RC%^)
  echo   replica_setup.log me poora output hai -- wahi bhej dena.
  echo  ================================================================
)
echo.
pause
