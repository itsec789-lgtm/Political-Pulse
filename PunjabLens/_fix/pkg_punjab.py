# -*- coding: utf-8 -*-
"""UPDATE_07-OCT package me Punjab ke changes jod do.

   Jodta hai:
     DASHBOARD/run_pipeline.py          (punjab-catchup)
     PunjabLens/server.js               (/api/ask hataya)
     PunjabLens/public/index.html       (assistant hataya)
     PunjabLens/public/ai-settings.js   (nayi)
     PunjabLens/public/wire.js
     PunjabLens/public/style.css
     PunjabLens/public/assistant.js     (khaali stub)
     PunjabLens/public/assistant-ai.js  (khaali stub)
     PunjabLens/public/punjab_dashboard_template.html

   UPDATE_KARO.bat me Punjab ka hissa jodta hai (PunjabLens na ho to
   chup-chaap chhod deta hai, fail nahi hota), aur WAPAS_KARO.bat me
   uska rollback.
"""
import io, os, shutil

ROOT = os.environ['HOME'] + '/mnt/Main Twitter Project'
PKG = ROOT + '/UPDATE_07-OCT'
NF = PKG + '/nayi-files'

def R(p): return io.open(p, encoding='utf-8').read()
def W(p, s): io.open(p, 'w', encoding='utf-8').write(s)

# ---------------------------------------------------------------- 1. files
PAIRS = [
    ('DASHBOARD/run_pipeline.py', 'DASHBOARD/run_pipeline.py'),
    ('PunjabLens/server.js', 'PunjabLens/server.js'),
    ('PunjabLens/public/index.html', 'PunjabLens/public/index.html'),
    ('PunjabLens/public/ai-settings.js', 'PunjabLens/public/ai-settings.js'),
    ('PunjabLens/public/wire.js', 'PunjabLens/public/wire.js'),
    ('PunjabLens/public/style.css', 'PunjabLens/public/style.css'),
    ('PunjabLens/public/assistant.js', 'PunjabLens/public/assistant.js'),
    ('PunjabLens/public/assistant-ai.js', 'PunjabLens/public/assistant-ai.js'),
    ('PunjabLens/public/punjab_dashboard_template.html', 'PunjabLens/public/punjab_dashboard_template.html'),
]
for src, dst in PAIRS:
    s = ROOT + '/' + src
    d = NF + '/' + dst
    assert os.path.exists(s), 'nahi mila: ' + s
    dd = os.path.dirname(d)
    if not os.path.isdir(dd): os.makedirs(dd)
    shutil.copyfile(s, d)
print('copied %d files -> nayi-files/' % len(PAIRS))

# koi secret galti se to nahi aa gaya
import re as _re
# Wahi niyam jo _CHECK_PACKAGE.py lagata hai: sirf WO mongo URL raaz hai
# jisme username:password ho. Khaali "mongodb://host:port" ek hint hai
# (server.js ke console message me pada hai), raaz nahi.
_SECRET = [(_re.compile(r"mongodb(?:\+srv)?://[^\s'\"]*:[^\s'\"@]+@"), 'Mongo URL me password'),
           (_re.compile(r"AIza[A-Za-z0-9_-]{20,}"), 'Google API key'),
           (_re.compile(r"gsk_[A-Za-z0-9]{20,}"), 'Groq API key'),
           (_re.compile(r"\bsk-[A-Za-z0-9]{20,}"), 'OpenAI jaisi key')]
for _, dst in PAIRS:
    t = R(NF + '/' + dst)
    for rx, what in _SECRET:
        assert not rx.search(t), 'SECRET mila: ' + dst + ' -> ' + what

# ---------------------------------------------------------------- 2. UPDATE_KARO.bat
B = PKG + '/UPDATE_KARO.bat'
s = R(B)
assert 'PunjabLens' not in s, 'PEHLE HI JUD CHUKA HAI'
if not os.path.exists(B + '.bak_before_punjab'):
    shutil.copyfile(B, B + '.bak_before_punjab')

a = 'mkdir "%BAK%\\UP-DASHBOARD\\data" 2>nul'
assert s.count(a) == 1
s = s.replace(a, a + '\nmkdir "%BAK%\\PunjabLens"        2>nul'
                   '\nmkdir "%BAK%\\PunjabLens\\public" 2>nul')

a = 'call :one "DASHBOARD"    "auto_update.py"'
assert s.count(a) == 1
s = s.replace(a, a + '\ncall :one "DASHBOARD"    "run_pipeline.py"')

a = '''echo.
echo   Saathi files (sirf tab daalenge jab wahan hain hi nahi):'''
assert s.count(a) == 1
s = s.replace(a, '''echo.
echo   --- PunjabLens (Punjab dashboard) ---
REM Punjab har system par nahi hota. Na ho to chup-chaap chhod dete hain --
REM isse poora update fail nahi hona chahiye.
if not exist "%ROOT%\\PunjabLens\\server.js" (
  echo   [chhoda] PunjabLens is system par nahi hai -- Punjab ka hissa skip.
) else (
  call :one "PunjabLens" "server.js"
  call :one "PunjabLens" "public\\index.html"
  call :one "PunjabLens" "public\\ai-settings.js"
  call :one "PunjabLens" "public\\wire.js"
  call :one "PunjabLens" "public\\style.css"
  call :one "PunjabLens" "public\\assistant.js"
  call :one "PunjabLens" "public\\assistant-ai.js"
  call :one "PunjabLens" "public\\punjab_dashboard_template.html"
)

''' + a)

a = '''echo     3^) Browser me  Ctrl + F5  ^(dono dashboard par^)'''
assert s.count(a) == 1
s = s.replace(a, '''echo     3^) Browser me  Ctrl + F5  ^(teeno par: / , /up , /punjab/^)''')

a = '''echo   Sentiment pehli baar laga rahe ho to:  DASHBOARD\\INSTALL_SENTIMENT.bat'''
assert s.count(a) == 1
s = s.replace(a, '''echo   Punjab me kya badla: "Political Lens Assistant" wali chat hata di gayi,
echo   aur pipeline me Punjab ab peeche nahi reh sakta ^(catch-up^).
echo.
''' + a)
W(B, s)
print('UPDATE_KARO.bat updated')

# ---------------------------------------------------------------- 3. WAPAS_KARO.bat
B2 = PKG + '/WAPAS_KARO.bat'
s = R(B2)
assert 'PunjabLens' not in s
if not os.path.exists(B2 + '.bak_before_punjab'):
    shutil.copyfile(B2, B2 + '.bak_before_punjab')
a = 'xcopy /y /e "%BAK%\\UP-DASHBOARD\\*" "%ROOT%\\UP-DASHBOARD\\" >nul'
assert s.count(a) == 1
s = s.replace(a, a + '\nif exist "%BAK%\\PunjabLens" xcopy /y /e "%BAK%\\PunjabLens\\*" "%ROOT%\\PunjabLens\\" >nul')
W(B2, s)
print('WAPAS_KARO.bat updated')
