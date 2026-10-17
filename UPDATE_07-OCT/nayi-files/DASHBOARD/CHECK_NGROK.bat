@echo off
title ngrok - URL chal raha hai ya nahi
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo   ================================================================
echo    NGROK CHECK   --  sirf PADHTA hai, kuch badalta NAHI
echo   ================================================================
echo.

echo   [1/5]  Dashboard server khud chal raha hai? (port 3000)
echo   ----------------------------------------------------------------
netstat -ano | findstr ":3000" | findstr LISTENING >nul 2>&1
if errorlevel 1 (
  echo      ** NAHI. Server hi band hai -- ngrok kis cheez ko dikhayega?
  echo         -^> DASHBOARD\START_LIVE.bat chalao.
) else (
  echo      [ok]  port 3000 par server chal raha hai
  curl -s -o nul -w "      localhost jawab: HTTP %%{http_code}" --max-time 8 http://localhost:3000/healthz
  echo.
)
echo.

echo   [2/5]  ngrok ka process chal raha hai?
echo   ----------------------------------------------------------------
tasklist /FI "IMAGENAME eq ngrok.exe" 2>nul | findstr /I "ngrok.exe" >nul
if errorlevel 1 (
  echo      ** NAHI. ngrok band hai.
  echo         -^> "Public URL - ngrok" wali window band to nahi ho gayi?
  echo            START_LIVE.bat dobara chalao.
) else (
  echo      [ok]  ngrok.exe chal raha hai
)
echo.

echo   [3/5]  ngrok ne ASLI me kaun sa URL khola hai
echo   ----------------------------------------------------------------
curl -s --max-time 8 http://127.0.0.1:4040/api/tunnels
if errorlevel 1 (
  echo      ** ngrok ka local panel (127.0.0.1:4040) jawab nahi de raha.
  echo         Matlab ngrok chalu nahi hua, ya shuru hote hi mar gaya.
)
echo.
echo.

echo   [4/5]  Bahar se wahi URL khulta hai?
echo   ----------------------------------------------------------------
set "PUB=https://unripe-thwarting-chewable.ngrok-free.dev"
echo      Jaanch rahe hain: %PUB%/healthz
curl -s -o nul -w "      jawab: HTTP %%{http_code}" --max-time 15 -H "ngrok-skip-browser-warning: 1" "%PUB%/healthz"
echo.
echo.
echo      200       = sab theek, URL chal raha hai
echo      502/504   = tunnel to hai par piche server band hai
echo      404       = tunnel kisi aur cheez par laga hai
echo      000       = tunnel hai hi nahi (offline / limit khatam)
echo.

echo   [5/5]  ngrok window me kya likha hai
echo   ----------------------------------------------------------------
echo      "Public URL - ngrok" wali black window dekho. Agar usme
echo      ERR_NGROK_... likha hai to wahi line bhej dijiye. Aam wajahein:
echo.
echo        ERR_NGROK_108  = yahi domain/account kisi DOOSRE system par
echo                         bhi chal raha hai. Free account par ek waqt
echo                         me ek hi chalta hai. Doosri machine par
echo                         ngrok band karo.
echo        ERR_NGROK_3200 = tunnel offline hai
echo        ERR_NGROK_6024 = mahine ki free limit khatam
echo.

echo   ================================================================
echo   Poora output copy karke bhej dijiye.
echo   ================================================================
echo.
pause
