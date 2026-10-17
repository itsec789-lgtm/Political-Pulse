# -*- coding: utf-8 -*-
"""Punjab ko package me POORA daal do -- taaki main system par Punjab na
   hone par bhi wahan ban jaaye.

   Dikkat jo thi:
     Main server Punjab ko aise jodta hai --
         try { require('../PunjabLens/server.js'); app.use('/punjab', ...) }
         catch (e) { console.log('[PUNJAB] mount skip: ' + e.message); }
     Agar PunjabLens folder na ho, ya uske node_modules na hon, to require
     fail -> /punjab route banta hi nahi -> "Cannot GET /punjab/".
     Package me ab tak sirf 8 file thi (HTML/CSS/JS + server.js), jo tabhi
     kaam karti jab Punjab pehle se laga ho.

   Ab package me Punjab ki SAARI source files hain (node_modules aur
   secrets chhod kar), aur ek SETUP_PUNJAB.bat jo ek baar npm install
   chala deta hai.
"""
import io, os, shutil, re

ROOT = os.environ['HOME'] + '/mnt/Main Twitter Project'
PKG = ROOT + '/UPDATE_07-OCT'
NF = PKG + '/nayi-files'
PL = ROOT + '/PunjabLens'

# ---- kya bheja jaayega ------------------------------------------------
ROOTF = ['server.js', 'aggregate.js', 'build_punjab_data.py',
         'mongo_conf.js', 'mongo_conf.py', 'package.json', 'package-lock.json',
         'requirements.txt', 'UPDATE_DATA.bat', 'MAIN_DASHBOARD_ME_KAISE_JUDA.md']
PUBF = ['index.html', 'punjab_dashboard_template.html', 'style.css',
        'app.js', 'ai-settings.js', 'assistant.js', 'assistant-ai.js',
        'breaking.js', 'district-map.js', 'extras.js', 'host-switch.js',
        'insights.js', 'overview-plus.js', 'punjab-geo.js',
        'report-ai.js', 'reports.js', 'state-config.js', 'wire.js']
ASSET = 'public/assets/lib/xlsx.full.min.js'
IFMISS = ['config.json']          # jo pehle se ho use chhoo mat -- settings uski apni

# NAHI bhejte: .session_secret, ai_config.json (API key), node_modules,
#              START.bat / SCHEDULE_DAILY.bat (Punjab ab main server me chalta hai)

SECRET = [(re.compile(r"mongodb(?:\+srv)?://[^\s'\"]*:[^\s'\"@]+@"), 'Mongo URL me password'),
          (re.compile(r"AIza[A-Za-z0-9_-]{20,}"), 'Google API key'),
          (re.compile(r"gsk_[A-Za-z0-9]{20,}"), 'Groq key'),
          (re.compile(r"\bsk-[A-Za-z0-9]{20,}"), 'OpenAI jaisi key')]

def cp(rel):
    s, d = PL + '/' + rel, NF + '/PunjabLens/' + rel
    assert os.path.exists(s), 'nahi mila: ' + s
    dd = os.path.dirname(d)
    if not os.path.isdir(dd): os.makedirs(dd)
    shutil.copyfile(s, d)
    if not rel.endswith(('.min.js', '.json')) or rel.endswith('config.json'):
        try:
            t = io.open(d, encoding='utf-8', errors='replace').read()
            for rx, what in SECRET:
                assert not rx.search(t), 'SECRET: ' + rel + ' -> ' + what
        except UnicodeError:
            pass
    return rel

sent = []
for f in ROOTF + IFMISS: sent.append(cp(f))
for f in PUBF: sent.append(cp('public/' + f))
sent.append(cp(ASSET))

# SETUP_PUNJAB.bat (ye package ke saath aayi hai, PunjabLens se nahi)
shutil.copyfile(os.path.dirname(os.path.abspath(__file__)) + '/SETUP_PUNJAB.bat',
                NF + '/PunjabLens/SETUP_PUNJAB.bat')
sent.append('SETUP_PUNJAB.bat')
print('PunjabLens me %d files package me gayi' % len(sent))

