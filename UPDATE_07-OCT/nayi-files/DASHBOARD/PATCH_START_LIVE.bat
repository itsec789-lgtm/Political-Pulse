@echo off
REM ================================================================
REM  PATCH_START_LIVE.bat  --  auto-restart chaalu karo (10-Oct)
REM
REM  Aapki START_LIVE.bat me sirf EK line badalni hai: server ab
REM  "npm start" se nahi, RUN_SERVER.bat se chalega -- jo crash hone
REM  par use khud wapas chalu kar deta hai.
REM
REM  Ye file aapki START_LIVE.bat ko CHHOD KAR baaki kuch nahi chhuti:
REM  Python ka path, ngrok ka domain/token, ghante wala loop -- sab
REM  waise ke waise rehte hain. Badalne se pehle backup bhi ban jaata hai.
REM
REM  Ek hi baar chalani hai. Dobara chalao to kuch nahi hota.
REM ================================================================
setlocal
title Auto-restart chaalu karo
cd /d "%~dp0"

if not exist "START_LIVE.bat" (
  echo.
  echo  !! START_LIVE.bat is folder me nahi mili:
  echo     %~dp0
  echo     Ye file DASHBOARD folder me honi chahiye.
  echo.
  pause
  exit /b 1
)
if not exist "RUN_SERVER.bat" (
  echo.
  echo  !! RUN_SERVER.bat nahi mili. Pehle UPDATE_KARO.bat chalao.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Join-Path $PWD 'START_LIVE.bat';" ^
  "$t = Get-Content -Raw -LiteralPath $p;" ^
  "if ($t -match 'RUN_SERVER\.bat') { Write-Host '  Auto-restart pehle se laga hua hai -- kuch badla nahi.'; exit 0 }" ^
  "$pat = '(?m)^\s*start \"All-India Dashboard Server\".*$';" ^
  "if ($t -notmatch $pat) { Write-Host '  !! START_LIVE.bat me server chalane wali line nahi mili.'; Write-Host '     Ye line haath se badalni padegi -- PEHLE_YE_PADHO.txt dekho.'; exit 2 }" ^
  "Copy-Item -LiteralPath $p -Destination ($p + '.bak_before_autorestart') -Force;" ^
  "$new = 'start \"All-India Dashboard Server\" \"' + [char]37 + '~dp0RUN_SERVER.bat\"';" ^
  "$t = [regex]::Replace($t, $pat, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $new }, 1);" ^
  "$kill = 'taskkill /F /FI \"WINDOWTITLE eq All-India Dashboard Server*\" >nul 2>&1';" ^
  "if ($t -notmatch 'WINDOWTITLE eq All-India Dashboard Server') {" ^
  "  $t = $t -replace '(?m)^(for /f \"tokens=5\" .*findstr \"\:3000\".*)$', ($kill + \"`r`n\" + '$1') }" ^
  "Set-Content -LiteralPath $p -Value $t -NoNewline -Encoding ASCII;" ^
  "Write-Host '  START_LIVE.bat badal di gayi (backup: START_LIVE.bat.bak_before_autorestart)'"

set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (
  echo  ============================================================
  echo    HO GAYA. Ab START_LIVE.bat band karke dobara chalao.
  echo    Server ki window ka naam "All-India Dashboard Server" hoga
  echo    aur wo kabhi gir jaaye to 5 second me khud wapas aa jaayegi.
  echo  ============================================================
) else (
  echo  ============================================================
  echo    Kuch badla nahi -- upar ki line padho.
  echo  ============================================================
)
echo.
pause
