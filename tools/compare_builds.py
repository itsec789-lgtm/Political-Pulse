# -*- coding: utf-8 -*-
"""compare_builds.py -- Phase 4 acceptance (READ-ONLY on all databases).

Runs the dashboard build twice per scope from the SAME data -- source "MONGO" (today)
and source "SPLIT" (summary + last N days raw) -- each in its own process, keeps the
results in memory files (no push, no data/*.json write), then diffs every key.

    python tools\\compare_builds.py [--summary daily_summary_test] [--out DIR]
"""
import os, sys, json, subprocess, time
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
a = sys.argv[1:]
SUMMARY = a[a.index('--summary') + 1] if '--summary' in a else 'daily_summary_test'
OUT = a[a.index('--out') + 1] if '--out' in a else os.path.join(ROOT, 'tools', '_cmp')
os.makedirs(OUT, exist_ok=True)
STRICT = ['UNI.tot', 'PARTY_DATA', 'STATE_DATA', 'DAILY_DATA', 'phd']

RUNNER = r'''
import sys, json, importlib.util, os
mod_dir, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, mod_dir); os.chdir(mod_dir)
spec = importlib.util.spec_from_file_location('ud', os.path.join(mod_dir, 'update_dashboard.py'))
m = importlib.util.module_from_spec(spec); sys.modules['ud'] = m; spec.loader.exec_module(m)
handles, phd_docs, mapping, dd_docs, DATES, tot = m.build(src)
json.dump({'handles': handles, 'phd': phd_docs, 'mapping': mapping, 'dd': dd_docs, 'dates': DATES, 'tot': tot},
          open(out, 'w', encoding='utf-8'), ensure_ascii=False, default=str)
'''


def run(scope_dir, src, name):
    out = os.path.join(OUT, name + '.json')
    env = dict(os.environ, PULSE_SUMMARY_COLL=SUMMARY)
    t = time.time()
    r = subprocess.run([sys.executable, '-c', RUNNER, scope_dir, src, out], env=env,
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    tail = [l for l in (r.stdout or '').splitlines() if 'SPLIT' in l or 'total tweets' in l or 'handles=' in l]
    print('  %-14s %-5s %6.1fs  rc=%d  %s' % (name, src, time.time() - t, r.returncode, ' | '.join(tail)[:200]))
    if r.returncode != 0:
        print((r.stderr or '')[-1500:]); sys.exit(1)
    return json.load(open(out, encoding='utf-8'))


def diff(x, y, path, out, limit=4):
    if type(x) != type(y) and not (isinstance(x, (int, float)) and isinstance(y, (int, float))):
        out.append((path, repr(x)[:80], repr(y)[:80])); return
    if isinstance(x, dict):
        for k in set(x) | set(y):
            if k not in x or k not in y:
                out.append((path + '.' + str(k), 'missing' if k not in x else '…', 'missing' if k not in y else '…'))
            else:
                diff(x[k], y[k], path + '.' + str(k), out)
    elif isinstance(x, list):
        if len(x) != len(y):
            out.append((path, 'len %d' % len(x), 'len %d' % len(y)))
        for i, (p, q) in enumerate(zip(x, y)):
            diff(p, q, '%s[%d]' % (path, i), out)
    elif isinstance(x, float) or isinstance(y, float):
        if abs(float(x) - float(y)) > 1e-6 * max(1, abs(float(x))):
            out.append((path, x, y))
    elif x != y:
        out.append((path, repr(x)[:80], repr(y)[:80]))


def summarize(scope, A, B):
    print('\n===== %s =====  tweets MONGO=%s SPLIT=%s  dates %d/%d' % (scope, A['tot'], B['tot'], len(A['dates']), len(B['dates'])))
    sets = {
        'handles': ({h['_id']: h for h in A['handles']}, {h['_id']: h for h in B['handles']}),
        'phd': ({h['h']: h for h in A['phd']}, {h['h']: h for h in B['phd']}),
        'mapping': ({h['_id']: h for h in A['mapping']}, {h['_id']: h for h in B['mapping']}),
    }
    dda = {d['key']: d['value'] for d in A['dd']}; ddb = {d['key']: d['value'] for d in B['dd']}
    for k in sorted(set(dda) | set(ddb)):
        sets['dd.' + k] = (dda.get(k), ddb.get(k))
    sets['dd.UNI.tot'] = (dda['UNI']['tot'], ddb['UNI']['tot'])
    bad_strict = 0
    for name, (x, y) in sets.items():
        out = []; diff(x, y, name, out)
        key = name.replace('dd.', '')
        strict = key in STRICT
        if out and strict: bad_strict += 1
        flag = 'OK' if not out else ('MISMATCH (STRICT)' if strict else 'differs')
        print('  %-22s %-18s %s' % (name, flag, ('%d paths, e.g. %s' % (len(out), out[:2])) if out else '')[:260])
    return bad_strict


A1 = run(os.path.join(ROOT, 'DASHBOARD'), 'MONGO', 'all_MONGO')
B1 = run(os.path.join(ROOT, 'DASHBOARD'), 'SPLIT', 'all_SPLIT')
A2 = run(os.path.join(ROOT, 'UP-DASHBOARD'), 'MONGO', 'up_MONGO')
B2 = run(os.path.join(ROOT, 'UP-DASHBOARD'), 'SPLIT', 'up_SPLIT')
bad = summarize('All-India', A1, B1) + summarize('UP', A2, B2)
print('\nRESULT:', 'STRICT KEYS IDENTICAL' if not bad else '%d STRICT KEY(S) DIFFER' % bad)
