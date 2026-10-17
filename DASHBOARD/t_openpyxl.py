# -*- coding: utf-8 -*-
"""openpyxl na ho to saaf sandesh + surakshit fail -- jaanch."""
import io, os, re, sys, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
P = F = 0; FAILS = []
def ok(c, m):
    global P, F
    if c: P += 1; print('  ok   ' + m)
    else: F += 1; FAILS.append(m); print('  FAIL ' + m)
def sec(t): print('\n== %s ==' % t)

D = r'/sessions/' + os.environ['USER'] + r'/mnt/Main Twitter Project/DASHBOARD'
RB = io.open(os.path.join(D, 'rebuild_mapping.py'), encoding='utf-8').read()
MS = io.open(os.path.join(D, 'mapping_sync.py'), encoding='utf-8').read()

sec('1. rebuild_mapping pehle hi jaanch leta hai')
ok('def _need_openpyxl():' in RB, 'jaanch wala function hai')
ok(RB.index('_need_openpyxl()') < RB.index('x = pd.ExcelFile(XLSX)'),
   'Excel kholne se PEHLE jaanch hoti hai')
ok('FIX_EXCEL_READER.bat' in RB, 'ilaaj (bat file) ka naam batata hai')
ok('-m pip install openpyxl' in RB, 'command bhi likh deta hai')
ok('sys.exit(2)' in RB, 'saaf-saaf fail hota hai (aadha kaam nahi karta)')
ok('kuch' in RB and 'mita nahi' in RB, 'yakeen dilata hai ki data mita nahi')

sec('2. mapping_sync asli wajah bataata hai')
ok("if 'openpyxl' in out:" in MS, 'openpyxl wali galti pehchanta hai')
ok('FIX_EXCEL_READER.bat' in MS, 'wahi ilaaj yahan bhi likha hai')

sec('3. ASLI me chala kar dekho (openpyxl chhupa kar)')
blocker = tempfile.mkdtemp()
io.open(os.path.join(blocker, 'openpyxl.py'), 'w', encoding='utf-8').write(
    'raise ImportError("blocked for test")\n')
env = dict(os.environ)
env['PYTHONPATH'] = blocker + os.pathsep + env.get('PYTHONPATH', '')
r = subprocess.run([sys.executable, os.path.join(D, 'rebuild_mapping.py')],
                   capture_output=True, text=True, cwd=D, env=env)
out = (r.stdout or '') + (r.stderr or '')
ok(r.returncode == 2, 'exit code 2 (saaf fail)  [mila %s]' % r.returncode)
ok('openpyxl' in out.lower(), 'sandesh me openpyxl ka zikr')
ok('FIX_EXCEL_READER.bat' in out, 'sandesh me bat file ka naam')
ok('pip install openpyxl' in out, 'sandesh me poori command')
ok('Traceback' not in out, 'lambi python traceback nahi dikhti')
ok(sys.executable in out, 'kaunsa Python hai wo bhi likha hai')

sec('4. Us haalat me bhi kuch mitta nahi')
hm = os.path.join(D, 'data', 'handle_master.json')
before = os.path.getmtime(hm)
r2 = subprocess.run([sys.executable, os.path.join(D, 'rebuild_mapping.py'), '--apply'],
                    capture_output=True, text=True, cwd=D, env=env)
ok(r2.returncode == 2, '--apply bhi surakshit fail hota hai')
ok(os.path.getmtime(hm) == before, 'handle_master.json ko haath nahi lagta')

print('\n' + '=' * 56)
print('  PASS %d   FAIL %d' % (P, F))
if F:
    print('\n  FAIL hui:')
    for m in FAILS: print('   - ' + m)
print('=' * 56)
sys.exit(1 if F else 0)
