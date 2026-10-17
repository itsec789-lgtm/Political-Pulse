@echo off
setlocal enabledelayedexpansion
title Sentiment model install
color 0A

echo ======================================================================
echo   SENTIMENT MODEL INSTALL  --  sentiment_tagger 3.0.0
echo ======================================================================
echo.
echo   Ye wahi 8-class model hai jo aapke notebook me chalta hai:
echo     Pro BJP / Anti BJP / Pro Govt. / Anti Govt.
echo     Positive / Negative / Neutral / No Sentiments
echo.

set "HERE=%~dp0"
set "WHL=%HERE%sentiment_tagger-3.0.0-py3-none-any.whl"

if not exist "%WHL%" (
  color 0C
  echo   [RUK JAO] Wheel file nahi mili:
  echo     %WHL%
  echo.
  echo   Ye .bat usi folder me rakho jisme wheel hai ^(DASHBOARD^).
  pause
  exit /b 1
)

REM ============ wahi python dhoondo jo dashboard bulata hai ============
REM sentiment.js isi tarteeb me try karta hai: python, py, python3.
REM Package USI me jaana chahiye -- warna "install to kiya tha" aur
REM "mila nahi" dono sach ho jaate hain.
set "PY="
for %%P in (python py python3) do (
  if not defined PY (
    %%P -c "import sys" >nul 2>&1
    if not errorlevel 1 set "PY=%%P"
  )
)

if not defined PY (
  color 0C
  echo   [RUK JAO] Python mila hi nahi ^(python / py / python3 -- teeno^).
  echo   Pehle Python install karo, phir ye dobara chalao.
  pause
  exit /b 1
)

echo   Python mila: %PY%
for /f "delims=" %%V in ('%PY% -c "import sys;print(sys.executable)"') do set "PYPATH=%%V"
for /f "delims=" %%V in ('%PY% -c "import platform;print(platform.python_version())"') do set "PYVER=%%V"
echo     %PYPATH%  ^(Python %PYVER%^)
echo.
echo   Isi me install ho raha hai. Model ~14 MB ka hai aur scikit-learn
echo   bhi aayega, to pehli baar 2-5 minute lag sakte hain.
echo.

%PY% -m pip install --upgrade "%WHL%"
if errorlevel 1 (
  color 0C
  echo.
  echo   ====================================================================
  echo   INSTALL FAIL HO GAYA -- upar ki lines dekho.
  echo   Aksar wajah: internet band hai ^(scikit-learn download nahi hua^),
  echo   ya pip ko admin chahiye. CMD ko "Run as administrator" se chalao.
  echo   ====================================================================
  pause
  exit /b 1
)

echo.
echo   Jaanch ho rahi hai...
%PY% "%HERE%sentiment_cli.py" --engine
echo.

%PY% -c "import sentiment_tagger as st; r=st.tag_texts(['Modi ji zindabad'])[0]; print('  Test tag:', r['label'], r['confidence'])"
if errorlevel 1 (
  color 0C
  echo   [DHYAN DO] Package import to hua par chala nahi. Upar ka error dekho.
  pause
  exit /b 1
)

echo.
echo ======================================================================
echo   HO GAYA
echo ======================================================================
echo.
echo   AB YE KARO:
echo     1^) START_LIVE.bat dobara chalao
echo     2^) Admin Panel -^> Handle Tracker kholo
echo        Upar ka banner HARA ho jana chahiye, aur usme aapke
echo        aathon label dikhne chahiye.
echo     3^) Ek baar scrape karo -- Sentiment column ab bharega.
echo.
echo   Jo tweet pehle khaali Sentiment ke saath save hue the, unka
echo   sentiment dobara scrape karne par bhar jaayega.
echo.
pause
exit /b 0
