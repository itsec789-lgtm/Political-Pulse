# -*- coding: utf-8 -*-
"""PEHLI BAAR wali haalat: mapping_synced.json hai hi nahi.
   Pehle aise me 'mapping_sync.py --check' hamesha
   "Mapping khaali hai ya padhi nahi gayi" kehkar fail ho jaata tha --
   chaahe mapping bilkul theek ho. Ye test wahi haalat bana kar dekhta hai.
   Chalao:  python t_syncfirst.py
"""
import io, os, sys, shutil, tempfile, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)
P = F = 0
FAILS = []


def ok(c, m):
    global P, F
    if c:
        P += 1; print('  ok   ' + m)
    else:
        F += 1; FAILS.append(m); print('  FAIL ' + m)


def sec(t):
    print('\n== %s ==' % t)


def sandbox(with_snapshot):
    """Asli file copy karke ek alag chhota project banate hain."""
    sb = tempfile.mkdtemp(prefix='msync_')
    os.makedirs(os.path.join(sb, 'DASHBOARD', 'data'))
    os.makedirs(os.path.join(sb, 'Mapping'))
    os.makedirs(os.path.join(sb, 'UP-DASHBOARD', 'data'))
    for f in ('mapping_sync.py', 'rebuild_mapping.py'):
        shutil.copy(os.path.join(HERE, f), os.path.join(sb, 'DASHBOARD', f))
    for f in ('handle_master.json', 'mapping_removed.json'):
        src = os.path.join(HERE, 'data', f)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(sb, 'DASHBOARD', 'data', f))
    shutil.copy(os.path.join(PROJ, 'Mapping', 'Mapping.xlsx'),
                os.path.join(sb, 'Mapping', 'Mapping.xlsx'))
    if with_snapshot:
        shutil.copy(os.path.join(HERE, 'data', 'handle_master.json'),
                    os.path.join(sb, 'DASHBOARD', 'data', 'mapping_synced.json'))
    return sb


def run_check(sb, script='mapping_sync.py'):
    r = subprocess.run([sys.executable, script, '--check'],
                       cwd=os.path.join(sb, 'DASHBOARD'),
                       capture_output=True, text=True)
    return r.returncode, (r.stdout or '') + (r.stderr or '')


MS = io.open(os.path.join(HERE, 'mapping_sync.py'), encoding='utf-8').read()

sec('1. Code me fix maujood hai')
ok('after = load(MAPJSON) or before' in MS,
   'CHECK mode ab abhi wali handle_master.json dekhta hai')
ok('after = before ' not in MS and 'after = before\n' not in MS,
   'purana (khaali snapshot wala) tarika hat gaya')

sec('2. PEHLI BAAR (mapping_synced.json hai hi nahi) -- ab chalta hai')
sb1 = sandbox(with_snapshot=False)
code, out = run_check(sb1)
ok('pehle kabhi mapping nahi gayi' in out, 'wahi haalat bani (pehli baar)')
ok('Mapping khaali hai ya padhi nahi gayi' not in out,
   'ab "Mapping khaali hai" wali galti NAHI aati')
ok('FAIL -- mapping kharab lagi' not in out, 'FAIL nahi hota')
ok('Dashboard synchronization completed' in out, 'poora chal kar khatam hota hai')
ok(code == 0, 'exit code 0  [mila %s]' % code)
ok('CHECK mode -- Mongo nahi chhua' in out, 'CHECK mode me Mongo ko haath nahi lagta')
ok('Mapping rows:' in out and 'Mapping rows: 0' not in out,
   'mapping ki ginti bhi dikhti hai')

sec('3. Purana code wahi jagah par FAIL hota tha (saabit)')
old = os.path.join(sb1, 'DASHBOARD', 'mapping_sync_old.py')
io.open(old, 'w', encoding='utf-8', newline='').write(
    MS.replace('after = load(MAPJSON) or before', 'after = before'))
code2, out2 = run_check(sb1, 'mapping_sync_old.py')
ok('Mapping khaali hai ya padhi nahi gayi' in out2,
   'purana code wahi galti deta tha -- yaani fix sach me isi ka hai')

sec('4. Doosri baar (snapshot maujood) -- pehle jaisa hi chalta hai')
sb2 = sandbox(with_snapshot=True)
code3, out3 = run_check(sb2)
ok(code3 == 0, 'exit code 0')
ok('aakhri baar gayi mapping' in out3, 'purani mapping se farak naapta hai')
ok('Mapping khaali' not in out3, 'koi galti nahi')

for sb in (sb1, sb2):
    try:
        shutil.rmtree(sb)
    except Exception:
        pass

print('\n' + '=' * 56)
print('  PASS %d   FAIL %d' % (P, F))
if F:
    print('\n  FAIL hui:')
    for m in FAILS:
        print('   - ' + m)
print('=' * 56)
sys.exit(1 if F else 0)
