# -*- coding: utf-8 -*-
"""test_summary_equivalence.py -- READ-ONLY proof that the daily summary reproduces
exactly what update_dashboard.read_csv_agg (the real dashboard code) computes.

For the given days: (1) run the REAL read_csv_agg on master (only those days),
(2) build summary docs in memory with build_daily_summary.summarize_day,
(3) rebuild every accumulator from the summary and compare. Nothing is written.

    python tools\\test_summary_equivalence.py 2026-10-20,2026-10-21
"""
import os, sys, collections, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, '..', 'DASHBOARD'); UPD = os.path.join(HERE, '..', 'UP-DASHBOARD')
sys.path.insert(0, DASH)
import update_dashboard as U
import build_daily_summary as B
import src_chunks as SC
from pymongo import MongoClient
from mongo_conf import MONGO_URL

days = sys.argv[1].split(',')
Q = {'$or': [{'Tweet Date': {'$gte': d, '$lt': d + '~'}} for d in days]}
_orig = SC.chunks
SC.chunks = lambda src, need, query=None: _orig(src, need, Q)

spec = importlib.util.spec_from_file_location('UPU', os.path.join(UPD, 'update_dashboard.py'))
UPU = importlib.util.module_from_spec(spec); spec.loader.exec_module(UPU)
UPU._SRC.chunks = SC.chunks

coll = MongoClient(MONGO_URL)['pulse_master']['master_tweets']
docs, wd = [], {'all': collections.Counter(), 'up': collections.Counter()}
for d in days:
    ds, ws, n = B.summarize_day(coll, d)
    docs += ds
    for w in ws: wd[w['scope']].update(w['w'])
print('summary docs:', len(docs))
CODES = U.SENT_CODES


def rebuild(scope):
    keep = (lambda g: g['cat'].lower() not in U.EXCLUDE_CAT) if scope == 'all' else (lambda g: g['st'] == 'Uttar Pradesh')
    acc, daily = {}, collections.defaultdict(lambda: [0, 0, 0, 0])
    htag = collections.defaultdict(lambda: dict({'c': 0, 'lk': 0, 'vw': 0}, **U.sent_blank()))
    htp = collections.defaultdict(lambda: collections.defaultdict(lambda: dict({'c': 0, 'lk': 0, 'vw': 0}, **U.sent_blank())))
    htd = collections.defaultdict(lambda: collections.defaultdict(int))
    htpd = collections.defaultdict(lambda: collections.defaultdict(int))
    sd = collections.defaultdict(int); hourly = [0] * 24; dates = set()
    for g in docs:
        if not keep(g): continue
        h, d = g['h'], g['d']
        if h:
            a = acc.setdefault(h, dict({'tw': 0, 'lk': 0, 'rt': 0, 'vw': 0}, **U.sent_blank()))
            a['tw'] += g['tw']; a['lk'] += g['lk']; a['rt'] += g['rt']; a['vw'] += g['vw']
            for c in CODES: a[c] += g['s'][c]
            if len(d) == 10:
                dates.add(d); e = daily[(h, d)]; e[0] += g['tw']; e[1] += g['vw']; e[2] += g['lk']; e[3] += g['rt']
        for tag, e in (g.get('ht') or {}).items():
            t = htag[tag]; t['c'] += e[0]; t['lk'] += e[1]; t['vw'] += e[2]
            for i, c in enumerate(CODES): t[c] += e[3 + i]
            htd[tag][d] += e[0]
            if g['pt']:
                tp = htp[g['pt']][tag]; tp['c'] += e[0]; tp['lk'] += e[1]; tp['vw'] += e[2]
                for i, c in enumerate(CODES): tp[c] += e[3 + i]
                htpd[(g['pt'], tag)][d] += e[0]
        if len(d) == 10:
            for c in CODES:
                if g['s'][c]: sd[(g['st'] or U.DASH, d, c)] += g['s'][c]
        for i, x in enumerate(g.get('hr') or []): hourly[i] += x
    return acc, daily, sorted(dates), htag, htp, hourly, htd, htpd, sd


def norm(x):
    if isinstance(x, dict): return {k: norm(v) for k, v in x.items() if not (isinstance(v, (dict, collections.Counter)) and not v)}
    return x


fails = 0
for scope, M in (('all', U), ('up', UPU)):
    real = M.read_csv_agg('MONGO')
    acc, meta, daily, dates, htag, htp, hourly, htd, htpd, words, sd = real
    mine = rebuild(scope)
    names = ['acc', 'daily', 'dates', 'htag', 'htag_party', 'hourly', 'htag_daily', 'htag_party_daily', 'sdaily']
    reals = [acc, dict(daily), dates, dict(htag), {k: dict(v) for k, v in htp.items()}, hourly,
             {k: dict(v) for k, v in htd.items()}, {k: dict(v) for k, v in htpd.items()}, dict(sd)]
    mines = [mine[0], dict(mine[1]), mine[2], dict(mine[3]), {k: dict(v) for k, v in mine[4].items()}, mine[5],
             {k: dict(v) for k, v in mine[6].items()}, {k: dict(v) for k, v in mine[7].items()}, dict(mine[8])]
    for nm, r, m in zip(names, reals, mines):
        r2, m2 = norm(r), norm(m)
        ok = r2 == m2
        if not ok:
            fails += 1
            if isinstance(r2, dict):
                ks = set(r2) ^ set(m2); diff = [k for k in set(r2) & set(m2) if r2[k] != m2[k]]
                print('  [%s] %-17s MISMATCH  keys only one side=%d  value diffs=%d  e.g. %s'
                      % (scope, nm, len(ks), len(diff), str((list(ks) + diff)[:2])[:200]))
            else:
                print('  [%s] %-17s MISMATCH' % (scope, nm))
        else:
            print('  [%s] %-17s OK  (%d entries)' % (scope, nm, len(r2) if hasattr(r2, '__len__') else 0))
    top_r = [w for w, _ in words.most_common(150)]; top_m = [w for w, _ in wd[scope].most_common(150)]
    cnt_diff = [w for w in top_r if words[w] != wd[scope].get(w, 0)]
    cut = words.most_common(150)[-1][1]
    print('  [%s] words top150 same set: %s | counts differ for %d of real top150 | boundary count=%d, real words at boundary=%d'
          % (scope, set(top_r) == set(top_m), len(cnt_diff), cut, sum(1 for c in words.values() if c == cut)))
    if cnt_diff: print('     e.g.', [(w, words[w], wd[scope].get(w, 0)) for w in cnt_diff[:5]])
    fw_diff = sum(1 for h in acc if meta.get(h, {}).get('followers', 0) and h in mine[0]) 
print('RESULT:', 'ALL EXACT' if not fails else '%d MISMATCHES' % fails)
