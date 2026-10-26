# -*- coding: utf-8 -*-
"""reconcile_summary.py -- READ-ONLY. Totals from the daily summary (after the same
case_merge + map_gate the dashboard uses) vs the live dashboards' UNI.tot.
Note: the dashboards were built from master at their lastUpdate time; tweets that
arrived or changed after that show up as small differences."""
import os, sys, collections, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'DASHBOARD'))
import update_dashboard as U
from pymongo import MongoClient
from mongo_conf import MONGO_URL
coll = sys.argv[1] if len(sys.argv) > 1 else 'daily_summary_test'
cli = MongoClient(MONGO_URL)
summ = cli['pulse_master'][coll]
spec = importlib.util.spec_from_file_location('UPU', os.path.join(HERE, '..', 'UP-DASHBOARD', 'update_dashboard.py'))
UPU = importlib.util.module_from_spec(spec); spec.loader.exec_module(UPU)
for scope, M, dbn in (('all', U, 'india_Pulse'), ('up', UPU, 'up_pulse')):
    q = {'h': {'$ne': ''}}
    if scope == 'up': q['st'] = 'Uttar Pradesh'
    acc, daily, meta = {}, {}, {}
    for g in summ.find(q, {'h': 1, 'd': 1, 'cat': 1, 'tw': 1, 'lk': 1, 'rt': 1, 'vw': 1, 's': 1, 'last': 1}):
        if scope == 'all' and g['cat'].lower() in U.EXCLUDE_CAT: continue
        h = g['h']
        a = acc.setdefault(h, dict({'tw': 0, 'lk': 0, 'rt': 0, 'vw': 0}, **U.sent_blank()))
        for k in ('tw', 'lk', 'rt', 'vw'): a[k] += g[k]
        for c in U.SENT_CODES: a[c] += g['s'][c]
        if len(g['d']) == 10:
            e = daily.setdefault((h, g['d']), [0, 0, 0, 0]); e[0] += g['tw']; e[1] += g['vw']; e[2] += g['lk']; e[3] += g['rt']
        m = meta.setdefault(h, {'name': h, 'party': '', 'levelCSV': 'Others', 'state': U.DASH, 'followers': 0, 'followings': 0, 'pcName': '', '_dt': '', '_fdt': ''})
    acc, meta, daily = M.case_merge(acc, meta, daily)
    acc, meta, daily = M.map_gate(acc, meta, daily)
    tot = {k: sum(a[k] for a in acc.values()) for k in ('tw', 'vw', 'lk', 'rt')}
    dd = {d['key']: d['value'] for d in cli[dbn]['dashboard_data'].find({'key': 'UNI'})}
    live = dd['UNI']['tot']; lu = cli[dbn]['meta'].find_one({'key': 'lastUpdate'}) or {}
    print('[%s] handles summary=%d live=%s  (dashboard lastUpdate %s)' % (scope, len(acc), dd['UNI'].get('handles'), lu.get('value')))
    for k in ('tw', 'vw', 'lk', 'rt'):
        print('   %s  summary=%14d  live=%14d  diff=%d' % (k, tot[k], int(live.get(k, 0)), tot[k] - int(live.get(k, 0))))