# ---- UPDATE_KARO.bat ---------------------------------------------------
B = PKG + '/UPDATE_KARO.bat'
s = io.open(B, encoding='utf-8').read()
assert 'SETUP_PUNJAB.bat' not in s, 'PEHLE HI HO CHUKA HAI'
if not os.path.exists(B + '.bak_before_pjfull'):
    shutil.copyfile(B, B + '.bak_before_pjfull')

# purana chhota Punjab block poora badal do
i = s.index('echo   --- PunjabLens (Punjab dashboard) ---')
j = s.index('echo   Saathi files', i)
old = s[i:j]
assert 'call :one "PunjabLens" "server.js"' in old

lines = ['echo   --- PunjabLens (Punjab dashboard) ---',
         'REM Punjab main server ke ANDAR chalta hai (/punjab/). Folder na ho to',
         'REM yahin bana dete hain -- warna require fail hota hai aur page par',
         'REM "Cannot GET /punjab/" aata hai.',
         'mkdir "%ROOT%\\PunjabLens"                  2>nul',
         'mkdir "%ROOT%\\PunjabLens\\public"           2>nul',
         'mkdir "%ROOT%\\PunjabLens\\public\\assets"    2>nul',
         'mkdir "%ROOT%\\PunjabLens\\public\\assets\\lib" 2>nul']
for f in ROOTF:
    lines.append('call :one "PunjabLens" "%s"' % f)
lines.append('call :one "PunjabLens" "SETUP_PUNJAB.bat"')
for f in PUBF:
    lines.append('call :one "PunjabLens" "public\\%s"' % f)
lines.append('call :one "PunjabLens" "public\\assets\\lib\\xlsx.full.min.js"')
for f in IFMISS:
    lines.append('call :ifmiss "PunjabLens" "%s"' % f)
lines += ['', 'echo.']
s = s[:i] + '\n'.join(lines) + '\n\n' + s[j:]

# backup folder ke liye bhi jagah
a = 'mkdir "%BAK%\\PunjabLens\\public" 2>nul'
assert s.count(a) == 1
s = s.replace(a, a + '\nmkdir "%BAK%\\PunjabLens\\public\\assets"     2>nul'
                   '\nmkdir "%BAK%\\PunjabLens\\public\\assets\\lib" 2>nul')

# node_modules ki jaanch -- ye bina npm install ke nahi aata
a = 'REM ================== server.js ko jo files chahiye =================='
assert s.count(a) == 1
s = s.replace(a, '''REM ========== Punjab ke node packages hain ya nahi ==========
echo.
echo   Checking: Punjab ^(/punjab/^) ke node packages...
set PJNPM=0
if exist "%ROOT%\\PunjabLens\\node_modules\\express\\package.json" (
  if exist "%ROOT%\\PunjabLens\\node_modules\\mongodb\\package.json" (
    echo     [ok]      express + mongodb
  ) else ( set PJNPM=1 )
) else ( set PJNPM=1 )
if !PJNPM! NEQ 0 (
  echo     [CHAHIYE] PunjabLens\\node_modules abhi nahi hai.
  echo.
  echo     ^>^> Ek baar ye chalao:  PunjabLens\\SETUP_PUNJAB.bat
  echo        Uske bina /punjab/ par "Cannot GET /punjab/" aayega.
)

''' + a)

# aakhri instructions me Punjab ka kadam
a = 'echo     3^) DASHBOARD\\START_LIVE.bat            chalao'
assert s.count(a) == 1
s = s.replace(a, '''echo     3^) PunjabLens\\SETUP_PUNJAB.bat        ^(sirf pehli baar,
echo        ya jab upar [CHAHIYE] likha aaye^)
echo.
echo     4^) DASHBOARD\\START_LIVE.bat            chalao''')
s = s.replace('echo     4^) Browser me  Ctrl + F5  ^(teeno par: / , /up , /punjab/^)',
              'echo     5^) Browser me  Ctrl + F5  ^(teeno par: / , /up , /punjab/^)')
s = s.replace('echo     5^) Ek baar kholo:  http://localhost:3000/healthz',
              'echo     6^) Ek baar kholo:  http://localhost:3000/healthz')
io.open(B, 'w', encoding='utf-8').write(s)
print('UPDATE_KARO.bat update ho gayi')
