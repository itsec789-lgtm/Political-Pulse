# -*- coding: utf-8 -*-
"""t_pjcatch.py -- punjab-catchup (10-Oct)

   Dekhta hai ki run_pipeline.py ka Punjab wala hissa ab peeche nahi reh
   sakta: All India/UP push ho jaayein aur Punjab fail ho jaaye, to agle
   run me Punjab AKELA dobara push hona chahiye -- chahe ek bhi nayi file
   na aayi ho.

   push_punjab() ko asli file se nikaal kar nakli subprocess ke saath
   chalaya jaata hai (koi asli build nahi chalta, Mongo ko haath nahi).
   Chalao:  python t_pjcatch.py
"""
import io, os, re, sys, tempfile, datetime

P, F = 0, 0
FAILS = []
def ok(c, m):
    global P, F
    if c:
        P += 1; print('  ok   ' + m)
    else:
        F += 1; FAILS.append(m); print('  FAIL ' + m)
def sec(t): print('\n== %s ==' % t)

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = io.open(os.path.join(HERE, 'run_pipeline.py'), encoding='utf-8').read()

sec('1. nishaan aur helpers maujood')
ok('punjab-catchup (10-Oct)' in SRC, 'patch ka nishaan')
for name in ['PJ_PENDING', 'def _pj_set', 'def _pj_clear', 'def _pj_is']:
    ok(name in SRC, 'maujood: ' + name)
ok('.punjab_pending' in SRC, 'alag nishaan file .punjab_pending')
ok('_pending_set' in SRC and '_pending_clear' in SRC, 'purana .push_pending waala kaam salaamat')

sec('2. push_punjab ab haan/na batata hai')
m = re.search(r'\ndef push_punjab\(\):\n(.*?)(?=\ndef )', SRC, re.S)
ok(bool(m), 'push_punjab mil gaya')
body = m.group(0)
ok('return True' in body and 'return False' in body, 'dono raaste par jawab deta hai')
ok('_pj_set()' in body and '_pj_clear()' in body, 'nishaan lagata aur hataata hai')

sec('3. chala kar dekha (nakli subprocess, asli build nahi)')
tmp = tempfile.mkdtemp()
PJ = os.path.join(tmp, '.punjab_pending')
logs = []

class FakeRun(object):
    def __init__(self, code, out='ok', err=''):
        self.returncode, self.stdout, self.stderr = code, out, err

def make_env(code, boom=False):
    """push_punjab ko akela chalane layak duniya bana do."""
    ns = {}
    ns['os'] = os; ns['sys'] = sys; ns['datetime'] = datetime
    ns['HERE'] = HERE
    ns['PJ_PENDING'] = PJ
    ns['PORT'] = 3000
    ns['log'] = lambda m: logs.append(str(m))
    class _SP(object):
        @staticmethod
        def run(*a, **k):
            if boom: raise RuntimeError('python hi nahi mila')
            return FakeRun(code)
    ns['subprocess'] = _SP
    class _UL(object):
        class request(object):
            @staticmethod
            def urlopen(*a, **k):
                raise RuntimeError('server band')      # refresh fail -> phir bhi True
    ns['urllib'] = _UL
    # helpers + push_punjab asli file se
    for fn in ['_pj_set', '_pj_clear', '_pj_is']:
        mm = re.search(r'\ndef ' + fn + r'\(\):\n(.*?)(?=\ndef )', SRC, re.S)
        exec(mm.group(0), ns)
    exec(body, ns)
    return ns

# -- (a) kaamyaab push
if os.path.exists(PJ): os.remove(PJ)
open(PJ, 'w').write('x')                      # pehle se adhoora pada tha
ns = make_env(0)
r = ns['push_punjab']()
ok(r is True, 'push theek chala -> True')
ok(not os.path.exists(PJ), 'kaamyaabi par nishaan hat gaya')
ok(any('Punjab ho gaya' in x for x in logs), 'log me "Punjab ho gaya"')

# -- (b) push fail (returncode 1)
logs[:] = []
ns = make_env(1)
r = ns['push_punjab']()
ok(r is False, 'push fail -> False')
ok(os.path.exists(PJ), 'fail par nishaan LAG gaya')
ok(any('agle run me Punjab akela' in x for x in logs), 'log me saaf likha hai ki dobara hoga')

# -- (c) poora crash
if os.path.exists(PJ): os.remove(PJ)
logs[:] = []
ns = make_env(0, boom=True)
r = ns['push_punjab']()
ok(r is False, 'crash -> False')
ok(os.path.exists(PJ), 'crash par bhi nishaan lag gaya')

# -- (d) refresh fail hone par bhi push kaamyaab hi mana jaye
if os.path.exists(PJ): os.remove(PJ)
open(PJ, 'w').write('x')
logs[:] = []
ns = make_env(0)
r = ns['push_punjab']()
ok(r is True, 'sirf /punjab/refresh fail ho to push phir bhi kaamyaab')
ok(not os.path.exists(PJ), '...aur nishaan hat gaya')
if os.path.exists(PJ): os.remove(PJ)

sec('4. "naya data nahi" wale raaste me Punjab pakda jaata hai')
skip = re.search(r"if added == 0 and not pending and '--force-push' not in sys\.argv:\n(.*?)\n    else:",
                 SRC, re.S)
ok(bool(skip), 'skip waala hissa mil gaya')
blk = skip.group(1)
ok('_pj_is()' in blk, 'skip se pehle Punjab ka nishaan dekha jaata hai')
ok('push_punjab()' in blk, 'nishaan laga ho to Punjab akela push hota hai')
ok(blk.index('_pj_is()') < blk.index('push_punjab()'), 'pehle jaanch, phir push')
ok('save_state(state)' in blk, 'state phir bhi save hoti hai (purana vyavhaar)')

sec('5. aam raaste me teeno saath (All India + UP + Punjab)')
norm = re.search(r'PA\.push_all\("MONGO", log=log\)\n(.*?)\n        save_state', SRC, re.S)
ok(bool(norm), 'aam push waala hissa mila')
ok('push_punjab()' in norm.group(1), 'Punjab wahin saath me push hota hai')
ok('All India/UP ho gaye, Punjab nahi' in norm.group(1),
   'Punjab fail ho to log me saaf line aati hai')

sec('6. kuch toota to nahi')
import py_compile
try:
    py_compile.compile(os.path.join(HERE, 'run_pipeline.py'), doraise=True)
    ok(True, 'run_pipeline.py compile ho rahi hai')
except Exception as e:
    ok(False, 'compile fail: %s' % e)
ok('def push_punjab():' in SRC, 'push_punjab abhi bhi maujood')
ok(SRC.count('push_punjab()') >= 2, 'dono jagah se bulaya jaata hai (aam + catch-up)')

print('\n================ RESULT ================')
print('PASS %d   FAIL %d' % (P, F))
if F:
    print('\nFAILS:')
    for x in FAILS: print(' - ' + x)
    sys.exit(1)
