@echo off
REM Political Pulse - GitHub sync jaanch. Sirf padhta hai, kuch nahi badalta.
REM Is file ko project folder ki jad me rakho (jahan auto_sync_github.py hai), phir double-click.
cd /d "%~dp0"
set OUT=%~dp0SYNC_CHECK_RESULT.txt
echo === folder: %cd% > "%OUT%"
echo === 1. git installed? >> "%OUT%"
git --version >> "%OUT%" 2>&1
echo === 2. python installed? >> "%OUT%"
python --version >> "%OUT%" 2>&1
echo === 3. ye folder git repo hai? >> "%OUT%"
git rev-parse --is-inside-work-tree >> "%OUT%" 2>&1
echo === 4. GitHub address >> "%OUT%"
git remote -v >> "%OUT%" 2>&1
echo === 5. branch aur aakhri commit is PC par >> "%OUT%"
git rev-parse --abbrev-ref HEAD >> "%OUT%" 2>&1
git log -1 --format="%%h %%ad %%s" --date=short >> "%OUT%" 2>&1
echo === 6. GitHub se naya laana - fetch >> "%OUT%"
git fetch origin main >> "%OUT%" 2>&1
echo === 7. GitHub par aakhri commit >> "%OUT%"
git log -1 origin/main --format="%%h %%ad %%s" --date=short >> "%OUT%" 2>&1
echo === 8. is PC ke aage / peeche - pehla number aage, doosra peeche >> "%OUT%"
git rev-list --left-right --count HEAD...origin/main >> "%OUT%" 2>&1
echo === 9. is PC par badli hui files >> "%OUT%"
git status --short --untracked-files=no >> "%OUT%" 2>&1
echo === 10. GitHub par badli files jo is PC par bhi badli hain - inhi se pull rukta hai >> "%OUT%"
git diff --name-only HEAD origin/main > "%TEMP%\gh_changed.txt" 2>nul
git diff --name-only > "%TEMP%\pc_changed.txt" 2>nul
findstr /x /g:"%TEMP%\gh_changed.txt" "%TEMP%\pc_changed.txt" >> "%OUT%" 2>&1
echo === DONE >> "%OUT%"
notepad "%OUT%"
