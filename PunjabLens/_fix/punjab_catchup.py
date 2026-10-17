# -*- coding: utf-8 -*-
"""punjab-catchup (10-Oct)

   Dikkat jo thi:
     run_pipeline.py me All India + UP + Punjab teeno ek hi jagah push hote
     hain. Par agar All India/UP ho jaayein aur Punjab FAIL ho jaaye, to
     push_punjab() bas ek line log me likh kar chup ho jaata tha. Uske
     turant baad _pending_clear() chal jaata tha, yaani "sab ho gaya".
     Agle ghante agar koi nayi file na mile to raasta yahan se jaata tha:

         if added == 0 and not pending:  ->  "Naya data nahi -> push skip."

     ...aur Punjab wahin ka wahin peeche reh jaata tha -- jab tak koi nayi
     file na aa jaaye. All India/UP taaza, Punjab purana.

   Ab:
     Punjab fail hone par .punjab_pending ka nishaan lag jaata hai, aur
     agle run me -- chahe ek bhi nayi file na mili ho -- sirf Punjab dobara
     push ho jaata hai.

   Ye script sirf run_pipeline.py ko badalti hai. Backup .bak banta hai.
"""
import io, os, shutil

HERE = os.environ['HOME'] + '/mnt/Main Twitter Project/DASHBOARD'
P = HERE + '/run_pipeline.py'

s = io.open(P, encoding='utf-8').read()
assert 'punjab-catchup (10-Oct)' not in s, 'PEHLE HI LAG CHUKA HAI'
n0 = len(s)
shutil.copyfile(P, P + '.bak_before_punjabcatchup')

# ---------------------------------------------------------------- 1. nishaan
A = 'PENDING = os.path.join(HERE, ".push_pending")   # push baaki hai -- agle run me kar lo'
assert s.count(A) == 1, 'PENDING line nahi mili'
s = s.replace(A, A + '\n'
  '# punjab-catchup (10-Oct): Punjab ka push alag se adhoora reh sakta hai\n'
  '# (All India/UP ho jaate hain, Punjab fail) -- uska apna nishaan.\n'
  'PJ_PENDING = os.path.join(HERE, ".punjab_pending")')

# ---------------------------------------------------------------- 2. helpers
B = 'def _pending_is():\n    return os.path.exists(PENDING)'
assert s.count(B) == 1, '_pending_is nahi mila'
s = s.replace(B, B + '''


def _pj_set():
    """Punjab adhoora reh gaya -- agle run me isi se pakda jayega."""
    try: open(PJ_PENDING, "w").write(datetime.datetime.now().isoformat())
    except Exception: pass


def _pj_clear():
    try:
        if os.path.exists(PJ_PENDING): os.remove(PJ_PENDING)
    except Exception: pass


def _pj_is():
    return os.path.exists(PJ_PENDING)''')

# ---------------------------------------------------------------- 3. push_punjab
C = '''    script = os.path.join(os.path.dirname(HERE), "PunjabLens", "build_punjab_data.py")
    if not os.path.exists(script):
        log("  (Punjab skip: build_punjab_data.py nahi mila)")
        return'''
assert s.count(C) == 1, 'push_punjab ka shuru nahi mila'
s = s.replace(C, '''    script = os.path.join(os.path.dirname(HERE), "PunjabLens", "build_punjab_data.py")
    if not os.path.exists(script):
        log("  (Punjab skip: build_punjab_data.py nahi mila)")
        _pj_clear()          # file hi nahi hai -> baar-baar koshish ka fayda nahi
        return True''')

D = '''        if r.returncode == 0:
            log("  Punjab ho gaya.")'''
assert s.count(D) == 1
s = s.replace(D, '''        if r.returncode == 0:
            log("  Punjab ho gaya.")
            _pj_clear()''')

E = '''            except Exception as e:
                log("  (Punjab refresh skip: %s -- server band hoga, khulte hi naya data aa jayega)" % e)
        else:
            log("  (Punjab push fail, code %s: %s)" % (r.returncode, (r.stderr or "")[-200:]))
    except Exception as e:
        log("  (Punjab skip: %s)" % e)'''
assert s.count(E) == 1, 'push_punjab ka ant nahi mila'
s = s.replace(E, '''            except Exception as e:
                log("  (Punjab refresh skip: %s -- server band hoga, khulte hi naya data aa jayega)" % e)
            return True
        else:
            log("  (Punjab push fail, code %s: %s)" % (r.returncode, (r.stderr or "")[-200:]))
            log("     -> nishaan laga diya; agle run me Punjab akela dobara push hoga.")
            _pj_set()
            return False
    except Exception as e:
        log("  (Punjab skip: %s)" % e)
        _pj_set()
        return False''')

# ---------------------------------------------------------------- 4. skip branch
F = '''    if added == 0 and not pending and '--force-push' not in sys.argv:
        log("Naya data nahi -> push skip.")
        save_state(state)'''
assert s.count(F) == 1, 'skip branch nahi mila'
s = s.replace(F, '''    if added == 0 and not pending and '--force-push' not in sys.argv:
        log("Naya data nahi -> push skip.")
        # punjab-catchup (10-Oct): All India/UP push ho chuke the par Punjab
        # fail hua tha -> Punjab yahin akela pakad liya jaata hai, warna wo
        # tab tak peeche rehta jab tak koi nayi file na aa jaaye.
        if _pj_is():
            log("Punjab pichhli baar adhoora reh gaya tha -> sirf Punjab dobara push kar rahe hain.")
            push_punjab()
        save_state(state)''')

# ---------------------------------------------------------------- 5. normal push
G = '''        PA.push_all("MONGO", log=log)
        push_punjab()'''
assert s.count(G) == 1, 'push_all + push_punjab nahi mila'
s = s.replace(G, '''        PA.push_all("MONGO", log=log)
        if not push_punjab():
            log("   (All India/UP ho gaye, Punjab nahi -- agle run me Punjab dobara chalega)")''')

io.open(P, 'w', encoding='utf-8').write(s)
print('PATCHED run_pipeline.py  %d -> %d  (+%d)' % (n0, len(s), len(s) - n0))
print('backup: run_pipeline.py.bak_before_punjabcatchup')
