# -*- coding: utf-8 -*-
"""Dono .bat theek likhi hain -- jaanch."""
import io, os, re, sys
D = r'/sessions/' + os.environ['USER'] + r'/mnt/Main Twitter Project/DASHBOARD'
PKG = r'/sessions/' + os.environ['USER'] + r'/mnt/Main Twitter Project/UPDATE_07-OCT'
P = F = 0; FAILS = []
def ok(c, m):
    global P, F
    if c: P += 1; print('  ok   ' + m)
    else: F += 1; FAILS.append(m); print('  FAIL ' + m)
def sec(t): print('\n== %s ==' % t)

RM = io.open(os.path.join(D, 'RUN_MAPPING_UPDATE.bat'), encoding='utf-8', newline='').read()
FX = io.open(os.path.join(D, 'FIX_EXCEL_READER.bat'), encoding='utf-8', newline='').read()

sec('1. RUN_MAPPING_UPDATE -- poora kaam karti hai')
for step, why in [('mapping_sync.py --check', 'pehle sirf report'),
                  ('rebuild_mapping.py --apply', 'Mapping.xlsx se handle_master'),
                  ('mapping_sync.py --force', 'Mongo par mapping'),
                  ('push_all_scopes.py MONGO', 'dashboard data dobara')]:
    ok(step in RM, '%s  (%s)' % (step, why))
ok(RM.index('--check') < RM.index('rebuild_mapping.py --apply') <
   RM.index('mapping_sync.py --force') < RM.index('push_all_scopes.py MONGO'),
   'chaaron step sahi kram me')
ok('set /p GO=' in RM, 'badalne se pehle poochhti hai')

sec('2. Python har system par milega')
ok('%LOCALAPPDATA%\\Programs\\Python\\Python313' in RM, 'Python313 LOCALAPPDATA se')
ok('Python312' in RM and 'Python311' in RM, '312 aur 311 bhi')
_code = '\n'.join(l for l in RM.splitlines() if not l.strip().upper().startswith('REM'))
ok('C:\\Users\\hp\\' not in _code, 'purana hardcoded "C:\\Users\\hp" ab sirf comment me hai, code me nahi')
ok('import pandas, pymongo, openpyxl' in RM, 'teeno purze jaanch kar python chunti hai')
ok('FIX_EXCEL_READER.bat' in RM, 'kuch na mile to ilaaj bhi batati hai')

sec('3. CRLF (Windows wali line ending)')
for nm, txt in (('RUN_MAPPING_UPDATE.bat', RM), ('FIX_EXCEL_READER.bat', FX)):
    bad = len(re.findall(r'(?<!\r)\n', txt))
    ok(bad == 0, '%s me saari lines CRLF  [%d galat]' % (nm, bad))
    ok(txt.startswith('@echo off'), '%s @echo off se shuru' % nm)

sec('4. Dono file package me bhi hain aur .bat list me bhi')
UK = io.open(os.path.join(PKG, 'UPDATE_KARO.bat'), encoding='utf-8', newline='').read()
for nm in ('FIX_EXCEL_READER.bat', 'RUN_MAPPING_UPDATE.bat'):
    ok(os.path.exists(os.path.join(PKG, 'nayi-files', 'DASHBOARD', nm)), nm + ' package me hai')
    ok('"%s"' % nm in UK, nm + ' UPDATE_KARO.bat ki list me hai')
    live = io.open(os.path.join(D, nm), encoding='utf-8', newline='').read()
    pk = io.open(os.path.join(PKG, 'nayi-files', 'DASHBOARD', nm), encoding='utf-8', newline='').read()
    ok(live == pk, nm + ' package aur live bilkul same')


sec('5. Galat jagah se chale to saaf mana karti hai')
for nm, txt in (('RUN_MAPPING_UPDATE.bat', RM), ('FIX_EXCEL_READER.bat', FX)):
    ok('find /I "nayi-files"' in txt, nm + ': package wale folder ko pehchanti hai')
    ok('YE FILE YAHAN SE MAT CHALAO' in txt, nm + ': saaf mana karti hai')
    ok('exit /b 1' in txt, nm + ': ruk jaati hai')
    ok(txt.index('find /I "nayi-files"') < txt.index('exit /b 1'),
       nm + ': kaam shuru karne se PEHLE jaanchti hai')
    ok('echo "%~dp0"' in txt, nm + ': path quote me hai (space wale naam par bhi chale)')
ok('if not exist "..\\Mapping\\Mapping.xlsx"' in RM,
   'RUN_MAPPING_UPDATE: Mapping.xlsx ki bhi jaanch')
ok(RM.index('Mapping.xlsx nahi mili') < RM.index('STEP 1 / 4'),
   'ye jaanch pehle step se bhi pehle hoti hai')
ok('DASHBOARD folder se chalao' in RM, 'sahi raasta bhi batati hai')

print('\n' + '=' * 56)
print('  PASS %d   FAIL %d' % (P, F))
if F:
    print('\n  FAIL hui:')
    for m in FAILS: print('   - ' + m)
print('=' * 56)
sys.exit(1 if F else 0)
