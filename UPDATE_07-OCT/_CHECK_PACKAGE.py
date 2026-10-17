# -*- coding: utf-8 -*-
"""_CHECK_PACKAGE.py -- package bhejne se pehle ki jaanch.
   Chalao:  python _CHECK_PACKAGE.py     (isi folder me rehkar)
   1. har file UPDATE_KARO.bat me listed hai (aur ulta bhi)
   2. koi config/secret file andar nahi gayi
   3. kisi file me token/key ki ASLI value nahi hai
   4. mapping_removed.json khaali hai (install par koi handle gayab na ho)
   5. readme me zaroori steps likhe hain
"""
import os, re, io, sys, json

ok = True
def bad(m):
    global ok; ok = False; print('  FAIL ' + m)
def good(m):
    print('  ok   ' + m)
def sec(t):
    print('\n== ' + t + ' ==')

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

have = set()
for root, _, fs in os.walk('nayi-files'):
    for f in fs:
        p = os.path.relpath(os.path.join(root, f), 'nayi-files').replace('\\', '/')
        have.add(tuple(p.split('/', 1)))

bat = io.open('UPDATE_KARO.bat', encoding='utf-8', errors='replace').read()
listed = set((d, f.replace('\\', '/'))
             for d, f in re.findall(r'call :(?:one|ifmiss)\s+"([^"]+)"\s+"([^"]+)"', bat))

sec('1. package aur installer ki list ek jaisi')
for x in sorted(have - listed): bad('package me hai par .bat me nahi: %s/%s' % x)
for x in sorted(listed - have): bad('.bat me hai par package me nahi: %s/%s' % x)
if have == listed: good('%d files, dono taraf ek jaisi' % len(have))

sec('2. koi config / secret file andar nahi')
S = ('x_config', 'ai_config', 'auth_secret', 'db_config', '.env')
f2 = sorted(x for x in have if any(s in x[1].lower() for s in S))
if f2: bad('config file mili: %s' % (f2,))
else:  good('x_config / ai_config / auth_secret / db_config -- koi nahi')

sec('3. kisi file me token ki ASLI value nahi')
# X ka public web bearer har kisi ke liye ek hi hai -- wo raaz nahi hai
PUBLIC_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs'
# value = ek hi tukda, usme space ya + na ho (warna wo code ka jod hai)
LIT = r"""['"][A-Za-z0-9%_-]{20,}['"]"""
PATS = [
    (re.compile(r"""auth_token\s*['"]?\s*[:=]\s*""" + LIT), 'auth_token ki value'),
    (re.compile(r"""\bct0\s*['"]?\s*[:=]\s*""" + LIT),      'ct0 ki value'),
    (re.compile(r"""\btwid\s*['"]?\s*[:=]\s*""" + LIT),     'twid ki value'),
    (re.compile(r"gsk_[A-Za-z0-9]{20,}"),                   'Groq API key'),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}"),                  'OpenAI jaisi key'),
    (re.compile(r"mongodb(?:\+srv)?://[^\s'\"]*:[^\s'\"@]+@"), 'Mongo URL me password'),
]
hits = 0
for d, f in sorted(have):
    if f.endswith('.whl'):
        continue
    try:
        t = io.open(os.path.join('nayi-files', d, f), encoding='utf-8', errors='ignore').read()
    except Exception:
        continue
    t = t.replace(PUBLIC_BEARER, '<X_KA_PUBLIC_BEARER>')
    for rx, lbl in PATS:
        for m in rx.findall(t):
            hits += 1
            bad('%s/%s me %s' % (d, f, lbl))
if not hits:
    good('auth_token / ct0 / twid / API key ki asli value kahin nahi')
    good('sirf field ke NAAM aur code hain -- wo zaroori hai')
    good('X ka public web bearer chhod diya (har kisi ke liye ek hi hai)')

sec('4. mapping_removed.json khaali (install par koi handle gayab na ho)')
for d in ('DASHBOARD', 'UP-DASHBOARD'):
    p = 'nayi-files/%s/data/mapping_removed.json' % d
    j = json.load(io.open(p, encoding='utf-8'))
    if j.get('handles'): bad('%s ki list khaali nahi: %s' % (d, j['handles'][:5]))
    else:                good('%s -> handles: []' % d)

sec('5. readme me zaroori steps')
r = io.open('PEHLE_YE_PADHO.txt', encoding='utf-8').read()
for s in ['RUN_MAPPING_UPDATE.bat', 'START_LIVE.bat', 'Ctrl + F5', 'WAPAS_KARO.bat',
          'mapping_removed.json', 'Mapping_Me_Nahi_Hain_84_Handles_07Oct.csv',
          'INSTALL_SENTIMENT.bat']:
    (good if s in r else bad)('readme me: ' + s)

sec('6. script ka naam/path theek')
(good if 'UPDATE_07-OCT' in bat else bad)('UPDATE_KARO.bat me folder ka naam')
w = io.open('WAPAS_KARO.bat', encoding='utf-8', errors='replace').read()
(good if 'last-backup.txt' in w else bad)('WAPAS_KARO.bat backup ka record padhti hai')

print('\n' + ('  SAB THEEK -- package bhejne layak hai' if ok
              else '  KUCH GALAT HAI -- upar dekho'))
sys.exit(0 if ok else 1)
